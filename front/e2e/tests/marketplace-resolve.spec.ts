import { test, expect } from '@playwright/test'
import { login, dismissOpenDialogs } from './helpers'

// Verifica el endpoint de resolucion de marketplaces (/core/marketplace/:extensionType) contra el back
// real: que descarga los manifests, filtra por tipo y estampa la procedencia. Se reutiliza la sesion del
// navegador capturando la cabecera Authorization de una llamada que la app ya hace, en vez de manejar
// credenciales en el test.
//
// NO destructivo: solo lee.

interface IEntry { extensionType: string; id: string; version: string; url: string; marketplaceId?: string }

interface ISession { auth: string; backend: string }

// El front habla con el back por URL absoluta, no por el dev server, asi que hay que quedarse tambien
// con el origen: un fetch relativo lo atenderia CRA devolviendo index.html con 200.
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

test('resuelve el marketplace publico y devuelve solo entradas del tipo pedido', async ({ page }) => {
    const s = await captureSession(page)

    const plugins = await resolve(page, s, 'plugin')
    expect(plugins.status).toBe(200)
    const list = plugins.body as IEntry[]
    expect(list.length).toBeGreaterThan(0)

    // todas del tipo pedido, ninguna de otro
    expect(list.every(e => e.extensionType === 'plugin')).toBe(true)

    // sin marketplaces privados configurados, todo viene del publico: sin procedencia estampada
    expect(list.every(e => e.marketplaceId === undefined)).toBe(true)

    // y trae de verdad el catalogo, con su historico de versiones
    const log = list.filter(e => e.id === 'log')
    expect(log.length).toBeGreaterThan(1)
    expect(log.every(e => e.url.includes('kwirth-plugin-log'))).toBe(true)
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
