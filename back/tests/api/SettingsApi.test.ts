import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import type { AddressInfo } from 'net'
import { ApiKeyApi } from '../../src/api/ApiKeyApi'
import { SettingsApi } from '../../src/api/SettingsApi'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { ISecrets } from '../../src/tools/ISecrets'
import { accessKeySerialize, IKwirthSettings, EMarketplaceAuthType, EManifestAuthType } from '@kwirthmagnify/kwirth-common'

// configurar Kwirth (/core/settings) es admin-only: validKey + scope 'admin'
const adminKey = { id: 'adminkey', type: 'permanent', resources: 'admin,cluster::::' }
const nonAdminKey = { id: 'userkey', type: 'permanent', resources: 'cluster::::' }
const AUTH = { Authorization: 'Bearer ' + accessKeySerialize(adminKey as any) }
const NONADMIN_AUTH = { Authorization: 'Bearer ' + accessKeySerialize(nonAdminKey as any) }
const JSON_AUTH = { ...AUTH, 'Content-Type': 'application/json' }

const storedKeys = [
    { accessKey: adminKey, description: 'admin', expire: Date.now() + 3600_000, days: 1 },
    { accessKey: nonAdminKey, description: 'cluster-only', expire: Date.now() + 3600_000, days: 1 }
]

// configMaps en memoria: 'kwirth.keys' sirve las claves de auth, 'kwirth.settings' es lo que probamos
const memConfigMaps = (initialSettings?: IKwirthSettings) => {
    let settings: IKwirthSettings|undefined = initialSettings
    const cm: IConfigMaps = {
        read: (async (name: string, def?: any) => {
            if (name === 'kwirth.keys') return storedKeys as any
            if (name === 'kwirth.settings') return settings ?? def
            return def
        }) as any,
        write: (async (name: string, data: any) => { if (name === 'kwirth.settings') settings = data }) as any,
        writeKey: async () => {},
        readAllKeys: async () => ({})
    }
    return { cm, current: () => settings }
}

// secrets en memoria. Respeta el parametro `name`: el ISecrets real guarda cada store por separado, y
// contraseñas del registro y tokens del manifest viven en stores distintos. Un mock que los mezclara
// dejaria pasar que el codigo pisara uno con otro.
const CREDENTIALS_STORE = 'kwirth.marketplace.credentials'

const memSecrets = (initialCredentials?: Record<string, any>) => {
    const stores = new Map<string, Record<string, any>>()
    if (initialCredentials) stores.set(CREDENTIALS_STORE, { ...initialCredentials })
    const s: ISecrets = {
        write: async () => {},
        read: async (_n: string, def?: any) => def,
        writeKey: async (name: string, key: string, value: any) => {
            const store = stores.get(name) ?? {}
            if (value === null) delete store[key]
            else store[key] = value
            stores.set(name, store)
        },
        readAllKeys: async (name: string) => ({ ...(stores.get(name) ?? {}) })
    }
    return { s, current: () => stores.get(CREDENTIALS_STORE) ?? {} }
}

async function startServer(initialSettings?: IKwirthSettings, initialSecrets?: Record<string, any>) {
    const store = memConfigMaps(initialSettings)
    const secrets = memSecrets(initialSecrets)
    const apiKeyApi = await ApiKeyApi.create(store.cm, 'masterx', true)
    const changes: IKwirthSettings[] = []
    const settingsApi = await SettingsApi.create(store.cm, secrets.s, apiKeyApi!, (s) => { changes.push(s) })
    const app = express()
    app.use(express.json())
    app.use('/core/settings', settingsApi!.router)
    const server = app.listen(0)
    await new Promise<void>(r => server.once('listening', () => r()))
    const port = (server.address() as AddressInfo).port
    return { base: `http://127.0.0.1:${port}`, store, secrets, changes, stop: () => new Promise<void>(r => server.close(() => r())) }
}

// ---- resolveMetricsInterval: precedencia guardado > METRICSINTERVAL > 15 ----

test('resolveMetricsInterval: sin nada guardado ni env → 15', () => {
    delete process.env.METRICSINTERVAL
    assert.equal(SettingsApi.resolveMetricsInterval({}), 15)
})

