import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import http from 'http'
import type { AddressInfo } from 'net'
import { AuthApi, IAuthContext } from '../../src/api/AuthApi'
import { SignupApi } from '../../src/api/SignupApi'
import { IdpManager } from '../../src/tools/IdpManager'
import { SignupStore, SIGNUP_PENDING_CAP } from '../../src/tools/auth/SignupStore'
import { EIdpConnectorKind, IIdpConnector, IIdpIdentity, IIdpInstanceConfig, TIdpConnectorConstructor } from '@kwirthmagnify/kwirth-common-back'
import { ISecrets } from '../../src/tools/ISecrets'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { accessKeySerialize, ESignupStatus, ESsoResult, IIdpSignupPolicy, ISignupInfo, ISignupRequest, IUser } from '@kwirthmagnify/kwirth-common'

/*
    Signup end to end in the back end (plan: plans/signup, S2): the IdP callback, the two public endpoints
    the signup dialog talks to, and the admin's SignupApi. They are mounted as index.ts mounts them, over ONE
    in-memory store holding 'kwirth-users', 'kwirth-idps' and 'kwirth-signups', so approving really writes a
    user the next login reads.

    The acceptance criteria of the PRD (§9) are tagged AC1..AC7 where they are checked; AC6 (the password
    login refusing an IdP user) is S0's, in LoginApi.test.ts.
*/

const fakeControl: { identity: IIdpIdentity } = { identity: { email: 'carol@example.com', emailVerified: true, name: 'Carol C.' } }

class FakeConnector implements IIdpConnector {
    id = 'fake'
    label = 'Fake IdP'
    kind = EIdpConnectorKind.OIDC
    getConfigSchema() { return [] }
    buildAuthorizationUrl(_cfg: Record<string, unknown>, ctx: { redirectUri: string, state: string }): string {
        return `https://idp.test/auth?state=${encodeURIComponent(ctx.state)}`
    }
    async handleCallback(): Promise<IIdpIdentity> {
        return fakeControl.identity
    }
}

// one store for everything: kwirth-users is read/write as a whole map, the rest by key
const memSecrets = (users: Record<string, string>): ISecrets => {
    let usersMap = { ...users }
    const keys: Record<string, Record<string, unknown>> = {}
    return {
        read: async (name: string) => { if (name === 'kwirth-users') return usersMap; throw new Error('no such secret') },
        write: async (name: string, content: {}) => {
            // writeUsers stores base64url(id) as the key; readUsers re-indexes by the decoded value, so the
            // key is irrelevant here
            if (name === 'kwirth-users') usersMap = { ...(content as Record<string, string>) }
        },
        writeKey: async (name: string, key: string, value: unknown) => {
            keys[name] = keys[name] ?? {}
            if (value === null) delete keys[name][key]
            else keys[name][key] = JSON.parse(JSON.stringify(value))
        },
        readAllKeys: async (name: string) => ({ ...(keys[name] ?? {}) }),
        storeLimit: () => undefined
    }
}
const memConfigMaps = (): IConfigMaps => ({
    read: async (_n: string, def?: any) => def ?? [], write: (() => {}) as any, writeKey: async () => {}, readAllKeys: async () => ({})
})

const adminKey = { id: 'adminkey', type: 'permanent', resources: 'admin,cluster::::' }
const nonAdminKey = { id: 'userkey', type: 'permanent', resources: 'view:default:::' }
const ADMIN = { Authorization: 'Bearer ' + accessKeySerialize(adminKey as any), 'Content-Type': 'application/json' }
const NONADMIN = { Authorization: 'Bearer ' + accessKeySerialize(nonAdminKey as any) }

const encodeUser = (u: Partial<IUser>) => Buffer.from(JSON.stringify({ name: 'x', password: '', resources: '', accessKey: { id: '', type: 'volatile', resources: '' }, ...u })).toString('base64')

interface IServerOptions {
    signup?: IIdpSignupPolicy
    seed?: (secrets: ISecrets) => Promise<void>
    notifySignup?: IAuthContext['notifySignup']
}

