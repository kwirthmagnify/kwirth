import { test, expect, Page, APIRequestContext } from '@playwright/test'
import { login, openMagnify } from './helpers'

/**
 * Magnify as a plugin, against the running dev (it needs `"magnify": "../plugins/magnify/dist"` in
 * back/kwirth-dev.json, or the plugin installed from the marketplace, and the `file-manager` DCE).
 *
 * Until now Magnify was compiled into the core and had no e2e of its own: what other specs touched of it
 * (the events and metrics providers' e2e) is all there was. Checked here: it is served as a plugin, not
 * registered by the core; it opens on the cluster with its overview; its stylesheets are put on the page;
 * the section pictures (SVG now, PNG before) are drawn; and its explorer lists what the cluster has.
 *
 * NON-DESTRUCTIVE: it opens Magnify and looks. It creates, changes and deletes nothing.
 */
test.describe.configure({ mode: 'serial' })
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

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
    await login(page)
    await expect.poll(() => authorization, { timeout: 60000 }).not.toBe('')
    api = await playwright.request.newContext()
})

test.afterAll(async () => {
    await api?.dispose()
    await page?.goto('about:blank').catch(() => { })
    await page?.context().close().catch(() => { })
})

const get = (path: string) => api.get(`${backUrl}${path}`, { headers: { Authorization: authorization } })

test('Magnify is a plugin: listed with its version, its front served, and loaded as a plugin by the page', async () => {
    const plugins = await (await get('/core/plugins')).json() as { id: string, version: string }[]
    const magnify = plugins.find(p => p.id === 'magnify')
    expect(magnify, 'is plugins/magnify in back/kwirth-dev.json (or installed)?').toBeDefined()
    expect(magnify!.version).toMatch(/^\d+\.\d+\.\d+$/)

    const front = await get('/core/plugins/magnify/front')
    expect(front.status()).toBe(200)
    expect(front.headers()['content-type']).toContain('javascript')

    // the page registered it the way it registers every plugin
    expect(await page.evaluate(() => Boolean((window as unknown as { __kwirth_plugins__?: Record<string, unknown> }).__kwirth_plugins__?.magnify))).toBe(true)
})

test('it opens on the cluster with its overview: the events feed, and no "provider missing" notice', async () => {
    await openMagnify(page)
    await expect(page.getByRole('button', { name: 'MORE EVENTS' })).toBeVisible({ timeout: 60000 })
    // the USAGE poll has answered by now: both providers are there, so no notice
    await page.waitForTimeout(5000)
    await expect(page.getByText(/provider is not installed/)).toHaveCount(0)
})

test('its own stylesheets are on the page, each once', async () => {
    for (const id of ['kwirth-plugin-magnify-css', 'kwirth-plugin-magnify-resizable-css']) {
        await expect(page.locator(`style#${id}`), `stylesheet ${id}`).toHaveCount(1)
    }
})

test('a top-level section with nothing selected draws its picture', async () => {
    await page.locator('.sb-folder-name[title="Workload"]').filter({ visible: true }).first().click()
    await expect(page.locator('svg[aria-label="WORKLOAD"]').first()).toBeVisible({ timeout: 15000 })
})

test('the explorer lists what the cluster has: Config Maps shows kube-root-ca.crt, which every namespace has', async () => {
    await page.locator('.sb-folder-name[title="Config"]').filter({ visible: true }).first().click()
    await page.locator('.sb-folder-name[title="Config Maps"]').filter({ visible: true }).first().click()
    await expect(page.getByText('kube-root-ca.crt', { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 30000 })
})

/*
    🔴 Another channel opened INSIDE Magnify, on a pod. Every embedded channel (Log, Metrics, Fileman, Ops…)
    broke in the first build of the plugin: a CommonJS default import that the bundler handed over as the
    whole exports object, '(0, X.default) is not a function' as soon as the window was drawn. The page
    error is what is watched, besides the window appearing.
*/
test('🔴 a channel opens inside Magnify on a pod (Metrics), in its own window and without a page error', async () => {
    test.skip(!await page.evaluate(() => Boolean((window as unknown as { __kwirth_plugins__?: Record<string, unknown> }).__kwirth_plugins__?.metrics)),
        'the metrics plugin is not installed: there is nothing to embed')
    const errors: string[] = []
    page.on('pageerror', err => errors.push(String(err)))

    await page.locator('.sb-folder-name[title="Workload"]').filter({ visible: true }).first().click()
    await page.locator('.sb-folder-name[title="Pods"]').filter({ visible: true }).first().click()
    await page.waitForTimeout(3000)
    await page.locator('.file-item-container, [class*="file-item"]').filter({ visible: true }).first().click()
    const windowsBefore = await page.locator('.MuiDialog-root').count()

    await page.getByRole('button', { name: 'Metrics', exact: true }).filter({ visible: true }).first().click()
    // a pod with several containers asks which one: the first offered is taken
    const containerMenu = page.getByRole('menuitem').filter({ visible: true })
    if (await containerMenu.count() > 0) await containerMenu.first().click()

    await expect.poll(() => page.locator('.MuiDialog-root').count(), { timeout: 20000 }).toBeGreaterThan(windowsBefore)
    await page.waitForTimeout(3000)
    expect(errors, errors.join('\n')).toEqual([])
})
