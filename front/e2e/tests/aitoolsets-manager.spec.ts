import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    The GENERIC extension manager (ExtensionManagerDialog), premiered by the `aitoolset` type
    (plan: plans/ai-tools/PLAN.md, S1). What is watched here is not "that something gets painted", but
    the decisions the generic one has to honour in order to replace the ten bespoke dialogs:

      · what is installed and the catalogue are TWO separate sections, each with its filter
      · an extension already installed cannot be installed again from the catalogue
      · a type that does NOT declare a configuration dialog shows no cog
      · a card's chips share a size (mixing sizes looks untidy)

    NON-destructive: it only opens the dialog, filters and switches view. It installs and uninstalls
    nothing.

    ⚠️ The spec names NO particular toolset, and that is deliberate: the first version assumed the
    installed one was `playground` and went red the day the environment came to have the Kubernetes ones.
    What is checked is the manager's BEHAVIOUR with whatever is installed, whatever that may be.
*/

const DIALOG = /Manage AI toolsets/i

interface IChipSeen { text: string, height: number, font: string }

test.describe.configure({ mode: 'serial' })

test.describe('gestor generico de extensiones: aitoolsets', () => {
    let page: Page

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage()
        await login(page)
        await dismissOpenDialogs(page)
        await clickExtensionMenuItem(page, 'AI toolsets')
        // The catalogue is not instantaneous: the back end resolves the remote manifests before
        // answering, and on a loaded machine that runs well past short timeouts.
        await page.getByRole('dialog').filter({ hasText: DIALOG }).waitFor({ timeout: 40000 })
    })

    test.afterAll(async () => {
        await dismissOpenDialogs(page).catch(() => {})
        await page.close()
    })

    const dialog = () => page.getByRole('dialog').filter({ hasText: DIALOG })

    /*
        Whether ANY toolset in this environment is loaded from `kwirth-dev.json`.

        It used to be a given —every toolset was a dev one— so two tests below asserted the dev
        wording unconditionally. The day the toolsets were installed from the marketplace instead,
        both went red without a single thing being broken. What this manager promises does not
        depend on where an extension came from, so the checks that DO depend on it are guarded.
    */
    const anyDevLoaded = async (): Promise<boolean> => await dialog().getByText('dev active').count() > 0

    test('el tipo aitoolset tiene su entrada de menu y abre el gestor generico', async () => {
        await expect(dialog()).toBeVisible()
        // The generic dialog's two sections, with the type's name interpolated from the descriptor
        await expect(dialog().getByText('Installed AI toolsets')).toBeVisible()
        await expect(dialog().getByText('Available AI toolsets')).toBeVisible()
    })

    test('lo instalado sale con su version y el numero REAL de tools', async () => {
        // The counter is not stated by the package: the back end counts it over the REGISTRY, so a
        // back.js that fails to load would show up WITHOUT a chip instead of lying with the number the
        // manifest carried. Hence the requirement that there be a chip and that the number be > 0.
        await expect(dialog().getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible({ timeout: 20000 })
        const chips = await dialog().getByText(/^\d+ tools?$/).allTextContents()
        expect(chips.length, 'ningun toolset instalado enseña su contador de tools').toBeGreaterThan(0)
        for (const c of chips) expect(Number(c.replace(/\D/g, '')), `contador vacio: ${c}`).toBeGreaterThan(0)
    })

    test('el catalogo publico sirve el toolset y no deja reinstalarlo', async () => {
        // It is in dev, so the catalogue has to say so and the install button has to be dead.
        // ⚠️ The aria-label is carried by the <span> wrapping the IconButton (MUI cannot label a disabled
        // button), so it is looked up there and not by the button's accessible name.
        // There may be several in the catalogue: some installed and some not. It is enough that those
        // that ARE have a dead button — and that there be at least one, or the test would prove nothing.
        //
        // ⚠️ The reason distinguishes who loads it: a DEV extension cannot be told to "uninstall first"
        // because it is not uninstalled — it is removed from kwirth-dev.json. ThemeManagerDialog carried
        // this and the generic one inherited it on migration, so both reasons are accepted here.
        const yaInstalados = dialog().locator('span[aria-label^="Already installed"] button, span[aria-label^="A dev version"] button')
        // The catalogue is not instant: the back resolves the remote manifests before answering.
        await expect(yaInstalados.first()).toBeVisible({ timeout: 40000 })
        expect(await yaInstalados.count(), 'ningun toolset del catalogo consta como instalado').toBeGreaterThan(0)
        for (let i = 0; i < await yaInstalados.count(); i++) await expect(yaInstalados.nth(i)).toBeDisabled()

        // A dev extension cannot be told "uninstall first" — it is not uninstalled, it is taken out
        // of kwirth-dev.json — so when one IS loaded the manager must say it with its own reason.
        if (await anyDevLoaded()) {
            await expect(dialog().locator('span[aria-label="A dev version is already loaded"]').first()).toBeVisible()
        }
    })

    test('el veredicto de canUninstall se ve y bloquea el boton', async () => {
        // A dev toolset is governed by kwirth-dev.json: uninstalling it from here would leave the index
        // saying one thing and startup putting it back. The descriptor forbids it and the generic dialog
        // has to show the REASON, not merely disable the button.
        if (await anyDevLoaded()) {
            await expect(dialog().locator('span[aria-label="Dev toolsets cannot be uninstalled"] button').first()).toBeDisabled()
            return
        }

        // With no dev toolset around, the other half of the same rule is what can be checked: one
        // installed from a marketplace CAN be uninstalled, so its button must be alive and say so.
        // Nothing is clicked — this spec is read-only, and uninstalling would take the user's toolset.
        const desinstalar = dialog().locator('span[aria-label="Uninstall"] button')
        expect(await desinstalar.count(), 'ningun toolset instalado ofrece desinstalar').toBeGreaterThan(0)
        await expect(desinstalar.first()).toBeEnabled()
    })

    test('un tipo sin dialogo de configuracion no enseña engranaje', async () => {
        // aitoolset does not declare renderConfigDialog: the generic dialog must NOT invent the action.
        // The day it is given configuration, this test falls and the decision has to be a deliberate one.
        await expect(dialog().locator('span[aria-label="Configure"]')).toHaveCount(0)
        await expect(dialog().getByText(/\d+ configs?$/)).toHaveCount(0)
    })

    test('los dos filtros son independientes: el de instalados no toca el catalogo', async () => {
        const filters = dialog().getByPlaceholder('Filter…')
        await expect(filters).toHaveCount(2)

        // What the catalogue holds, counted BEFORE filtering: the entries themselves, not the dev wording,
        // which only exists when a toolset is loaded from kwirth-dev.json.
        const enCatalogo = dialog().locator('span[aria-label^="Already installed"] button, span[aria-label^="A dev version"] button')
        const antes = await enCatalogo.count()

        await filters.first().fill('no-existe-este-toolset')
        await expect(dialog().getByText('No AI toolsets installed.')).toBeVisible()
        // the catalogue stays whole: the filter above is not a global one
        expect(await enCatalogo.count(), 'el filtro de instalados se ha llevado por delante el catalogo').toBe(antes)

        await filters.first().fill('')
        await expect(dialog().getByText(/^\d+ tools?$/).first()).toBeVisible()
    })

    test('la vista de lista enseña lo mismo que la de tarjetas', async () => {
        const enTarjetas = await dialog().getByText(/^\d+ tools?$/).allTextContents()

        await dialog().getByRole('button', { name: 'List view' }).click()
        await expect(dialog().getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible()
        expect(await dialog().getByText(/^\d+ tools?$/).allTextContents()).toEqual(enTarjetas)

        await dialog().getByRole('button', { name: 'Card view' }).click()
        await expect(dialog().getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible()
    })

    test('en la lista, las columnas de filas distintas quedan alineadas', async () => {
        // Rule 6 of the UI criteria (plans/extension-managers-ui/PLAN.md) can only be checked with
        // SEVERAL rows: `extensionRowCells` returns loose cells — not one container per row — precisely
        // so that they share the grid. With a single row any layout looks correct, and that is why this
        // was noted as pending until there was a second toolset in the catalogue.
        //
        // ⚠️ It is measured INSIDE the catalogue: installed and available are two different grids, and
        // their columns need not agree with each other. And the catalogue's rows carry different numbers
        // of chips ('dev active' on only one), which is exactly what a per-row layout would misalign.
        await dialog().getByRole('button', { name: 'List view' }).click()
        await expect(dialog().locator('.MuiSelect-select').first()).toBeVisible({ timeout: 40000 })

        // ⚠️ VERSION Selects only. In the installed section there is another Select — the grant one —
        // living in a different column: lumping them together made the measurement fail by comparing
        // apples with oranges. They are told apart by their content, which is a version number.
        const columnXs = await dialog().locator('.MuiSelect-select').evaluateAll(els => els
            .map(e => ({ version: (e.textContent ?? '').replace(/​/g, '').trim(), left: Math.round(e.getBoundingClientRect().left) }))
            .filter(c => /^\d+\.\d+\.\d+$/.test(c.version)))

        expect(columnXs.length, 'el catalogo deberia traer dos toolsets').toBeGreaterThan(1)
        expect([...new Set(columnXs.map(c => c.left))], `columna de version desalineada: ${JSON.stringify(columnXs)}`).toHaveLength(1)

        await dialog().getByRole('button', { name: 'Card view' }).click()
    })

    test('todos los chips de una tarjeta miden lo mismo', async () => {
        // compactChip (MarketplaceBadge) is the common size of ALL the chips on an extension card. It is
        // really checked because the eye cannot tell: a chip with more contrast looks bigger even at the
        // same size, and conversely a real misalignment goes unnoticed.
        const chips: IChipSeen[] = await dialog().locator('.MuiChip-root').evaluateAll(els => els.map(el => ({
            text: (el.textContent ?? '').trim(),
            height: el.getBoundingClientRect().height,
            font: getComputedStyle(el).fontSize
        })))

        expect(chips.length, 'la tarjeta deberia traer chips').toBeGreaterThan(2)
        const heights = [...new Set(chips.map(c => c.height))]
        const fonts = [...new Set(chips.map(c => c.font))]
        expect(heights, `alturas distintas: ${JSON.stringify(chips)}`).toEqual([20])
        expect(fonts, `tamaños de letra distintos: ${JSON.stringify(chips)}`).toHaveLength(1)
    })
})