async function startServer(options: IServerOptions = {}) {
    const secrets = memSecrets({ 'alice@example.com': encodeUser({ id: 'alice@example.com', idp: 'google' }) })
    const reg = new Map<string, TIdpConnectorConstructor>()
    const idpManager = new IdpManager(secrets, memConfigMaps(), reg)
    idpManager.registerConnector('fake', FakeConnector)
    const instance: IIdpInstanceConfig = { id: 'google', connectorId: 'fake', label: 'Login with Google', enabled: true, config: {}, signup: options.signup }
    await idpManager.saveInstance(instance)
    if (options.seed) await options.seed(secrets)

    const apiKeyApi: any = {
        apiKeys: [
            { accessKey: adminKey, description: 'admin', expire: Date.now() + 3600_000, days: 1 },
            { accessKey: nonAdminKey, description: 'user', expire: Date.now() + 3600_000, days: 1 }
        ],
        masterKey: 'x', isDesktop: true, refreshKeys: async () => {}
    }
    const ctx: IAuthContext = { secrets, configMaps: memConfigMaps(), apiKeyApi, notifySignup: options.notifySignup }
    const authApi = new AuthApi(() => idpManager, () => ctx, '', 'kwirth')
    const signupApi = new SignupApi(secrets, apiKeyApi, () => new Set(['', 'admin', 'cluster', 'view']))

    const app = express()
    app.use(express.json())
    app.use('/core/auth', authApi.router)
    app.use('/core/signups', signupApi.router)
    const server = app.listen(0)
    await new Promise<void>(r => server.once('listening', () => r()))
    const port = (server.address() as AddressInfo).port
    return {
        base: `http://127.0.0.1:${port}`, secrets, idpManager, instance,
        stop: () => new Promise<void>(r => server.close(() => r()))
    }
}

const getRaw = (base: string, path: string): Promise<{ status: number, location: string }> =>
    new Promise((resolve, reject) => {
        const u = new URL(base + path)
        http.get({ hostname: u.hostname, port: u.port, path: u.pathname + u.search }, res => {
            res.resume()
            resolve({ status: res.statusCode ?? 0, location: res.headers.location ?? '' })
        }).on('error', reject)
    })

// a whole IdP round trip for `email`: what the callback redirected to, as query params
const loginAs = async (base: string, email: string): Promise<URLSearchParams> => {
    fakeControl.identity = { email, emailVerified: true, name: 'Carol C.' }
    const start = await getRaw(base, '/core/auth/google/start')
    const state = new URL(start.location).searchParams.get('state') as string
    const cb = await getRaw(base, `/core/auth/google/callback?state=${state}&code=xyz`)
    assert.equal(cb.status, 302)
    return new URL(cb.location).searchParams
}

const postJson = (base: string, path: string, body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) =>
    fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) })

const OPEN: IIdpSignupPolicy = { enabled: true, allowedDomains: [] }

const pendingRequest = (id: string, idp = 'google'): ISignupRequest =>
    ({ id, idp, name: id, requestedAt: Date.now(), status: ESignupStatus.PENDING })

// ---- the callback ----

test('AC1: con el signup deshabilitado, un desconocido recibe notfound como siempre', async () => {
    for (const signup of [undefined, { enabled: false, allowedDomains: [] }]) {
        const srv = await startServer({ signup })
        try {
            const q = await loginAs(srv.base, 'carol@example.com')
            assert.equal(q.get('ssoerror'), ESsoResult.NOTFOUND)
            assert.equal(q.get('signup'), null)
        }
        finally { await srv.stop() }
    }
})

test('AC2: con el signup habilitado pero de otro dominio → notfound', async () => {
    const srv = await startServer({ signup: { enabled: true, allowedDomains: ['corp.example'] } })
    try {
        const q = await loginAs(srv.base, 'carol@example.com')
        assert.equal(q.get('ssoerror'), ESsoResult.NOTFOUND)
    }
    finally { await srv.stop() }
})

