import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IdpManager } from '../../../src/tools/IdpManager'
import { EIdpConnectorKind, IIdpConnector, IIdpConfigFieldDef, IIdpInstanceConfig, TIdpConnectorConstructor } from '@kwirthmagnify/kwirth-common-back'
import { ISecrets } from '../../../src/tools/ISecrets'
import { IConfigMaps } from '../../../src/tools/IConfigMap'
import tar from 'tar'
import fs from 'fs'
import os from 'os'
import path from 'path'

// ---- fakes ----
class FakeConnector implements IIdpConnector {
    id = 'fake'
    label = 'Fake IdP'
    kind = EIdpConnectorKind.OIDC
    getConfigSchema(): IIdpConfigFieldDef[] {
        return [
            { name: 'clientId', label: 'Client ID', type: 'text', required: true },
            { name: 'clientSecret', label: 'Secret', type: 'password', required: true }
        ]
    }
    buildAuthorizationUrl(): string { return 'https://idp.example/auth' }
    async handleCallback() { return { email: 'x@example.com', emailVerified: true } }
}

// ISecrets en memoria (kwirth-idps)
const memSecrets = (): ISecrets => {
    const keys: Record<string, Record<string, any>> = {}
    return {
        read: async () => { throw new Error('no such secret') },
        write: async () => {},
        writeKey: async (name: string, key: string, value: any) => { (keys[name] ||= {}); if (value === null) delete keys[name][key]; else keys[name][key] = value },
        readAllKeys: async (name: string) => keys[name] ?? {}
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

const memConfigMaps = (): IConfigMaps => {
    const store: Record<string, any> = {}
    return {
        read: async (name: string, def?: any) => (name in store ? store[name] : def),
        write: ((name: string, data: any) => { store[name] = data }) as any,
        writeKey: async () => {},
        readAllKeys: async () => ({})
    }
}

const managerWithFake = () => {
    const reg = new Map<string, TIdpConnectorConstructor>()
    const mgr = new IdpManager(memSecrets(), memConfigMaps(), reg)
    mgr.registerConnector('fake', FakeConnector)
    return mgr
}

// ---- connectors ----
test('registerConnector + getConnector instancia el conector', () => {
    const mgr = managerWithFake()
    const c = mgr.getConnector('fake')
    assert.ok(c)
    assert.equal(c!.id, 'fake')
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
    assert.equal(list[0].id, 'fake')
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

// ---- installable connectors (tgz) ----
test('install(tgz) registra el conector, lo lista en el índice, loadAll lo recupera y uninstall lo quita', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-idp-test-'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ id: 'installed-fake', name: '@x/installed-fake', displayName: 'Installed Fake', version: '0.0.1', description: 'test connector' }))
    fs.writeFileSync(path.join(dir, 'back.js'), "class C { constructor(){ this.id='installed-fake'; this.label='Installed Fake'; this.kind='oidc' } getConfigSchema(){ return [] } buildAuthorizationUrl(){ return 'https://x/auth' } async handleCallback(){ return { email:'a@b.com', emailVerified:true } } } module.exports.default = C")
    const tgz = path.join(dir, 'pkg.tgz')
    await tar.c({ gzip: true, file: tgz, cwd: dir }, ['package.json', 'back.js'])
    const buffer = fs.readFileSync(tgz)

    const cfg = memConfigMaps()
    const mgr = new IdpManager(memSecrets(), cfg, new Map<string, TIdpConnectorConstructor>())
    const meta = await mgr.installFromBuffer(buffer)
    assert.equal(meta.id, 'installed-fake')
    assert.ok(mgr.getConnector('installed-fake'), 'el conector debe quedar registrado tras install')
    assert.ok(mgr.listConnectors().some(c => c.id === 'installed-fake' && c.installed), 'debe aparecer como installed')
    assert.ok((await mgr.listInstalledMeta()).some(m => m.id === 'installed-fake'), 'debe estar en el índice')

    // loadAll on a new manager with the same configMaps recovers it
    const mgr2 = new IdpManager(memSecrets(), cfg, new Map<string, TIdpConnectorConstructor>())
    await mgr2.init()
    await mgr2.loadAll()
    assert.ok(mgr2.getConnector('installed-fake'), 'loadAll debe re-registrar el conector instalado')

    await mgr.uninstall('installed-fake')
    assert.equal(mgr.getConnector('installed-fake'), undefined, 'uninstall debe quitar el conector')
    assert.ok(!(await mgr.listInstalledMeta()).some(m => m.id === 'installed-fake'), 'uninstall debe quitarlo del índice')

    fs.rmSync(dir, { recursive: true, force: true })
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

/*
    ── un conector roto NO se lleva el core por delante ──────────────────────────────────────────────

    A connector is third-party code and constructing it, or asking it for its schema, can throw. The
    real case: a connector built against a newer common-back, installed BEFORE restarting the core, so
    its getConfigSchema() calls an export the running core does not have yet. Thrown from here it came
    out of an async route, which Express does not catch, and the unhandledRejection took the core down
    with every channel and every user inside.
*/

class BrokenCtorConnector implements IIdpConnector {
    id = 'broken-ctor'
    label = 'Broken'
    kind = EIdpConnectorKind.OIDC
    constructor() { throw new TypeError('idpRedirectUriField is not a function') }
    getConfigSchema(): IIdpConfigFieldDef[] { return [] }
    buildAuthorizationUrl(): string { return '' }
    async handleCallback() { return { email: '', emailVerified: false } }
}

class BrokenSchemaConnector implements IIdpConnector {
    id = 'broken-schema'
    label = 'Broken schema'
    kind = EIdpConnectorKind.OIDC
    getConfigSchema(): IIdpConfigFieldDef[] { throw new TypeError('idpRedirectUriField is not a function') }
    buildAuthorizationUrl(): string { return '' }
    async handleCallback() { return { email: '', emailVerified: false } }
}

const managerWith = (id: string, ctor: TIdpConnectorConstructor) => {
    const reg = new Map<string, TIdpConnectorConstructor>()
    const mgr = new IdpManager(memSecrets(), memConfigMaps(), reg)
    mgr.registerConnector(id, ctor)
    return mgr
}

test('un conector que revienta al construirse devuelve undefined, no lanza', () => {
    const mgr = managerWith('broken-ctor', BrokenCtorConnector as unknown as TIdpConnectorConstructor)
    assert.doesNotThrow(() => mgr.getConnector('broken-ctor'))
    assert.equal(mgr.getConnector('broken-ctor'), undefined)
})

test('un conector que revienta al pedirle el schema devuelve undefined, no lanza', () => {
    const mgr = managerWith('broken-schema', BrokenSchemaConnector as unknown as TIdpConnectorConstructor)
    assert.doesNotThrow(() => mgr.getConnectorSchema('broken-schema'))
    assert.equal(mgr.getConnectorSchema('broken-schema'), undefined)
})

/*
    undefined and [] must NOT be the same thing. Whoever masks secrets tells them apart: with no schema
    there is no way to know which fields are passwords, and treating it as 'no password fields' sends
    the client secret out in the clear.
*/
test('undefined (no se pudo leer) se distingue de [] (no tiene campos)', () => {
    const roto = managerWith('broken-schema', BrokenSchemaConnector as unknown as TIdpConnectorConstructor)
    assert.equal(roto.getConnectorSchema('broken-schema'), undefined)

    class SinCampos implements IIdpConnector {
        id = 'vacio'; label = 'Vacio'; kind = EIdpConnectorKind.OIDC
        getConfigSchema(): IIdpConfigFieldDef[] { return [] }
        buildAuthorizationUrl(): string { return '' }
        async handleCallback() { return { email: '', emailVerified: false } }
    }
    const vacio = managerWith('vacio', SinCampos as unknown as TIdpConnectorConstructor)
    assert.deepEqual(vacio.getConnectorSchema('vacio'), [])
})

test('listConnectors sigue en pie aunque uno de los conectores este roto', () => {
    const reg = new Map<string, TIdpConnectorConstructor>()
    const mgr = new IdpManager(memSecrets(), memConfigMaps(), reg)
    mgr.registerConnector('fake', FakeConnector)
    mgr.registerConnector('broken-ctor', BrokenCtorConnector as unknown as TIdpConnectorConstructor)
    const list = mgr.listConnectors()
    assert.equal(list.length, 1, 'el roto se descarta, el sano se sirve')
    assert.equal(list[0].id, 'fake')
})
