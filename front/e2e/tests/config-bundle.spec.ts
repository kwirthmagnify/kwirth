import { test, expect } from '@playwright/test'
import { login, dismissOpenDialogs } from './helpers'

/*
    Portabilidad de configuracion: el bundle que se lleva la configuracion de un Kwirth a otro.

    Se prueba contra el back real, reutilizando la sesion del navegador —se captura la cabecera
    Authorization de una llamada que la app ya hace— en vez de manejar credenciales aqui.

    NO DESTRUCTIVO, y merece una explicacion porque este es de los pocos sitios donde un test podria
    cargarse la configuracion del usuario: se exporta y se lee cuanto se quiera, y lo unico que se
    importa es `plugin/censor`, con el contenido que el propio Kwirth acaba de exportar. Es decir, se
    le devuelve lo que ya tenia. Los ajustes globales NO se importan nunca aqui.
*/

interface ISession { auth: string; backend: string }

interface IExportableEntry { type: string; id: string; displayName: string; status: string }

interface IBundle {
    kind: string
    formatVersion: number
    meta: { exportedAt: string; kwirthVersion: string; includesCredentials: boolean }
    core: { settings?: unknown; sharedAi?: unknown }
    extensions: { type: string; id: string; version?: string; config: unknown }[]
}

const CENSOR = 'plugin/censor'

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

async function api(page: import('@playwright/test').Page, s: ISession, path: string, init?: { method: string, body: unknown }) {
    return await page.evaluate(async ([backend, p, a, raw]) => {
        const opciones = raw
            ? { method: (raw as { method: string }).method, headers: { Authorization: a as string, 'Content-Type': 'application/json' }, body: JSON.stringify((raw as { body: unknown }).body) }
            : { headers: { Authorization: a as string } }
        const r = await fetch(`${backend}${p}`, opciones as RequestInit)
        return { status: r.status, body: r.ok || r.status === 400 ? await r.json().catch(() => null) : null }
    }, [s.backend, path, s.auth, init ?? null] as const)
}

test.describe.configure({ mode: 'serial' })

test.describe('portabilidad de configuracion', () => {
    let page: import('@playwright/test').Page
    let s: ISession

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage()
        s = await captureSession(page)
    })

    test.afterAll(async () => { await page?.close() })

    test('lo exportable se lista con el estado de cada entrada', async () => {
        const r = await api(page, s, '/core/config-bundle/exportable')
        expect(r.status).toBe(200)

        const entradas = r.body as IExportableEntry[]
        expect(Array.isArray(entradas)).toBe(true)
        expect(entradas.length).toBeGreaterThan(0)

        // Todo lo instalado se lista, implemente el contrato o no: quien mira el dialogo tiene que ver
        // su plugin y por que no entra, no encontrarse una lista corta sin explicacion.
        for (const e of entradas) {
            expect(['available', 'not-supported', 'not-instantiated']).toContain(e.status)
        }
    })

    test('censor implementa el contrato y esta disponible', async () => {
        const entradas = (await api(page, s, '/core/config-bundle/exportable')).body as IExportableEntry[]
        const censor = entradas.find(e => `${e.type}/${e.id}` === CENSOR)
        expect(censor, 'censor deberia estar instalado en el dev').toBeTruthy()
        expect(censor!.status).toBe('available')
    })

    test('el export produce un bundle valido, y sin credenciales por defecto', async () => {
        const r = await api(page, s, '/core/config-bundle/export')
        expect(r.status).toBe(200)

        const b = r.body as IBundle
        expect(b.kind).toBe('kwirth-config-bundle')
        expect(b.formatVersion).toBe(1)
        expect(b.meta.includesCredentials).toBe(false)
        expect(b.meta.kwirthVersion).toMatch(/^\d+\.\d+\.\d+/)
        expect(new Date(b.meta.exportedAt).getTime()).toBeGreaterThan(0)
        expect(b.core.settings, 'los ajustes globales son lo que aporta el core').toBeTruthy()
        expect(b.extensions.some(e => `${e.type}/${e.id}` === CENSOR)).toBe(true)
    })

    test('el fichero declara si lleva credenciales, para quien lo guarde', async () => {
        const b = (await api(page, s, '/core/config-bundle/export?credentials=true')).body as IBundle
        expect(b.meta.includesCredentials).toBe(true)
    })

    test('el include manda: se puede exportar una sola extension', async () => {
        const b = (await api(page, s, `/core/config-bundle/export?include=${CENSOR}`)).body as IBundle
        expect(b.extensions).toHaveLength(1)
        expect(`${b.extensions[0].type}/${b.extensions[0].id}`).toBe(CENSOR)
        expect(b.core.settings, 'sin marcar, el core tampoco entra').toBeUndefined()
    })

    test('la vista previa dice que pasaria con cada entrada', async () => {
        const b = (await api(page, s, '/core/config-bundle/export')).body as IBundle
        const r = await api(page, s, '/core/config-bundle/preview', { method: 'POST', body: b })
        expect(r.status).toBe(200)

        const previa = r.body as { type: string, id: string, status: string }[]
        expect(previa.length).toBe(b.extensions.length)
        // Es un bundle de este mismo Kwirth: todo lo que exporto puede volver a entrar.
        for (const p of previa) expect(p.status).toBe('available')
    })

    test('un fichero que no es un bundle se rechaza ANTES de tocar nada', async () => {
        const r = await api(page, s, '/core/config-bundle/preview', { method: 'POST', body: { hola: 1 } })
        expect(r.status).toBe(400)
        expect((r.body as { error: string }).error).toContain('not a Kwirth configuration bundle')
    })

    test('un formato mas nuevo se rechaza diciendo que hay que actualizar', async () => {
        const b = (await api(page, s, '/core/config-bundle/export')).body as IBundle
        const r = await api(page, s, '/core/config-bundle/preview', { method: 'POST', body: { ...b, formatVersion: 99 } })
        expect(r.status).toBe(400)
        expect((r.body as { error: string }).error).toContain('upgrade Kwirth')
    })

    test('exportar e importar sobre el mismo Kwirth no cambia nada', async () => {
        // El criterio de aceptacion central: es lo que permite reimportar sin miedo. Se hace solo sobre
        // censor —devolviendole lo que acaba de dar—, nunca sobre los ajustes globales del usuario.
        const antes = (await api(page, s, `/core/config-bundle/export?include=${CENSOR}`)).body as IBundle

        const r = await api(page, s, '/core/config-bundle/import', { method: 'POST', body: { bundle: antes, include: [CENSOR] } })
        expect(r.status).toBe(200)

        const informe = r.body as { entries: { id: string, status: string, result?: { applied: number, warnings: string[] }, error?: string }[], coreApplied: string[] }
        expect(informe.coreApplied, 'no se ha tocado nada del core').toHaveLength(0)
        expect(informe.entries).toHaveLength(1)
        expect(informe.entries[0].error, 'censor deberia aceptar lo que el mismo exporto').toBeUndefined()
        expect(informe.entries[0].status).toBe('available')

        const despues = (await api(page, s, `/core/config-bundle/export?include=${CENSOR}`)).body as IBundle
        expect(despues.extensions[0].config).toEqual(antes.extensions[0].config)
    })
})