test('un usuario que ya existe sigue entrando: el signup no se mete por medio', async () => {
    const srv = await startServer({ signup: OPEN })
    try {
        const q = await loginAs(srv.base, 'alice@example.com')
        assert.ok(q.get('sso'))
        assert.equal(q.get('signup'), null)
    }
    finally { await srv.stop() }
})

test('habilitado y del dominio permitido → ?signup=<code>, y NO un sso', async () => {
    const srv = await startServer({ signup: { enabled: true, allowedDomains: ['EXAMPLE.com'] } })
    try {
        const q = await loginAs(srv.base, 'carol@example.com')
        assert.ok(q.get('signup'))
        assert.equal(q.get('sso'), null, 'no AccessKey for somebody who is not a user')
        assert.equal(q.get('ssoerror'), null)
    }
    finally { await srv.stop() }
})

// ---- the dialog's endpoints ----

test('signup/info da email, nombre y etiqueta del IdP, y NO gasta el codigo', async () => {
    const srv = await startServer({ signup: OPEN })
    try {
        const code = (await loginAs(srv.base, 'carol@example.com')).get('signup')
        for (let i = 0; i < 2; i++) {
            const res = await postJson(srv.base, '/core/auth/signup/info', { code })
            assert.equal(res.status, 200)
            const info = await res.json() as ISignupInfo
            assert.deepEqual(info, { id: 'carol@example.com', name: 'Carol C.', idp: 'google', idpLabel: 'Login with Google' })
        }
        assert.equal((await postJson(srv.base, '/core/auth/signup/info', { code: 'BOGUS' })).status, 404)
    }
    finally { await srv.stop() }
})

test('AC3: pedir acceso deja la peticion pendiente; el siguiente login dice pending y sigue sin AccessKey', async () => {
    const srv = await startServer({ signup: OPEN })
    try {
        const code = (await loginAs(srv.base, 'carol@example.com')).get('signup')
        const res = await postJson(srv.base, '/core/auth/signup', { code, name: '  Carol  ', comment: 'platform team' })
        assert.equal(res.status, 200)
        const stored = await SignupStore.get(srv.secrets, 'carol@example.com')
        assert.equal(stored?.status, ESignupStatus.PENDING)
        assert.equal(stored?.idp, 'google')
        assert.equal(stored?.name, 'Carol', 'trimmed')
        assert.equal(stored?.comment, 'platform team')

        const again = await loginAs(srv.base, 'carol@example.com')
        assert.equal(again.get('ssoerror'), ESsoResult.PENDING)
        assert.equal(again.get('sso'), null)
    }
    finally { await srv.stop() }
})

test('🔴 el email sale de la identidad verificada: uno en el body se ignora', async () => {
    const srv = await startServer({ signup: OPEN })
    try {
        const code = (await loginAs(srv.base, 'carol@example.com')).get('signup')
        const res = await postJson(srv.base, '/core/auth/signup', { code, name: 'Carol', id: 'ceo@example.com', email: 'ceo@example.com', idp: 'other' })
        assert.equal(res.status, 200)
        const all = await SignupStore.list(srv.secrets)
        assert.deepEqual(all.map(r => [r.id, r.idp]), [['carol@example.com', 'google']])
    }
    finally { await srv.stop() }
})

test('el codigo es de un solo uso, y uno inventado no vale', async () => {
    const srv = await startServer({ signup: OPEN })
    try {
        const code = (await loginAs(srv.base, 'carol@example.com')).get('signup')
        assert.equal((await postJson(srv.base, '/core/auth/signup', { code, name: 'Carol' })).status, 200)
        assert.equal((await postJson(srv.base, '/core/auth/signup', { code, name: 'Carol' })).status, 404)
        assert.equal((await postJson(srv.base, '/core/auth/signup', { code: 'BOGUS', name: 'Carol' })).status, 404)
    }
    finally { await srv.stop() }
})

