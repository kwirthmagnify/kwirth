import { test, expect, Page } from '@playwright/test'
import { login, pickCombo, openChannelCombo, openTabMenu, COMBO_CLUSTER, COMBO_VIEW, CLUSTER, NAMESPACE } from './helpers'

/**
 * Magnify embedding the metrics plugin: Cluster → Namespaces → kube-system → Metrics.
 *
 * Before the plugin, Magnify built the metrics channel's initial state by hand, with the channel's own
 * types. Now the plugin hands it over through prepareExternalChannel (the same hook log and trivy use),
 * so what is checked here is precisely that hand-over: the window opens with the plugin's six default
 * metrics, and they fill with real values.
 *
 * NON-DESTRUCTIVE: it only reads. The Magnify tab is not persisted between browser sessions.
 */
test.describe.configure({ mode: 'serial' })
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

// What prepareExternalChannel starts with, as Chart.tsx titles it
const DEFAULT_TITLES = [
    'Kwirth container CPU percentage',
    'Kwirth container memory percentage',
    'Kwirth container transmit Mbps',
    'Kwirth container receive Mbps',
    'Kwirth container write Mbps',
    'Kwirth container read Mbps'
]

let page: Page

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    await page.setViewportSize({ width: 1600, height: 1000 })
    await login(page)
})

test.afterAll(async () => {
    await page?.goto('about:blank').catch(() => { })
    await page?.context().close().catch(() => { })
})

test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus && page) {
        await testInfo.attach('screenshot', { body: await page.screenshot(), contentType: 'image/png' })
    }
})

test('Magnify reaches the namespace list and offers Metrics', async () => {
    await pickCombo(page, COMBO_CLUSTER, CLUSTER)
    await pickCombo(page, COMBO_VIEW, 'cluster')
    await openChannelCombo(page)
    await page.getByRole('option').filter({ hasText: /^magnify$/ }).first().click()
    await page.getByRole('button', { name: 'ADD' }).click()
    await page.waitForTimeout(1500)
    await openTabMenu(page)
    await page.getByRole('menuitem', { name: 'Start' }).click()

    // The tree's folder names (the selector's 'Cluster' label would match a plain getByText)
    await page.locator('.sb-folder-name[title="Cluster"]').filter({ visible: true }).first().click({ timeout: 60000 })
    await page.locator('.sb-folder-name[title="Namespaces"]').filter({ visible: true }).first().click()
    await page.getByText(NAMESPACE, { exact: true }).filter({ visible: true }).first().click()

    await expect(page.getByRole('button', { name: 'Metrics' })).toBeVisible()
})

test('Metrics opens with the plugin\'s six default metrics, filled with real values', async () => {
    await page.getByRole('button', { name: 'Metrics' }).click()

    for (const title of DEFAULT_TITLES) {
        await expect(page.getByText(title, { exact: true }), `chart '${title}' missing: did prepareExternalChannel run?`).toBeVisible({ timeout: 60000 })
    }
    // Aggregated, so the series is named after the namespace, and it has a drawn line
    await expect(page.locator('.recharts-legend-item-text', { hasText: NAMESPACE }).first()).toBeVisible()
    await expect(page.locator('.recharts-line-curve').first()).toBeVisible({ timeout: 60000 })
})
