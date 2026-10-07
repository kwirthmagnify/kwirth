import { test, expect, Page } from '@playwright/test'
import { login, dismissOpenDialogs } from './helpers'

/*
    The marketplace Kwirth OFFERS without imposing: jfvilas' community one, written into the settings at
    startup as an ordinary entry so that whoever does not want it can delete it.

    What is checked here is that it ARRIVED and that it is usable — that it is a real entry of the
    settings and that its extensions show up when resolving.

    ⛔ What is NOT checked here is the half that matters most, that deleting it sticks across a restart.
    Doing that from a test would mean deleting it for real from this Kwirth and it would NOT come back,
    which is the whole point: the test would leave the environment permanently changed. That invariant
    lives in the back end's harness (marketplaceSeed), where restarting costs nothing.

    NON-destructive: it only reads.
*/

interface IMarketplace { id: string; label: string; url: string; enabled: boolean }
interface IEntry { extensionType: string; id: string; marketplaceId?: string }
interface ISession { auth: string; backend: string }

const SEEDED_ID = 'jfvilas'

// The front end talks to the back end through an absolute URL, so the origin has to be captured too.
async function captureSession(page: Page): Promise<ISession> {
    const found: ISession = { auth: '', backend: '' }
    page.on('request', req => {
        const h = req.headers()['authorization']
        if (h && !found.auth && req.url().includes('/config/')) {
            found.auth = h
            found.backend = new URL(req.url()).origin
        }
    })
    await login(page)
    await dismissOpenDialogs(page)
    await expect.poll(() => found.auth, { timeout: 15000 }).not.toBe('')
    return found
}

async function marketplaces(page: Page, s: ISession): Promise<IMarketplace[]> {
    return await page.evaluate(async ([backend, a]) => {
        const r = await fetch(`${backend}/core/settings`, { headers: { Authorization: a } })
        return r.ok ? ((await r.json()).marketplaces ?? []) : []
    }, [s.backend, s.auth])
}

test('the community marketplace was offered and is a normal, editable entry', async ({ page }) => {
    const s = await captureSession(page)
    const list = await marketplaces(page, s)

    const seeded = list.find(m => m.id === SEEDED_ID)
    /*
        A skip and not a pass: on a Kwirth where the admin already deleted it, its absence is correct
        behaviour and not something this test can tell apart from a seeding that never ran.
    */
    test.skip(!seeded, `'${SEEDED_ID}' is not configured here — it may have been deleted on purpose, which is allowed`)

    expect(seeded!.url).toMatch(/^https:\/\/raw\.githubusercontent\.com\/jfvilas\/kwirth\/.*manifest\.json$/)
    expect(seeded!.label.length).toBeGreaterThan(0)
    // It is an entry of the settings like any other — which is what makes it removable, unlike the
    // public Kwirth one, which is hardcoded and never appears in this list.
    expect(list.filter(m => m.id === SEEDED_ID)).toHaveLength(1)
})

test('the public Kwirth marketplace is NOT one of these entries: it cannot be removed', async ({ page }) => {
    const s = await captureSession(page)
    const list = await marketplaces(page, s)

    // the hardcoded one is resolved by the back end and is deliberately absent from the settings
    expect(list.some(m => m.url.includes('kwirthmagnify/kwirth'))).toBe(false)
})

test('its extensions are resolved, with the provenance of the marketplace that served them', async ({ page }) => {
    const s = await captureSession(page)
    const list = await marketplaces(page, s)
    const seeded = list.find(m => m.id === SEEDED_ID)
    test.skip(!seeded || !seeded.enabled, `'${SEEDED_ID}' is not configured or is switched off here`)

    const plugins = await page.evaluate(async ([backend, a]) => {
        const r = await fetch(`${backend}/core/marketplace/plugin`, { headers: { Authorization: a } })
        return r.ok ? await r.json() : []
    }, [s.backend, s.auth]) as IEntry[]

    const fromSeeded = plugins.filter(e => e.marketplaceId === SEEDED_ID)
    expect(fromSeeded.length).toBeGreaterThan(0)
    // the provenance is what tells the installer whose credentials to use, so it has to be stamped
    expect(fromSeeded.every(e => e.extensionType === 'plugin')).toBe(true)
})