test('resolveMetricsInterval: METRICSINTERVAL manda cuando no hay valor guardado', () => {
    process.env.METRICSINTERVAL = '42'
    try { assert.equal(SettingsApi.resolveMetricsInterval({}), 42) }
    finally { delete process.env.METRICSINTERVAL }
})

test('resolveMetricsInterval: lo guardado gana sobre METRICSINTERVAL', () => {
    process.env.METRICSINTERVAL = '42'
    try { assert.equal(SettingsApi.resolveMetricsInterval({ metricsInterval: 7 }), 7) }
    finally { delete process.env.METRICSINTERVAL }
})

test('resolveMetricsInterval: METRICSINTERVAL no numerico se ignora → 15', () => {
    process.env.METRICSINTERVAL = 'not-a-number'
    try { assert.equal(SettingsApi.resolveMetricsInterval({}), 15) }
    finally { delete process.env.METRICSINTERVAL }
})

test('resolveMetricsInterval: valores no positivos se ignoran', () => {
    process.env.METRICSINTERVAL = '0'
    try {
        assert.equal(SettingsApi.resolveMetricsInterval({}), 15)
        assert.equal(SettingsApi.resolveMetricsInterval({ metricsInterval: 0 }), 15)
        assert.equal(SettingsApi.resolveMetricsInterval({ metricsInterval: -5 }), 15)
    }
    finally { delete process.env.METRICSINTERVAL }
})

// ---- autorizacion ----

test('GET /core/settings sin key → 403', async () => {
    const srv = await startServer()
    try { assert.equal((await fetch(`${srv.base}/core/settings`)).status, 403) }
    finally { await srv.stop() }
})

test('GET /core/settings con key valida SIN scope admin → 403', async () => {
    const srv = await startServer()
    try { assert.equal((await fetch(`${srv.base}/core/settings`, { headers: NONADMIN_AUTH })).status, 403) }
    finally { await srv.stop() }
})

test('PUT /core/settings sin scope admin → 403 y no persiste', async () => {
    const srv = await startServer({ metricsInterval: 30 })
    try {
        const res = await fetch(`${srv.base}/core/settings`, {
            method: 'PUT',
            headers: { ...NONADMIN_AUTH, 'Content-Type': 'application/json' },
            body: JSON.stringify({ metricsInterval: 99 })
        })
        assert.equal(res.status, 403)
        assert.equal(srv.store.current()?.metricsInterval, 30)
    }
    finally { await srv.stop() }
})

// ---- lectura ----

test('GET devuelve el valor efectivo, no el crudo, cuando no hay nada guardado', async () => {
    delete process.env.METRICSINTERVAL
    const srv = await startServer()
    try {
        const res = await fetch(`${srv.base}/core/settings`, { headers: AUTH })
        assert.equal(res.status, 200)
        assert.equal((await res.json() as IKwirthSettings).metricsInterval, 15)
    }
    finally { await srv.stop() }
})

test('GET devuelve lo guardado cuando existe', async () => {
    const srv = await startServer({ metricsInterval: 30 })
    try {
        const res = await fetch(`${srv.base}/core/settings`, { headers: AUTH })
        assert.equal((await res.json() as IKwirthSettings).metricsInterval, 30)
    }
    finally { await srv.stop() }
})

// ---- escritura ----

test('PUT persiste, devuelve el valor efectivo y notifica el cambio', async () => {
    const srv = await startServer()
    try {
        const res = await fetch(`${srv.base}/core/settings`, {
            method: 'PUT', headers: JSON_AUTH, body: JSON.stringify({ metricsInterval: 25 })
        })
        assert.equal(res.status, 200)
        assert.equal((await res.json() as IKwirthSettings).metricsInterval, 25)
        assert.equal(srv.store.current()?.metricsInterval, 25)
        assert.equal(srv.changes.length, 1)
        assert.equal(srv.changes[0].metricsInterval, 25)
    }
    finally { await srv.stop() }
})

