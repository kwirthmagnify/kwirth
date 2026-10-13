import { test, expect, Page, APIRequestContext } from '@playwright/test'
import { execFileSync } from 'child_process'
import { login } from './helpers'

/**
 * The events provider as an installable extension, against the running dev.
 *
 * The browser logs in and the back's URL and Authorization header are taken from the requests the front
 * itself makes, so the API is used exactly as the front uses it. Checked: the provider is installed and
 * running (not 'core'); its read moved behind the accessKey at /core/providerconfig/events and left
 * /provider/events; Magnify's events feed (a read through getData) and the push (a ConfigMap created with
 * kubectl shows up in Magnify's list without reloading, and goes away when deleted) both work.
 *
 * NON-DESTRUCTIVE: the only thing it creates is a ConfigMap of its own in 'default', deleted at the end.
 */
test.describe.configure({ mode: 'serial' })
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

const CONFIGMAP = `kwirth-e2e-events-${Date.now()}`
const kubectl = (...args: string[]) => execFileSync('kubectl', args, { stdio: 'pipe' }).toString()

let page: Page
let api: APIRequestContext
let backUrl = ''
let authorization = ''

test.beforeAll(async ({ browser, playwright }) => {
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
    api = await playwright.request.newContext()
})

test.afterAll(async () => {
    try { kubectl('delete', 'configmap', CONFIGMAP, '-n', 'default', '--ignore-not-found') } catch { /* already gone */ }
    await api?.dispose()
    await page?.goto('about:blank').catch(() => { })
    await page?.context().close().catch(() => { })
})

const get = (path: string, withKey = true) => api.get(`${backUrl}${path}`, { headers: withKey ? { Authorization: authorization } : {} })

test('the provider is installed as an extension and running, not a core one', async () => {
    const providers = await (await get('/core/providers')).json() as { id: string, version: string, core?: boolean, running?: boolean }[]
    const events = providers.find(p => p.id === 'events')
    expect(events, 'is providers/events in back/kwirth-dev.json?').toBeDefined()
    expect(events!.core).not.toBe(true)
    expect(events!.version).not.toBe('core')
    expect(events!.running).toBe(true)
})

test('its read moved behind the accessKey, and the old public path is gone', async () => {
    expect((await get('/core/providerconfig/events', false)).status()).toBe(403)
    expect((await get('/provider/events')).status()).toBe(404)
})

test('the read serves Kubernetes Events, newest first, honouring the limit', async () => {
    const response = await get('/core/providerconfig/events?limit=5')
    expect(response.status()).toBe(200)
    const events = await response.json() as { eventTime?: string, lastTimestamp?: string, firstTimestamp?: string, involvedObject?: unknown }[]
    expect(events.length).toBeLessThanOrEqual(5)
    const times = events.map(e => new Date(e.eventTime ?? e.lastTimestamp ?? e.firstTimestamp ?? 0).getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))
})

test('Magnify opens with its events feed and without the "not installed" notice', async () => {
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

    await expect(page.getByRole('button', { name: 'MORE EVENTS' })).toBeVisible({ timeout: 60000 })
    // the USAGE poll has answered by now: the provider is there, so no notice
    await page.waitForTimeout(5000)
    await expect(page.getByText(/The events provider is not installed/)).toHaveCount(0)
})

test('the push reaches Magnify: a ConfigMap created with kubectl appears in its list, and disappears when deleted', async () => {
    await page.locator('.sb-folder-name[title="Config"]').filter({ visible: true }).first().click()
    await page.locator('.sb-folder-name[title="Config Maps"]').filter({ visible: true }).first().click()
    await page.waitForTimeout(1500)
    await expect(page.getByText(CONFIGMAP, { exact: true })).toHaveCount(0)

    kubectl('create', 'configmap', CONFIGMAP, '-n', 'default', '--from-literal=k=v')
    await expect(page.getByText(CONFIGMAP, { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 30000 })

    kubectl('delete', 'configmap', CONFIGMAP, '-n', 'default')
    await expect(page.getByText(CONFIGMAP, { exact: true })).toHaveCount(0, { timeout: 30000 })
})
