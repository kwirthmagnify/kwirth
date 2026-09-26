import { test, expect } from '@playwright/test'
import { login, dismissOpenDialogs } from './helpers'

// Verifies the marketplace resolution endpoint (/core/marketplace/:extensionType) against the real back
// end: that it downloads the manifests, filters by type and stamps the provenance. The browser's session
// is reused by capturing the Authorization header of a call the app already makes, rather than handling
// credentials in the test.
//
// NON-destructive: it only reads.

interface IEntry { extensionType: string; targetType?: string; id: string; version: string; url: string; marketplaceId?: string }

interface IMarketplace { id: string; label: string; url: string; enabled: boolean }

interface ISession { auth: string; backend: string }

// The front end talks to the back end through an absolute URL and not through the dev server, so the
// origin has to be kept as well: a relative fetch would be served by CRA returning index.html with 200.
async function captureSession(page: import('@playwright/test').Page): Promise<ISession> {
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

async function resolve(page: import('@playwright/test').Page, s: ISession, type: string) {
    return await page.evaluate(async ([backend, t, a]) => {
        const r = await fetch(`${backend}/core/marketplace/${t}`, { headers: { Authorization: a } })
        return { status: r.status, body: r.ok ? await r.json() : null }
    }, [s.backend, type, s.auth])
}

async function configuredMarketplaces(page: import('@playwright/test').Page, s: ISession): Promise<IMarketplace[]> {
    return await page.evaluate(async ([backend, a]) => {
        const r = await fetch(`${backend}/core/settings`, { headers: { Authorization: a } })
        return r.ok ? ((await r.json()).marketplaces ?? []) : []
    }, [s.backend, s.auth])
}

test('resuelve el marketplace publico y devuelve solo entradas del tipo pedido', async ({ page }) => {
    const s = await captureSession(page)

    const plugins = await resolve(page, s, 'plugin')
    expect(plugins.status).toBe(200)
    const list = plugins.body as IEntry[]
    expect(list.length).toBeGreaterThan(0)

    // all of the requested type, none of another
    expect(list.every(e => e.extensionType === 'plugin')).toBe(true)

    // The provenance has to be consistent with what is configured in THIS Kwirth: no marketplaceId =
    // public, and with a marketplaceId = one of the registered private ones. It cannot be assumed that
    // there are no private ones: as soon as one is registered, the catalogue carries entries of its own.
    const registered = (await configuredMarketplaces(page, s)).map(m => m.id)
    const stamped = [...new Set(list.map(e => e.marketplaceId).filter(id => id !== undefined))]
    for (const id of stamped) {
        expect(registered, `la entrada dice venir de '${id}', que no esta registrado`).toContain(id)
    }

    // the public catalogue still arrives whole, with its version history
    const log = list.filter(e => e.id === 'log')
    expect(log.length).toBeGreaterThan(1)
    expect(log.every(e => e.url.includes('kwirth-plugin-log'))).toBe(true)
    expect(log.every(e => e.marketplaceId === undefined), 'log es del marketplace publico').toBe(true)
})

test('la documentacion se identifica por el par (targetType, id)', async ({ page }) => {
    const s = await captureSession(page)

    const res = await resolve(page, s, 'docs')
    expect(res.status).toBe(200)
    const list = res.body as IEntry[]
    test.skip(list.length === 0, 'no hay ninguna documentacion publicada en los marketplaces de este Kwirth')

    // a guide's id is that of the documented extension, so without targetType there is no telling whose it is
    for (const e of list) {
        expect(e.targetType, `la entrada docs '${e.id}' no dice a que tipo de extension documenta`).toBeTruthy()
    }

    // and the pair has to be unique per marketplace: two identical entries would be two versions of the same one
    const pairs = list.map(e => `${e.targetType}/${e.id}@${e.version}`)
    expect(new Set(pairs).size, 'hay guias duplicadas en el catalogo').toBe(pairs.length)
})

test('cada tipo de extension resuelve su propio manifest', async ({ page }) => {
    const s = await captureSession(page)

    for (const type of ['sender', 'provider', 'theme', 'homepage']) {
        const res = await resolve(page, s, type)
        expect(res.status, `${type} debe resolver`).toBe(200)
        const list = res.body as IEntry[]
        expect(list.length, `${type} deberia traer entradas`).toBeGreaterThan(0)
        expect(list.every(e => e.extensionType === type), `${type} solo debe traer su tipo`).toBe(true)
    }
})

test('un tipo de extension inexistente da 400', async ({ page }) => {
    const s = await captureSession(page)
    const res = await resolve(page, s, 'noexiste')
    expect(res.status).toBe(400)
})

test('sin autorizacion no se resuelve nada', async ({ page }) => {
    const s = await captureSession(page)
    const res = await page.evaluate(async (backend) => {
        const r = await fetch(`${backend}/core/marketplace/plugin`)
        return r.status
    }, s.backend)
    expect(res).toBe(403)
})