test('nombre vacio o largo, o comentario largo → 400, y no se guarda nada', async () => {
    const srv = await startServer({ signup: OPEN })
    try {
        for (const body of [{ name: '   ' }, { name: 'x'.repeat(101) }, { name: 'Carol', comment: 'x'.repeat(501) }, {}]) {
            const code = (await loginAs(srv.base, 'carol@example.com')).get('signup')
            assert.equal((await postJson(srv.base, '/core/auth/signup', { code, ...body })).status, 400, JSON.stringify(body))
        }
        assert.deepEqual(await SignupStore.list(srv.secrets), [])
    }
    finally { await srv.stop() }
})

test('si el admin apaga el signup entre el callback y el envio → 409 notfound', async () => {
    const srv = await startServer({ signup: OPEN })
    try {
        const code = (await loginAs(srv.base, 'carol@example.com')).get('signup')
        await srv.idpManager.saveInstance({ ...srv.instance, signup: { enabled: false, allowedDomains: [] } })
        const res = await postJson(srv.base, '/core/auth/signup', { code, name: 'Carol' })
        assert.equal(res.status, 409)
        assert.equal((await res.json()).result, ESsoResult.NOTFOUND)
        assert.deepEqual(await SignupStore.list(srv.secrets), [])
    }
    finally { await srv.stop() }
})

// ---- the cap ----

test(`AC7: con ${SIGNUP_PENDING_CAP} pendientes en ese IdP → signuplimit; las de otro IdP no cuentan`, async () => {
    const seed = async (secrets: ISecrets) => {
        for (let i = 0; i < SIGNUP_PENDING_CAP; i++) await SignupStore.save(secrets, pendingRequest(`p${i}@example.com`))
    }
    const srv = await startServer({ signup: OPEN, seed })
    try {
        assert.equal((await loginAs(srv.base, 'carol@example.com')).get('ssoerror'), ESsoResult.SIGNUPLIMIT)
    }
    finally { await srv.stop() }

    const other = await startServer({ signup: OPEN, seed: async (secrets) => {
        for (let i = 0; i < SIGNUP_PENDING_CAP; i++) await SignupStore.save(secrets, pendingRequest(`p${i}@example.com`, 'gitlab'))
    } })
    try {
        assert.ok((await loginAs(other.base, 'carol@example.com')).get('signup'))
    }
    finally { await other.stop() }
})

test('🔴 dos envios a la vez por la ultima plaza: entra uno y el otro recibe signuplimit', async () => {
    const seed = async (secrets: ISecrets) => {
        for (let i = 0; i < SIGNUP_PENDING_CAP - 1; i++) await SignupStore.save(secrets, pendingRequest(`p${i}@example.com`))
    }
    const srv = await startServer({ signup: OPEN, seed })
    try {
        const c1 = (await loginAs(srv.base, 'carol@example.com')).get('signup')
        const c2 = (await loginAs(srv.base, 'dave@example.com')).get('signup')
        const [r1, r2] = await Promise.all([
            postJson(srv.base, '/core/auth/signup', { code: c1, name: 'Carol' }),
            postJson(srv.base, '/core/auth/signup', { code: c2, name: 'Dave' })
        ])
        assert.deepEqual([r1.status, r2.status].sort(), [200, 409])
        const refused = r1.status === 409 ? r1 : r2
        assert.equal((await refused.json()).result, ESsoResult.SIGNUPLIMIT)
        assert.equal(await SignupStore.countPending(srv.secrets, 'google'), SIGNUP_PENDING_CAP)
    }
    finally { await srv.stop() }
})

// ---- the admin's side ----

const requestAccess = async (base: string, email: string) => {
    const code = (await loginAs(base, email)).get('signup')
    assert.equal((await postJson(base, '/core/auth/signup', { code, name: 'Carol' })).status, 200)
}

