import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'crypto'
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

// El FRONT envía la contraseña ya como sha256(hex); el verifyPassword del back compara contra eso
// (sha256(stored) === incoming para el valor plano heredado). Los tests deben mimetizar al front.
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

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
    const srv = await startServer(encodeUsers([makeUser({ id: 'admin', name: 'admin', password: 'password' })]))
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

// ---- el proceso no se cae por una promesa rechazada ----
//
// Los handlers lanzan su trabajo con `LoginApi.semaphore.use(async () => {...})` sin esperarlo, asi que
// una excepcion de dentro no la ve express: sale como 'unhandledRejection', y este proceso lo trata como
// fatal. Un POST sin password contra un usuario ya migrado a bcrypt hacia justo eso — bcrypt.compare
// exige dos strings y lanza 'Illegal arguments: undefined, string' — y tumbaba el core sin autenticar.
// El basta con que empiece por $2b$ para entrar en la rama de bcrypt: compare valida sus argumentos antes
// de mirar el hash.
const BCRYPT_USER = () => makeUser({ password: '$2b$10$noesunhashrealperoentraenlarama' })

// Vigila que no escape ningun unhandledRejection mientras corre fn.
const withoutUnhandledRejections = async (fn: () => Promise<void>): Promise<unknown[]> => {
    const escaped: unknown[] = []
    const onReject = (reason: unknown) => escaped.push(reason)
    process.on('unhandledRejection', onReject)
    try {
        await fn()
        // las rejections llegan en un tick posterior: hay que darles sitio antes de mirar
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

        // y lo que de verdad importa: el servidor sigue atendiendo
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

// OJO — HALLAZGO, no lo arregla este test: '/login/password' NO se cuelga el proceso, pero deja la
// peticion COLGADA para siempre. Su catch (LoginApi.ts) registra el error y no responde, asi que el
// cliente espera indefinidamente. Es un bug distinto del crash y tocarlo seria cambiar logica, asi que
// aqui solo se comprueba lo que el guard garantiza: que nada escapa del proceso y que el servidor sigue
// sirviendo. El test aborta la peticion por su cuenta en vez de esperarla.
test('POST /login/password sin password no escapa del proceso (aunque la peticion quede colgada)', async () => {
    const srv = await startServer(encodeUsers([BCRYPT_USER()]))
    try {
        const escaped = await withoutUnhandledRejections(async () => {
            const ctrl = new AbortController()
            const timer = setTimeout(() => ctrl.abort(), 300)
            await fetch(srv.base + '/login/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: 'alice@example.com', newpassword: sha256('nuevo') }),
                signal: ctrl.signal
            }).catch(() => { /* se espera el abort: hoy no llega respuesta */ })
            clearTimeout(timer)
        })
        assert.deepEqual(escaped, [], 'el fallo no puede salir del proceso')

        // el servidor sigue atendiendo al resto
        const after = await post(srv.base, '/login', { user: 'nadie@example.com', password: 'x' })
        assert.equal(after.status, 401)
    }
    finally { await srv.stop() }
})
