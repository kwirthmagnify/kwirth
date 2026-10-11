import { test, expect, Page } from '@playwright/test'
import { readdirSync } from 'fs'
import path from 'path'
import { login, pickCombo, openChannelCombo, channelOption, openTabMenu, COMBO_CLUSTER, COMBO_VIEW, COMBO_NAMESPACE, CLUSTER } from './helpers'

// Screenshots for the guide (docs/<live version>/_media/guide/). DARK theme and 1600x900, like the rest.
// Not part of the normal suite (a zz- file, launched by hand). Traces and video off: the SPA leaves the
// websocket open and Playwright's teardown hangs with them enabled.
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

/*
    This plugin's guide lives in the CORE's documentation tree, and the captures go to the LIVE version:
    the highest `docs/<x.y.z>`, resolved the same way as in `back/scripts/build-docs-tgz.js`.
*/
const DOCS = path.resolve(__dirname, '..', '..', '..', '..', 'docs')
const liveDocsVersion = (): string =>
    readdirSync(DOCS, { withFileTypes: true })
        .filter(d => d.isDirectory() && /^\d+\.\d+\.\d+$/.test(d.name))
        .map(d => d.name)
        .sort((a, b) => {
            const pa = a.split('.').map(Number)
            const pb = b.split('.').map(Number)
            return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2]
        })
        .pop() ?? ''

const MEDIA = path.join(DOCS, liveDocsVersion(), '_media', 'guide').replace(/\\/g, '/')

// Three namespaces with pods in the dev cluster
const NAMESPACES = ['kube-system', 'kwirth', 'ingress-nginx']

/** Changes the type of the chart whose title is the given one, from its ⋮ menu. */
const setChartType = async (page: Page, title: string, menuItem: string): Promise<void> => {
    await page.locator('.MuiCard-root').filter({ hasText: title }).locator('[data-testid="MoreVertIcon"]').click()
    await page.getByRole('menuitem', { name: menuItem }).click()
    await page.waitForTimeout(600)
}

test('dashboard: five metrics, five chart types, and the cluster metric as one Cluster series', async ({ page }) => {
    test.setTimeout(300_000)
    await page.setViewportSize({ width: 1600, height: 900 })
    await login(page)

    // dark theme
    if (await page.getByText('light', { exact: true }).isVisible().catch(() => false)) {
        await page.locator('.MuiSwitch-input').first().click()
        await expect(page.getByText('dark', { exact: true })).toBeVisible()
        await page.waitForTimeout(800)
    }

    await pickCombo(page, COMBO_CLUSTER, CLUSTER)
    await pickCombo(page, COMBO_VIEW, 'namespace')
    await page.getByRole('combobox').nth(COMBO_NAMESPACE).click()
    await page.getByRole('listbox').waitFor({ state: 'visible', timeout: 5000 })
    for (const namespace of NAMESPACES) await page.getByRole('option', { name: namespace, exact: true }).click()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    await openChannelCombo(page)
    await channelOption(page).click()
    await page.getByRole('button', { name: 'ADD' }).click()
    await page.waitForTimeout(1500)

    await openTabMenu(page)
    await page.getByText('Start', { exact: true }).click()
    const dialog = page.getByRole('dialog')
    const chipDeletes = dialog.locator('.MuiChip-deleteIcon')
    while (await chipDeletes.count() > 0) {
        await chipDeletes.first().click()
        await page.waitForTimeout(100)
    }
    // a short interval, so the depth fills in about a minute instead of five
    await dialog.getByLabel('Interval').fill('3')
    await page.getByLabel('Filter').fill('kwirth_c')
    for (const metric of ['kwirth_container_cpu_percentage', 'kwirth_container_memory_percentage', 'kwirth_container_transmit_mbps', 'kwirth_container_receive_mbps', 'kwirth_cluster_cpu_percentage']) {
        await page.getByRole('button', { name: metric, exact: true }).click()
    }
    if (await dialog.getByLabel('Aggregate').isChecked()) await dialog.getByLabel('Aggregate').uncheck()
    await dialog.getByLabel('Merge').check()
    await page.getByRole('button', { name: 'OK', exact: true }).click()

    await expect(page.locator('.recharts-line-curve').first()).toBeVisible({ timeout: 60000 })
    await page.waitForTimeout(70000)

    await setChartType(page, 'Kwirth container memory percentage', 'Area chart')
    await setChartType(page, 'Kwirth container transmit Mbps', 'Bar chart')
    await setChartType(page, 'Kwirth container receive Mbps', 'Pie chart')
    await setChartType(page, 'Kwirth cluster CPU percentage', 'Show value')
    await page.mouse.move(5, 5)
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${MEDIA}/channel-metrics-dashboard.png` })

    await page.goto('about:blank').catch(() => { })
    await page.context().close().catch(() => { })
})