test('SignupApi es solo para admin', async () => {
    const srv = await startServer({ signup: OPEN })
    try {
        assert.equal((await fetch(`${srv.base}/core/signups`)).status, 403)
        assert.equal((await fetch(`${srv.base}/core/signups`, { headers: NONADMIN })).status, 403)
        assert.equal((await fetch(`${srv.base}/core/signups`, { headers: ADMIN })).status, 200)
    }
    finally { await srv.stop() }
})

test('GET /core/signups lista las peticiones, la mas reciente primero', async () => {
    const srv = await startServer({ signup: OPEN, seed: async (secrets) => {
        await SignupStore.save(secrets, { ...pendingRequest('old@example.com'), requestedAt: 1000 })
        await SignupStore.save(secrets, { ...pendingRequest('new@example.com'), requestedAt: 2000 })
    } })
    try {
        const all = await (await fetch(`${srv.base}/core/signups`, { headers: ADMIN })).json() as ISignupRequest[]
        assert.deepEqual(all.map(r => r.id), ['new@example.com', 'old@example.com'])
    }
    finally { await srv.stop() }
})

test('AC4: aprobar con unos recursos → el siguiente login entra con EXACTAMENTE esos, y la peticion desaparece', async () => {
    const srv = await startServer({ signup: OPEN })
    try {
        await requestAccess(srv.base, 'carol@example.com')
        const id = encodeURIComponent('carol@example.com')
        const res = await postJson(srv.base, `/core/signups/${id}/approve`, { resources: 'view:default:::', enabledChannels: ['log'] }, ADMIN)
        assert.equal(res.status, 200)
        assert.equal(await SignupStore.get(srv.secrets, 'carol@example.com'), undefined)

        const q = await loginAs(srv.base, 'carol@example.com')
        const sso = q.get('sso')
        assert.ok(sso, 'the approved user logs in')
        const login = await (await postJson(srv.base, '/core/auth/exchange', { code: sso })).json()
        assert.equal(login.id, 'carol@example.com')
        assert.equal(login.name, 'Carol')
        assert.equal(login.accessKey.resources, 'view:default:::')
        assert.deepEqual(login.enabledChannels, ['log'])
    }
    finally { await srv.stop() }
})

test('aprobar exige resources y rechaza scopes desconocidos (400); una peticion que no existe → 404', async () => {
    const srv = await startServer({ signup: OPEN })
    try {
        await requestAccess(srv.base, 'carol@example.com')
        const id = encodeURIComponent('carol@example.com')
        assert.equal((await postJson(srv.base, `/core/signups/${id}/approve`, {}, ADMIN)).status, 400)
        assert.equal((await postJson(srv.base, `/core/signups/${id}/approve`, { resources: 'nosuchscope::::' }, ADMIN)).status, 400)
        assert.equal((await postJson(srv.base, `/core/signups/nobody%40example.com/approve`, { resources: '' }, ADMIN)).status, 404)
        assert.ok(await SignupStore.get(srv.secrets, 'carol@example.com'), 'a refused approval leaves the request')
    }
    finally { await srv.stop() }
})

test('aprobar a alguien que ya es usuario → 409, y no se toca el usuario', async () => {
    const srv = await startServer({ signup: OPEN, seed: async (secrets) => {
        await SignupStore.save(secrets, pendingRequest('alice@example.com', 'gitlab'))
    } })
    try {
        const res = await postJson(srv.base, `/core/signups/${encodeURIComponent('alice@example.com')}/approve`, { resources: 'admin::::' }, ADMIN)
        assert.equal(res.status, 409)
        const q = await loginAs(srv.base, 'alice@example.com')
        const login = await (await postJson(srv.base, '/core/auth/exchange', { code: q.get('sso') })).json()
        assert.equal(login.accessKey.resources, '', 'still the resources she had, not the ones in the approval')
    }
    finally { await srv.stop() }
})

