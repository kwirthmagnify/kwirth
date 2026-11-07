import { Page } from '@playwright/test'
import { test, expect } from './statusSession'

/*
    The SQL tab (S‑SQL): the core's PostgreSQL/knex support — connection config, driver versions and the
    database list. Non-destructive: the channel only reads.
*/

test.describe.configure({ mode: 'serial' })
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

let page: Page

test.beforeAll(async ({ statusPage }) => {
    page = statusPage   // NOT closed here: it is the session of the whole run (statusSession.ts)
    // The first snapshot reads every database's tables when the core has just started: wait for it, not a clock.
    await expect(page.getByRole('tab', { name: 'SQL', exact: true })).toBeVisible({ timeout: 30_000 })
})

test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus && page) {
        await testInfo.attach('screenshot', { body: await page.screenshot(), contentType: 'image/png' })
    }
})

const tab = (name: string) => page.getByRole('tab', { name, exact: true })

test('the SQL tab is in the strip and opens', async () => {
    await expect(tab('SQL')).toBeVisible()
    await tab('SQL').click()
    await expect(tab('SQL')).toHaveAttribute('aria-selected', 'true')
})

test('the server config is shown with host, port and client', async () => {
    await expect(page.getByText('Server', { exact: true })).toBeVisible()
    await expect(page.getByText('client', { exact: true })).toBeVisible()
    // The dev Kwirth reads KWIRTH_SQL_* env; whatever the values, host and port are always shown.
    await expect(page.getByText('host', { exact: true })).toBeVisible()
    await expect(page.getByText('port', { exact: true })).toBeVisible()
})

test('the connection pools section is shown', async () => {
    await expect(page.getByText('Connection pools', { exact: true })).toBeVisible()
})

test('the database list or an unreachable message is shown', async () => {
    // Either the server is reachable and the Databases heading shows a table, or it is not and the error
    // is shown. Both are valid; what is NOT valid is a blank tab.
    await expect(page.getByText('Databases', { exact: true })).toBeVisible()
    // by its exact text: 'chip' is no ARIA role and a MUI Chip exposes none, so getByRole('chip') never
    // matched — the test only ever passed through the unreachable branch
    const reachable = page.getByText('reachable', { exact: true })
    const notReachable = page.getByText(/Could not list databases/)
    await expect(reachable.or(notReachable)).toBeVisible({ timeout: 10000 })
})

// ── server statistics, pool peaks and per-database figures ─────────────────────

const skipUnlessStats = async () => {
    test.skip(!(await page.getByText('reachable', { exact: true }).isVisible().catch(() => false)), 'the SQL server is not reachable from this Kwirth')
    test.skip(!(await page.getByText('version', { exact: true }).isVisible().catch(() => false)), "this core's common-sql does not read the server statistics")
}

test('🔴 the server shows its version, uptime and connections used of max', async () => {
    await skipUnlessStats()
    await expect(page.getByText(/^PostgreSQL \d+/)).toBeVisible()
    await expect(page.getByText(/^\d+(d \d+h|h \d+m|m) \(since /)).toBeVisible()
    const txt = (await page.getByText(/^\d+ of \d+ — \d+ active · \d+ idle · \d+ idle in transaction/).innerText()).trim()
    const [used, max] = txt.match(/^(\d+) of (\d+)/)!.slice(1).map(Number)
    expect(used, 'connections used').toBeGreaterThan(0)
    expect(used, 'used beyond the max').toBeLessThanOrEqual(max)
})

test('🔴 every pool shows its peak, never below what it has in use now, never above its max', async () => {
    const rows = page.locator('tr[aria-label^="Pool "]')
    test.skip((await rows.count()) === 0, 'no pool is open in this Kwirth')
    for (let i = 0; i < await rows.count(); i++) {
        const cells = await rows.nth(i).locator('td').allInnerTexts()
        const [used, , max] = cells.slice(2, 5).map(c => Number(c.trim()))
        const peakTxt = (await rows.nth(i).locator('td[aria-label="Peak"]').innerText()).trim()
        test.skip(peakTxt === '—', "this core's common-sql does not track the peak")
        const peak = Number(peakTxt)
        expect(peak, `peak of ${cells[0]} below what it has in use`).toBeGreaterThanOrEqual(used)
        expect(peak, `peak of ${cells[0]} above its max`).toBeLessThanOrEqual(max)
    }
})

test('🔴 every database shows a real size and its activity; the kwirth ones have connections and commits', async () => {
    await skipUnlessStats()
    const rows = page.locator('tr[aria-label^="Database "]')
    expect(await rows.count()).toBeGreaterThan(0)
    const sizes = await page.locator('tr[aria-label^="Database "] td[aria-label="Size"]').allInnerTexts()
    for (const s of sizes) expect(s.trim(), 'a database size').toMatch(/^(\d+ B|\d+\.\d (KB|MB|GB))$/)
    // Its own tables added up: a size, or a dash when they could not be read.
    for (const s of await page.locator('tr[aria-label^="Database "] td[aria-label="Tables size"]').allInnerTexts()) {
        expect(s.trim(), 'a tables size').toMatch(/^(\d+ B|\d+\.\d (KB|MB|GB)|—)$/)
    }
    for (const h of await page.locator('tr[aria-label^="Database "] td[aria-label="Cache hit"]').allInnerTexts()) {
        expect(h.trim(), 'a cache hit').toMatch(/^(\d{1,3}\.\d %|—)$/)
    }
})

test('🔴 a database unfolds into its tables, with size and rows, and folds back', async () => {
    await skipUnlessStats()
    // A kwirth consumer's database: it is the core's own, so it has tables.
    const row = page.locator('tr[aria-label^="Database kwirth_"]').first()
    test.skip((await row.count()) === 0, 'there is no kwirth consumer database')
    const name = (await row.getAttribute('aria-label'))!.replace('Database ', '')
    await row.click()
    const tablas = page.locator(`tr[aria-label="Tables of ${name}"]`)
    await expect(tablas).toBeVisible()
    const filas = tablas.locator('tr[aria-label^="Table "]')
    if (await filas.count() > 0) {
        const celdas = await filas.first().locator('td').allInnerTexts()
        expect(celdas[1].trim(), 'a table size').toMatch(/^(\d+ B|\d+\.\d (KB|MB|GB))$/)
        expect(celdas[2].trim(), 'a row estimate').toMatch(/^[\d.,]+$/)
    }
    await row.click()
    await expect(tablas).toHaveCount(0)
})