test('PUT acepta el intervalo como string numerico y lo guarda como numero', async () => {
    const srv = await startServer()
    try {
        const res = await fetch(`${srv.base}/core/settings`, {
            method: 'PUT', headers: JSON_AUTH, body: JSON.stringify({ metricsInterval: '25' })
        })
        assert.equal(res.status, 200)
        assert.strictEqual(srv.store.current()?.metricsInterval, 25)
    }
    finally { await srv.stop() }
})

test('PUT rechaza intervalos no positivos o no numericos → 400, sin persistir ni notificar', async () => {
    for (const bad of [0, -1, 'abc']) {
        const srv = await startServer({ metricsInterval: 30 })
        try {
            const res = await fetch(`${srv.base}/core/settings`, {
                method: 'PUT', headers: JSON_AUTH, body: JSON.stringify({ metricsInterval: bad })
            })
            assert.equal(res.status, 400, `valor ${JSON.stringify(bad)} deberia rechazarse`)
            assert.equal(srv.store.current()?.metricsInterval, 30)
            assert.equal(srv.changes.length, 0)
        }
        finally { await srv.stop() }
    }
})

test('PUT parcial no borra ajustes que no envia', async () => {
    // un ajuste futuro ya guardado (p.ej. marketplaces) debe sobrevivir a un PUT que solo trae el intervalo
    const srv = await startServer({ metricsInterval: 30, ...{ someOtherSetting: 'keep me' } } as IKwirthSettings)
    try {
        await fetch(`${srv.base}/core/settings`, {
            method: 'PUT', headers: JSON_AUTH, body: JSON.stringify({ metricsInterval: 12 })
        })
        const saved = srv.store.current() as Record<string, unknown>
        assert.equal(saved.metricsInterval, 12)
        assert.equal(saved.someOtherSetting, 'keep me')
    }
    finally { await srv.stop() }
})

// ---- hidratacion en arranque ----

test('SettingsApi.read devuelve {} cuando no hay nada guardado', async () => {
    const store = memConfigMaps()
    assert.deepEqual(await SettingsApi.read(store.cm), {})
})

test('SettingsApi.read devuelve lo guardado', async () => {
    const store = memConfigMaps({ metricsInterval: 33 })
    assert.equal((await SettingsApi.read(store.cm)).metricsInterval, 33)
})

// ---- marketplaces: validacion ----

const MP = { id: 'nexus', url: 'https://raw.example.com/manifest.json', label: 'Nexus', enabled: true }

test('validateMarketplaces acepta una lista valida y rechaza lo que no lo es', () => {
    assert.equal(SettingsApi.validateMarketplaces([]), undefined)
    assert.equal(SettingsApi.validateMarketplaces([MP]), undefined)
    assert.match(SettingsApi.validateMarketplaces('nope') ?? '', /must be an array/)
    assert.match(SettingsApi.validateMarketplaces([{ ...MP, id: '' }]) ?? '', /non-empty id/)
    assert.match(SettingsApi.validateMarketplaces([MP, MP]) ?? '', /duplicated/)
    assert.match(SettingsApi.validateMarketplaces([{ ...MP, url: 'ftp://x' }]) ?? '', /http\(s\) url/)
    assert.match(SettingsApi.validateMarketplaces([{ ...MP, label: '' }]) ?? '', /non-empty label/)
    assert.match(SettingsApi.validateMarketplaces([{ ...MP, enabled: 'yes' }]) ?? '', /boolean enabled/)
})

test('validateMarketplaces exige username cuando el auth es basic', () => {
    assert.match(SettingsApi.validateMarketplaces([{ ...MP, auth: { type: EMarketplaceAuthType.BASIC } }]) ?? '', /needs a username/)
    assert.equal(SettingsApi.validateMarketplaces([{ ...MP, auth: { type: EMarketplaceAuthType.BASIC, username: 'u' } }]), undefined)
    assert.equal(SettingsApi.validateMarketplaces([{ ...MP, auth: { type: EMarketplaceAuthType.NONE } }]), undefined)
    assert.match(SettingsApi.validateMarketplaces([{ ...MP, auth: { type: 'kerberos' } }]) ?? '', /unknown auth type/)
})

