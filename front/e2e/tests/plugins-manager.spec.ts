import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    Migration of the `plugin` manager to the generic dialog (plan: plans/completed/extension-managers-ui/PLAN.md).

    Plugins are Kwirth's channels, the most visible type, and what is watched here is what changes
    behaviour on migrating it:

      · THE COG only on the plugins that declare configuration. It used to show on all of them —the
        installation configuration is free JSON and the manager could not know who reads it— and it
        opened an editor that in most cases was of no use. Now the plugin declares it with `configSchema`.
      · `requires` / `uses` in the catalogue: the generic one understands them for all eleven types, not
        only here.
      · the icon each plugin declares, painted by the generic one.

    NON-destructive: it opens, looks and closes.
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

// The name that gets drawn, resolved as in the descriptor: displayName, failing that the package's,
// failing that the id. A plugin from a private registry has the whole scope as its 'name', so using the
// id will not do.
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
            This was the reported symptom: the cog showed on all of them, including the ones that read no
            installation configuration at all, and it opened a JSON editor that did nothing. Now the
            plugin declares it (configSchema in its package.json) and the manager offers it only on those.
        */
        /*
            ⚠️ The cog does NOT disappear: it stays visible and disabled with the reason, which is the
            project's UI rule. What is counted is how many are ALIVE.
        */
        const configurables = delBack.filter(p => (p.configSchema?.length ?? 0) > 0)
        const vivas = await dialog().locator('button[aria-label="Configure"]:not([disabled])').count()
        expect(vivas, `hay ${vivas} ruedas vivas y solo ${configurables.length} plugins declaran configuracion`).toBe(configurables.length)

        // And the dead one has to SAY why, rather than simply not responding.
        if (configurables.length < delBack.length) {
            await expect(dialog().locator('span[aria-label="This plugin takes no installation config"] button').first()).toBeDisabled()
        }

        // If any declares it, its own opens its editor.
        if (configurables.length > 0) {
            await dialog().locator('button[aria-label="Configure"]:not([disabled])').first().click()
            await expect(page.locator('.MuiDialog-root')).toHaveCount(2, { timeout: 15000 })
            await page.getByRole('button', { name: /cancel/i }).last().click()
        }
    })

    test('el catalogo dice que necesita y que aprovecha cada plugin', async () => {
        // requires/uses are declared by the manifest and understood by the generic dialog. The number
        // goes in the chip and the detail in the tooltip: the list does not fit on the card, but without
        // the number there is no way to know that an extension drags others along.
        await expect(dialog().locator('span[aria-label$="nstall"] button').first()).toBeVisible({ timeout: 60000 })

        /*
            Which catalogue the back end serves is LISTENED to from the response the dialog itself asks
            for: the endpoint is authenticated and the session does not live in localStorage, so asking
            for it separately gives a 403.

            Doing it this way and not settling for looking at the screen matters: if the manifest brings
            dependencies and the card does not show them, they were lost along the way, which is exactly
            what has to be detected.
        */
        const cuerpo = page.waitForResponse(r => r.url().includes('/core/marketplace/plugin'), { timeout: 60000 })
        await dialog().getByRole('button', { name: 'Refresh catalog' }).click()
        const entradas = await (await cuerpo).json() as { id: string, version: string, requires?: unknown[], uses?: unknown[] }[]

        /*
            ⚠️ Only the version the card SHOWS counts, which is the newest of each id. Looking at the
            whole manifest gave a false red: censor declared dependencies in 0.2.48 and stopped declaring
            them in 0.2.49, so the catalogue brought them and the card —rightly— did not paint them.
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
        // The icon is declared by the extension (a name from the curated set or a sanitised SVG of its
        // own) and resolved by the generic dialog. Were it lost, every card would come out with the
        // 'extension' icon.
        const conIcono = delBack.filter(p => p.icon)
        test.skip(conIcono.length === 0, 'ningun plugin declara icono en este entorno')

        const iconos = await dialog().locator('svg[data-testid]').evaluateAll(els => els.map(e => e.getAttribute('data-testid')))
        const distintos = new Set(iconos.filter(Boolean))
        expect(distintos.size, 'todas las tarjetas usan el mismo icono: se perdio el que declara cada plugin').toBeGreaterThan(3)
    })
})
