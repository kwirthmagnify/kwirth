import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import http from 'http'
import type { AddressInfo } from 'net'
import { AuthApi, IAuthContext } from '../../src/api/AuthApi'
import { IdpManager } from '../../src/tools/IdpManager'
import { EIdpConnectorKind, IIdpConnector, IIdpIdentity, TIdpConnectorConstructor } from '@kwirthmagnify/kwirth-common-back'
import { ISecrets } from '../../src/tools/ISecrets'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { IUser } from '@kwirthmagnify/kwirth-common'

// identidad que devuelve el conector fake; los tests la ajustan antes de cada callback
const fakeControl: { identity: IIdpIdentity } = { identity: { email: 'alice@example.com', emailVerified: true } }

class FakeConnector implements IIdpConnector {
    connectorId = 'fake'
    label = 'Fake IdP'
    kind = EIdpConnectorKind.OIDC
    getConfigSchema() { return [] }
    buildAuthorizationUrl(_cfg: Record<string, unknown>, ctx: { redirectUri: string, state: string, codeChallenge: string }): string {
        return `https://idp.test/auth?state=${encodeURIComponent(ctx.state)}&redirect_uri=${encodeURIComponent(ctx.redirectUri)}&cc=${encodeURIComponent(ctx.codeChallenge)}`
    }
    async handleCallback(): Promise<IIdpIdentity> { return fakeControl.identity }
}

const encodeUser = (u: IUser) => Buffer.from(JSON.stringify(u)).toString('base64')
const makeUser = (over: Partial<IUser>): IUser => ({
    id: 'alice@example.com', name: 'Alice', password: '',
    accessKey: { id: '', type: 'volatile', resources: '' } as any, resources: 'view:default:::', ...over
})

// un unico ISecrets que guarda kwirth-users (seed) y kwirth-idps (lo gestiona IdpManager)
const memSecrets = (usersMap: any): ISecrets => {
    const keys: Record<string, Record<string, any>> = {}
    return {
        read: async (name: string) => { if (name === 'kwirth-users') return usersMap; throw new Error('no such secret') },
        write: async () => {},
        writeKey: async (name: string, key: string, value: any) => { (keys[name] ||= {}); if (value === null) delete keys[name][key]; else keys[name][key] = value },
        readAllKeys: async (name: string) => keys[name] ?? {}
    }
}
const memConfigMaps = (): IConfigMaps => ({
    read: async (_n: string, def?: any) => def ?? [], write: (() => {}) as any, writeKey: async () => {}, readAllKeys: async () => ({})
})

// GET crudo con node:http para leer el 302 sin seguir el redirect (evita salir a idp.test)
const getRaw = (base: string, path: string): Promise<{ status: number, location: string }> =>
    new Promise((resolve, reject) => {
        const u = new URL(base + path)
        http.get({ hostname: u.hostname, port: u.port, path: u.pathname + u.search }, res => {
            res.resume()
            resolve({ status: res.statusCode ?? 0, location: res.headers.location ?? '' })
        }).on('error', reject)
    })

async function startServer() {
    const users = { 'alice@example.com': encodeUser(makeUser({ id: 'alice@example.com', idp: 'google' })),
                    'bob@example.com': encodeUser(makeUser({ id: 'bob@example.com', idp: 'keycloak' })) }
    const secrets = memSecrets(users)
    const reg = new Map<string, TIdpConnectorConstructor>()
    const idpManager = new IdpManager(secrets, memConfigMaps(), reg)
    idpManager.registerConnector('fake', FakeConnector)
    await idpManager.saveInstance({ id: 'google', connectorId: 'fake', label: 'Login with Google', enabled: true, config: {} })

    const ctx: IAuthContext = { secrets, configMaps: memConfigMaps(), apiKeyApi: { apiKeys: [] } as any }
    const authApi = new AuthApi(() => idpManager, () => ctx, '', 'kwirth')

    const app = express()
    app.use(express.json())
    app.use('/core/auth', authApi.router)
    const server = app.listen(0)
    await new Promise<void>(r => server.once('listening', () => r()))
    const port = (server.address() as AddressInfo).port
    return { base: `http://127.0.0.1:${port}`, stop: () => new Promise<void>(r => server.close(() => r())) }
}

const startFlow = async (base: string) => {
    const r = await getRaw(base, '/core/auth/google/start')
    assert.equal(r.status, 302)
    return new URL(r.location).searchParams.get('state') as string
}

test('GET /method devuelve kwirth + IdPs habilitados', async () => {
    const srv = await startServer()
    try {
        const res = await fetch(`${srv.base}/core/auth/method`)
        const body = await res.json()
        const ids = body.methods.map((m: any) => m.id)
        assert.ok(ids.includes('kwirth'))
        assert.ok(ids.includes('google'))
        const google = body.methods.find((m: any) => m.id === 'google')
        assert.equal(google.kind, 'redirect')
        assert.equal(google.startUrl, '/core/auth/google/start')
    }
    finally { await srv.stop() }
})

