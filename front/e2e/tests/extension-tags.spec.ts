import { test, expect, Page, Locator } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    Extension tags in the generic manager dialog (plans/extension-taxonomy): the catalogue cards show
    their tags, and the tags filter narrows the catalogue with AND — ticking 'observability' and then
    'kubernetes' leaves only what carries BOTH.

    The plugins catalogue is used because it is the richest one. Nothing is assumed about which plugins it
    has: the tags to tick are taken from what the filter offers, and every check is about the cards that
    remain, against the count before.

    NON-destructive: it opens a dialog, filters and closes it. Nothing is installed or uninstalled.
*/

test.describe.serial('extension tags', () => {
let page: Page

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    await login(page)
    await dismissOpenDialogs(page)
})

test.afterAll(async () => { await page?.close() })

/** The tags of every catalogue card on screen, one array per card. */
const cardTags = async (available: Locator): Promise<string[][]> => {
    const rows = available.getByTestId('extension-tags')
    const n = await rows.count()
    const result: string[][] = []
    for (let i = 0; i < n; i++) result.push(await rows.nth(i).locator('.MuiChip-label').allInnerTexts())
    return result
}

/*
    Ticks one tag in the filter and closes the dropdown. Closed by its BACKDROP, not with Escape: an open
    MUI popover hides the rest of the app from the accessibility tree, and Escape depends on where the
    focus is.
*/
const tickTag = async (tag: string): Promise<void> => {
    await page.getByRole('combobox', { name: 'Filter by tags' }).click()
    await page.getByRole('option', { name: tag, exact: true }).click()
    await page.locator('.MuiPopover-root .MuiBackdrop-root').click()
    await page.waitForTimeout(300)
}

test('the catalogue cards carry tags, and the tags filter narrows with AND', async () => {
    await clickExtensionMenuItem(page, 'Plugins')
    const dialog = page.getByRole('dialog').filter({ hasText: /Manage (channel )?plugins/i })
    await dialog.waitFor({ timeout: 60000 })
    const available = dialog.getByTestId('extensions-available')
    // The catalogue resolves remote manifests before it paints: up to 60 s on a loaded machine.
    await available.getByTestId('extension-tags').first().waitFor({ timeout: 60000 })

    const all = await cardTags(available)
    expect(all.length, 'no catalogue cards').toBeGreaterThan(0)
    expect(all.filter(t => t.length > 0).length, 'no catalogue card shows tags').toBeGreaterThan(0)

    // The filter starts empty — no filter — and offers only the tags this catalogue uses.
    const filter = page.getByRole('combobox', { name: 'Filter by tags' })
    await expect(filter).toContainText('All tags')
    await filter.click()
    const offered = await page.getByRole('option').allInnerTexts()
    await page.locator('.MuiPopover-root .MuiBackdrop-root').click()
    const used = [...new Set(all.flat())].sort()
    expect(offered.map(o => o.trim())).toEqual(used)

    // The two most used tags: both give a non-empty list, and together they are the AND case.
    const byUse = used.map(t => ({ t, n: all.filter(c => c.includes(t)).length })).sort((a, b) => b.n - a.n)
    expect(byUse.length, 'fewer than two tags in the catalogue').toBeGreaterThanOrEqual(2)
    const [first, second] = [byUse[0].t, byUse[1].t]

    await tickTag(first)
    const one = await cardTags(available)
    expect(one.length).toBe(all.filter(c => c.includes(first)).length)
    for (const tags of one) expect(tags).toContain(first)

    await tickTag(second)
    await expect(filter).toContainText(`${first} + ${second}`)
    const both = await cardTags(available)
    expect(both.length).toBe(all.filter(c => c.includes(first) && c.includes(second)).length)
    expect(both.length).toBeLessThanOrEqual(one.length)
    for (const tags of both) {
        expect(tags).toContain(first)
        expect(tags).toContain(second)
    }

    // Clear gives the whole catalogue back, and is disabled once there is nothing to clear.
    const clear = dialog.getByRole('button', { name: 'Clear', exact: true })
    await clear.click()
    await expect(filter).toContainText('All tags')
    expect((await cardTags(available)).length).toBe(all.length)
    await expect(clear).toBeDisabled()

    await dialog.getByRole('button', { name: 'CLOSE' }).click()
})
})
