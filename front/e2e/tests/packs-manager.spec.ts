import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    Migration of the `pack` manager to the generic dialog (plan: plans/extension-managers-ui/PLAN.md).

    The plan marked packs as a candidate NOT to migrate: it is the only type that CONTAINS other
    extensions and installing it means loading each member's front. What is watched here is exactly what
    raised the doubt:

      · the MEMBERS LINE ('plugin, login' in the catalogue; '1 plugin, 1 login' when installed), which no
        other type has and which the generic one gained as `subtitle` on migrating it
      · that installing a pack REALLY installs what it brings, and uninstalling it takes it away
      · that the uninstall button warns about that, instead of the generic 'Uninstall'

    The full cycle is tested with the PUBLIC pack from the catalogue, and the environment is left as it
    was: if anything is left installed, the next run would see it and the result would stop meaning
    anything.
*/

const DIALOG = /Manage extension packs/i

test.describe.configure({ mode: 'serial' })

/** What a pack brings: 'Includes: 2 plugins, 1 theme' when installed, 'Includes: plugin, theme' in the catalogue.
    The prefix goes into the check: without it, the line fell below a truncated description and read as
    its continuation. */
const TIPOS = '(plugin|theme|homepage|sender|provider|webhook|login|docs|aitoolset|idp)'
const MIEMBROS = new RegExp(`^Includes: (\\d+ )?${TIPOS}s?(, (\\d+ )?${TIPOS}s?)*$`)

test.describe('gestor generico de extensiones: packs', () => {
    let page: Page

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage()
        await login(page)
        await dismissOpenDialogs(page)
        await clickExtensionMenuItem(page, 'Packs')
        await page.getByRole('dialog').filter({ hasText: DIALOG }).waitFor({ timeout: 40000 })
    })

    test.afterAll(async () => {
        await dismissOpenDialogs(page).catch(() => {})
        await page.close()
    })

    const dialog = () => page.getByRole('dialog').filter({ hasText: DIALOG })

    test('el tipo pack abre el gestor generico con sus dos secciones', async () => {
        await expect(dialog().getByText('Installed packs')).toBeVisible()
        await expect(dialog().getByText('Available packs')).toBeVisible()
    })

    test('el catalogo dice QUE trae cada pack, no solo su nombre', async () => {
        // It is the only line the type has of its own. Without it a pack is indistinguishable from any
        // other extension and there is no way to know what gets installed on pressing.
        // ⚠️ In the catalogue the version goes in a Select, not in a 'v0.0.0' chip: the button is awaited.
        await expect(dialog().locator('span[aria-label="Install"] button').first()).toBeVisible({ timeout: 60000 })
        expect(await dialog().getByText(MIEMBROS).count(), 'ningun pack del catalogo dice que trae').toBeGreaterThan(0)
    })

    test('instalar un pack instala lo que trae, y desinstalarlo se lo lleva', async () => {
        test.setTimeout(240000)

        const instalable = dialog().locator('span[aria-label="Install"] button:not([disabled])')
        test.skip(await instalable.count() === 0, 'no hay ningun pack del catalogo sin instalar')

        await instalable.first().click()

        // Installed = the generic dialog draws it at the top with ITS OWN uninstall warning, not the generic one.
        const desinstalar = dialog().locator('span[aria-label="Uninstall pack (removes all member extensions)"] button')
        await expect(desinstalar).toHaveCount(1, { timeout: 90000 })
        expect(await dialog().locator('span[aria-label="Uninstall"] button').count(), 'usa el tooltip generico: no avisa de lo que borra').toBe(0)

        // And what is installed counts what is INSIDE, which differs from what the catalogue promises.
        await expect(dialog().getByText(/^Includes: \d+ \w+(s)?(, \d+ \w+(s)?)*$/).first()).toBeVisible()

        // The members really are installed, not just the pack: it is what made migrating it doubtful.
        const miembros = await page.evaluate(async () => {
            const base = window.location.origin.replace(':3000', ':3883')
            const packs = await (await fetch(`${base}/core/packs`)).json() as { extensions: { extensionType: string, id: string }[] }[]
            const dentro = packs.flatMap(p => p.extensions)
            const plugins = await (await fetch(`${base}/core/plugins`)).json() as { id: string }[]
            const logins = await (await fetch(`${base}/core/logins`)).json() as { id: string }[]
            return dentro.map(e => ({
                ...e,
                presente: e.extensionType === 'plugin' ? plugins.some(p => p.id === e.id)
                    : e.extensionType === 'login' ? logins.some(l => l.id === e.id)
                    : true
            }))
        })
        expect(miembros.length, 'el pack instalado no declara ningun miembro').toBeGreaterThan(0)
        for (const m of miembros) expect(m.presente, `${m.extensionType} '${m.id}' no quedo instalado`).toBe(true)

        // ── and now removing it, which is how the environment is left as it was ─────────────────────
        await desinstalar.click()
        await expect(desinstalar).toHaveCount(0, { timeout: 90000 })

        const quedan = await page.evaluate(async (ids: string[]) => {
            const base = window.location.origin.replace(':3000', ':3883')
            const plugins = await (await fetch(`${base}/core/plugins`)).json() as { id: string }[]
            const logins = await (await fetch(`${base}/core/logins`)).json() as { id: string }[]
            return [...plugins, ...logins].filter(e => ids.includes(e.id)).map(e => e.id)
        }, miembros.map(m => m.id))
        expect(quedan, 'quitar el pack dejo miembros sueltos detras').toEqual([])
    })

    test('la linea de miembros tambien esta en la vista de lista', async () => {
        // On migrating, the subtitle has to be drawn in BOTH views: the list one only had a name.
        await dialog().getByRole('button', { name: 'List view' }).click()
        expect(await dialog().getByText(MIEMBROS).count(), 'la vista de lista pierde lo que trae el pack').toBeGreaterThan(0)
        await dialog().getByRole('button', { name: 'Card view' }).click()
    })
})