test('flujo feliz: start → callback → exchange emite AccessKey', async () => {
    const srv = await startServer()
    try {
        fakeControl.identity = { email: 'alice@example.com', emailVerified: true }
        const state = await startFlow(srv.base)
        const cb = await getRaw(srv.base, `/core/auth/google/callback?state=${state}&code=xyz`)
        assert.equal(cb.status, 302)
        const ssoCode = new URL(cb.location).searchParams.get('sso')
        assert.ok(ssoCode, 'debe redirigir con ?sso=<code>')
        const ex = await fetch(`${srv.base}/core/auth/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: ssoCode }) })
        assert.equal(ex.status, 200)
        const body = await ex.json()
        assert.equal(body.id, 'alice@example.com')
        assert.equal(body.accessKey.type, 'permanent')
        assert.equal(body.accessKey.resources, 'view:default:::')
    }
    finally { await srv.stop() }
})

test('exchange con codigo ya usado devuelve 404 (single-use)', async () => {
    const srv = await startServer()
    try {
        fakeControl.identity = { email: 'alice@example.com', emailVerified: true }
        const state = await startFlow(srv.base)
        const cb = await getRaw(srv.base, `/core/auth/google/callback?state=${state}&code=xyz`)
        const ssoCode = new URL(cb.location).searchParams.get('sso')
        await fetch(`${srv.base}/core/auth/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: ssoCode }) })
        const again = await fetch(`${srv.base}/core/auth/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: ssoCode }) })
        assert.equal(again.status, 404)
    }
    finally { await srv.stop() }
})

test('callback con email no verificado → ssoerror=unverified', async () => {
    const srv = await startServer()
    try {
        fakeControl.identity = { email: 'alice@example.com', emailVerified: false }
        const state = await startFlow(srv.base)
        const cb = await getRaw(srv.base, `/core/auth/google/callback?state=${state}&code=xyz`)
        assert.equal(new URL(cb.location).searchParams.get('ssoerror'), 'unverified')
    }
    finally { await srv.stop() }
})

test('callback con usuario fuera de la lista blanca → ssoerror=notfound', async () => {
    const srv = await startServer()
    try {
        fakeControl.identity = { email: 'nobody@example.com', emailVerified: true }
        const state = await startFlow(srv.base)
        const cb = await getRaw(srv.base, `/core/auth/google/callback?state=${state}&code=xyz`)
        assert.equal(new URL(cb.location).searchParams.get('ssoerror'), 'notfound')
    }
    finally { await srv.stop() }
})

test('callback con IdP distinto al asignado → ssoerror=idpmismatch', async () => {
    const srv = await startServer()
    try {
        // bob esta atado a 'keycloak' pero entra por 'google'
        fakeControl.identity = { email: 'bob@example.com', emailVerified: true }
        const state = await startFlow(srv.base)
        const cb = await getRaw(srv.base, `/core/auth/google/callback?state=${state}&code=xyz`)
        assert.equal(new URL(cb.location).searchParams.get('ssoerror'), 'idpmismatch')
    }
    finally { await srv.stop() }
})

test('callback con state invalido → ssoerror=state', async () => {
    const srv = await startServer()
    try {
        const cb = await getRaw(srv.base, `/core/auth/google/callback?state=BOGUS&code=xyz`)
        assert.equal(new URL(cb.location).searchParams.get('ssoerror'), 'state')
    }
    finally { await srv.stop() }
})

const startWithReturn = async (base: string, returnTo: string) => {
    const r = await getRaw(base, `/core/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`)
    assert.equal(r.status, 302)
    return new URL(r.location).searchParams.get('state') as string
}

test('handoff respeta returnTo de localhost (dev: front en otro origen)', async () => {
    const srv = await startServer()
    try {
        fakeControl.identity = { email: 'alice@example.com', emailVerified: true }
        const state = await startWithReturn(srv.base, 'http://localhost:3000/')
        const cb = await getRaw(srv.base, `/core/auth/google/callback?state=${state}&code=xyz`)
        assert.equal(cb.status, 302)
        assert.ok(cb.location.startsWith('http://localhost:3000/?sso='), `debe volver al front dev; fue ${cb.location}`)
    }
    finally { await srv.stop() }
})

test('handoff ignora un returnTo no confiable (anti open-redirect) y usa el fallback del back', async () => {
    const srv = await startServer()
    try {
        fakeControl.identity = { email: 'alice@example.com', emailVerified: true }
        const state = await startWithReturn(srv.base, 'http://evil.example.com/')
        const cb = await getRaw(srv.base, `/core/auth/google/callback?state=${state}&code=xyz`)
        assert.equal(cb.status, 302)
        assert.ok(!cb.location.includes('evil.example.com'), 'no debe redirigir a un origen no confiable')
        assert.ok(cb.location.includes('/front?sso='), `debe usar el fallback del back; fue ${cb.location}`)
    }
    finally { await srv.stop() }
})
