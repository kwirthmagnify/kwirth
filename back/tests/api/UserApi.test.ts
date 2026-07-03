import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import type { AddressInfo } from 'net'
import { UserApi } from '../../src/api/UserApi'
import { ISecrets } from '../../src/tools/ISecrets'
import { accessKeySerialize } from '@kwirthmagnify/kwirth-common'

// gestión de usuarios (/user) es admin-only: validKey + scope 'admin' (ver UserApi)
const adminKey = { id: 'adminkey', type: 'permanent', resources: 'admin,cluster::::' }
const nonAdminKey = { id: 'userkey', type: 'permanent', resources: 'view:default:::' }
const fakeApiKeyApi = (): any => ({
    apiKeys: [
        { accessKey: adminKey, description: 'admin', expire: Date.now() + 3600_000, days: 1 },
        { accessKey: nonAdminKey, description: 'user', expire: Date.now() + 3600_000, days: 1 }
    ],
    masterKey: 'x', isDesktop: true, refreshKeys: async () => {}
})
const AUTH = { Authorization: 'Bearer ' + accessKeySerialize(adminKey as any) }
const NONADMIN_AUTH = { Authorization: 'Bearer ' + accessKeySerialize(nonAdminKey as any) }

const memSecrets = (): ISecrets => {
    const usersRaw = { admin: btoa(JSON.stringify({ id: 'admin', name: 'Admin', password: 'x', resources: 'admin,cluster::::' })) }
    return {
        read: async (name: string) => { if (name === 'kwirth-users') return usersRaw as any; throw new Error('no such secret') },
        write: async () => {},
        writeKey: async () => {},
        readAllKeys: async () => ({})
    }
}

async function startServer() {
    const userApi = new UserApi(memSecrets(), fakeApiKeyApi())
    const app = express()
    app.use(express.json())
    app.use('/user', userApi.router)
    const server = app.listen(0)
    await new Promise<void>(r => server.once('listening', () => r()))
    const port = (server.address() as AddressInfo).port
    return { base: `http://127.0.0.1:${port}`, stop: () => new Promise<void>(r => server.close(() => r())) }
}

test('GET /user sin key → 403', async () => {
    const srv = await startServer()
    try { assert.equal((await fetch(`${srv.base}/user`)).status, 403) }
    finally { await srv.stop() }
})

test('GET /user con key válida SIN scope admin → 403', async () => {
    const srv = await startServer()
    try { assert.equal((await fetch(`${srv.base}/user`, { headers: NONADMIN_AUTH })).status, 403) }
    finally { await srv.stop() }
})

test('GET /user con scope admin → 200', async () => {
    const srv = await startServer()
    try {
        const res = await fetch(`${srv.base}/user`, { headers: AUTH })
        assert.equal(res.status, 200)
        assert.ok((await res.json()).includes('admin'))
    }
    finally { await srv.stop() }
})
