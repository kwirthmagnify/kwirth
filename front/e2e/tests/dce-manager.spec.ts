import { test, expect, Page, APIRequestContext } from '@playwright/test'
import { createHash } from 'crypto'
import { login, clickExtensionMenuItem, dismissOpenDialogs, USER, PASS } from './helpers'

/*
    The `dce` type in the FRONT END (plan: plans/completed/dce/PLAN.md, S2). It needs the sample DCE
    installed (from the marketplace or kwirth-dev.json → dces.sample).

    What it checks is the two things the type promises:

      · the manager: the DCE is listed as a family of its own, saying which sides it brings and whether
        its back end is alive — a DCE whose factory failed has to be readable from the card
      · the ONE instance, on both ends. The sample's counter is shared: a copy per reading would start
        again from 1, which is exactly what the type exists to prevent

    The single instance is read straight from the registries, not through a consumer plugin: in the
    front from `window.__kwirth_dce__`, which is where getDce() reads it; in the back from /core/dces,
    which serialises the instance the core keeps (createdAt and boots — functions do not travel).

    NON-destructive: it installs and removes nothing. It opens the manager and reads.
*/

const BACK = process.env.KWIRTH_E2E_BACK ?? 'http://localhost:3883'
const DIALOG = /Manage DCEs/i
const DCE_ID = 'sample'

interface IAccessKey { id: string, type: string, resources: string }
/** The sample's back-end instance as /core/dces serialises it: its data, without the functions. */
interface ISampleBackListed {
    id: string
    back?: { state: string, instance?: { id: string, createdAt: number, boots: number } }
}
/** What the page reads from the front registry, in one go. */
interface IFrontReading {
    state?: string
    createdAt?: number
    ticks: number[]
}

test.describe.configure({ mode: 'serial' })

test.describe('dce: the manager and the single instance', () => {
    let page: Page
    let api: APIRequestContext
    let auth: Record<string, string>

    test.beforeAll(async ({ browser, playwright }) => {
        page = await browser.newPage()
        await login(page)
        await dismissOpenDialogs(page)

        api = await playwright.request.newContext({ baseURL: BACK })
        const res = await api.post('/login', { data: { user: USER, password: createHash('sha256').update(PASS).digest('hex') } })
        expect(res.status(), 'login against the back end').toBe(200)
        const key = (await res.json()).accessKey as IAccessKey
        auth = { Authorization: `Bearer ${key.id}|${key.type}|${key.resources}` }
    })

    test.afterAll(async () => {
        await page?.close()
        await api?.dispose()
    })

    const dialog = () => page.getByRole('dialog').filter({ hasText: DIALOG })

    /** The front registry's entry, read now: its state, its createdAt, and two calls to the shared counter. */
    const readFront = () => page.evaluate((id: string): IFrontReading => {
        interface ISampleLike { createdAt: number, next(): number }
        const registry = (window as unknown as { __kwirth_dce__?: Record<string, { state: string, instance?: ISampleLike }> }).__kwirth_dce__
        const entry = registry?.[id]
        const instance = entry?.instance
        return {
            state: entry?.state,
            createdAt: instance?.createdAt,
            ticks: instance ? [instance.next(), instance.next()] : []
        }
    }, DCE_ID)

    const readBack = async (): Promise<ISampleBackListed | undefined> => {
        const res = await api.get('/core/dces', { headers: auth })
        expect(res.status()).toBe(200)
        return ((await res.json()) as ISampleBackListed[]).find(dce => dce.id === DCE_ID)
    }

    test('🔴 DCEs are a family of their own in the extensions menu', async () => {
        await clickExtensionMenuItem(page, 'DCEs')
        await expect(dialog()).toBeVisible({ timeout: 40000 })
        // The generic manager's two sections, with the type's noun interpolated from the descriptor.
        await expect(dialog().getByText(/Installed DCEs/i)).toBeVisible()
        await expect(dialog().getByText(/Available DCEs/i)).toBeVisible()
    })

    test('🔴 the sample DCE says which sides it brings and that its back end is LOADED', async () => {
        const card = dialog().getByText('Sample DCE').first()
        await expect(card).toBeVisible()
        // The chips of the type: what the package brought, and how its factory went. A DCE whose factory
        // threw is installed and useless, and that must be readable here and not only in the server log.
        await expect(dialog().getByText('back + front').first()).toBeVisible()
        await expect(dialog().getByText('Loaded', { exact: true }).first()).toBeVisible()
    })

    test('a DCE has no configuration in this version, so it shows no gear', async () => {
        // The type declares no renderConfigDialog: the generic manager must not paint one.
        await expect(dialog().getByRole('button', { name: 'Configure' })).toHaveCount(0)
        await dismissOpenDialogs(page)
    })

    // ── The single instance ───────────────────────────────────────────────────────────────────────

    test('🔴 the sample is LOADED on both ends: the front registry holds its instance, and so does the back', async () => {
        // The front loader runs after login: wait for the entry rather than assuming it is already there.
        await page.waitForFunction((id: string) => {
            const registry = (window as unknown as { __kwirth_dce__?: Record<string, { state: string }> }).__kwirth_dce__
            return registry?.[id]?.state !== undefined
        }, DCE_ID, { timeout: 30_000 })
        const front = await readFront()
        expect(front.state, 'the front factory failed in the browser').toBe('loaded')

        const back = await readBack()
        expect(back, 'the sample DCE is not installed').toBeTruthy()
        expect(back?.back?.state, 'the back factory failed at load').toBe('loaded')
        expect(back?.back?.instance?.id).toBe(DCE_ID)
    })

    test('🔴 the front counter GROWS between readings, and the instance is the same one: no copy per reading', async () => {
        const first = await readFront()
        // Two consecutive calls to the shared counter: within one reading they already have to differ.
        expect(first.ticks[1], 'the counter does not move within a reading').toBe(first.ticks[0] + 1)

        const second = await readFront()
        expect(second.ticks[0], 'the front built a NEW object instead of sharing one').toBeGreaterThan(first.ticks[1])
        expect(second.createdAt, 'a different createdAt means a different instance').toBe(first.createdAt)
    })

    test('🔴 the back instance is the same one across requests, and says how many times its factory ran', async () => {
        const first = await readBack()
        await page.waitForTimeout(1100)
        const second = await readBack()
        // A copy per request would carry the time IT was made: the same createdAt is the same object.
        expect(second?.back?.instance?.createdAt, 'the back built a NEW object instead of sharing one')
            .toBe(first?.back?.instance?.createdAt)
        // It is the host's configMaps at work: the count survives restarts, the instance does not.
        expect(second?.back?.instance?.boots ?? 0, 'the factory runs are not persisted by the host').toBeGreaterThanOrEqual(1)
    })
})