test('PUT rechaza marketplaces invalidos → 400 sin persistir', async () => {
    const srv = await startServer()
    try {
        const res = await fetch(`${srv.base}/core/settings`, {
            method: 'PUT', headers: JSON_AUTH, body: JSON.stringify({ marketplaces: [{ ...MP, url: 'nope' }] })
        })
        assert.equal(res.status, 400)
        assert.equal(srv.store.current()?.marketplaces, undefined)
        assert.equal(srv.changes.length, 0)
    }
    finally { await srv.stop() }
})

// ---- marketplaces: contraseñas fuera del configmap ----

test('PUT desvia la contraseña a secrets y NUNCA la guarda en settings', async () => {
    const srv = await startServer()
    try {
        const body = { marketplaces: [{ ...MP, auth: { type: EMarketplaceAuthType.BASIC, username: 'u' }, password: 's3cr3t' }] }
        const res = await fetch(`${srv.base}/core/settings`, { method: 'PUT', headers: JSON_AUTH, body: JSON.stringify(body) })
        assert.equal(res.status, 200)
        // la contraseña esta en secrets...
        assert.equal(srv.secrets.current()['nexus'], 's3cr3t')
        // ...y no aparece por ningun lado del configmap
        assert.ok(!JSON.stringify(srv.store.current()).includes('s3cr3t'))
    }
    finally { await srv.stop() }
})

test('GET informa hasPassword pero no devuelve la contraseña', async () => {
    const stored: IKwirthSettings = { marketplaces: [{ ...MP, auth: { type: EMarketplaceAuthType.BASIC, username: 'u' } }] }
    const srv = await startServer(stored, { nexus: 's3cr3t' })
    try {
        const res = await fetch(`${srv.base}/core/settings`, { headers: AUTH })
        const body = await res.text()
        assert.ok(!body.includes('s3cr3t'), 'la contraseña no debe viajar al front')
        const json = JSON.parse(body) as IKwirthSettings
        assert.equal(json.marketplaces?.[0].auth?.hasPassword, true)
    }
    finally { await srv.stop() }
})

test('GET marca hasPassword false cuando no hay contraseña guardada', async () => {
    const stored: IKwirthSettings = { marketplaces: [{ ...MP, auth: { type: EMarketplaceAuthType.BASIC, username: 'u' } }] }
    const srv = await startServer(stored)
    try {
        const res = await fetch(`${srv.base}/core/settings`, { headers: AUTH })
        assert.equal(((await res.json()) as IKwirthSettings).marketplaces?.[0].auth?.hasPassword, false)
    }
    finally { await srv.stop() }
})

test('PUT sin password conserva la ya guardada, no la borra', async () => {
    const stored: IKwirthSettings = { marketplaces: [{ ...MP, auth: { type: EMarketplaceAuthType.BASIC, username: 'u' } }] }
    const srv = await startServer(stored, { nexus: 's3cr3t' })
    try {
        const body = { marketplaces: [{ ...MP, label: 'Nexus renombrado', auth: { type: EMarketplaceAuthType.BASIC, username: 'u' } }] }
        await fetch(`${srv.base}/core/settings`, { method: 'PUT', headers: JSON_AUTH, body: JSON.stringify(body) })
        assert.equal(srv.secrets.current()['nexus'], 's3cr3t')
        assert.equal(srv.store.current()?.marketplaces?.[0].label, 'Nexus renombrado')
    }
    finally { await srv.stop() }
})

test('borrar un marketplace se lleva su contraseña', async () => {
    const stored: IKwirthSettings = { marketplaces: [{ ...MP, auth: { type: EMarketplaceAuthType.BASIC, username: 'u' } }] }
    const srv = await startServer(stored, { nexus: 's3cr3t' })
    try {
        await fetch(`${srv.base}/core/settings`, { method: 'PUT', headers: JSON_AUTH, body: JSON.stringify({ marketplaces: [] }) })
        assert.equal(srv.secrets.current()['nexus'], undefined)
    }
    finally { await srv.stop() }
})

