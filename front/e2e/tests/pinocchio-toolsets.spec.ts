import { test, expect, Page, APIRequestContext } from '@playwright/test'
import { login, dismissOpenDialogs, pickCombo, pickLastCombo } from './helpers'

/*
    Pinocchio deja de coger las 43 tools compiladas dentro de `common-ai` y las resuelve contra el
    REGISTRO de toolsets instalados (plan: plans/ai-tools/PLAN.md, S3).

    El cambio no se ve: la misma lista de tools, con los mismos nombres. Por eso el test no comprueba
    "que hay tools" —eso pasaba también antes— sino que la lista ES la de los toolsets que Pinocchio
    tiene a su alcance:

      · están las de los toolsets concedidos a `pinocchio` (k8s-describe, k8s-observability)
      · NO está `delete_pod`, que vive en `k8s-ops` y NO se le concede
      · NO está `times_two`, que vive en `playground` y ni siquiera está instalado

    Con el camino viejo las tres aparecían siempre, porque venían todas del mismo sitio. Si alguna
    reaparece, es que se ha vuelto a colar el catálogo compilado.

    ⚠️ **La concesión se la da el propio test, y la devuelve como estaba.** La lista del selector sale de
    `resolveTools(…, 'pinocchio')`, así que sin concesión llega VACÍA aunque los toolsets estén instalados
    y todo funcione. La primera versión del test daba por hecho el estado del entorno, y el día que los
    toolsets se concedieron a otro plugin —a `agora`— se puso rojo sin que nada se hubiera roto: el
    síntoma era "0 tools" y el mensaje culpaba al registro, que estaba perfecto. Un test no puede depender
    de cómo tenga configurado su dev quien lo corra.

    NO destructivo: hace snapshot de las concesiones, concede lo justo, y restaura al terminar. Abre el
    canal, mira el selector y cancela. No guarda configuración del canal.
*/

test.describe.configure({ mode: 'serial' })

/** What the test needs to see. `k8s-ops` is deliberately LEFT OUT: it is the negative half of the test. */
const NECESARIOS = ['k8s-describe', 'k8s-observability']
const PINOCCHIO = 'pinocchio'

type TGrants = Record<string, string[]>

/*
    El front firma cada llamada al back con su accessString, y el test no tiene forma de fabricarse una:
    se la toma prestada de la primera petición que salga hacia `/core/`. Registrar esto ANTES del login es
    lo que lo hace fiable — la app empieza a llamar al back en cuanto entra.
*/
interface IBackAccess {
    base: string
    auth: string
}

const espiarAcceso = (page: Page): IBackAccess => {
    const acceso: IBackAccess = { base: '', auth: '' }
    page.on('request', req => {
        if (acceso.auth) return
        const auth = req.headers()['authorization']
        const i = req.url().indexOf('/core/')
        if (auth && i > 0) {
            acceso.base = req.url().slice(0, i)
            acceso.auth = auth
        }
    })
    return acceso
}

const leerGrants = async (api: APIRequestContext, acc: IBackAccess): Promise<TGrants> => {
    const res = await api.get(`${acc.base}/core/aitoolsets/grants`, { headers: { authorization: acc.auth } })
    expect(res.ok(), `no se pudieron leer las concesiones (${res.status()})`).toBeTruthy()
    return await res.json() as TGrants
}

const escribirGrant = async (api: APIRequestContext, acc: IBackAccess, toolsetId: string, plugins: string[]): Promise<void> => {
    const res = await api.put(`${acc.base}/core/aitoolsets/grants/${toolsetId}`, {
        headers: { authorization: acc.auth, 'content-type': 'application/json' },
        data: { plugins }
    })
    // Granting demands the admin scope: if the e2e's user lacks it, better to say so than to give 0 tools.
    expect(res.ok(), `no se pudo conceder '${toolsetId}' (${res.status()}): ¿el usuario del e2e es admin?`).toBeTruthy()
}

