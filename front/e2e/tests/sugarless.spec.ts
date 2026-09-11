/*
    Sugarless: el provider (configuracion propia, secreto de ida y vuelta) y el canal (autonomo, con
    view 'none').

    NO DESTRUCTIVO, y con un matiz que no es el habitual: aqui **no se restaura** nada porque **no se
    escribe** nada. El unico PUT que se hace es invalido a proposito y el back lo rechaza, asi que
    nunca llega a persistirse. Y es deliberado no seguir el patron de "snapshot + PUT de vuelta" del
    spec de http-pull-push: en sugarless, guardar configuracion REARRANCA el polling y **vacia el
    historico en memoria**, asi que un restore "inocente" le borraria al usuario la curva que tuviera.

    ⚠️ El ADD que CONFIRMA se clica SIN `force: true`. Con force, Playwright se salta las
    comprobaciones de estabilidad y dispara en la posicion que el boton tenia antes de cerrarse el
    desplegable de canal, asi que el click cae fuera y la pestaña no se crea — sin error, que es lo
    peor de todo: el sintoma es identico al de un canal roto. La primera pulsacion (la que abre el
    selector) si lleva force, porque al arrancar puede estar tapada.
*/
import { test, expect, Page } from '@playwright/test'
import { login, dismissOpenDialogs, clickExtensionMenuItem, pickCombo, assertFrontCompiles } from './helpers'

const CONFIG_PATH = '/core/providerconfig/sugarless/config'

const COMBO_CLUSTER = 0
const COMBO_VIEW = 1

interface ISession {
    bearer: string
    backend: string
}

// El accessKey vive en el estado de React, asi que se captura de las peticiones que el front hace.
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

const api = async (page: Page, session: ISession, method: string, body?: unknown) =>
    await page.evaluate(async ({ method, body, path, bearer, backend }) => {
        const res = await fetch(`${backend}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${bearer}`,
                'Content-Type': 'application/json',
                'X-Kwirth-App': 'true'
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        })
        return { status: res.status, text: await res.text() }
    }, { method, body, path: CONFIG_PATH, bearer: session.bearer, backend: session.backend })

const openProviderManager = async (page: Page) => {
    await clickExtensionMenuItem(page, 'Providers')
    await page.getByRole('dialog').filter({ hasText: /Manage providers/i }).waitFor({ timeout: 10000 })
}

/** Abre el selector y deja elegido el canal indicado con la view 'none'. */
const selectAutonomousChannel = async (page: Page, channel: string): Promise<boolean> => {
    await dismissOpenDialogs(page)
    // La PRIMERA pulsacion (abrir el selector) si necesita force: al arrancar puede quedar tapada.
    await page.getByRole('button', { name: 'ADD', exact: true }).click({ force: true })
    await pickCombo(page, COMBO_CLUSTER, 'inCluster')
    await pickCombo(page, COMBO_VIEW, 'none')

    const count = await page.getByRole('combobox').count()
    await page.getByRole('combobox').nth(count - 1).click()
    await page.getByRole('listbox').waitFor({ state: 'visible', timeout: 5000 })
    const option = page.getByRole('option', { name: channel, exact: true })
    if (await option.count() === 0) return false
    await option.click()
    return true
}

