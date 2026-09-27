import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    Migration of the `provider` manager to the generic dialog (plan: plans/extension-managers-ui/PLAN.md).

    It is the type with the most quirks of its own, and they are exactly what could be lost when throwing
    away its 600 lines:

      · the CORE providers (events, metrics) are not extensions and do not show up in the manager
      · it is configured in TWO ways, chosen by `hasFront`: the schema-driven form the core paints, or
        the UI the provider itself brings (being the one with its configurations and its endpoint)
      · the 'N configs' chip counts what the provider says, not what the core knows

    ⚠️ It is not checked against a fixed list of providers: the environment changes. The back end is asked
    what there is and that is compared with what gets painted.

    NON-destructive: it opens, looks and closes. It does not install, does not uninstall and saves no
    configuration.
*/

const DIALOG = /Manage providers/i

test.describe.configure({ mode: 'serial' })

interface IProviderRef {
    id: string
    displayName?: string
    name?: string
    version?: string
    core?: boolean
    hasFront?: boolean
    hasSchema?: boolean
    configNames?: string[]
    /** PLUVIDER: a plugin that also produces. It is listed here, but not managed from here. */
    pluvider?: boolean
    hostedBy?: string
}

test.describe('gestor generico de extensiones: providers', () => {
    let page: Page
    let delBack: IProviderRef[] = []

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage()
        await login(page)
        await dismissOpenDialogs(page)
        delBack = await page.evaluate(async () => {
            const base = window.location.origin.replace(':3000', ':3883')
            return await (await fetch(`${base}/core/providers`)).json()
        })
        await clickExtensionMenuItem(page, 'Providers')
        await page.getByRole('dialog').filter({ hasText: DIALOG }).waitFor({ timeout: 40000 })
    })

    test.afterAll(async () => {
        await dismissOpenDialogs(page).catch(() => {})
        await page.close()
    })

    const dialog = () => page.getByRole('dialog').filter({ hasText: DIALOG })

    /*
        THAT provider's card cog. It climbs from the name to the first ancestor with a cog inside:
        filtering divs by text returns either the name's <Typography> (with no buttons) or the container
        of all the cards (with somebody else's cog), and both shapes show the wrong thing.
    */
    const gearDe = (nombre: string) => dialog().getByText(nombre, { exact: true }).first()
        .locator('xpath=ancestor::*[.//button[@aria-label="Configure"]][1]')
        .locator('button[aria-label="Configure"]').first()

    test('los providers de CORE no se pintan: no son extensiones', async () => {
        // events and metrics come inside Kwirth. Were they to show up, the bin would invite removing
        // something that cannot be removed, and the installed counter would lie.
        const core = delBack.filter(p => p.core)
        // PLUVIDERS do not count as installed either: they are drawn (whoever comes here comes to see
        // what they can subscribe to) but they are neither installed nor uninstalled — they come and go
        // with their plugin, so they contribute no bin.
        const extensiones = delBack.filter(p => !p.core && !p.pluvider)
        expect(core.length, 'el back no devuelve ningun provider de core: el test no probaria nada').toBeGreaterThan(0)

        await expect(dialog().getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible({ timeout: 60000 })
        const papeleras = dialog().locator('span[aria-label="Uninstall"] button, span[aria-label^="Dev providers"] button, span[aria-label^="Installed via pack"] button')
        expect(await papeleras.count(), 'lo instalado no cuadra con las extensiones que sirve el back').toBe(extensiones.length)

        for (const p of core) {
            await expect(dialog().getByText(p.displayName ?? p.id, { exact: true }), `'${p.id}' es de core y no debe salir`).toHaveCount(0)
        }
    })

    /*
        PLUVIDERS: a plugin that also produces and publishes its information in-process. They are served
        in the SAME list as the providers —whoever consumes has no reason to know there are two kinds—
        and that is why they are painted here: whoever opens this dialog comes to see what they can
        subscribe to, and hiding them would force knowing in advance that they exist. What CANNOT be done
        is managing them from here.
    */
    test('un pluvider se pinta, marcado, con el nombre y la version de SU plugin', async () => {
        const pluviders = delBack.filter(p => p.pluvider)
        test.skip(pluviders.length === 0, 'ningun plugin publica como pluvider en este entorno')

        for (const p of pluviders) {
            const nombre = p.displayName ?? p.name ?? p.id
            await expect(dialog().getByText(nombre, { exact: true }).first(),
                `'${p.id}' no aparece en el gestor`).toBeVisible({ timeout: 60000 })
            // it is not versioned separately: it carries its plugin's version, not an invented one
            expect(p.version, `'${p.id}' deberia traer la version de su plugin`).toMatch(/^\d+\.\d+\.\d+$/)
        }
        // the chip that tells it apart from an installed provider
        await expect(dialog().getByText('pluvider', { exact: true }).first()).toBeVisible()
    })

    test('un pluvider no se puede desinstalar ni configurar desde aqui, y dice por que', async () => {
        // The project's rule is a VISIBLE control, disabled with its reason, never hidden: whoever sees
        // it has to be able to read why they cannot press it.
        const pluvider = delBack.find(p => p.pluvider)
        test.skip(!pluvider, 'ningun plugin publica como pluvider en este entorno')

        const host = pluvider!.hostedBy
        await expect(dialog().getByText(`Subscribe with id: ${pluvider!.id}`).first(),
            'el subtitulo tiene que dar el id con el que suscribirse').toBeVisible()
        await expect(dialog().locator(`[aria-label*="uninstall that plugin instead"]`).first(),
            `desinstalar deberia estar denegado remitiendo al plugin '${host}'`).toBeVisible()
        await expect(dialog().locator(`[aria-label*="Configured from the '${host}' plugin"]`).first(),
            'configurar deberia remitir al plugin').toBeVisible()
    })

    test('el chip de configs dice lo que dice el provider', async () => {
        // The core does not count providers' configurations: each one keeps its own. The chip merely
        // repeats what the provider declares, which is why one with several connections inside a single
        // config says 1.
        const conConfigs = delBack.filter(p => !p.core && (p.configNames?.length ?? 0) > 0)
        test.skip(conConfigs.length === 0, 'ningun provider tiene configuraciones en este entorno')

        for (const p of conConfigs) {
            const n = p.configNames!.length
            await expect(dialog().getByText(`${n} config${n > 1 ? 's' : ''}`).first(),
                `'${p.id}' declara ${n} y la tarjeta no lo dice`).toBeVisible()
        }
    })

    test('un provider con front propio abre SU dialogo, no el formulario del core', async () => {
        /*
            The difference shows in the title: the core's form is titled 'Configure: <name>', and the
            provider's UI brings its own. What is checked is that pressing the cog on one with `hasFront`
            does NOT bring up the core's form — which is what would happen if the migration had dropped
            the own-front path along the way.
        */
        const conFront = delBack.find(p => !p.core && p.hasFront)
        test.skip(!conFront, 'ningun provider con front propio en este entorno')

        const nombre = conFront!.displayName ?? conFront!.id
        await gearDe(nombre).click()

        /*
            ⚠️ `.MuiDialog-root` is counted, NOT getByRole('dialog'): with two dialogs stacked MUI puts
            aria-hidden on the one underneath and Playwright stops seeing it as a dialog, so the role
            says 1 while there are 2 on screen. It cost a while of diagnosis believing nothing opened.

            Its UI takes a while: the provider's front.js has to be downloaded and mounted.
        */
        await expect(page.locator('.MuiDialog-root'), 'no se abrio la UI del provider').toHaveCount(2, { timeout: 30000 })
        await expect(page.getByText(`Configure: ${nombre}`), 'se abrio el formulario del core en vez de la UI del provider').toHaveCount(0)
        await dismissOpenDialogs(page)
        await clickExtensionMenuItem(page, 'Providers')
        await dialog().waitFor({ timeout: 40000 })
    })

    test('un provider con schema se configura con el formulario del core', async () => {
        const conSchema = delBack.find(p => !p.core && !p.hasFront && p.hasSchema)
        test.skip(!conSchema, 'ningun provider con schema del core en este entorno')

        const nombre = conSchema!.displayName ?? conSchema!.id
        await gearDe(nombre).click()

        // The core draws the form from the provider's schema, and titles it with its name.
        const cfg = page.getByRole('dialog').filter({ hasText: `Configure: ${nombre}` })
        await expect(cfg).toBeVisible({ timeout: 20000 })
        await cfg.getByRole('button', { name: /cancel/i }).click()
    })

    test('🔴 el que no se configura de ninguna forma tiene la rueda muerta, y lo dice', async () => {
        /*
            There are providers that bring no front NOR declare a schema: for those the cog leads
            nowhere. Their bespoke dialog already left it dead with 'No configuration available', and on
            migrating that was lost: it came out alive and opened an empty form.

            The cog does NOT disappear — it stays visible and disabled, which is the project's UI rule.
        */
        // A PLUVIDER is not configured either, but its gear says something else — it points at its
        // plugin — so it has its own test and does not count here.
        const sinNada = delBack.filter(p => !p.core && !p.pluvider && !p.hasFront && !p.hasSchema)
        test.skip(sinNada.length === 0, 'todos los providers de este entorno se configuran de alguna forma')

        const muertas = dialog().locator('span[aria-label="No configuration available"] button')
        expect(await muertas.count(), `${sinNada.length} providers no se configuran y ninguna rueda lo dice`).toBe(sinNada.length)
        await expect(muertas.first()).toBeDisabled()
    })
})
