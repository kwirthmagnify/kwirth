import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import express from 'express'
import type { AddressInfo } from 'net'
import { LoginApi } from '../../src/api/LoginApi'
import { IUser } from '@kwirthmagnify/kwirth-common'
import { ISecrets } from '../../src/tools/ISecrets'
import { IConfigMaps } from '../../src/tools/IConfigMap'

// ---- helpers ----
/*
    How a password is STORED: bcrypt over the sha256 the front end sends, never the clear text and never
    the plain value. The login used to accept a plain stored password and re-hash it on the way through;
    that branch is gone, so a user built with a clear-text password now simply cannot log in — which is
    what the last test here pins down.

    Cost 4 instead of the product's 10: these are unit tests and bcrypt is deliberately slow.
*/
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')
const storedPassword = (plain: string) => bcrypt.hashSync(sha256(plain), 4)

const makeUser = (over: Partial<IUser> = {}): IUser => ({
    id: 'alice@example.com',
    name: 'Alice',
    password: storedPassword('secret'),
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

// brings up an ephemeral express with LoginApi's router mounted at /login
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

// The FRONT END sends the password already as sha256(hex), and verifyPassword compares that against the
// stored bcrypt. The tests have to mimic the front end. (sha256 is defined with the helpers above.)

// ---- login ----
test('POST /login con credenciales validas devuelve 200 y accessKey', async () => {
    const srv = await startServer(encodeUsers([makeUser()]))
    try {
        const res = await post(srv.base, '/login', { user: 'alice@example.com', password: sha256('secret') })
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
    const srv = await startServer(encodeUsers([makeUser({ id: 'admin', name: 'admin', password: storedPassword('password') })]))
    try {
        const res = await post(srv.base, '/login', { user: 'admin', password: sha256('password') })
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
        const res = await post(srv.base, '/login/password', { user: 'alice@example.com', password: sha256('secret'), newpassword: sha256('nuevo') })
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

// ---- the process does not fall over because of a rejected promise ----
//
// The handlers fire their work with `LoginApi.semaphore.use(async () => {...})` without awaiting it, so
// express never sees an exception from inside: it comes out as an 'unhandledRejection', and this process
// treats that as fatal. A POST with no password against a user already migrated to bcrypt did exactly
// that — bcrypt.compare demands two strings and throws 'Illegal arguments: undefined, string' — and
// brought the core down without authenticating. Starting with $2b$ is enough to enter the bcrypt branch:
// compare validates its arguments before looking at the hash.
const BCRYPT_USER = () => makeUser({ password: '$2b$10$noesunhashrealperoentraenlarama' })

// Watches that no unhandledRejection escapes while fn runs.
const withoutUnhandledRejections = async (fn: () => Promise<void>): Promise<unknown[]> => {
    const escaped: unknown[] = []
    const onReject = (reason: unknown) => escaped.push(reason)
    process.on('unhandledRejection', onReject)
    try {
        await fn()
        // rejections arrive on a later tick: they have to be given room before looking
        await new Promise(r => setTimeout(r, 50))
    }
    finally {
        process.off('unhandledRejection', onReject)
    }
    return escaped
}

test('POST /login sin password no escapa como unhandledRejection y el servidor sigue vivo', async () => {
    const srv = await startServer(encodeUsers([BCRYPT_USER()]))
    try {
        let status = 0
        const escaped = await withoutUnhandledRejections(async () => {
            status = (await post(srv.base, '/login', { user: 'alice@example.com' })).status
        })
        assert.deepEqual(escaped, [], 'el fallo tiene que quedarse dentro del handler')
        assert.equal(status, 500, 'responde en vez de dejar la peticion colgada')

        // and what really matters: the server is still serving
        const after = await post(srv.base, '/login', { user: 'nadie@example.com', password: 'x' })
        assert.equal(after.status, 401)
    }
    finally { await srv.stop() }
})

test('POST /login con password null tampoco tumba nada', async () => {
    const srv = await startServer(encodeUsers([BCRYPT_USER()]))
    try {
        const escaped = await withoutUnhandledRejections(async () => {
            await post(srv.base, '/login', { user: 'alice@example.com', password: null })
        })
        assert.deepEqual(escaped, [])
    }
    finally { await srv.stop() }
})

// The password change had a catch that logged the error and left WITHOUT answering: the request hung
// forever and, by resolving the promise normally, it did not let the guard act either. It hurts
// especially here, because it is the first-startup endpoint (admin with the default password): the user
// was left with the spinner going round with no idea what had happened.
test('POST /login/password sin password RESPONDE en vez de dejar la peticion colgada', async () => {
    const srv = await startServer(encodeUsers([BCRYPT_USER()]))
    try {
        let status = 0
        const escaped = await withoutUnhandledRejections(async () => {
            status = (await post(srv.base, '/login/password', { user: 'alice@example.com', newpassword: sha256('nuevo') })).status
        })
        assert.equal(status, 500, 'tiene que contestar algo, no dejar al cliente esperando')
        assert.deepEqual(escaped, [], 'y el fallo no puede salir del proceso')

        // the server carries on serving everybody else
        const after = await post(srv.base, '/login', { user: 'nadie@example.com', password: 'x' })
        assert.equal(after.status, 401)
    }
    finally { await srv.stop() }
})

test('POST /login/password sin newpassword tambien responde', async () => {
    // it passes verification and blows up afterwards, in the bcrypt.hash of the missing newpassword
    const srv = await startServer(encodeUsers([makeUser()]))
    try {
        const res = await post(srv.base, '/login/password', { user: 'alice@example.com', password: sha256('secret') })
        assert.equal(res.status, 500)
    }
    finally { await srv.stop() }
})

test('un registro de usuario corrupto se descarta arriba y da 401, no cuelga', async () => {
    // readUsers already filters out what does not decode, so the handler's JSON.parse(atob(...)) never
    // sees garbage: the user simply does not exist. It is checked so it is clear where the defence lies.
    const srv = await startServer({ 'alice@example.com': 'esto-no-es-base64-de-un-json' })
    try {
        const res = await post(srv.base, '/login/password', { user: 'alice@example.com', password: sha256('secret'), newpassword: sha256('nuevo') })
        assert.equal(res.status, 401)
    }
    finally { await srv.stop() }
})

/*
    🔴 A stored password in clear text is refused, full stop.

    The login used to have a second path for it: compare sha256(stored) and re-hash on the way out, to
    migrate installations written before hashing. A code path that accepts an unhashed stored password
    is a code path that makes storing one work, so it is gone — and everything that seeds a user writes
    bcrypt now: the core's bootstrap admin, the Helm chart, and UserApi.

    This is a deliberate break for installations still holding one. They log in nowhere until the users
    Secret is deleted and the admin seeded again.
*/
test('POST /login con la password guardada EN CLARO devuelve 401, no la migra', async () => {
    const srv = await startServer(encodeUsers([makeUser({ password: 'secret' })]))
    try {
        // exactly what used to work: the front end's sha256 against a plain stored value
        const res = await post(srv.base, '/login', { user: 'alice@example.com', password: sha256('secret') })
        assert.equal(res.status, 401)
    }
    finally { await srv.stop() }
})

test('se aceptan los tres prefijos de bcrypt, no solo $2b$', async () => {
    // Helm's htpasswd emits $2a$, and bcryptjs verifies $2a$, $2b$ and $2y$ alike: insisting on one
    // would reject hashes made by perfectly ordinary tools
    const hash2a = bcrypt.hashSync(sha256('secret'), 4).replace(/^\$2[aby]\$/, '$2a$')
    const srv = await startServer(encodeUsers([makeUser({ password: hash2a })]))
    try {
        const res = await post(srv.base, '/login', { user: 'alice@example.com', password: sha256('secret') })
        assert.equal(res.status, 200)
    }
    finally { await srv.stop() }
})
