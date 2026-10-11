import { test, expect, Page } from '@playwright/test'
import { login, pickCombo, openChannelCombo, channelOption, openTabMenu, COMBO_CLUSTER, COMBO_VIEW, COMBO_NAMESPACE, CLUSTER, NAMESPACE } from './helpers'

/**
 * The cluster metrics (kwirth_cluster_*) in a merged chart of two namespaces.
 *
 * They are one value for the whole cluster. They used to be repeated inside every asset, so a merged
 * chart drew one identical line per namespace ("kube-system: 2.30", "kwirth: 2.30"), each named after a
 * namespace the value has nothing to do with. Now they travel in a series of their own, 'Cluster', and
 * the namespaces' charts do not carry them.
 *
 * NON-DESTRUCTIVE: it only reads metrics. The tab is not persisted between browser sessions.
 */
test.describe.configure({ mode: 'serial' })
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

// The second namespace: the one the dev Kwirth runs in, so it always has pods to measure
const OTHER_NAMESPACE = 'kwirth'
const CLUSTER_CPU = 'kwirth_cluster_cpu_percentage'
const CONTAINER_MEMORY = 'kwirth_container_memory_percentage'

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

/** The legend entries of the chart whose title is the given one. */
const legendOf = (title: string) => page.locator('.MuiCard-root').filter({ hasText: title }).locator('.recharts-legend-item-text')

test('two namespaces merged, with a cluster metric and a container metric', async () => {
    await pickCombo(page, COMBO_CLUSTER, CLUSTER)
    await pickCombo(page, COMBO_VIEW, 'namespace')
    await page.getByRole('combobox').nth(COMBO_NAMESPACE).click()
    await page.getByRole('listbox').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByRole('option', { name: NAMESPACE, exact: true }).click()
    await page.getByRole('option', { name: OTHER_NAMESPACE, exact: true }).click()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    await openChannelCombo(page)
    await channelOption(page).click()
    await page.getByRole('button', { name: 'ADD' }).click()
    await page.waitForTimeout(1500)

    await openTabMenu(page)
    await page.getByText('Start', { exact: true }).click()
    const dialog = page.getByRole('dialog')
    // start from an empty selection whatever the user's saved defaults are (nothing is saved)
    const chipDeletes = dialog.locator('.MuiChip-deleteIcon')
    while (await chipDeletes.count() > 0) {
        await chipDeletes.first().click()
        await page.waitForTimeout(100)
    }
    await page.getByLabel('Filter').fill('kwirth_c')
    await page.getByRole('button', { name: CLUSTER_CPU, exact: true }).click()
    await page.getByRole('button', { name: CONTAINER_MEMORY, exact: true }).click()
    // merge needs aggregate off; a saved default may have left it on
    if (await dialog.getByLabel('Aggregate').isChecked()) await dialog.getByLabel('Aggregate').uncheck()
    await dialog.getByLabel('Merge').check()
    await page.getByRole('button', { name: 'OK', exact: true }).click()

    await expect(page.getByText('Kwirth cluster CPU percentage', { exact: true })).toBeVisible({ timeout: 60000 })
    await expect(page.getByText('Kwirth container memory percentage', { exact: true })).toBeVisible({ timeout: 60000 })
})

test('the cluster metric is ONE series, named Cluster, not one per namespace', async () => {
    await expect(legendOf('Kwirth cluster CPU percentage')).toHaveText(['Cluster'], { timeout: 60000 })
})

test('the container metric keeps one series per namespace, and no Cluster series', async () => {
    const legend = legendOf('Kwirth container memory percentage')
    await expect(legend.filter({ hasText: NAMESPACE })).toHaveCount(1, { timeout: 60000 })
    await expect(legend.filter({ hasText: OTHER_NAMESPACE })).toHaveCount(1)
    await expect(legend.filter({ hasText: 'Cluster' })).toHaveCount(0)
})