test('getPassword devuelve la contraseña al back y undefined si no hay', async () => {
    const secrets = memSecrets({ nexus: 's3cr3t' })
    assert.equal(await SettingsApi.getPassword(secrets.s, 'nexus'), 's3cr3t')
    assert.equal(await SettingsApi.getPassword(secrets.s, 'otro'), undefined)
})

// ---- token de lectura del manifest, separado de la contraseña del registro ----

test('PUT desvia el token del manifest a secrets y no lo guarda en settings', async () => {
    const srv = await startServer()
    try {
        const body = { marketplaces: [{ ...MP, manifestAuth: { type: EManifestAuthType.PRIVATE_TOKEN }, token: 'glpat-s3cr3t' }] }
        const res = await fetch(`${srv.base}/core/settings`, { method: 'PUT', headers: JSON_AUTH, body: JSON.stringify(body) })
        assert.equal(res.status, 200)
        assert.ok(!JSON.stringify(srv.store.current()).includes('glpat-s3cr3t'), 'el token no debe tocar el configmap')
        assert.equal(srv.store.current()?.marketplaces?.[0].manifestAuth?.type, EManifestAuthType.PRIVATE_TOKEN)
    }
    finally { await srv.stop() }
})

test('GET informa hasToken pero no devuelve el token', async () => {
    const stored: IKwirthSettings = { marketplaces: [{ ...MP, manifestAuth: { type: EManifestAuthType.PRIVATE_TOKEN } }] }
    const srv = await startServer(stored)
    try {
        // el token vive en su propio store, distinto del de contraseñas
        await fetch(`${srv.base}/core/settings`, { method: 'PUT', headers: JSON_AUTH,
            body: JSON.stringify({ marketplaces: [{ ...MP, manifestAuth: { type: EManifestAuthType.PRIVATE_TOKEN }, token: 'glpat-abc' }] }) })
        const res = await fetch(`${srv.base}/core/settings`, { headers: AUTH })
        const text = await res.text()
        assert.ok(!text.includes('glpat-abc'), 'el token no debe viajar al front')
        assert.equal((JSON.parse(text) as IKwirthSettings).marketplaces?.[0].manifestAuth?.hasToken, true)
    }
    finally { await srv.stop() }
})

test('token del manifest y contraseña del registro son independientes', async () => {
    const srv = await startServer()
    try {
        const body = { marketplaces: [{ ...MP,
            manifestAuth: { type: EManifestAuthType.PRIVATE_TOKEN }, token: 'glpat-manifest',
            auth: { type: EMarketplaceAuthType.BASIC, username: 'u' }, password: 'nexus-pass' }] }
        await fetch(`${srv.base}/core/settings`, { method: 'PUT', headers: JSON_AUTH, body: JSON.stringify(body) })
        assert.equal(await SettingsApi.getManifestToken(srv.secrets.s, 'nexus'), 'glpat-manifest')
        assert.equal(await SettingsApi.getPassword(srv.secrets.s, 'nexus'), 'nexus-pass')
    }
    finally { await srv.stop() }
})

test('validateMarketplaces rechaza un tipo de auth de manifest desconocido', () => {
    assert.equal(SettingsApi.validateMarketplaces([{ ...MP, manifestAuth: { type: EManifestAuthType.PRIVATE_TOKEN } }]), undefined)
    assert.match(SettingsApi.validateMarketplaces([{ ...MP, manifestAuth: { type: 'oauth' } }]) ?? '', /unknown manifest auth type/)
})

test('marketplaces y metricsInterval no se pisan entre si', async () => {
    const srv = await startServer({ metricsInterval: 30 })
    try {
        await fetch(`${srv.base}/core/settings`, { method: 'PUT', headers: JSON_AUTH, body: JSON.stringify({ marketplaces: [MP] }) })
        assert.equal(srv.store.current()?.metricsInterval, 30, 'el intervalo debe sobrevivir')
        await fetch(`${srv.base}/core/settings`, { method: 'PUT', headers: JSON_AUTH, body: JSON.stringify({ metricsInterval: 12 }) })
        assert.equal(srv.store.current()?.marketplaces?.length, 1, 'los marketplaces deben sobrevivir')
        assert.equal(srv.store.current()?.metricsInterval, 12)
    }
    finally { await srv.stop() }
})
