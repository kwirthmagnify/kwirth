import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import type { AddressInfo } from 'net'
import { IdpApi } from '../../src/api/IdpApi'
import { IdpManager } from '../../src/tools/IdpManager'
import { EIdpConnectorKind, IIdpConnector, IIdpConfigFieldDef, TIdpConnectorConstructor } from '@kwirthmagnify/kwirth-common-back'
import { ISecrets } from '../../src/tools/ISecrets'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { accessKeySerialize } from '@kwirthmagnify/kwirth-common'

class FakeConnector implements IIdpConnector {
    id = 'fake'
    label = 'Fake IdP'
    kind = EIdpConnectorKind.OIDC
    getConfigSchema(): IIdpConfigFieldDef[] {
        return [
            { name: 'clientId', label: 'Client ID', type: 'text' },
            { name: 'clientSecret', label: 'Secret', type: 'password' }
        ]
    }
    buildAuthorizationUrl(): string { return 'https://idp.test/auth' }
    async handleCallback() { return { email: 'x@example.com', emailVerified: true } }
}

const memSecrets = (): ISecrets => {
    const keys: Record<string, Record<string, any>> = {}
    return {
        read: async () => { throw new Error('no') },
        write: async () => {},
        writeKey: async (name: string, key: string, value: any) => { (keys[name] ||= {}); if (value === null) delete keys[name][key]; else keys[name][key] = value },
        readAllKeys: async (name: string) => keys[name] ?? {}
    }
}

// a minimal apiKeyApi with one valid permanent key (for validKey)
const validAccessKey = { id: 'testkey', type: 'permanent', resources: 'admin::::' }
const nonAdminKey = { id: 'nonadmin', type: 'permanent', resources: 'view:default:::' }
const fakeApiKeyApi = (): any => ({
    apiKeys: [
        { accessKey: validAccessKey, description: 'admin', expire: Date.now() + 3600_000, days: 1 },
        { accessKey: nonAdminKey, description: 'nonadmin', expire: Date.now() + 3600_000, days: 1 }
    ],
    masterKey: 'x', isDesktop: true, refreshKeys: async () => {}
})
const AUTH = { Authorization: 'Bearer ' + accessKeySerialize(validAccessKey as any) }
const NONADMIN_AUTH = { Authorization: 'Bearer ' + accessKeySerialize(nonAdminKey as any) }

async function startServer() {
    const reg = new Map<string, TIdpConnectorConstructor>()
    const memConfigMaps: IConfigMaps = { read: async (_n, def?) => def, write: (() => {}) as any, writeKey: async () => {}, readAllKeys: async () => ({}) }
    const idpManager = new IdpManager(memSecrets(), memConfigMaps, reg)
    idpManager.registerConnector('fake', FakeConnector)
    const idpApi = new IdpApi(idpManager, fakeApiKeyApi())
    const app = express()
    app.use(express.json())
    app.use('/core/idps', idpApi.router)
    const server = app.listen(0)
    await new Promise<void>(r => server.once('listening', () => r()))
    const port = (server.address() as AddressInfo).port
    return { base: `http://127.0.0.1:${port}`, stop: () => new Promise<void>(r => server.close(() => r())) }
}

const j = (extra: any = {}) => ({ headers: { 'Content-Type': 'application/json', ...AUTH }, ...extra })

test('sin key → 403', async () => {
    const srv = await startServer()
    try {
        const res = await fetch(`${srv.base}/core/idps`)
        assert.equal(res.status, 403)
    }
    finally { await srv.stop() }
})

test('key válida SIN scope admin → 403', async () => {
    const srv = await startServer()
    try {
        const res = await fetch(`${srv.base}/core/idps`, { headers: NONADMIN_AUTH })
        assert.equal(res.status, 403)
    }
    finally { await srv.stop() }
})

test('GET /connectors lista tipos con schema', async () => {
    const srv = await startServer()
    try {
        const res = await fetch(`${srv.base}/core/idps`, j())
        assert.equal(res.status, 200)
        const list = await res.json()
        assert.equal(list[0].id, 'fake')
        assert.ok(list[0].schema.some((f: any) => f.type === 'password'))
    }
    finally { await srv.stop() }
})

test('POST crea instancia y GET la devuelve con el secreto ENMASCARADO', async () => {
    const srv = await startServer()
    try {
        const inst = { id: 'google', connectorId: 'fake', label: 'Google', enabled: true, config: { clientId: 'cid', clientSecret: 'supersecret' } }
        const post = await fetch(`${srv.base}/core/idps/instances`, j({ method: 'POST', body: JSON.stringify(inst) }))
        assert.equal(post.status, 200)

        const get = await fetch(`${srv.base}/core/idps/instances/google`, j())
        const body = await get.json()
        assert.equal(body.config.clientId, 'cid')
        assert.equal(body.config.clientSecret, '********', 'el secreto no debe exponerse')
    }
    finally { await srv.stop() }
})

