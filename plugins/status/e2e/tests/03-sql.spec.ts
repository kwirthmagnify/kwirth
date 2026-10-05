import { test, expect, Page } from '@playwright/test'
import { login, openChannelPicker, openTabMenu, CHANNEL } from './helpers'

/*
    The SQL tab (S‑SQL): the core's PostgreSQL/knex support — connection config, driver versions and the
    database list. Non-destructive: the channel only reads.
*/

test.describe.configure({ mode: 'serial' })
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

let page: Page

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    await login(page)
    const option = await openChannelPicker(page)
    await expect(option).toBeVisible()
    await expect(option).toHaveText(CHANNEL)
    await option.click()
    await page.getByRole('button', { name: 'ADD' }).click()
    await page.waitForTimeout(1500)
    await openTabMenu(page)
    const start = page.getByText('Start', { exact: true })
    if (await start.isVisible().catch(() => false)) await start.click()
    else await page.keyboard.press('Escape')
    await page.waitForTimeout(2500)
})

test.afterAll(async () => {
    await page?.goto('about:blank').catch(() => {})
    await page?.context().close().catch(() => {})
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
    const reachable = page.getByRole('chip', { name: 'reachable' })
    const notReachable = page.getByText(/Could not list databases/)
    await expect(reachable.or(notReachable)).toBeVisible({ timeout: 10000 })
})
