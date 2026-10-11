import { test, expect, Page } from '@playwright/test'
import { login, pickCombo, openChannelCombo, channelOption, selectNamespaceForMetrics, openTabMenu, COMBO_CLUSTER, COMBO_VIEW, CLUSTER, NAMESPACE } from './helpers'

/**
 * The metrics channel, now a plugin, end to end against the running dev: it is offered where it
 * should be, its setup works, and it draws charts with REAL values coming from the core's 'metrics'
 * provider through the plugin's back end.
 *
 * Serial, and with ONE page for the whole file: the dominant cost is reloading the SPA against
 * react-scripts' dev server, so it is paid once. The tests share state and order matters: they go
 * from "selector" to "tab started" to "stopped".
 *
 * NON-DESTRUCTIVE: it only reads metrics. The tab it creates is not persisted between browser sessions.
 */
test.describe.configure({ mode: 'serial' })

// Trace and video off: the SPA keeps the websocket alive (metrics pushes every interval) and closing
// the page hangs finalising the trace. Failure screenshots are attached by hand in the afterEach.
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

// What the setup selects, and the titles the charts show for them (Chart.tsx builds the title from the name)
const CPU = 'kwirth_container_cpu_percentage'
const MEMORY = 'kwirth_container_memory_percentage'
const CPU_TITLE = 'Kwirth container CPU percentage'
const MEMORY_TITLE = 'Kwirth container memory percentage'

let page: Page

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
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

test('the plugin is offered with a resource view and not with the cluster view', async () => {
    // getChannelData(): resourced true, cluster false. A wrong flag in the port would show up here.
    await pickCombo(page, COMBO_CLUSTER, CLUSTER)

    await pickCombo(page, COMBO_VIEW, 'namespace')
    await openChannelCombo(page)
    await expect(channelOption(page), 'the metrics plugin is not loaded: is it in back/kwirth-dev.json?').toBeVisible()
    expect(await channelOption(page).getAttribute('aria-disabled')).not.toBe('true')
    await page.keyboard.press('Escape')

    await pickCombo(page, COMBO_VIEW, 'cluster')
    await openChannelCombo(page)
    expect(await channelOption(page).getAttribute('aria-disabled')).toBe('true')
    await page.keyboard.press('Escape')
})

test('Start opens the setup, and OK stays disabled until a metric is chosen', async () => {
    await selectNamespaceForMetrics(page)
    await page.getByRole('button', { name: 'ADD' }).click()
    await page.waitForTimeout(1500)

    await openTabMenu(page)
    await page.getByText('Start', { exact: true }).click()
    await expect(page.getByText('Configure metrics for namespace')).toBeVisible()

    /*
        The setup may come with metrics already chosen: the user's saved defaults ('Set as default').
        They are removed from the dialog (each chip's delete icon) so the gate can be checked; nothing is
        saved, the defaults stay as they were.
    */
    const dialog = page.getByRole('dialog')
    const chipDeletes = dialog.locator('.MuiChip-deleteIcon')
    while (await chipDeletes.count() > 0) {
        await chipDeletes.first().click()
        await page.waitForTimeout(100)
    }
    const ok = page.getByRole('button', { name: 'OK', exact: true })
    await expect(ok).toBeDisabled()

    // The list comes from the core's metricsList (requirements.metrics): if it is empty the plugin is
    // not receiving it, and the filter proves the list is the real one.
    await page.getByLabel('Filter').fill('kwirth_container_')
    await expect(page.getByRole('button', { name: CPU, exact: true })).toBeVisible()
    await page.getByRole('button', { name: CPU, exact: true }).click()
    await page.getByRole('button', { name: MEMORY, exact: true }).click()

    // the chosen ones appear as chips, and OK is enabled
    await expect(page.locator('.MuiChip-label', { hasText: CPU })).toBeVisible()
    await expect(page.locator('.MuiChip-label', { hasText: MEMORY })).toBeVisible()
    await expect(ok).toBeEnabled()
})

test('accepting the setup starts the channel and the charts fill with real values', async () => {
    await page.getByRole('button', { name: 'OK', exact: true }).click()

    // One chart per metric (namespace view, not merged)
    await expect(page.getByText(CPU_TITLE, { exact: true })).toBeVisible({ timeout: 60000 })
    await expect(page.getByText(MEMORY_TITLE, { exact: true })).toBeVisible()

    /*
        Real data, not just an empty card: the series is drawn as an SVG path by recharts. The back only
        answers once it holds two readings of the provider, and the first one is sent immediately on
        start, so within an interval (15 s) or two there has to be a line.
    */
    await expect(page.locator('.recharts-line-curve').first()).toBeVisible({ timeout: 60000 })

    // In namespace view the back names the asset after the namespace (getAssetMetricName)
    await expect(page.locator('.recharts-legend-item-text', { hasText: NAMESPACE }).first()).toBeVisible()
})

test('pause stops refreshing and resume continues it', async () => {
    // The channel declares pauseable: the menu item is enabled while it runs
    await openTabMenu(page)
    await page.getByRole('menuitem', { name: 'Pause' }).click()
    await page.waitForTimeout(800)
    // While paused the same item reads Resume
    await openTabMenu(page)
    await expect(page.getByRole('menuitem', { name: 'Resume' })).toBeVisible()
    await page.getByRole('menuitem', { name: 'Resume' }).click()
    await page.waitForTimeout(800)
    await expect(page.getByText(CPU_TITLE, { exact: true })).toBeVisible()
})

test('stop leaves the tab stopped, so Start is offered again', async () => {
    await openTabMenu(page)
    await page.getByText('Stop', { exact: true }).click()
    await page.waitForTimeout(1200)
    await openTabMenu(page)
    await expect(page.getByText('Start', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
})
