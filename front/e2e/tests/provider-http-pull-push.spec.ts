import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    Provider http-pull-push: valida de punta a punta el modelo de "provider dueño de su configuracion"
    que estrena el core (configRouter montado detras de validKey + storage inyectado):

      - el dialogo propio se carga desde la rueda dentada del gestor de providers
      - una conexion creada desde la UI se persiste y sobrevive a reabrir el dialogo
      - las credenciales acaban en el Secret y NO en el ConfigMap
      - los endpoints de gestion exigen accessKey

    NO destructivo: se guarda la configuracion previa al empezar y se restaura al terminar. Las conexiones
    de prueba llevan el prefijo 'e2e-hpp-' para no confundirlas con las del usuario.
*/

const PREFIX = 'e2e-hpp-'
const CONFIG_PATH = '/core/providerconfig/http-pull-push/configs'

/*
    El accessKey vive en el estado de React, no en storage, asi que se captura de las propias peticiones
    que el front hace al back. Es mas robusto que hurgar en el interior del front.
*/
interface ISession {
    bearer: string
    backend: string
}

const watchSession = (page: Page): ISession => {
    const session: ISession = { bearer: '', backend: '' }
    page.on('request', req => {
        const auth = req.headers()['authorization']
        if (!session.bearer && auth?.startsWith('Bearer ')) {
            session.bearer = auth.slice(7)
            session.backend = new URL(req.url()).origin
        }
    })
    return session
}

// Ejecuta un fetch autenticado DESDE la pagina, con el accessKey de la sesion viva.
const api = async (page: Page, session: ISession, method: string, body?: unknown) => {
    return await page.evaluate(async ({ method, body, path, bearer, backend }) => {
        const res = await fetch(`${backend}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${bearer}`,
                'Content-Type': 'application/json',
                'X-Kwirth-App': 'true'
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        })
        const text = await res.text()
        return { status: res.status, text }
    }, { method, body, path: CONFIG_PATH, bearer: session.bearer, backend: session.backend })
}

const openProviderManager = async (page: Page) => {
    await clickExtensionMenuItem(page, 'Providers')
    await page.getByRole('dialog').filter({ hasText: /Manage providers/i }).waitFor({ timeout: 10000 })
}

