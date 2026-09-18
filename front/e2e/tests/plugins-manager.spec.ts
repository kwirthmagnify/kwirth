import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    Migracion del gestor de `plugin` al diálogo generico (plan: plans/extension-managers-ui/PLAN.md).

    Los plugins son los canales de Kwirth, el tipo mas visible, y lo que se vigila aqui es lo que cambia
    de comportamiento al migrarlo:

      · LA RUEDA DENTADA solo en los plugins que declaran configuracion. Antes salia en todos —la
        configuracion de instalacion es JSON libre y el gestor no podia saber quien la lee— y abria un
        editor que en la mayoria no servia para nada. Ahora lo declara el plugin con `configSchema`.
      · `requires` / `uses` en el catalogo: el generico los entiende para los once tipos, no solo aqui.
      · el icono que declara cada plugin, que lo pinta el generico.

    NO destructivo: abre, mira y cierra.
*/

const DIALOG = /Manage channel plugins/i

test.describe.configure({ mode: 'serial' })

interface IPluginRef {
    id: string
    name?: string
    displayName?: string
    icon?: string
    configSchema?: unknown[]
}

// El nombre que se pinta, resuelto igual que en el descriptor: displayName, si no el del paquete, si no
// el id. Un plugin de un registro privado tiene por 'name' el scope entero, asi que no vale usar el id.
const nombreDe = (p: IPluginRef) => p.displayName || p.name || p.id

test.describe('gestor generico de extensiones: plugins', () => {
    let page: Page
    let delBack: IPluginRef[] = []

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage()
        await login(page)
        await dismissOpenDialogs(page)
        delBack = await page.evaluate(async () => {
            const base = window.location.origin.replace(':3000', ':3883')
            return await (await fetch(`${base}/core/plugins`)).json()
        })
        await clickExtensionMenuItem(page, 'Plugins')
        await page.getByRole('dialog').filter({ hasText: DIALOG }).waitFor({ timeout: 40000 })
    })

    test.afterAll(async () => {
        await dismissOpenDialogs(page).catch(() => {})
        await page.close()
    })

    const dialog = () => page.getByRole('dialog').filter({ hasText: DIALOG })

    test('todos los plugins instalados se pintan, con su version', async () => {
        await expect(dialog().getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible({ timeout: 60000 })
        expect(delBack.length, 'el back no devuelve ningun plugin').toBeGreaterThan(0)
        for (const p of delBack) {
            await expect(dialog().getByText(nombreDe(p), { exact: true }).first(),
                `'${p.id}' no aparece en el gestor`).toBeVisible()
        }
    })

    test('🔴 la rueda dentada SOLO en los plugins que declaran configuracion', async () => {
        /*
            Era el sintoma que se reporto: la rueda salia en todos, incluidos los que no leen ninguna
            configuracion de instalacion, y abria un editor JSON que no hacia nada. Ahora la declara el
            plugin (configSchema en su package.json) y el gestor la ofrece solo en esos.
        */
        /*
            ⚠️ La rueda NO desaparece: se queda visible y deshabilitada con el motivo, que es la regla de
            UI del proyecto. Lo que se cuenta es cuantas estan VIVAS.
        */
        const configurables = delBack.filter(p => (p.configSchema?.length ?? 0) > 0)
        const vivas = await dialog().locator('button[aria-label="Configure"]:not([disabled])').count()
        expect(vivas, `hay ${vivas} ruedas vivas y solo ${configurables.length} plugins declaran configuracion`).toBe(configurables.length)

        // Y la que esta muerta tiene que DECIR por que, en vez de no responder sin mas.
        if (configurables.length < delBack.length) {
            await expect(dialog().locator('span[aria-label="This plugin takes no installation config"] button').first()).toBeDisabled()
        }

        // Si alguno la declara, la suya abre su editor.
        if (configurables.length > 0) {
            await dialog().locator('button[aria-label="Configure"]:not([disabled])').first().click()
            await expect(page.locator('.MuiDialog-root')).toHaveCount(2, { timeout: 15000 })
            await page.getByRole('button', { name: /cancel/i }).last().click()
        }
    })

    test('el catalogo dice que necesita y que aprovecha cada plugin', async () => {
        // requires/uses los declara el manifest y los entiende el generico. El numero va en el chip y el
        // detalle en el tooltip: en la tarjeta no cabe la lista, pero sin el numero no hay forma de saber
        // que una extension arrastra a otras.
        await expect(dialog().locator('span[aria-label$="nstall"] button').first()).toBeVisible({ timeout: 60000 })

        /*
            Que catalogo sirve el back se ESCUCHA de la respuesta que pide el propio diálogo: el endpoint
            va autenticado y la sesion no vive en localStorage, asi que pedirlo por separado da 403.

            Importa hacerlo asi y no conformarse con mirar la pantalla: si el manifest trae dependencias y
            la tarjeta no las enseña, se perdieron por el camino, que es justo lo que hay que detectar.
        */
        const cuerpo = page.waitForResponse(r => r.url().includes('/core/marketplace/plugin'), { timeout: 60000 })
        await dialog().getByRole('button', { name: 'Refresh catalog' }).click()
        const entradas = await (await cuerpo).json() as { id: string, version: string, requires?: unknown[], uses?: unknown[] }[]

        /*
            ⚠️ Solo cuenta la version que la tarjeta ENSEÑA, que es la mas nueva de cada id. Mirar el
            manifest entero daba un falso rojo: censor declaraba dependencias en 0.2.48 y dejo de
            declararlas en 0.2.49, asi que el catalogo las traia y la tarjeta —con razon— no las pintaba.
        */
        const masNueva = new Map<string, { version: string, requires?: unknown[], uses?: unknown[] }>()
        for (const e of entradas) {
            const previa = masNueva.get(e.id)
            if (!previa || e.version.localeCompare(previa.version, undefined, { numeric: true }) > 0) masNueva.set(e.id, e)
        }
        const conDeps = [...masNueva.entries()].filter(([, e]) => (e.requires?.length ?? 0) > 0 || (e.uses?.length ?? 0) > 0).map(([id]) => id)
        test.skip(conDeps.length === 0, 'ninguna version actual del catalogo declara dependencias')

        const deps = dialog().getByText(/^(Requires|Uses) \d+$/)
        await expect(deps.first(), `el back sirve dependencias (${conDeps.slice(0, 3).join(', ')}…) y ninguna tarjeta las enseña`).toBeVisible({ timeout: 30000 })
    })

    test('cada plugin se pinta con SU icono, no con el generico del tipo', async () => {
        // El icono lo declara la extension (nombre del set curado o un SVG propio saneado) y lo resuelve
        // el generico. Si se perdiera, todas las tarjetas saldrian con el icono de 'extension'.
        const conIcono = delBack.filter(p => p.icon)
        test.skip(conIcono.length === 0, 'ningun plugin declara icono en este entorno')

        const iconos = await dialog().locator('svg[data-testid]').evaluateAll(els => els.map(e => e.getAttribute('data-testid')))
        const distintos = new Set(iconos.filter(Boolean))
        expect(distintos.size, 'todas las tarjetas usan el mismo icono: se perdio el que declara cada plugin').toBeGreaterThan(3)
    })
})