test('PUT con secreto enmascarado CONSERVA el valor almacenado', async () => {
    const srv = await startServer()
    try {
        const inst = { id: 'google', connectorId: 'fake', label: 'Google', enabled: true, config: { clientId: 'cid', clientSecret: 'supersecret' } }
        await fetch(`${srv.base}/core/idps/instances`, j({ method: 'POST', body: JSON.stringify(inst) }))

        // the front end sends the masked secret back (it does not know it) when changing the label
        const upd = { ...inst, label: 'Google Nuevo', config: { clientId: 'cid', clientSecret: '********' } }
        await fetch(`${srv.base}/core/idps/instances/google`, j({ method: 'PUT', body: JSON.stringify(upd) }))

        // the export (unmasked) confirms the original secret is still there
        const exp = await (await fetch(`${srv.base}/core/idps/export`, j())).json()
        assert.equal(exp.google.label, 'Google Nuevo')
        assert.equal(exp.google.config.clientSecret, 'supersecret')
    }
    finally { await srv.stop() }
})

test('DELETE elimina la instancia', async () => {
    const srv = await startServer()
    try {
        const inst = { id: 'google', connectorId: 'fake', label: 'Google', enabled: true, config: {} }
        await fetch(`${srv.base}/core/idps/instances`, j({ method: 'POST', body: JSON.stringify(inst) }))
        await fetch(`${srv.base}/core/idps/instances/google`, j({ method: 'DELETE' }))
        const get = await fetch(`${srv.base}/core/idps/instances/google`, j())
        assert.equal(get.status, 404)
    }
    finally { await srv.stop() }
})

/*
    ── un conector ROTO no debe filtrar secretos ni matar el proceso ─────────────────────────────────

    Masking asks the connector which of its fields are passwords. A connector built against a newer
    common-back throws when asked, and the schema cannot be read at all — which used to end two ways,
    both bad: the throw escaped an async route and took the core down, and once that was fixed the
    `?? []` turned 'unknown' into 'no password fields' and the client secret went out in the clear.
*/
class BrokenSchemaConnector implements IIdpConnector {
    id = 'broken'
    label = 'Broken'
    kind = EIdpConnectorKind.OIDC
    getConfigSchema(): IIdpConfigFieldDef[] { throw new TypeError('idpRedirectUriField is not a function') }
    buildAuthorizationUrl(): string { return '' }
    async handleCallback() { return { email: '', emailVerified: false } }
}

async function startServerBroken() {
    const reg = new Map<string, TIdpConnectorConstructor>()
    const memConfigMaps: IConfigMaps = { read: async (_n, def?) => def, write: (() => {}) as any, writeKey: async () => {}, readAllKeys: async () => ({}) }
    const idpManager = new IdpManager(memSecrets(), memConfigMaps, reg)
    idpManager.registerConnector('broken', BrokenSchemaConnector as unknown as TIdpConnectorConstructor)
    const idpApi = new IdpApi(idpManager, fakeApiKeyApi())
    const app = express()
    app.use(express.json())
    app.use('/core/idps', idpApi.router)
    const server = app.listen(0)
    await new Promise<void>(r => server.once('listening', () => r()))
    const port = (server.address() as AddressInfo).port
    return { base: `http://127.0.0.1:${port}`, stop: () => new Promise<void>(r => server.close(() => r())) }
}

test('🔴 con un conector roto el GET responde, no tumba el proceso', async () => {
    const srv = await startServerBroken()
    try {
        const inst = { id: 'ent', connectorId: 'broken', label: 'Roto', enabled: true, config: { clientId: 'cid', clientSecret: 'supersecret' } }
        const post = await fetch(`${srv.base}/core/idps/instances`, j({ method: 'POST', body: JSON.stringify(inst) }))
        assert.equal(post.status, 200)
        const list = await fetch(`${srv.base}/core/idps/instances`, j())
        assert.equal(list.status, 200, 'la ruta debe contestar aunque el conector reviente')
    }
    finally { await srv.stop() }
})

test('🔴 con un conector roto NO se filtra el secreto: se enmascara todo', async () => {
    const srv = await startServerBroken()
    try {
        const inst = { id: 'ent', connectorId: 'broken', label: 'Roto', enabled: true, config: { clientId: 'cid', clientSecret: 'supersecret' } }
        await fetch(`${srv.base}/core/idps/instances`, j({ method: 'POST', body: JSON.stringify(inst) }))
        const body = await (await fetch(`${srv.base}/core/idps/instances/ent`, j())).json()
        assert.equal(body.config.clientSecret, '********', 'el secreto NO puede salir en claro')
        assert.equal(body.config.clientId, '********', 'sin schema no se sabe cual es secreto: se enmascara todo')
    }
    finally { await srv.stop() }
})

// And the mask must not be persisted AS the secret: with no schema the old merge skipped the swap-back
// and the stored credential was quietly destroyed on the next save.
test('🔴 con un conector roto, guardar la mascara NO destruye el secreto', async () => {
    const srv = await startServerBroken()
    try {
        const inst = { id: 'ent', connectorId: 'broken', label: 'Roto', enabled: true, config: { clientId: 'cid', clientSecret: 'supersecret' } }
        await fetch(`${srv.base}/core/idps/instances`, j({ method: 'POST', body: JSON.stringify(inst) }))
        const upd = { ...inst, label: 'Roto 2', config: { clientId: 'cid', clientSecret: '********' } }
        await fetch(`${srv.base}/core/idps/instances/ent`, j({ method: 'PUT', body: JSON.stringify(upd) }))
        const exp = await (await fetch(`${srv.base}/core/idps/export`, j())).json()
        assert.equal(exp.ent.label, 'Roto 2')
        assert.equal(exp.ent.config.clientSecret, 'supersecret', 'el secreto almacenado debe conservarse')
    }
    finally { await srv.stop() }
})