test.describe('sugarless', () => {

    test('the provider owns its config, and the secret travels both ways', async ({ page }) => {
        const session = watchSession(page)
        await login(page)
        await assertFrontCompiles(page)

        await openProviderManager(page)
        expect(session.bearer, 'ya deberia haberse capturado una peticion autenticada').not.toBe('')

        const before = await api(page, session, 'GET')

        /*
            El provider monta su endpoint solo si esta CARGADO; si no, la ruta no existe y el back
            devuelve la SPA, asi que el cuerpo no es JSON. Eso es estado del entorno y no un fallo del
            producto: un rojo que depende de si alguien instalo una extension tapa los rojos de verdad.
        */
        const loaded = before.status === 200 && before.text.trim().startsWith('{')
        test.skip(!loaded, "el provider 'sugarless' no esta cargado en este cluster")

        const stored = JSON.parse(before.text)

        // ── el endpoint exige accessKey ─────────────────────────────────────
        const anonymous = await page.evaluate(async ({ path, backend }) => {
            const res = await fetch(`${backend}${path}`)
            return res.status
        }, { path: CONFIG_PATH, backend: session.backend })
        expect(anonymous, 'sin accessKey el core tiene que rechazarlo').toBe(403)

        // ── la configuracion llega ENTERA, contraseña incluida ───────────────
        /*
            Esta es la regla del proyecto que este spec vigila: los secretos se tratan como cualquier
            otro dato y viajan al front; lo unico distinto es que la UI los enmascara. Nada de
            'hasPassword' ni de "deja el campo vacio para conservarla".
        */
        expect(Object.keys(stored), 'la config tiene que traer el campo password, no un hasPassword')
            .toContain('password')
        expect(Object.keys(stored)).not.toContain('hasPassword')
        expect(stored.email, 'el email se guarda en el ConfigMap y vuelve').toBeTruthy()
        expect(typeof stored.intervalSeconds).toBe('number')
        expect(typeof stored.maxSamples).toBe('number')
        expect(stored.clientVersion, 'la version de cliente es configurable porque Abbott sube el minimo').toBeTruthy()

        // ── el back valida por su cuenta, no solo el dialogo ─────────────────
        // Se manda invalido a proposito: se rechaza y NO se persiste, asi que no hay nada que restaurar.
        const rejected = await api(page, session, 'PUT', { ...stored, email: 'esto-no-es-un-email' })
        expect(rejected.status, rejected.text).toBe(400)
        expect(rejected.text).toMatch(/email/i)

        const afterReject = JSON.parse((await api(page, session, 'GET')).text)
        expect(afterReject.email, 'un PUT rechazado no debe haber tocado nada').toBe(stored.email)
    })

    test('the provider renders its own dialog, with the password masked and an eye', async ({ page }) => {
        await login(page)
        await openProviderManager(page)
        const manager = page.getByRole('dialog').filter({ hasText: /Manage providers/i })

        await manager.getByPlaceholder('Filter…').first().fill('sugarless')
        await page.waitForTimeout(500)

        const gear = manager.locator('[aria-label="Configure"]')
        test.skip(await gear.count() === 0, "el provider 'sugarless' no esta instalado en este cluster")
        await gear.first().getByRole('button').click()

        const dialog = page.getByRole('dialog').filter({ hasText: /LibreLinkUp account/i })
        await expect(dialog, 'tiene que pintar SU dialogo, no el formulario generico').toBeVisible({ timeout: 15000 })

        // El aviso de la cuenta seguidora va el primero: es donde encalla todo el mundo.
        await expect(dialog.getByText(/FOLLOWS/)).toBeVisible()

        // exact:true porque getByLabel casa por SUBSTRING y 'Password' aparece dentro de otros textos
        const password = dialog.getByLabel('Password', { exact: true })
        await expect(password).toHaveAttribute('type', 'password')

        // el ojo lo revela: es la contrapartida de que el secreto SI viaje
        await dialog.getByRole('button', { name: /show/i }).first().click()
        await expect(password).toHaveAttribute('type', 'text')

        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    })

    test('the channel is autonomous: offered with the none view and not with cluster', async ({ page }) => {
        await login(page)
        const found = await selectAutonomousChannel(page, 'sugarless')
        test.skip(!found, "el plugin 'sugarless' no esta instalado en este cluster")

        // Se ha podido elegir con la view 'none', que es la mitad de la prueba. La otra mitad:
        // con la view 'cluster' NO debe poder elegirse, porque el canal no la soporta.
        await pickCombo(page, COMBO_VIEW, 'cluster')
        const count = await page.getByRole('combobox').count()
        await page.getByRole('combobox').nth(count - 1).click()
        await page.getByRole('listbox').waitFor({ state: 'visible', timeout: 5000 })

        const withCluster = page.getByRole('option', { name: 'sugarless', exact: true })
        expect(await withCluster.getAttribute('aria-disabled'), 'un canal autonomo no debe ofrecerse con la view cluster').toBe('true')
        await page.keyboard.press('Escape')
    })

    test('a tab that has not been started says so, instead of pretending to wait for data', async ({ page }) => {
        /*
            Antes de darle a Start no hay suscripcion al provider, asi que decir "esperando la primera
            lectura" seria mandar al usuario a esperar algo que no va a llegar. Las pestañas viven en
            localStorage del navegador, y Playwright usa un contexto limpio, asi que crear una aqui no
            toca el espacio de trabajo real de nadie.
        */
        await login(page)
        const found = await selectAutonomousChannel(page, 'sugarless')
        test.skip(!found, "el plugin 'sugarless' no esta instalado en este cluster")

        await page.getByRole('button', { name: 'ADD', exact: true }).click()
        await expect(page.getByRole('tab')).toHaveCount(2, { timeout: 10000 })

        await expect(page.getByText('Sugarless not started')).toBeVisible({ timeout: 10000 })
        await expect(page.getByText(/Start the channel/i)).toBeVisible()

        // Y NO debe decir que espera una lectura: no hay nada esperando todavia.
        await expect(page.getByText('Waiting for the first reading')).toHaveCount(0)
    })
})
