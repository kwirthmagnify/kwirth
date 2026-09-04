import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import type { AddressInfo } from 'net'
import { ApiKeyApi } from '../../src/api/ApiKeyApi'
import { SettingsApi } from '../../src/api/SettingsApi'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { accessKeySerialize, IKwirthSettings } from '@kwirthmagnify/kwirth-common'

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

async function startServer(initialSettings?: IKwirthSettings) {
    const store = memConfigMaps(initialSettings)
    const apiKeyApi = await ApiKeyApi.create(store.cm, 'masterx', true)
    const changes: IKwirthSettings[] = []
    const settingsApi = await SettingsApi.create(store.cm, apiKeyApi!, (s) => { changes.push(s) })
    const app = express()
    app.use(express.json())
    app.use('/core/settings', settingsApi!.router)
    const server = app.listen(0)
    await new Promise<void>(r => server.once('listening', () => r()))
    const port = (server.address() as AddressInfo).port
    return { base: `http://127.0.0.1:${port}`, store, changes, stop: () => new Promise<void>(r => server.close(() => r())) }
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
