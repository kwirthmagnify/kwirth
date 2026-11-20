import { test, expect, Page, Locator } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    Extension tags in the generic manager dialog (plans/extension-taxonomy): the cards show their tags, and
    each section —installed and catalog— has its own tags filter, which narrows with AND: ticking
    'observability' and then 'kubernetes' leaves only what carries BOTH.

    The plugins manager is used because it is the richest one. Nothing is assumed about which plugins it
    has: the tags to tick are taken from what each filter offers, and every check is about the cards that
    remain, against the count before.

    NON-destructive: it opens a dialog, filters and closes it. Nothing is installed or uninstalled.
*/

const CATALOG_FILTER = 'Filter catalog by tags'
const INSTALLED_FILTER = 'Filter installed by tags'

test.describe.serial('extension tags', () => {
let page: Page

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    await login(page)
    await dismissOpenDialogs(page)
})

test.afterAll(async () => { await page?.close() })

const dialog = () => page.getByRole('dialog').filter({ hasText: /Manage (channel )?plugins/i })

/** The tags of every card on screen in a section, one array per card. */
const cardTags = async (section: Locator): Promise<string[][]> => {
    const rows = section.getByTestId('extension-tags')
    const n = await rows.count()
    const result: string[][] = []
    for (let i = 0; i < n; i++) result.push(await rows.nth(i).locator('.MuiChip-label').allInnerTexts())
    return result
}

/** What a filter offers, read by opening it and closing it again. */
const offeredBy = async (filterLabel: string): Promise<string[]> => {
    await page.getByRole('combobox', { name: filterLabel }).click()
    const offered = (await page.getByRole('option').allInnerTexts()).map(o => o.trim())
    await page.locator('.MuiPopover-root .MuiBackdrop-root').click()
    return offered
}

/*
    Ticks one tag in a filter and closes the dropdown. Closed by its BACKDROP, not with Escape: an open MUI
    popover hides the rest of the app from the accessibility tree, and Escape depends on where the focus is.
*/
const tickTag = async (filterLabel: string, tag: string): Promise<void> => {
    await page.getByRole('combobox', { name: filterLabel }).click()
    await page.getByRole('option', { name: tag, exact: true }).click()
    await page.locator('.MuiPopover-root .MuiBackdrop-root').click()
    await page.waitForTimeout(300)
}

/** The tags of a section ordered by how many cards carry them, most used first. */
const byUse = (all: string[][]): string[] =>
    [...new Set(all.flat())].map(t => ({ t, n: all.filter(c => c.includes(t)).length })).sort((a, b) => b.n - a.n).map(x => x.t)

/*
    The whole AND check on one section: tick its two most used tags one after the other, check what is
    left each time against the count before, and Clear back to everything.
*/
const checkSection = async (section: Locator, filterLabel: string): Promise<void> => {
    const all = await cardTags(section)
    expect(all.length, 'no cards in the section').toBeGreaterThan(0)
    expect(all.filter(t => t.length > 0).length, 'no card shows tags').toBeGreaterThan(0)

    // It starts empty — no filter — and offers only the tags this section uses.
    const filter = page.getByRole('combobox', { name: filterLabel })
    await expect(filter).toContainText('All tags')
    expect(await offeredBy(filterLabel)).toEqual([...new Set(all.flat())].sort())

    const [first, second] = byUse(all)
    expect(second, 'fewer than two tags in the section').toBeDefined()

    await tickTag(filterLabel, first)
    const one = await cardTags(section)
    expect(one.length).toBe(all.filter(c => c.includes(first)).length)
    for (const tags of one) expect(tags).toContain(first)

    await tickTag(filterLabel, second)
    await expect(filter).toContainText(`${first} + ${second}`)
    const both = await cardTags(section)
    expect(both.length).toBe(all.filter(c => c.includes(first) && c.includes(second)).length)
    expect(both.length).toBeLessThanOrEqual(one.length)
    for (const tags of both) {
        expect(tags).toContain(first)
        expect(tags).toContain(second)
    }

    // Clear gives the whole section back, and is disabled once there is nothing to clear.
    const clear = dialog().getByRole('button', { name: `Clear: ${filterLabel}` })
    await clear.click()
    await expect(filter).toContainText('All tags')
    expect((await cardTags(section)).length).toBe(all.length)
    await expect(clear).toBeDisabled()
}

test('the catalog cards carry tags, and the catalog tags filter narrows with AND', async () => {
    await clickExtensionMenuItem(page, 'Plugins')
    await dialog().waitFor({ timeout: 60000 })
    const available = dialog().getByTestId('extensions-available')
    // The catalog resolves remote manifests before it paints: up to 60 s on a loaded machine.
    await available.getByTestId('extension-tags').first().waitFor({ timeout: 60000 })
    await checkSection(available, CATALOG_FILTER)
})

test('the installed section has its own tags filter, and it does not touch the catalog', async () => {
    const installed = dialog().getByTestId('extensions-installed')
    const available = dialog().getByTestId('extensions-available')
    const catalogBefore = (await cardTags(available)).length
    await checkSection(installed, INSTALLED_FILTER)

    // Independent, like the text filters: narrowing the installed ones leaves the catalog whole.
    await tickTag(INSTALLED_FILTER, byUse(await cardTags(installed))[0])
    expect((await cardTags(available)).length).toBe(catalogBefore)
    await expect(page.getByRole('combobox', { name: CATALOG_FILTER })).toContainText('All tags')
    await dialog().getByRole('button', { name: `Clear: ${INSTALLED_FILTER}` }).click()

    await dialog().getByRole('button', { name: 'CLOSE' }).click()
})
})
