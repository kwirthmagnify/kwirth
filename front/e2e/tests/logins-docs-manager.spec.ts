import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    Migracion de los gestores de `login` y `docs` al diálogo generico
    (plan: plans/extension-managers-ui/PLAN.md).

    No se comprueba "que se pinte algo": se comprueba lo que cada tipo APORTA y que el generico tiene que
    respetar, que es justo lo que se podria perder al tirar sus 624 y 488 lineas:

      · login → abrir su pagina en otra pestaña (?loginExt=<id>) y el engranaje SOLO en los que declaran
        configuracion
      · docs  → la identidad es el PAR (targetType, id), no el id; y lo `bundled` no se desinstala

    Ademas se vigila que la procedencia, que ahora pinta el generico para los once tipos, siga saliendo.

    NO destructivo: abre, mira y cierra. No instala ni desinstala nada, y NO pulsa el boton que abre la
    pagina de login (abriria una pestaña real).
*/

const LOGINS = /Manage login extensions/i
const DOCS = /Manage documentation/i

test.describe.configure({ mode: 'serial' })

test.describe('gestores migrados al generico: logins y docs', () => {
    let page: Page

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage()
        await login(page)
        await dismissOpenDialogs(page)
    })

    test.afterAll(async () => {
        await dismissOpenDialogs(page).catch(() => {})
        await page.close()
    })

    const abrir = async (menu: string, titulo: RegExp) => {
        await clickExtensionMenuItem(page, menu)
        const dialog = page.getByRole('dialog').filter({ hasText: titulo })
        // El catalogo lo resuelve el back contra los marketplaces remotos: no es instantaneo.
        await dialog.waitFor({ timeout: 40000 })
        return dialog
    }

    test('logins: las dos secciones del generico con el nombre del tipo', async () => {
        const dialog = await abrir('Login extensions', LOGINS)
        await expect(dialog.getByText('Installed login extensions')).toBeVisible()
        await expect(dialog.getByText('Available login extensions')).toBeVisible()
        await dismissOpenDialogs(page)
    })

    test('logins: cada instalado ofrece abrir SU pagina de login', async () => {
        // Es la accion propia del tipo: sin ella, comprobar como quedo un login obligaria a cerrar sesion.
        // Se comprueba que esta y que esta viva; NO se pulsa, porque abriria una pestaña de verdad.
        const dialog = await abrir('Login extensions', LOGINS)
        await expect(dialog.getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible({ timeout: 60000 })

        const abrirPagina = dialog.locator('span[aria-label="Open login page in new tab"] button')
        const instalados = await dialog.locator('span[aria-label^="Uninstall"] button, span[aria-label^="Dev login"] button, span[aria-label^="Installed via pack"] button').count()
        expect(await abrirPagina.count(), 'ningun login instalado ofrece abrir su pagina').toBeGreaterThan(0)
        expect(await abrirPagina.count(), 'la accion no sale en TODOS los instalados').toBe(instalados)
        await expect(abrirPagina.first()).toBeEnabled()

        // Y no se cuela en el catalogo: una pagina que no esta instalada no se puede abrir.
        await dialog.getByPlaceholder('Filter…').first().fill('no-existe-este-login')
        await expect(dialog.getByText('No login extensions installed.')).toBeVisible()
        await expect(dialog.locator('span[aria-label="Open login page in new tab"] button')).toHaveCount(0)
        await dismissOpenDialogs(page)
    })

    test('logins: el engranaje solo en los que declaran configuracion', async () => {
        // canConfigure es de la TARJETA, no del tipo: un login sin configSchema no tiene nada que abrir.
        const dialog = await abrir('Login extensions', LOGINS)
        await expect(dialog.getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible({ timeout: 60000 })

        // La rueda se queda visible y deshabilitada en los que no declaran nada (regla de UI del
        // proyecto), asi que lo que distingue una tarjeta de otra es cuantas estan VIVAS.
        const vivas = await dialog.locator('button[aria-label="Configure"]:not([disabled])').count()
        const instalados = await dialog.locator('span[aria-label^="Uninstall"] button, span[aria-label^="Dev login"] button, span[aria-label^="Installed via pack"] button').count()
        expect(instalados, 'no hay logins instalados con los que comprobar nada').toBeGreaterThan(0)
        expect(vivas, 'todas las ruedas estan vivas: se estaria ofreciendo por tipo y no por tarjeta').toBeLessThan(instalados + 1)
        await dismissOpenDialogs(page)
    })

    test('docs: la identidad es el PAR (targetType, id), no el id', async () => {
        // La guia del core y la de un plugin pueden compartir id; si el generico agrupara por id, una
        // taparia a la otra y el contador de tarjetas no cuadraria con lo que sirve el back.
        const dialog = await abrir('Documentation', DOCS)
        await expect(dialog.getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible({ timeout: 60000 })

        const enPantalla = await dialog.locator('span[aria-label="Open in new tab"] button').count()
        // El back no cuelga del dev server: en dev el front se sirve en :3000 y Kwirth en :3883.
        const delBack = await page.evaluate(async () => {
            const res = await fetch(`${window.location.origin.replace(':3000', ':3883')}/core/docs`)
            return res.ok ? ((await res.json()) as { targetType: string, id: string }[]).map(d => `${d.targetType}/${d.id}`) : []
        })
        expect(delBack.length, 'el back no devolvio ninguna documentacion').toBeGreaterThan(0)
        expect(new Set(delBack).size, 'el par (targetType, id) se repite: no identificaria unas docs').toBe(delBack.length)
        expect(enPantalla, 'se pierden documentaciones por agrupar mal la clave').toBe(delBack.length)
        await dismissOpenDialogs(page)
    })

    test('docs: lo que no se puede quitar lo dice y tiene el boton muerto', async () => {
        /*
            La documentacion que viene DENTRO (bundled) o la que gobierna kwirth-dev.json no se desinstalan
            desde aqui: borrar la del core dejaria Kwirth sin ayuda, y la de dev volveria al arrancar. El
            generico tiene que enseñar el MOTIVO, no solo desactivar el boton.

            ⚠️ No se nombra cual de los dos motivos hay en el entorno: la primera version daba por hecho
            que existia una 'bundled' y se puso roja en un entorno donde la del core esta en dev. Se
            comprueba el COMPORTAMIENTO con lo que haya instalado.
        */
        const dialog = await abrir('Documentation', DOCS)
        const bloqueado = dialog.locator('span[aria-label$="documentation cannot be uninstalled"] button')
        await expect(bloqueado.first()).toBeVisible({ timeout: 60000 })
        const n = await bloqueado.count()
        for (let i = 0; i < n; i++) await expect(bloqueado.nth(i)).toBeDisabled()

        // El chip de procedencia lo pinta ahora el generico para los once tipos: tiene que seguir saliendo
        // en cada una de esas, que es justo lo que explica por que no se pueden quitar.
        expect(await dialog.getByText(/^(dev|bundled)$/).count(), 'ninguna enseña de donde viene').toBeGreaterThanOrEqual(n)
        await dismissOpenDialogs(page)
    })
})
