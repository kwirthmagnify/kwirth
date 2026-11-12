import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import type { AddressInfo } from 'net'
import { UserApi } from '../../src/api/UserApi'
import { IdentityService } from '../../src/tools/auth/IdentityService'
import { ISecrets } from '../../src/tools/ISecrets'
import { accessKeySerialize } from '@kwirthmagnify/kwirth-common'

// managing users (/user) is admin-only: validKey + the 'admin' scope (see UserApi)
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

// 🔴 D6 (signup S1): UserApi takes THE identity lock, the same the login and the signups take. It used to
// have a semaphore of its own, which serialised the admin with the admin and with nobody else.
test('GET /user espera mientras alguien tiene IdentityService.lock', async () => {
    const srv = await startServer()
    let release!: () => void
    const held = new Promise<void>(r => { release = r })
    const holder = IdentityService.lock.use(async () => { await held })
    try {
        let answered = false
        const pending = fetch(`${srv.base}/user`, { headers: AUTH }).then(r => { answered = true; return r })
        await new Promise(r => setTimeout(r, 100))
        assert.equal(answered, false, 'the request must be waiting for the lock')
        release()
        assert.equal((await pending).status, 200)
    }
    finally { release(); await holder; await srv.stop() }
})

// ── plans/user-tags: tags on the user ─────────────────────────────────────────────────────────────────────────

// A users Secret that KEEPS what is written (the one above discards it), to read back what a save stored.
const writableSecrets = () => {
    let raw: { [k: string]: string } = { admin: btoa(JSON.stringify({ id: 'admin', name: 'Admin', password: 'x', resources: 'admin,cluster::::' })) }
    const secrets: ISecrets = {
        read: async (name: string) => { if (name === 'kwirth-users') return raw as any; throw new Error('no such secret') },
        write: async (_name: string, data: any) => { raw = data },
        writeKey: async () => {},
        readAllKeys: async () => ({})
    }
    return { secrets, stored: async (id: string) => JSON.parse(atob((await IdentityService.readUsers(secrets))![id])) }
}
async function startWritable() {
    const w = writableSecrets()
    const userApi = new UserApi(w.secrets, fakeApiKeyApi())
    const app = express()
    app.use(express.json())
    app.use('/user', userApi.router)
    const server = app.listen(0)
    await new Promise<void>(r => server.once('listening', () => r()))
    const port = (server.address() as AddressInfo).port
    return { base: `http://127.0.0.1:${port}`, stored: w.stored, stop: () => new Promise<void>(r => server.close(() => r())) }
}
const json = (body: unknown) => ({ headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

test('user tags: stored normalized on create, read back on GET, edited on PUT', async () => {
    const srv = await startWritable()
    try {
        const create = await fetch(`${srv.base}/user`, { method: 'POST', ...json({ id: 'ana', name: 'Ana', password: 'p', resources: 'cluster::::', tags: [' Agora:SRE ', 'agora:sre', 'chat:exec'] }) })
        assert.equal(create.status, 200)
        assert.deepEqual((await srv.stored('ana')).tags, ['agora:sre', 'chat:exec'], 'trimmed, lower case, no repeats')
        const got = await (await fetch(`${srv.base}/user/ana`, { headers: AUTH })).json()
        assert.deepEqual(got.tags, ['agora:sre', 'chat:exec'])
        assert.equal(got.password, undefined, 'the password never comes back')

        const edit = await fetch(`${srv.base}/user/ana`, { method: 'PUT', ...json({ id: 'ana', name: 'Ana', resources: 'cluster::::', tags: ['agora:executive'] }) })
        assert.equal(edit.status, 200)
        assert.deepEqual((await srv.stored('ana')).tags, ['agora:executive'])

        // An empty list is no tags at all: no field stored.
        await fetch(`${srv.base}/user/ana`, { method: 'PUT', ...json({ id: 'ana', name: 'Ana', resources: 'cluster::::', tags: [] }) })
        assert.equal((await srv.stored('ana')).tags, undefined)
    }
    finally { await srv.stop() }
})

test('user tags: a malformed one, or too many, is refused with the reason and nothing is stored', async () => {
    const srv = await startWritable()
    try {
        const bad = await fetch(`${srv.base}/user`, { method: 'POST', ...json({ id: 'bob', name: 'Bob', password: 'p', resources: 'cluster::::', tags: ['sre'] }) })
        assert.equal(bad.status, 400)
        assert.match((await bad.json()).error, /Invalid tag 'sre': the form is <extension>:<value>/)
        assert.ok(!(await (await fetch(`${srv.base}/user`, { headers: AUTH })).json()).includes('bob'), 'the refused user was not saved')

        await fetch(`${srv.base}/user`, { method: 'POST', ...json({ id: 'bob', name: 'Bob', password: 'p', resources: 'cluster::::', tags: ['agora:sre'] }) })
        const many = await fetch(`${srv.base}/user/bob`, { method: 'PUT', ...json({ id: 'bob', name: 'Bob', resources: 'cluster::::', tags: Array.from({ length: 33 }, (_, i) => `t:${i}`) }) })
        assert.equal(many.status, 400)
        assert.match((await many.json()).error, /At most 32 tags/)
        assert.deepEqual((await srv.stored('bob')).tags, ['agora:sre'], 'the refused edit changed nothing')
    }
    finally { await srv.stop() }
})

test('user tags: a user saved without the field has none (no migration needed)', async () => {
    const srv = await startWritable()
    try {
        await fetch(`${srv.base}/user`, { method: 'POST', ...json({ id: 'old', name: 'Old', password: 'p', resources: 'cluster::::' }) })
        assert.equal((await srv.stored('old')).tags, undefined)
    }
    finally { await srv.stop() }
})
