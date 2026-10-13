import { test, expect, Page, APIRequestContext } from '@playwright/test'
import { login } from './helpers'

/**
 * The metrics provider as an installable extension, against the running dev.
 *
 * The browser logs in, and the back's URL and the Authorization header are taken from the requests the
 * front itself makes, so the API is exercised exactly as the front exercises it. What is checked: the
 * provider is installed and running (not 'core'), its routes moved behind the accessKey at
 * /core/providerconfig/metrics and left /provider/metrics, they serve real data, the core still publishes
 * the cluster's capacity without the provider writing it, and the channels that live on it still get their
 * data (the metrics plugin is installed from the public marketplace if it is not there).
 *
 * NON-DESTRUCTIVE except for that install, which is the state the dev is meant to be in.
 */
test.describe.configure({ mode: 'serial' })
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

const METRICS_PLUGIN_URL = 'https://registry.npmjs.org/@kwirthmagnify/kwirth-plugin-metrics/-/kwirth-plugin-metrics-0.1.0.tgz'

let page: Page
let api: APIRequestContext
let backUrl = ''
let authorization = ''

test.beforeAll(async ({ browser, playwright }) => {
    page = await browser.newPage()
    page.on('request', request => {
        const url = request.url()
        const header = request.headers()['authorization']
        if (!authorization && header && url.includes('/config/')) {
            authorization = header
            backUrl = url.substring(0, url.indexOf('/config/'))
        }
    })
    // the plugin may not be installed yet: the login helper must not wait for it here
    await login(page).catch(() => { })
    await expect.poll(() => authorization, { timeout: 60000 }).not.toBe('')
    api = await playwright.request.newContext()
})

test.afterAll(async () => {
    await api?.dispose()
    await page?.goto('about:blank').catch(() => { })
    await page?.context().close().catch(() => { })
})

const get = (path: string, withKey = true) => api.get(`${backUrl}${path}`, { headers: withKey ? { Authorization: authorization } : {} })

test('the provider is installed as an extension and running, not a core one', async () => {
    const providers = await (await get('/core/providers')).json() as { id: string, version: string, core?: boolean, running?: boolean }[]
    const metrics = providers.find(p => p.id === 'metrics')
    expect(metrics, 'is providers/metrics in back/kwirth-dev.json?').toBeDefined()
    expect(metrics!.core).not.toBe(true)
    expect(metrics!.version).not.toBe('core')
    expect(metrics!.running).toBe(true)
})

test('its routes moved behind the accessKey, and the old public path is gone', async () => {
    expect((await get('/core/providerconfig/metrics', false)).status()).toBe(403)
    expect((await get('/provider/metrics')).status()).toBe(404)
})

test('the metric list is served at the new path, synthetic metrics included', async () => {
    const response = await get('/core/providerconfig/metrics')
    expect(response.status()).toBe(200)
    const names = (await response.json() as { metric: string }[]).map(m => m.metric)
    expect(names).toContain('container_cpu_usage_seconds_total')
    expect(names).toContain('kwirth_container_cpu_percentage')
    expect(names).toContain('kwirth_cluster_cpu_percentage')
})

test('the cluster usage is served too, with real figures', async () => {
    // the first reading takes an interval: poll until it is there
    await expect.poll(async () => (await (await get('/core/providerconfig/metrics/usage/cluster')).json() as { pods: number }).pods, { timeout: 60000 }).toBeGreaterThan(0)
    const usage = await (await get('/core/providerconfig/metrics/usage/cluster')).json() as { vcpus: number, memory: number, maxPods: number }
    expect(usage.vcpus).toBeGreaterThan(0)
    expect(usage.memory).toBeGreaterThan(0)
    expect(usage.maxPods).toBeGreaterThan(0)
})

test('the core still publishes the cluster capacity, now from the nodes and not from the provider', async () => {
    const cluster = await (await get('/config/cluster')).json() as { vcpu: number, memory: number }
    expect(cluster.vcpu).toBeGreaterThan(0)
    expect(cluster.memory).toBeGreaterThan(0)
})

test('Magnify, the core channel that subscribes to it, draws the cluster usage in its overview', async () => {
    await page.setViewportSize({ width: 1600, height: 1000 })
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

    // the overview's three charts (% CPU, % Memory, Tx/Rx Mbps) fill with the provider's cluster usage
    await expect(page.getByText('% CPU', { exact: true })).toBeVisible({ timeout: 60000 })
    await expect(page.locator('.recharts-line-curve').first()).toBeVisible({ timeout: 90000 })
})

test('the metrics plugin, which lives on this provider, is installed (from the public marketplace if needed)', async () => {
    const plugins = await (await get('/core/plugins')).json() as { id: string }[]
    if (!plugins.some(p => p.id === 'metrics')) {
        const response = await api.post(`${backUrl}/core/plugins/install`, { headers: { Authorization: authorization, 'Content-Type': 'application/json' }, data: { url: METRICS_PLUGIN_URL } })
        expect(response.status(), await response.text()).toBe(200)
    }
    const after = await (await get('/core/plugins')).json() as { id: string }[]
    expect(after.some(p => p.id === 'metrics')).toBe(true)
})
