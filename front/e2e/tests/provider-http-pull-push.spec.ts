import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    The http-pull-push provider: it validates end to end the "a provider owns its configuration" model
    the core premieres (a configRouter mounted behind validKey + injected storage):

      - its own dialog is loaded from the providers manager's cog
      - a connection created from the UI is persisted and survives reopening the dialog
      - the credentials end up in the Secret and NOT in the ConfigMap
      - the management endpoints demand an accessKey

    NON-destructive: the previous configuration is saved at the start and restored at the end. The test
    connections carry the 'e2e-hpp-' prefix so as not to confuse them with the user's.
*/

const PREFIX = 'e2e-hpp-'
const CONFIG_PATH = '/core/providerconfig/http-pull-push/configs'

/*
    The accessKey lives in React's state, not in storage, so it is captured from the very requests the
    front end makes to the back end. It is more robust than poking around inside the front end.
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

// Runs an authenticated fetch FROM the page, with the live session's accessKey.
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

        // ── snapshot of whatever was there before ───────────────────────────
        await openProviderManager(page)
        expect(session.bearer, 'an authenticated request should have been captured by now').not.toBe('')
        const before = await api(page, session, 'GET')

        // The provider mounts its config endpoint only when it is LOADED. When it is not, the route does
        // not exist and the back end returns the SPA, so the body is not JSON. That is environment state
        // and not a product failure: a red that depends on whether somebody installed an extension is no
        // signal, and it masks the real reds. Install it from the public marketplace, or declare it in
        // kwirth-dev.json.
        const loaded = before.status === 200 && before.text.trim().startsWith('[')
        test.skip(!loaded, "el provider 'http-pull-push' no esta cargado en este cluster (instalalo desde el marketplace)")

        const original = JSON.parse(before.text)
        expect(Array.isArray(original)).toBe(true)

        try {
            // ── the management endpoints demand an accessKey ────────────────
            const anonymous = await page.evaluate(async ({ path, backend }) => {
                const res = await fetch(`${backend}${path}`)
                return res.status
            }, { path: CONFIG_PATH, backend: session.backend })
            expect(anonymous, 'without an accessKey the core must reject it').toBe(403)

            // ── registration through the API, and a check that the provider accepts it ──
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

            // ── it is read back whole, credential included ──────────────────
            const after = JSON.parse((await api(page, session, 'GET')).text)
            const saved = after.find((c: any) => c.name === `${PREFIX}quotes`)
            expect(saved, 'the connection must have been persisted').toBeTruthy()
            expect(saved.url).toBe('https://api.example.com/quotes')
            expect(saved.intervalSeconds).toBe(300)
            expect(saved.headers['X-Test']).toBe('e2e')
            expect(saved.auth.username).toBe('e2e-user')
            expect(saved.auth.password, 'the credential is recomposed from the Secret on read').toBe('e2e-secret-value')

            // ── server-side validation ─────────────────────────────────────
            const invalid = await api(page, session, 'PUT', [...original, { ...connection, url: 'ftp://nope' }])
            expect(invalid.status, 'a bad url must be rejected by the back, not only by the dialog').toBe(400)
            expect(invalid.text).toContain('http')

            // ── the provider's own dialog opens from the gear ───────────────
            await dismissOpenDialogs(page)
            await openProviderManager(page)
            const manager = page.getByRole('dialog').filter({ hasText: /Manage providers/i })

            // the filter leaves a single card, and with it a single gear
            await manager.getByPlaceholder('Filter…').first().fill('http-pull-push')
            await page.waitForTimeout(500)

            // the card counts the connections the provider declares (getConfigNames)
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

            // with nothing selected there is no form, and Clone does not apply
            await expect(dialog.getByText('Select a connection to edit or click New.')).toBeVisible()
            await expect(dialog.getByRole('button', { name: 'Clone', exact: true })).toBeDisabled()

            // the connection created earlier through the API appears in the list; clicking it edits it
            await expect(dialog.getByText(`${PREFIX}quotes`)).toBeVisible({ timeout: 10000 })
            await dialog.getByText(`${PREFIX}quotes`).click()
            await expect(dialog.getByText(`Editing: ${PREFIX}quotes`)).toBeVisible()

            // and its values are drawn in the detail, with the credential hidden
            await expect(dialog.getByLabel('URL')).toHaveValue('https://api.example.com/quotes')
            await expect(dialog.getByLabel('Interval (s)')).toHaveValue('300')
            await expect(dialog.getByLabel('Username')).toHaveValue('e2e-user')
            const password = dialog.getByLabel('Password')
            await expect(password, 'a credential must be masked by default').toHaveAttribute('type', 'password')

            // the eye reveals it
            await dialog.getByLabel('Show').click()
            await expect(password).toHaveAttribute('type', 'text')
            await expect(password).toHaveValue('e2e-secret-value')

            // ── Update persists immediately, with no global Save ───────────
            await dialog.getByLabel('Interval (s)').fill('600')
            await dialog.getByRole('button', { name: 'Update', exact: true }).click()
            await expect(dialog.getByText('Select a connection to edit or click New.')).toBeVisible({ timeout: 10000 })
            const afterUpdate = JSON.parse((await api(page, session, 'GET')).text)
            expect(afterUpdate.find((c: any) => c.name === `${PREFIX}quotes`).intervalSeconds,
                'Update must persist on its own').toBe(600)

            // ── New + Clone + Delete on the row ────────────────────────────
            await dialog.getByRole('button', { name: 'New', exact: true }).click()
            await expect(dialog.getByText('New connection')).toBeVisible()
            await dialog.getByLabel('Connection name').fill(`${PREFIX}dup-src`)
            await dialog.getByLabel('URL').fill('https://api.example.com/one')
            await dialog.getByRole('button', { name: 'Add', exact: true }).click()
            await expect(dialog.getByText(`${PREFIX}dup-src`)).toBeVisible({ timeout: 10000 })

            await dialog.getByText(`${PREFIX}dup-src`).click()
            await dialog.getByRole('button', { name: 'Clone', exact: true }).click()
            // the clone arrives with a free name and has to be confirmed with Add
            await expect(dialog.getByLabel('Connection name')).toHaveValue(`${PREFIX}dup-src-copy`)
            await dialog.getByRole('button', { name: 'Add', exact: true }).click()
            await expect(dialog.getByText(`${PREFIX}dup-src-copy`)).toBeVisible({ timeout: 10000 })

            const afterClone = JSON.parse((await api(page, session, 'GET')).text)
            expect(afterClone.filter((c: any) => c.name.startsWith(`${PREFIX}dup-src`)).length).toBe(2)
            expect(afterClone.find((c: any) => c.name === `${PREFIX}dup-src-copy`).url,
                'the clone must copy the values, not just the name').toBe('https://api.example.com/one')

            // deleting from the row itself (each button is identified by its connection)
            await dialog.getByLabel(`Delete ${PREFIX}dup-src-copy`).click()
            await expect(dialog.getByText(`${PREFIX}dup-src-copy`)).toHaveCount(0, { timeout: 10000 })
            const afterDelete = JSON.parse((await api(page, session, 'GET')).text)
            expect(afterDelete.some((c: any) => c.name === `${PREFIX}dup-src-copy`)).toBe(false)

            // ── the export offers a decision about the credentials ─────────
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
            // ── restore: exactly what was there is left behind ─────────────
            const restore = await api(page, session, 'PUT', original)
            expect(restore.status, 'the previous configuration must be restored').toBe(200)
        }
    })
})
