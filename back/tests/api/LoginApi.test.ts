import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import type { AddressInfo } from 'net'
import { LoginApi } from '../../src/api/LoginApi'
import { IUser } from '@kwirthmagnify/kwirth-common'
import { ISecrets } from '../../src/tools/ISecrets'
import { IConfigMaps } from '../../src/tools/IConfigMap'

// ---- helpers ----
const makeUser = (over: Partial<IUser> = {}): IUser => ({
    id: 'alice@example.com',
    name: 'Alice',
    password: 'secret',
    accessKey: { id: '', type: 'volatile', resources: '' } as any,
    resources: 'view:default:::',
    ...over
})

const encodeUsers = (users: IUser[]): { [k:string]: string } => {
    const out: { [k:string]: string } = {}
    for (const u of users) out[u.id] = btoa(JSON.stringify(u))
    return out
}

const mockSecrets = (usersMap: any): ISecrets => ({
    read: async (name: string) => { if (name === 'kwirth-users') return usersMap; throw new Error('no such secret') },
    write: async () => {},
    writeKey: async () => {},
    readAllKeys: async () => ({})
})

const mockConfigMaps = (): IConfigMaps => ({
    read: async (_name: string, def?: any) => def ?? [],
    write: (() => {}) as any,
    writeKey: async () => {},
    readAllKeys: async () => ({})
})

// levanta un express efimero con el router de LoginApi montado en /login
async function startServer(usersMap: any) {
    const app = express()
    app.use(express.json())
    const apiKeyApi: any = { apiKeys: [] }
    const loginApi = new LoginApi(mockSecrets(usersMap), mockConfigMaps(), apiKeyApi)
    app.use('/login', loginApi.router)
    const server = app.listen(0)
    await new Promise<void>(r => server.once('listening', () => r()))
    const port = (server.address() as AddressInfo).port
    return { base: `http://127.0.0.1:${port}`, stop: () => new Promise<void>(r => server.close(() => r())) }
}

const post = (base: string, path: string, body: any) =>
    fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// ---- login ----
test('POST /login con credenciales validas devuelve 200 y accessKey', async () => {
    const srv = await startServer(encodeUsers([makeUser()]))
    try {
        const res = await post(srv.base, '/login', { user: 'alice@example.com', password: 'secret' })
        assert.equal(res.status, 200)
        const body = await res.json()
        assert.equal(body.id, 'alice@example.com')
        assert.equal(body.name, 'Alice')
        assert.ok(body.accessKey && body.accessKey.type === 'permanent')
        assert.equal(body.accessKey.resources, 'view:default:::')
    }
    finally { await srv.stop() }
})

test('POST /login admin/password devuelve 201 (fuerza cambio)', async () => {
    const srv = await startServer(encodeUsers([makeUser({ id: 'admin', name: 'admin', password: 'password' })]))
    try {
        const res = await post(srv.base, '/login', { user: 'admin', password: 'password' })
        assert.equal(res.status, 201)
    }
    finally { await srv.stop() }
})

test('POST /login con password incorrecta devuelve 401', async () => {
    const srv = await startServer(encodeUsers([makeUser()]))
    try {
        const res = await post(srv.base, '/login', { user: 'alice@example.com', password: 'WRONG' })
        assert.equal(res.status, 401)
    }
    finally { await srv.stop() }
})

test('POST /login con usuario inexistente devuelve 401', async () => {
    const srv = await startServer(encodeUsers([makeUser()]))
    try {
        const res = await post(srv.base, '/login', { user: 'nadie@example.com', password: 'x' })
        assert.equal(res.status, 401)
    }
    finally { await srv.stop() }
})

// ---- change password ----
test('POST /login/password con password valida devuelve 200 y nuevo accessKey', async () => {
    const srv = await startServer(encodeUsers([makeUser()]))
    try {
        const res = await post(srv.base, '/login/password', { user: 'alice@example.com', password: 'secret', newpassword: 'nuevo' })
        assert.equal(res.status, 200)
        const body = await res.json()
        assert.equal(body.id, 'alice@example.com')
        assert.ok(body.accessKey && body.accessKey.type === 'permanent')
    }
    finally { await srv.stop() }
})

test('POST /login/password con password incorrecta devuelve 401', async () => {
    const srv = await startServer(encodeUsers([makeUser()]))
    try {
        const res = await post(srv.base, '/login/password', { user: 'alice@example.com', password: 'WRONG', newpassword: 'nuevo' })
        assert.equal(res.status, 401)
    }
    finally { await srv.stop() }
})
