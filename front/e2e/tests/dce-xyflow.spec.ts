import { test, expect, APIRequestContext } from '@playwright/test'
import { createHash } from 'crypto'
import { login } from './helpers'

/*
    The `xyflow` DCE against a real core: React Flow and elk, moved out of the core into a DCE.

    It needs the dev core with the DCE loaded (kwirth-dev.json → dces.xyflow). What is checked here is
    what only a running page can answer: that the core serves the package, that the browser runs its
    factory, that what it hands out WORKS against the core's own React, and that the core no longer
    publishes the libraries itself. What its consumers draw is their own e2e (status 02-graph, iter).

    NON-destructive: it installs nothing and touches nothing; it only reads.
*/

const BACK = process.env.KWIRTH_E2E_BACK ?? 'http://localhost:3883'
const USER = process.env.KWIRTH_E2E_USER ?? 'admin'
const PASS = process.env.KWIRTH_E2E_PASS ?? ''

const DCE_ID = 'xyflow'

interface IAccessKey { id: string, type: string, resources: string }
interface IDceListed {
    id: string
    version: string
    hasBack: boolean
    hasFront: boolean
    requiresRestart: boolean
}

/** What the page answers about the DCE and the core's globals, read in the browser. */
interface IPageReport {
    state?: string
    instanceId?: string
    reactFlowExports: string[]
    arrowClosed?: string
    elkBelow?: boolean
    cssInjected: boolean
    cssHasReactFlow: boolean
    coreReactFlow: boolean
    coreLoadElk: boolean
    coreCreatePortal: string
}

test.describe.configure({ mode: 'serial' })

test.describe('dce xyflow: React Flow and elk served by a DCE, not by the core', () => {
    let api: APIRequestContext
    let auth: Record<string, string>

    test.beforeAll(async ({ playwright }) => {
        api = await playwright.request.newContext({ baseURL: BACK })
        const res = await api.post('/login', { data: { user: USER, password: createHash('sha256').update(PASS).digest('hex') } })
        expect(res.status(), 'login against the back end').toBe(200)
        const key = (await res.json()).accessKey as IAccessKey
        auth = { Authorization: `Bearer ${key.id}|${key.type}|${key.resources}` }
    })

    test.afterAll(async () => {
        await api.dispose()
    })

    test('the DCE is installed, front only', async () => {
        const res = await api.get('/core/dce', { headers: auth })
        expect(res.status()).toBe(200)
        const xyflow = ((await res.json()) as IDceListed[]).find(dce => dce.id === DCE_ID)
        expect(xyflow, 'xyflow is not installed — is it in back/kwirth-dev.json?').toBeTruthy()
        expect(xyflow?.hasFront).toBe(true)
        expect(xyflow?.hasBack, 'xyflow is front-only').toBe(false)
        expect(xyflow?.requiresRestart).toBe(true)
        expect(xyflow?.version).toMatch(/^\d+\.\d+\.\d+$/)
    })

    test('🔴 its front.js registers a factory and takes React and ReactDOM from the core', async () => {
        const front = await api.get(`/core/dce/${DCE_ID}/front`)
        expect(front.status()).toBe(200)
        expect(front.headers()['content-type']).toContain('javascript')
        const code = await front.text()
        // The script REGISTERS a factory under its id; the core calls it. Minified, the key is read by name.
        expect(code).toMatch(/DCE_FRONT_FACTORIES|__kwirth_dce_factories__/)
        expect(code).toMatch(/\.xyflow=\{create:|\["xyflow"\]=\{create:/)
        expect(code).toContain('window.__kwirth__.React')
        expect(code).toContain('window.__kwirth__.ReactDOM')
        // A second React would break React Flow's hooks: its own copy must not be in the bundle.
        expect(code).not.toContain('ReactCurrentDispatcher:{current')
        // Its stylesheet travels inside, as text the factory injects.
        expect(code).toContain('kwirth-dce-xyflow-css')
    })

    test('🔴 in the browser the factory ran, React Flow and elk work, and the CSS is on the page', async ({ page }) => {
        await login(page)
        await page.waitForFunction((id: string) => {
            const registry = (window as unknown as { __kwirth_dce__?: Record<string, { state: string }> }).__kwirth_dce__
            return registry?.[id]?.state !== undefined
        }, DCE_ID, { timeout: 30_000 })

        const report = await page.evaluate(async (id: string): Promise<IPageReport> => {
            interface IElkNode { id: string, x?: number, y?: number, children?: IElkNode[] }
            interface IXyflowLike {
                id: string
                reactFlow: Record<string, unknown> & { MarkerType?: { ArrowClosed?: string } }
                loadElk(): Promise<new () => { layout(g: unknown): Promise<IElkNode> }>
            }
            const w = window as unknown as {
                __kwirth_dce__?: Record<string, { state: string, instance?: IXyflowLike }>
                __kwirth__: Record<string, unknown> & { ReactDOM?: { createPortal?: unknown } }
            }
            const entry = w.__kwirth_dce__?.[id]
            const instance = entry?.instance
            let elkBelow: boolean | undefined
            if (instance) {
                const ELK = await instance.loadElk()
                const g = await new ELK().layout({
                    id: 'root',
                    layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'DOWN' },
                    children: [{ id: 'a', width: 100, height: 40 }, { id: 'b', width: 100, height: 40 }],
                    edges: [{ id: 'a-b', sources: ['a'], targets: ['b'] }]
                })
                const a = g.children?.find(n => n.id === 'a')
                const b = g.children?.find(n => n.id === 'b')
                elkBelow = a?.y !== undefined && b?.y !== undefined && b.y >= a.y + 40
            }
            const style = document.getElementById('kwirth-dce-xyflow-css')
            return {
                state: entry?.state,
                instanceId: instance?.id,
                reactFlowExports: ['ReactFlow', 'Background', 'Controls', 'Handle', 'ReactFlowProvider'].filter(k => instance?.reactFlow[k] !== undefined),
                arrowClosed: instance?.reactFlow.MarkerType?.ArrowClosed,
                elkBelow,
                cssInjected: style !== null,
                cssHasReactFlow: (style?.textContent ?? '').includes('.react-flow'),
                coreReactFlow: 'reactFlow' in w.__kwirth__,
                coreLoadElk: 'loadElk' in w.__kwirth__,
                coreCreatePortal: typeof w.__kwirth__.ReactDOM?.createPortal
            }
        }, DCE_ID)

        expect(report.state, 'the factory failed in the browser').toBe('loaded')
        expect(report.instanceId).toBe(DCE_ID)
        expect(report.reactFlowExports).toEqual(['ReactFlow', 'Background', 'Controls', 'Handle', 'ReactFlowProvider'])
        expect(report.arrowClosed).toBe('arrowclosed')
        expect(report.elkBelow, 'elk did not lay the graph out top-down').toBe(true)
        expect(report.cssInjected, 'React Flow does not draw without its stylesheet').toBe(true)
        expect(report.cssHasReactFlow).toBe(true)
        // The libraries left the core; what stays is the ReactDOM the DCE's portals need.
        expect(report.coreReactFlow, 'the core still publishes reactFlow').toBe(false)
        expect(report.coreLoadElk, 'the core still publishes loadElk').toBe(false)
        expect(report.coreCreatePortal).toBe('function')
    })
})
