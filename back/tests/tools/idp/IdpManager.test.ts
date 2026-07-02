import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IdpManager } from '../../../src/tools/idp/IdpManager'
import { EIdpConnectorKind, IIdpConnector, IIdpInstanceConfig, TIdpConnectorConstructor } from '../../../src/tools/idp/IIdpConnector'
import { ISecrets } from '../../../src/tools/ISecrets'
import type { IProviderSchemaField } from '../../../src/tools/ProviderManager'

// ---- fakes ----
class FakeConnector implements IIdpConnector {
    connectorId = 'fake'
    label = 'Fake IdP'
    kind = EIdpConnectorKind.OIDC
    getConfigSchema(): IProviderSchemaField[] {
        return [
            { name: 'clientId', label: 'Client ID', type: 'string', required: true },
            { name: 'clientSecret', label: 'Secret', type: 'password', required: true }
        ]
    }
    buildAuthorizationUrl(): string { return 'https://idp.example/auth' }
    async handleCallback() { return { email: 'x@example.com', emailVerified: true } }
}

// ISecrets en memoria (kwirth-idps)
const memSecrets = (): ISecrets => {
    const store: Record<string, any> = {}
    return {
        read: async (name: string) => { if (name in store) return store[name]; throw new Error('no such secret') },
        write: async (name: string, content: any) => { store[name] = content },
        writeKey: async () => {},
        readAllKeys: async () => ({})
    }
}

const makeInstance = (over: Partial<IIdpInstanceConfig> = {}): IIdpInstanceConfig => ({
    id: 'google',
    connectorId: 'fake',
    label: 'Login with Google',
    enabled: true,
    config: { clientId: 'cid', clientSecret: 'sec' },
    ...over
})

const managerWithFake = () => {
    const reg = new Map<string, TIdpConnectorConstructor>()
    const mgr = new IdpManager(memSecrets(), reg)
    mgr.registerConnector('fake', FakeConnector)
    return mgr
}

// ---- conectores ----
test('registerConnector + getConnector instancia el conector', () => {
    const mgr = managerWithFake()
    const c = mgr.getConnector('fake')
    assert.ok(c)
    assert.equal(c!.connectorId, 'fake')
    assert.equal(c!.kind, EIdpConnectorKind.OIDC)
})

test('getConnector con id desconocido devuelve undefined', () => {
    const mgr = managerWithFake()
    assert.equal(mgr.getConnector('nope'), undefined)
})

test('listConnectors expone label/kind/schema', () => {
    const mgr = managerWithFake()
    const list = mgr.listConnectors()
    assert.equal(list.length, 1)
    assert.equal(list[0].connectorId, 'fake')
    assert.equal(list[0].kind, EIdpConnectorKind.OIDC)
    assert.equal(list[0].schema.length, 2)
    assert.equal(list[0].schema[1].type, 'password')
    assert.equal(list[0].installed, false)
})

// ---- instancias (Secret kwirth-idps) ----
test('saveInstance + getInstance hacen roundtrip', async () => {
    const mgr = managerWithFake()
    await mgr.saveInstance(makeInstance())
    const got = await mgr.getInstance('google')
    assert.equal(got?.connectorId, 'fake')
    assert.equal((got?.config as any).clientId, 'cid')
})

test('getEnabledInstances filtra por enabled', async () => {
    const mgr = managerWithFake()
    await mgr.saveInstance(makeInstance({ id: 'google', enabled: true }))
    await mgr.saveInstance(makeInstance({ id: 'kc', enabled: false }))
    const enabled = await mgr.getEnabledInstances()
    assert.equal(enabled.length, 1)
    assert.equal(enabled[0].id, 'google')
    const all = await mgr.listInstances()
    assert.equal(all.length, 2)
})

test('deleteInstance elimina la instancia', async () => {
    const mgr = managerWithFake()
    await mgr.saveInstance(makeInstance())
    await mgr.deleteInstance('google')
    assert.equal(await mgr.getInstance('google'), undefined)
})

// ---- export / import ----
test('export/import hace roundtrip del record completo', async () => {
    const mgr = managerWithFake()
    await mgr.saveInstance(makeInstance({ id: 'google' }))
    const exported = await mgr.exportConfig()
    const mgr2 = managerWithFake()
    await mgr2.importConfig(exported)
    assert.deepEqual(await mgr2.getInstance('google'), exported['google'])
})

// ---- interpolacion de env ----
test('interpolateEnvDeep sustituye ${VAR} recursivamente', () => {
    process.env.KWIRTH_TEST_CID = 'the-client-id'
    const out: any = IdpManager.interpolateEnvDeep({
        config: { clientId: '${KWIRTH_TEST_CID}', scopes: 'openid email', missing: '${KWIRTH_TEST_ABSENT}' }
    })
    assert.equal(out.config.clientId, 'the-client-id')
    assert.equal(out.config.scopes, 'openid email')
    assert.equal(out.config.missing, '')   // variable inexistente → ''
    delete process.env.KWIRTH_TEST_CID
})
