import { test, expect, Page } from '@playwright/test'
import { login } from './helpers'

/**
 * Magnify in a cluster WITHOUT the metrics provider: the overview says why there is no cluster usage,
 * instead of drawing three empty charts with no explanation.
 *
 * It needs the provider absent, which the dev normally is not, so it skips itself (with the reason) when
 * the provider is installed. To run it: take "metrics" out of back/kwirth-dev.json "providers", wait for
 * the back to restart, run this spec, and put it back.
 */
test.describe.configure({ mode: 'serial' })
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

let page: Page
let backUrl = ''
let authorization = ''

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    await page.setViewportSize({ width: 1600, height: 1000 })
    page.on('request', request => {
        const url = request.url()
        const header = request.headers()['authorization']
        if (!authorization && header && url.includes('/config/')) {
            authorization = header
            backUrl = url.substring(0, url.indexOf('/config/'))
        }
    })
    await login(page).catch(() => { })
    await expect.poll(() => authorization, { timeout: 60000 }).not.toBe('')
})

test.afterAll(async () => {
    await page?.goto('about:blank').catch(() => { })
    await page?.context().close().catch(() => { })
})

test('without the provider, Magnify\'s overview explains there is no cluster usage to draw', async ({ playwright }) => {
    const api = await playwright.request.newContext()
    const providers = await (await api.get(`${backUrl}/core/providers`, { headers: { Authorization: authorization } })).json() as { id: string }[]
    await api.dispose()
    test.skip(providers.some(p => p.id === 'metrics'), 'the metrics provider is installed: this case needs it absent (see the header of this file)')

    await page.getByRole('combobox').nth(0).click()
    await page.getByRole('option', { name: process.env.METRICS_E2E_CLUSTER ?? 'inCluster', exact: true }).click()
    await page.waitForTimeout(600)
    await page.getByRole('combobox').nth(1).click()
    await page.getByRole('option', { name: 'cluster', exact: true }).click()
    await page.waitForTimeout(600)
    const combos = page.getByRole('combobox')
    await combos.nth(await combos.count() - 1).click()
    await page.getByRole('option').filter({ hasText: /^magnify$/ }).first().click()
    await page.getByRole('button', { name: 'ADD' }).click()
    await page.waitForTimeout(1500)
    await page.locator('[data-testid="SettingsIcon"]').first().click({ force: true })
    await page.getByRole('menuitem', { name: 'Start' }).click()

    await expect(page.getByText(/The metrics provider is not installed in this cluster/)).toBeVisible({ timeout: 60000 })
    // and the empty charts are gone
    await expect(page.getByText('% CPU', { exact: true })).toHaveCount(0)
})