test('AC5: rechazar → el login dice rejected; borrarla → puede volver a pedir', async () => {
    const srv = await startServer({ signup: OPEN })
    try {
        await requestAccess(srv.base, 'carol@example.com')
        const id = encodeURIComponent('carol@example.com')
        assert.equal((await postJson(srv.base, `/core/signups/${id}/reject`, {}, ADMIN)).status, 200)
        assert.equal((await loginAs(srv.base, 'carol@example.com')).get('ssoerror'), ESsoResult.REJECTED)

        assert.equal((await fetch(`${srv.base}/core/signups/${id}`, { method: 'DELETE', headers: ADMIN })).status, 200)
        assert.ok((await loginAs(srv.base, 'carol@example.com')).get('signup'), 'deleted: they may ask again')
        assert.equal((await fetch(`${srv.base}/core/signups/${id}`, { method: 'DELETE', headers: ADMIN })).status, 404)
    }
    finally { await srv.stop() }
})

test('una peticion rechazada no se puede reenviar con un codigo viejo', async () => {
    const srv = await startServer({ signup: OPEN })
    try {
        // a code handed out BEFORE the rejection, submitted after it
        const code = (await loginAs(srv.base, 'carol@example.com')).get('signup')
        await SignupStore.save(srv.secrets, { ...pendingRequest('carol@example.com'), status: ESignupStatus.REJECTED })
        const res = await postJson(srv.base, '/core/auth/signup', { code, name: 'Carol' })
        assert.equal(res.status, 409)
        assert.equal((await res.json()).result, ESsoResult.REJECTED)
    }
    finally { await srv.stop() }
})

// ---- the notice by sender (S4) ----

test('S4: una peticion guardada se avisa UNA vez, con la peticion y la etiqueta del IdP', async () => {
    const calls: { id: string, idpLabel: string }[] = []
    const srv = await startServer({ signup: OPEN, notifySignup: async (request, idpLabel) => { calls.push({ id: request.id, idpLabel }) } })
    try {
        await requestAccess(srv.base, 'carol@example.com')
        await new Promise(r => setTimeout(r, 50))   // it is fired after answering, without waiting
        assert.deepEqual(calls, [{ id: 'carol@example.com', idpLabel: 'Login with Google' }])
    }
    finally { await srv.stop() }
})

test('S4: lo que no llega a guardarse no se avisa (rechazo por tope, codigo gastado)', async () => {
    const calls: string[] = []
    const seed = async (secrets: ISecrets) => {
        for (let i = 0; i < SIGNUP_PENDING_CAP - 1; i++) await SignupStore.save(secrets, pendingRequest(`p${i}@example.com`))
    }
    const srv = await startServer({ signup: OPEN, seed, notifySignup: async (request) => { calls.push(request.id) } })
    try {
        const c1 = (await loginAs(srv.base, 'carol@example.com')).get('signup')
        const c2 = (await loginAs(srv.base, 'dave@example.com')).get('signup')
        assert.equal((await postJson(srv.base, '/core/auth/signup', { code: c1, name: 'Carol' })).status, 200)
        assert.equal((await postJson(srv.base, '/core/auth/signup', { code: c2, name: 'Dave' })).status, 409)
        assert.equal((await postJson(srv.base, '/core/auth/signup', { code: c1, name: 'Carol' })).status, 404)
        await new Promise(r => setTimeout(r, 50))
        assert.deepEqual(calls, ['carol@example.com'])
    }
    finally { await srv.stop() }
})

test('🔴 S4: si el aviso falla, la peticion queda hecha y el proceso sigue en pie', async () => {
    const srv = await startServer({ signup: OPEN, notifySignup: async () => { throw new Error('webhook down') } })
    const escaped: unknown[] = []
    const onReject = (reason: unknown) => escaped.push(reason)
    process.on('unhandledRejection', onReject)
    try {
        await requestAccess(srv.base, 'carol@example.com')
        await new Promise(r => setTimeout(r, 50))
        assert.equal((await SignupStore.get(srv.secrets, 'carol@example.com'))?.status, ESignupStatus.PENDING)
        assert.deepEqual(escaped, [], 'a failed notice must not escape as an unhandledRejection (fatal here)')
    }
    finally { process.off('unhandledRejection', onReject); await srv.stop() }
})
