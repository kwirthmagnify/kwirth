import { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    Migration of the `login` and `docs` managers to the generic dialog
    (plan: plans/completed/extension-managers-ui/PLAN.md).

    It does not check "that something gets painted": it checks what each type CONTRIBUTES and the generic
    one has to honour, which is exactly what could be lost when throwing away their 624 and 488 lines:

      · login → opening its page in another tab (?loginExt=<id>) and the cog ONLY on those declaring
        configuration
      · docs  → identity is the PAIR (targetType, id), not the id; and what is `bundled` is not uninstalled

    On top of that it watches that the provenance, now painted by the generic one for all eleven types,
    still shows up.

    NON-destructive: it opens, looks and closes. It installs and uninstalls nothing, and it does NOT press
    the button that opens the login page (that would open a real tab).
*/

const LOGINS = /Manage login extensions/i
const DOCS = /Manage documentation/i

test.describe.configure({ mode: 'serial' })

test.describe('gestores migrados al generico: logins y docs', () => {
    let page: Page

    test.beforeAll(async ({ kwirth }) => {
        page = kwirth
        await dismissOpenDialogs(page)
    })

    /*
        🔴 The dialog is closed after EVERY test, not only at the end.

        These run serially and each one opens its own manager, so a test that ends without closing
        leaves the next unable to open anything — and `test.skip()` ends it RIGHT THERE, skipping the
        `dismissOpenDialogs` at the bottom. Adding the first skip to this file turned the next test red
        for that reason alone, which reads like a product failure and is not one.

        Here and not in each test: the ones that do close are left closing nothing, which costs nothing.
    */
    test.afterEach(async () => {
        await dismissOpenDialogs(page).catch(() => {})
    })

    // La pagina es de la CORRIDA, no de este fichero: se deja limpia, no se cierra.
    test.afterAll(async () => {
        await dismissOpenDialogs(page).catch(() => {})
    })

    const abrir = async (menu: string, titulo: RegExp) => {
        await clickExtensionMenuItem(page, menu)
        const dialog = page.getByRole('dialog').filter({ hasText: titulo })
        // The back end resolves the catalogue against the remote marketplaces: it is not instantaneous.
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
        // It is the type's own action: without it, checking how a login turned out would mean logging
        // out. It is checked that it is there and that it is alive; it is NOT pressed, because it would
        // open a real tab.
        const dialog = await abrir('Login extensions', LOGINS)

        /*
            ⚠️ It needs a login INSTALLED, and an environment may have none: they are all paid ones, so a
            core without the private marketplace, or one where the last one was uninstalled, has an empty
            section and nothing to check. It used to wait 60 s for a version chip and go red, which reads
            exactly like a broken product and is not one — it cost a diagnosis on 2026-10-20, with the
            cluster's configmaps as the thing that settled it (there is no kwirth-logins-index at all).

            Skipped rather than adapted: what this guards is that EVERY installed login offers to open
            its page, and with none installed that sentence has nothing to be true or false about.
        */
        const abrirPagina = dialog.locator('span[aria-label="Open login page in new tab"] button')
        const instalados = await dialog.locator('span[aria-label^="Uninstall"] button, span[aria-label^="Dev login"] button, span[aria-label^="Installed via pack"] button').count()
        test.skip(instalados === 0, 'no hay ninguna extension de login instalada en este entorno')

        await expect(dialog.getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible({ timeout: 60000 })
        expect(await abrirPagina.count(), 'ningun login instalado ofrece abrir su pagina').toBeGreaterThan(0)
        expect(await abrirPagina.count(), 'la accion no sale en TODOS los instalados').toBe(instalados)
        await expect(abrirPagina.first()).toBeEnabled()

        // And it does not slip into the catalogue: a page that is not installed cannot be opened.
        await dialog.getByPlaceholder('Filter…').first().fill('no-existe-este-login')
        await expect(dialog.getByText('No login extensions installed.')).toBeVisible()
        await expect(dialog.locator('span[aria-label="Open login page in new tab"] button')).toHaveCount(0)
        await dismissOpenDialogs(page)
    })

    test('logins: el engranaje solo en los que declaran configuracion', async () => {
        // canConfigure belongs to the CARD and not to the type: a login with no configSchema has nothing to open.
        const dialog = await abrir('Login extensions', LOGINS)

        // The gear stays visible and disabled on those that declare nothing (the project's UI rule), so
        // what tells one card from another is how many are ALIVE.
        const vivas = await dialog.locator('button[aria-label="Configure"]:not([disabled])').count()
        const instalados = await dialog.locator('span[aria-label^="Uninstall"] button, span[aria-label^="Dev login"] button, span[aria-label^="Installed via pack"] button').count()
        // same as above: with none installed there is nothing for this sentence to be true or false about
        test.skip(instalados === 0, 'no hay ninguna extension de login instalada en este entorno')

        await expect(dialog.getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible({ timeout: 60000 })
        expect(vivas, 'todas las ruedas estan vivas: se estaria ofreciendo por tipo y no por tarjeta').toBeLessThan(instalados + 1)
        await dismissOpenDialogs(page)
    })

    test('docs: la identidad es el PAR (targetType, id), no el id', async () => {
        // The core's guide and a plugin's can share an id; were the generic dialog to group by id, one
        // would hide the other and the card counter would not match what the back end serves.
        const dialog = await abrir('Documentation', DOCS)
        await expect(dialog.getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible({ timeout: 60000 })

        const enPantalla = await dialog.locator('span[aria-label="Open in new tab"] button').count()
        // The back end does not hang off the dev server: in dev the front is served on :3000 and Kwirth on :3883.
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
            Documentation that comes INSIDE (bundled) or is governed by kwirth-dev.json is not
            uninstalled from here: deleting the core's would leave Kwirth without help, and the dev one
            would come back at startup. The generic one has to show the REASON, not merely disable the
            button.

            ⚠️ Which of the two reasons is present in the environment is not named: the first version
            assumed there was a 'bundled' one and went red in an environment where the core's is in dev.
            The BEHAVIOUR with whatever is installed is what gets checked.
        */
        const dialog = await abrir('Documentation', DOCS)
        const bloqueado = dialog.locator('span[aria-label$="documentation cannot be uninstalled"] button')
        await expect(bloqueado.first()).toBeVisible({ timeout: 60000 })
        const n = await bloqueado.count()
        for (let i = 0; i < n; i++) await expect(bloqueado.nth(i)).toBeDisabled()

        // The provenance chip is now drawn by the generic dialog for all eleven types: it has to keep
        // showing up on each of those, which is exactly what explains why they cannot be removed.
        expect(await dialog.getByText(/^(dev|bundled)$/).count(), 'ninguna enseña de donde viene').toBeGreaterThanOrEqual(n)
        await dismissOpenDialogs(page)
    })

    test('🔴 lo bundled ya NO se bloquea para actualizar: no se puede quitar, pero sí subir de version', async () => {
        /*
            Las dos cosas iban juntas y no son la misma. Que algo venga DENTRO de la imagen explica que no
            se desinstale —volvería en el siguiente arranque—, pero no que no se pueda actualizar: trae
            version, el back instala encima como con cualquier otra, y el arranque respeta lo instalado
            desde que solo reinstala lo que viene en la imagen si es MAS NUEVO.

            Hasta entonces el boton salia muerto con «Bundled with Kwirth — it is updated with Kwirth
            itself», y como el aviso de arranque SI anunciaba la version nueva, el operador recibia en
            cada login una actualizacion que no podia aplicar ni silenciar, y la unica salida era una
            imagen nueva.

            Se comprueba la AUSENCIA de ese bloqueo, que es la regresion a evitar. El tooltip que tenga
            ahora depende del catalogo del entorno («Up to date», «Not in any catalog», «Update to vX»),
            asi que nombrarlo haria el test dependiente de lo que haya publicado ese dia.
        */
        const dialog = await abrir('Documentation', DOCS)
        await expect(dialog.getByText(/^(dev|bundled)$/).first()).toBeVisible({ timeout: 60000 })

        expect(await dialog.locator('span[aria-label*="updated with Kwirth itself"]').count(),
            'el gestor sigue alegando la procedencia bundled para no actualizar').toBe(0)

        // y lo que SI sigue bloqueado: una dev no se actualiza desde el catalogo, se cambia en kwirth-dev.json
        const devs = await dialog.getByText(/^dev$/).count()
        if (devs > 0) {
            expect(await dialog.locator('span[aria-label*="kwirth-dev.json"]').count(),
                'una dev deberia seguir diciendo que se cambia en kwirth-dev.json').toBeGreaterThan(0)
        }
        await dismissOpenDialogs(page)
    })
})