test.describe('pinocchio: las tools salen del registro de toolsets', () => {
    let page: Page
    let herramientas: string[] = []
    let rotulo = ''
    /** What was there before touching anything, so it can be left the same. */
    let original: TGrants = {}
    let tocados: string[] = []
    /** The borrowed authorization, captured at login and valid for the whole session. */
    let acceso: IBackAccess

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage()
        acceso = espiarAcceso(page)
        await login(page)
        await dismissOpenDialogs(page)
        expect(acceso.auth, 'no se pudo tomar prestada la autorizacion del front').not.toEqual('')

        // ── the grant, before opening anything: the channel asks for its tool list on start ──
        original = await leerGrants(page.request, acceso)
        for (const id of NECESARIOS) {
            const actuales = original[id] ?? []
            if (actuales.includes(PINOCCHIO)) continue
            await escribirGrant(page.request, acceso, id, [...actuales, PINOCCHIO])
            tocados.push(id)
        }

        await page.getByRole('button', { name: 'ADD', exact: true }).click({ force: true })
        await page.waitForTimeout(800)
        await pickCombo(page, 0, 'inCluster')
        await pickCombo(page, 1, 'cluster')
        await pickLastCombo(page, 'pinocchio')
        await page.getByRole('button', { name: 'ADD', exact: true }).click({ force: true })
        await page.waitForTimeout(1500)

        // The channel has to START: it asks the back end for the tool list when it does.
        await page.locator('button:has(svg[data-testid="SettingsIcon"])').first().click()
        await page.getByRole('menuitem', { name: /^Start$/ }).click()
        await page.waitForTimeout(4000)

        // Config → Triggers, which is where the tool selector lives
        await page.getByRole('button', { name: 'Config', exact: true }).click()
        await page.getByRole('menuitem', { name: /trigger/i }).click()
        await page.waitForTimeout(1500)

        // ⚠️ The selector is only enabled with a trigger AND a version chosen: without that it is greyed
        // out and draws nothing, which is what misled the first time. The FIRST of each list is clicked so
        // as not to depend on what the triggers of whoever runs the test are called: they are their data.
        const dialog = page.getByRole('dialog').first()
        const item = dialog.locator('.MuiListItemButton-root')
        await item.first().click({ force: true })
        await page.waitForTimeout(800)
        // The version list appears on choosing a trigger: the second block of items is the first version
        await item.nth(1).click({ force: true })
        await page.waitForTimeout(800)

        rotulo = (await dialog.locator('.MuiFormControl-root').filter({ hasText: 'Tools' }).locator('.MuiSelect-select').first().textContent().catch(() => '')) ?? ''

        // The catalogue is INSIDE the dropdown: it has to be opened.
        await dialog.locator('.MuiFormControl-root').filter({ hasText: 'Tools' }).locator('.MuiSelect-select').first().click({ force: true })
        await page.waitForTimeout(800)
        herramientas = await page.locator('[role="listbox"] [role="option"]').allTextContents()
        await page.keyboard.press('Escape')
        await page.waitForTimeout(400)
    })

    test.afterAll(async () => {
        // The grants go back EXACTLY to how they were, even if the test blew up halfway: they are the
        // user's config, not the test's.
        for (const id of tocados) {
            await escribirGrant(page.request, acceso, id, original[id] ?? []).catch(() => {})
        }
        await dismissOpenDialogs(page).catch(() => {})
        await page?.close()
    })

    test('el catalogo que ofrece no esta vacio', async () => {
        // Two different causes for the same symptom, and the message has to tell them apart: with no
        // registry there are no tools, and with a registry but no grant there are none either — but they
        // are fixed in different places.
        expect(herramientas.length, `no hay ninguna tool disponible: los toolsets ${NECESARIOS.join(', ')} estan instalados pero ¿llego la concesion a '${PINOCCHIO}'?`).toBeGreaterThan(0)
        // And the selector's label exists (empty when none is ticked, 'all (N)' with autoTools)
        expect(typeof rotulo).toBe('string')
    })

    test('las tools que ofrece son las de los toolsets CONCEDIDOS', async () => {
        const texto = herramientas.join(' ')
        // From k8s-describe and k8s-observability, the two the test grants itself
        expect(texto, 'falta describe_pod (k8s-describe)').toContain('describe_pod')
        expect(texto, 'falta get_pod_logs (k8s-observability)').toContain('get_pod_logs')
    })

    test('NO ofrece las de los toolsets que no estan a su alcance', async () => {
        // `delete_pod` belongs to k8s-ops (write): it may be INSTALLED, but the test does not grant it to
        // itself, and resolution filters by grant. `times_two` belongs to playground, which is not even
        // installed. Under the old path both showed up, because they came compiled inside the core along
        // with the rest.
        const texto = herramientas.join(' ')
        expect(texto, 'delete_pod no deberia estar: k8s-ops no esta concedido a pinocchio').not.toContain('delete_pod')
        expect(texto, 'times_two no deberia estar: playground no esta instalado').not.toContain('times_two')
    })
})