test.describe('http-pull-push provider', () => {

    test('the provider owns its config: dialog, persistence, secret split and auth', async ({ page }) => {
        const session = watchSession(page)
        await login(page)

        // ── snapshot de lo que hubiera antes ────────────────────────────────
        await openProviderManager(page)
        expect(session.bearer, 'an authenticated request should have been captured by now').not.toBe('')
        const before = await api(page, session, 'GET')
        expect(before.status, 'the config endpoint must answer with a valid session').toBe(200)
        const original = JSON.parse(before.text)
        expect(Array.isArray(original)).toBe(true)

        try {
            // ── los endpoints de gestion exigen accessKey ───────────────────
            const anonymous = await page.evaluate(async ({ path, backend }) => {
                const res = await fetch(`${backend}${path}`)
                return res.status
            }, { path: CONFIG_PATH, backend: session.backend })
            expect(anonymous, 'without an accessKey the core must reject it').toBe(403)

            // ── alta por API y comprobacion de que el provider la acepta ─────
            const connection = {
                name: `${PREFIX}quotes`,
                enabled: true,
                url: 'https://api.example.com/quotes',
                method: 'GET',
                headers: { 'X-Test': 'e2e' },
                intervalSeconds: 300,
                timeoutMs: 5000,
                auth: { type: 'basic', username: 'e2e-user', password: 'e2e-secret-value' },
                responseType: 'json',
                emitMode: 'always',
                retries: 0,
                allowInsecureTls: false
            }
            const put = await api(page, session, 'PUT', [...original, connection])
            expect(put.status, put.text).toBe(200)

            // ── se lee de vuelta completa, credencial incluida ───────────────
            const after = JSON.parse((await api(page, session, 'GET')).text)
            const saved = after.find((c: any) => c.name === `${PREFIX}quotes`)
            expect(saved, 'the connection must have been persisted').toBeTruthy()
            expect(saved.url).toBe('https://api.example.com/quotes')
            expect(saved.intervalSeconds).toBe(300)
            expect(saved.headers['X-Test']).toBe('e2e')
            expect(saved.auth.username).toBe('e2e-user')
            expect(saved.auth.password, 'the credential is recomposed from the Secret on read').toBe('e2e-secret-value')

            // ── validacion del lado servidor ─────────────────────────────────
            const invalid = await api(page, session, 'PUT', [...original, { ...connection, url: 'ftp://nope' }])
            expect(invalid.status, 'a bad url must be rejected by the back, not only by the dialog').toBe(400)
            expect(invalid.text).toContain('http')

            // ── el dialogo propio del provider se abre desde la rueda ────────
            await dismissOpenDialogs(page)
            await openProviderManager(page)
            const manager = page.getByRole('dialog').filter({ hasText: /Manage providers/i })

            // el filtro deja una sola tarjeta, y con ella una sola rueda dentada
            await manager.getByPlaceholder('Filter…').first().fill('http-pull-push')
            await page.waitForTimeout(500)

            // la tarjeta cuenta las conexiones que el provider declara (getConfigNames)
            const expectedCount = original.length + 1
            await expect(
                manager.getByText(`${expectedCount} config${expectedCount > 1 ? 's' : ''}`, { exact: true }),
                'the card must show how many connections the provider has, like senders do'
            ).toBeVisible({ timeout: 10000 })

            const gear = manager.locator('[aria-label="Configure"]')
            await expect(gear, 'only the http-pull-push card should be left').toHaveCount(1)
            await gear.getByRole('button').click()

            const dialog = page.getByRole('dialog').filter({ hasText: /HTTP Pull-Push Provider — Connections/i })
            await expect(dialog, 'the provider must render its own dialog, not the generic form').toBeVisible({ timeout: 15000 })

            // sin nada seleccionado no hay formulario, y Clone no aplica
            await expect(dialog.getByText('Select a connection to edit or click New.')).toBeVisible()
            await expect(dialog.getByRole('button', { name: 'Clone', exact: true })).toBeDisabled()

            // la conexion creada antes por API aparece en la lista; al pulsarla se edita
            await expect(dialog.getByText(`${PREFIX}quotes`)).toBeVisible({ timeout: 10000 })
            await dialog.getByText(`${PREFIX}quotes`).click()
            await expect(dialog.getByText(`Editing: ${PREFIX}quotes`)).toBeVisible()

            // y sus valores se pintan en el detalle, con la credencial oculta
            await expect(dialog.getByLabel('URL')).toHaveValue('https://api.example.com/quotes')
            await expect(dialog.getByLabel('Interval (s)')).toHaveValue('300')
            await expect(dialog.getByLabel('Username')).toHaveValue('e2e-user')
            const password = dialog.getByLabel('Password')
            await expect(password, 'a credential must be masked by default').toHaveAttribute('type', 'password')

            // el ojo la revela
            await dialog.getByLabel('Show').click()
            await expect(password).toHaveAttribute('type', 'text')
            await expect(password).toHaveValue('e2e-secret-value')

            // ── Update persiste al momento, sin un Save global ──────────────
            await dialog.getByLabel('Interval (s)').fill('600')
            await dialog.getByRole('button', { name: 'Update', exact: true }).click()
            await expect(dialog.getByText('Select a connection to edit or click New.')).toBeVisible({ timeout: 10000 })
            const afterUpdate = JSON.parse((await api(page, session, 'GET')).text)
            expect(afterUpdate.find((c: any) => c.name === `${PREFIX}quotes`).intervalSeconds,
                'Update must persist on its own').toBe(600)

            // ── New + Clone + Delete en la linea ────────────────────────────
            await dialog.getByRole('button', { name: 'New', exact: true }).click()
            await expect(dialog.getByText('New connection')).toBeVisible()
            await dialog.getByLabel('Connection name').fill(`${PREFIX}dup-src`)
            await dialog.getByLabel('URL').fill('https://api.example.com/one')
            await dialog.getByRole('button', { name: 'Add', exact: true }).click()
            await expect(dialog.getByText(`${PREFIX}dup-src`)).toBeVisible({ timeout: 10000 })

            await dialog.getByText(`${PREFIX}dup-src`).click()
            await dialog.getByRole('button', { name: 'Clone', exact: true }).click()
            // el clon llega con un nombre libre y hay que confirmarlo con Add
            await expect(dialog.getByLabel('Connection name')).toHaveValue(`${PREFIX}dup-src-copy`)
            await dialog.getByRole('button', { name: 'Add', exact: true }).click()
            await expect(dialog.getByText(`${PREFIX}dup-src-copy`)).toBeVisible({ timeout: 10000 })

            const afterClone = JSON.parse((await api(page, session, 'GET')).text)
            expect(afterClone.filter((c: any) => c.name.startsWith(`${PREFIX}dup-src`)).length).toBe(2)
            expect(afterClone.find((c: any) => c.name === `${PREFIX}dup-src-copy`).url,
                'the clone must copy the values, not just the name').toBe('https://api.example.com/one')

            // borrar desde la propia linea (cada boton se identifica por su conexion)
            await dialog.getByLabel(`Delete ${PREFIX}dup-src-copy`).click()
            await expect(dialog.getByText(`${PREFIX}dup-src-copy`)).toHaveCount(0, { timeout: 10000 })
            const afterDelete = JSON.parse((await api(page, session, 'GET')).text)
            expect(afterDelete.some((c: any) => c.name === `${PREFIX}dup-src-copy`)).toBe(false)

            // ── el export ofrece decidir sobre las credenciales ─────────────
            await dialog.getByRole('button', { name: 'Export', exact: true }).click()
            const exportDialog = page.getByRole('dialog').filter({ hasText: /^Export connections/ })
            await expect(exportDialog).toBeVisible()
            const includeCreds = exportDialog.getByLabel('Include credentials')
            await expect(includeCreds, 'credentials must be OUT by default').not.toBeChecked()
            await expect(exportDialog.getByText(/Credentials are left empty/i)).toBeVisible()
            await includeCreds.check()
            await expect(exportDialog.getByText(/clear text/i), 'turning it on must warn').toBeVisible()
            await exportDialog.getByRole('button', { name: 'Cancel', exact: true }).click()

            await dialog.getByRole('button', { name: 'Close', exact: true }).click()
        }
        finally {
            // ── restore: se deja exactamente lo que habia ────────────────────
            const restore = await api(page, session, 'PUT', original)
            expect(restore.status, 'the previous configuration must be restored').toBe(200)
        }
    })
})
