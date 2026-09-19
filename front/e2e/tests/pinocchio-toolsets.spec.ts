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

/** Lo que el test necesita ver. `k8s-ops` queda FUERA a propósito: es la mitad negativa de la prueba. */
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
    // Conceder exige scope admin: si el usuario del e2e no lo tiene, mejor decirlo que dar 0 tools.
    expect(res.ok(), `no se pudo conceder '${toolsetId}' (${res.status()}): ¿el usuario del e2e es admin?`).toBeTruthy()
}

test.describe('pinocchio: las tools salen del registro de toolsets', () => {
    let page: Page
    let herramientas: string[] = []
    let rotulo = ''
    /** Lo que había antes de tocar nada, para dejarlo igual. */
    let original: TGrants = {}
    let tocados: string[] = []
    /** La autorizacion prestada, capturada en el login y valida toda la sesion. */
    let acceso: IBackAccess

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage()
        acceso = espiarAcceso(page)
        await login(page)
        await dismissOpenDialogs(page)
        expect(acceso.auth, 'no se pudo tomar prestada la autorizacion del front').not.toEqual('')

        // ── la concesion, antes de abrir nada: el canal pide su lista de tools al arrancar ──
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

        // El canal tiene que ARRANCAR: la lista de tools se la pide al back al iniciarse.
        await page.locator('button:has(svg[data-testid="SettingsIcon"])').first().click()
        await page.getByRole('menuitem', { name: /^Start$/ }).click()
        await page.waitForTimeout(4000)

        // Config → Triggers, que es donde vive el selector de tools
        await page.getByRole('button', { name: 'Config', exact: true }).click()
        await page.getByRole('menuitem', { name: /trigger/i }).click()
        await page.waitForTimeout(1500)

        // ⚠️ El selector solo se habilita con un trigger Y una version elegidos: sin eso esta en gris y
        // no pinta nada, que fue lo que despisto la primera vez. Se pincha el PRIMERO de cada lista para
        // no depender de como se llamen los triggers de quien corra el test: son datos suyos.
        const dialog = page.getByRole('dialog').first()
        const item = dialog.locator('.MuiListItemButton-root')
        await item.first().click({ force: true })
        await page.waitForTimeout(800)
        // La lista de versiones aparece al elegir trigger: el segundo bloque de items es la primera version
        await item.nth(1).click({ force: true })
        await page.waitForTimeout(800)

        rotulo = (await dialog.locator('.MuiFormControl-root').filter({ hasText: 'Tools' }).locator('.MuiSelect-select').first().textContent().catch(() => '')) ?? ''

        // El catalogo esta DENTRO del desplegable: hay que abrirlo.
        await dialog.locator('.MuiFormControl-root').filter({ hasText: 'Tools' }).locator('.MuiSelect-select').first().click({ force: true })
        await page.waitForTimeout(800)
        herramientas = await page.locator('[role="listbox"] [role="option"]').allTextContents()
        await page.keyboard.press('Escape')
        await page.waitForTimeout(400)
    })

    test.afterAll(async () => {
        // Las concesiones vuelven EXACTAMENTE a como estaban, aunque el test haya petado a medias: son
        // config del usuario, no del test.
        for (const id of tocados) {
            await escribirGrant(page.request, acceso, id, original[id] ?? []).catch(() => {})
        }
        await dismissOpenDialogs(page).catch(() => {})
        await page?.close()
    })

    test('el catalogo que ofrece no esta vacio', async () => {
        // Dos causas distintas para el mismo sintoma, y el mensaje tiene que distinguirlas: sin registro no
        // hay tools, y con registro pero sin concesion tampoco — pero se arreglan en sitios diferentes.
        expect(herramientas.length, `no hay ninguna tool disponible: los toolsets ${NECESARIOS.join(', ')} estan instalados pero ¿llego la concesion a '${PINOCCHIO}'?`).toBeGreaterThan(0)
        // Y el rotulo del selector existe (vacio si no hay ninguna marcada, 'all (N)' con autoTools)
        expect(typeof rotulo).toBe('string')
    })

    test('las tools que ofrece son las de los toolsets CONCEDIDOS', async () => {
        const texto = herramientas.join(' ')
        // De k8s-describe y de k8s-observability, los dos que el test se concede
        expect(texto, 'falta describe_pod (k8s-describe)').toContain('describe_pod')
        expect(texto, 'falta get_pod_logs (k8s-observability)').toContain('get_pod_logs')
    })

    test('NO ofrece las de los toolsets que no estan a su alcance', async () => {
        // `delete_pod` es de k8s-ops (escritura): puede estar INSTALADO, pero el test no se lo concede, y
        // la resolucion filtra por concesion. `times_two` es de playground, que ni siquiera esta instalado.
        // Con el camino viejo salian las dos, porque venian compiladas dentro del core junto a las demas.
        const texto = herramientas.join(' ')
        expect(texto, 'delete_pod no deberia estar: k8s-ops no esta concedido a pinocchio').not.toContain('delete_pod')
        expect(texto, 'times_two no deberia estar: playground no esta instalado').not.toContain('times_two')
    })
})
