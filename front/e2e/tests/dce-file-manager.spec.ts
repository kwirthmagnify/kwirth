import { test, expect, Page, APIRequestContext } from '@playwright/test'
import { createHash } from 'crypto'
import { login, dismissOpenDialogs } from './helpers'

/*
    The `file-manager` DCE (plan: plans/file-manager/PLAN.md, S1).

    It needs the dev core with the DCE loaded (kwirth-dev.json → dces['file-manager']).

    This is where the DCE is really checked, and not in its harness: `@jfvilas/react-file-manager`
    touches `document` while it is being imported, so node cannot load it at all. What only a browser
    can answer is here — that the factory ran, that the instance carries the library's namespace, and
    that the stylesheet the component needs is on the page.

    NON-destructive: it installs and removes nothing, and only reads.
*/

const BACK = process.env.KWIRTH_E2E_BACK ?? 'http://localhost:3883'
const USER = process.env.KWIRTH_E2E_USER ?? 'admin'
const PASS = process.env.KWIRTH_E2E_PASS ?? ''

const DCE_ID = 'file-manager'
const STYLE_ID = 'kwirth-dce-file-manager-css'

interface IDceListed {
    id: string
    version: string
    hasBack: boolean
    hasFront: boolean
    requiresRestart: boolean
}

test.describe.configure({ mode: 'serial' })

test.describe('dce file-manager: the library, out of the core', () => {
    let page: Page
    let api: APIRequestContext
    let auth: Record<string, string>

    test.beforeAll(async ({ browser, playwright }) => {
        api = await playwright.request.newContext({ baseURL: BACK })
        const loggedIn = await api.post('/login', { data: { user: USER, password: createHash('sha256').update(PASS).digest('hex') } })
        expect(loggedIn.status(), 'login against the back end').toBe(200)
        const key = (await loggedIn.json()).accessKey as { id: string, type: string, resources: string }
        auth = { Authorization: `Bearer ${key.id}|${key.type}|${key.resources}` }

        page = await browser.newPage()
        await login(page)
        await dismissOpenDialogs(page)
    })

    test.afterAll(async () => {
        await page?.close()
        await api?.dispose()
    })

    test('it is installed and front only: the library has no business in the back end', async () => {
        const res = await api.get('/core/dces', { headers: auth })
        expect(res.status()).toBe(200)
        const dce = ((await res.json()) as IDceListed[]).find(entry => entry.id === DCE_ID)

        expect(dce, 'file-manager is not installed — is it in back/kwirth-dev.json?').toBeTruthy()
        expect(dce?.hasFront).toBe(true)
        expect(dce?.hasBack, 'a back end slipped into a front-only DCE').toBe(false)
        expect(dce?.requiresRestart, 'forced true for every DCE').toBe(true)
    })

    test('🔴 its front.js is served, and carries no copy of React', async () => {
        const front = await api.get(`/core/dces/${DCE_ID}/front`)
        expect(front.status()).toBe(200)
        expect(front.headers()['content-type']).toContain('javascript')
        const code = await front.text()

        /*
            React and ReactDOM resolve against the core's. This is not about size: the file manager is
            a React component, and its hooks only work against the React that renders it — a second
            copy in here would throw at the first useState, from inside a library nobody would suspect.
        */
        expect(code).toContain('window.__kwirth__.React')
        expect(code, 'React itself is bundled in').not.toContain('Minified React error')

        // The library IS in here — that is the point of the DCE — and nothing else of consequence.
        expect(code.length).toBeGreaterThan(100_000)
        expect(code.length, 'the bundle grew far beyond the library').toBeLessThan(900_000)
    })

    test('🔴 the factory ran in the browser and the instance carries the library namespace', async () => {
        const instance = await page.evaluate(() => {
            const registry = (window as unknown as { __kwirth_dce__?: Record<string, { state: string, instance?: { id?: string, fileManager?: Record<string, unknown> }, error?: string }> }).__kwirth_dce__
            const entry = registry?.['file-manager']
            const namespace = entry?.instance?.fileManager
            const component = namespace?.FileManager as { $$typeof?: symbol } | undefined
            return {
                state: entry?.state ?? 'missing',
                error: entry?.error,
                id: entry?.instance?.id,
                exports: namespace ? Object.keys(namespace) : [],
                // A symbol does not survive the trip out of the page, so it travels as its description.
                reactMarker: component?.$$typeof ? String(component.$$typeof) : undefined
            }
        })

        expect(instance.error, 'the factory threw').toBeUndefined()
        expect(instance.state).toBe('loaded')
        expect(instance.id).toBe(DCE_ID)
        // The component consumers draw with — the whole reason the DCE exists.
        expect(instance.exports, 'the namespace does not carry FileManager').toContain('FileManager')
        /*
            It is an OBJECT and not a function: the library ships it wrapped (forwardRef/memo), and
            those are objects carrying React's `$$typeof` marker. Asserting `typeof === 'function'`
            would be asserting how it happens to be wrapped, which is the library's business; what
            matters is that React would accept it as a component.
        */
        expect(instance.reactMarker, 'FileManager is not a React component').toMatch(/^Symbol\(react\./)
    })

    /*
        ── The consumer ─────────────────────────────────────────────────────────────────────────────

        `fileman` is what this DCE exists for. What is checked here is that it really stopped carrying
        the library: that its bundle resolves it from the registry, and that neither the library nor
        its stylesheet travel inside it any more. Whether the file tree draws is the manual QA's job —
        that needs a container with files in it.
    */
    test('🔴 fileman resolves the library from the DCE, and no longer carries it', async () => {
        const front = await api.get('/core/plugins/fileman/front')
        expect(front.status(), 'fileman is not installed in this kwirth').toBe(200)
        const code = await front.text()

        // It reads the instance out of the registry...
        expect(code).toContain(`__kwirth_dce__["file-manager"].instance.fileManager`)
        // ...and not the global the core used to publish.
        expect(code, 'it still reads the core global').not.toContain('jfvilasReactFileManager')
        /*
            And neither the library nor its stylesheet are in there. `.file-explorer` is one of the
            library's own selectors: finding it would mean the 100 KB stylesheet is being shipped and
            injected twice, once by the DCE and once by the plugin.
        */
        expect(code, 'the library is still bundled in').not.toContain('.file-explorer')
        expect(code, 'the stylesheet is still bundled in').not.toContain('loader-container')
    })

    test('🔴 fileman declares the dependency, so kwirth will not install it without the DCE', async () => {
        const res = await api.get('/core/plugins', { headers: auth })
        const plugin = ((await res.json()) as { id: string, requiresExtension?: { extensionType: string, id: string, minVersion: string }[] }[])
            .find(entry => entry.id === 'fileman')

        expect(plugin, 'fileman is not installed').toBeTruthy()
        expect(plugin?.requiresExtension).toContainEqual({ extensionType: 'dce', id: DCE_ID, minVersion: '0.1.0' })
    })

    test('🔴 the stylesheet is on the page, once: the core no longer loads it', async () => {
        const styles = await page.evaluate((id) => {
            const nodes = Array.from(document.querySelectorAll(`style#${id}`))
            return { count: nodes.length, length: nodes[0]?.textContent?.length ?? 0 }
        }, STYLE_ID)

        expect(styles.count, 'the DCE did not inject its stylesheet, or injected it twice').toBe(1)
        expect(styles.length, 'the stylesheet is there but empty').toBeGreaterThan(10000)
    })
})
