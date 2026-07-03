import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import type { AddressInfo } from 'net'
import { ApiKeyApi } from '../../src/api/ApiKeyApi'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { accessKeySerialize } from '@kwirthmagnify/kwirth-common'

// gestión de API keys (/key) es admin-only: validKey + scope 'admin' (ver ApiKeyApi)
const adminKey = { id: 'adminkey', type: 'permanent', resources: 'admin,cluster::::' }
const nonAdminKey = { id: 'userkey', type: 'permanent', resources: 'cluster::::' }
const AUTH = { Authorization: 'Bearer ' + accessKeySerialize(adminKey as any) }
const NONADMIN_AUTH = { Authorization: 'Bearer ' + accessKeySerialize(nonAdminKey as any) }

const storedKeys = [
    { accessKey: adminKey, description: 'admin', expire: Date.now() + 3600_000, days: 1 },
    { accessKey: nonAdminKey, description: 'cluster-only', expire: Date.now() + 3600_000, days: 1 }
]
const memConfigMaps = (): IConfigMaps => ({
    read: async (name: string, def?: any) => (name === 'kwirth.keys' ? storedKeys as any : (def ?? [])),
    write: (async () => {}) as any,
    writeKey: async () => {},
    readAllKeys: async () => ({})
})

async function startServer() {
    const apiKeyApi = await ApiKeyApi.create(memConfigMaps(), 'masterx', true)
    const app = express()
    app.use(express.json())
    app.use('/key', apiKeyApi!.router)
    const server = app.listen(0)
    await new Promise<void>(r => server.once('listening', () => r()))
    const port = (server.address() as AddressInfo).port
    return { base: `http://127.0.0.1:${port}`, stop: () => new Promise<void>(r => server.close(() => r())) }
}

test('GET /key sin key → 403', async () => {
    const srv = await startServer()
    try { assert.equal((await fetch(`${srv.base}/key`)).status, 403) }
    finally { await srv.stop() }
})

test('GET /key con key válida SIN scope admin (cluster-only) → 403', async () => {
    const srv = await startServer()
    try { assert.equal((await fetch(`${srv.base}/key`, { headers: NONADMIN_AUTH })).status, 403) }
    finally { await srv.stop() }
})

test('GET /key con scope admin → 200', async () => {
    const srv = await startServer()
    try {
        const res = await fetch(`${srv.base}/key`, { headers: AUTH })
        assert.equal(res.status, 200)
        assert.ok(Array.isArray(await res.json()))
    }
    finally { await srv.stop() }
})
