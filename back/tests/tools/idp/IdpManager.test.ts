import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IdpManager } from '../../../src/tools/IdpManager'
import { EIdpConnectorKind, IIdpConnector, IIdpConfigFieldDef, IIdpInstanceConfig, TIdpConnectorConstructor } from '@kwirthmagnify/kwirth-common-back'
import { IConfigMaps } from '../../../src/tools/IConfigMap'
import { ExtensionConfigStore } from '../../../src/tools/ExtensionConfigStore'
import { fakeConfigStore, fakeSecrets, IFakeSecrets } from '../fakeExtensionConfigStore'
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

const managerWithFake = (secrets: IFakeSecrets = fakeSecrets()) => {
    const reg = new Map<string, TIdpConnectorConstructor>()
    const mgr = new IdpManager(new ExtensionConfigStore(secrets), memConfigMaps(), reg)
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

// ---- instances: one Secret each (plans/extension-config, S5) ----
test('saveInstance + getInstance hacen roundtrip', async () => {
    const mgr = managerWithFake()
    assert.deepEqual(await mgr.saveInstance(makeInstance()), [])
    const got = await mgr.getInstance('google')
    assert.equal(got?.connectorId, 'fake')
    assert.equal((got?.config as any).clientId, 'cid')
})

test('🔴 cada instancia es su propio Secret, kwirth-idp-<instanceId>-config, entero y con el secreto real', async () => {
    const secrets = fakeSecrets()
    const mgr = managerWithFake(secrets)
    await mgr.saveInstance(makeInstance({ id: 'google' }))
    await mgr.saveInstance(makeInstance({ id: 'google-2', label: 'Second' }))
    assert.deepEqual([...secrets.objects.keys()].sort(), ['kwirth-idp-google-2-config', 'kwirth-idp-google-config'])
    const stored = JSON.parse(Buffer.from(String(secrets.objects.get('kwirth-idp-google-config')?.data), 'base64').toString('utf8'))
    assert.equal(stored.config.clientSecret, 'sec')
    assert.equal(stored.connectorId, 'fake')
})

test('🔴 guardar sustituye la instancia entera: sin merge con lo guardado', async () => {
    const mgr = managerWithFake()
    await mgr.saveInstance(makeInstance({ config: { clientId: 'cid', clientSecret: 'sec' } }))
    await mgr.saveInstance(makeInstance({ config: { clientId: 'cid2', clientSecret: 'new' } }))
    assert.deepEqual((await mgr.getInstance('google'))?.config, { clientId: 'cid2', clientSecret: 'new' })
})

test('🔴 lo que no encaja con el esquema del conector se rechaza, campo a campo, y no se guarda', async () => {
    const secrets = fakeSecrets()
    const mgr = managerWithFake(secrets)
    const errors = await mgr.saveInstance(makeInstance({ config: { clientId: '' } }))
    assert.deepEqual(errors.map(e => e.field), ['clientId', 'clientSecret'])
    assert.equal(secrets.objects.size, 0)
})

test('lo que el esquema ya no declara se descarta al guardar', async () => {
    const mgr = managerWithFake()
    await mgr.saveInstance(makeInstance({ config: { clientId: 'cid', clientSecret: 'sec', legacy: 'x' } }))
    assert.equal('legacy' in ((await mgr.getInstance('google'))?.config ?? {}), false)
})

test('un conector sin esquema legible: se guarda sin validar (P2)', async () => {
    const mgr = managerWithFake()
    assert.deepEqual(await mgr.saveInstance(makeInstance({ connectorId: 'missing', config: { anything: 1 } })), [])
    assert.deepEqual((await mgr.getInstance('google'))?.config, { anything: 1 })
})

test('🔴 un id que no puede nombrar un Secret se rechaza', async () => {
    const mgr = managerWithFake()
    assert.deepEqual((await mgr.saveInstance(makeInstance({ id: 'My IdP' }))).map(e => e.field), ['id'])
})

test('un Secret que no tiene forma de instancia se lee como ausente', async () => {
    const secrets = fakeSecrets()
    secrets.objects.set('kwirth-idp-junk-config', { data: Buffer.from(JSON.stringify({ nope: true })).toString('base64') })
    const mgr = managerWithFake(secrets)
    assert.equal(await mgr.getInstance('junk'), undefined)
    assert.deepEqual(await mgr.listInstances(), [])
})

test('🔴 desinstalar el conector SIN deleteConfig conserva sus instancias; CON él, se las lleva (solo las suyas)', async () => {
    const mgr = managerWithFake()
    await mgr.saveInstance(makeInstance({ id: 'google' }))
    await mgr.saveInstance(makeInstance({ id: 'other', connectorId: 'missing', config: {} }))
    await mgr.uninstall('fake')
    assert.ok(await mgr.getInstance('google'), 'kept without deleteConfig')
    mgr.registerConnector('fake', FakeConnector)
    await mgr.uninstall('fake', true)
    assert.equal(await mgr.getInstance('google'), undefined)
    assert.ok(await mgr.getInstance('other'), 'the other connector\'s instance is not touched')
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
    assert.deepEqual(await mgr2.importConfig(exported), [])
    assert.deepEqual(await mgr2.getInstance('google'), exported['google'])
})

test('import: una instancia que no encaja no se aplica, y lo dice', async () => {
    const mgr = managerWithFake()
    const warnings = await mgr.importConfig({ google: makeInstance({ config: { clientId: 'cid' } }) })
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /google/)
    assert.equal(await mgr.getInstance('google'), undefined)
})

// ---- dev: kwirth-dev.json → idpConfigs ----
test('🔴 loadDevIdpConfigs siembra las instancias de kwirth-dev.json, sin pisar una ya configurada', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-idp-dev-'))
    process.env.KWIRTH_TEST_IDP_SECRET = 'from-env'
    fs.writeFileSync(path.join(dir, 'kwirth-dev.json'), JSON.stringify({ idpConfigs: {
        seeded: { connectorId: 'fake', label: 'Seeded', enabled: true, config: { clientId: 'cid', clientSecret: '${KWIRTH_TEST_IDP_SECRET}' } },
        google: { connectorId: 'fake', label: 'From dev', enabled: true, config: { clientId: 'dev', clientSecret: 'dev' } },
        invalid: { connectorId: 'fake', label: 'Invalid', enabled: true, config: { clientId: 'only' } }
    } }))
    const cwd = process.cwd()
    try {
        process.chdir(dir)
        const mgr = managerWithFake()
        await mgr.saveInstance(makeInstance({ id: 'google' }))
        await mgr.loadDevIdpConfigs()
        assert.equal((await mgr.getInstance('seeded'))?.config.clientSecret, 'from-env')
        assert.equal((await mgr.getInstance('google'))?.label, 'Login with Google', 'an instance already configured is not overwritten')
        assert.equal(await mgr.getInstance('invalid'), undefined, 'what does not fit the schema is not seeded')
    }
    finally {
        process.chdir(cwd)
        fs.rmSync(dir, { recursive: true, force: true })
    }
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
    const mgr = new IdpManager(fakeConfigStore(), cfg, new Map<string, TIdpConnectorConstructor>())
    const meta = await mgr.installFromBuffer(buffer)
    assert.equal(meta.id, 'installed-fake')
    assert.ok(mgr.getConnector('installed-fake'), 'el conector debe quedar registrado tras install')
    assert.ok(mgr.listConnectors().some(c => c.id === 'installed-fake' && c.installed), 'debe aparecer como installed')
    assert.ok((await mgr.listInstalledMeta()).some(m => m.id === 'installed-fake'), 'debe estar en el índice')

    // loadAll on a new manager with the same configMaps recovers it
    const mgr2 = new IdpManager(fakeConfigStore(), cfg, new Map<string, TIdpConnectorConstructor>())
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
    const mgr = new IdpManager(fakeConfigStore(), memConfigMaps(), reg)
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
    const mgr = new IdpManager(fakeConfigStore(), memConfigMaps(), reg)
    mgr.registerConnector('fake', FakeConnector)
    mgr.registerConnector('broken-ctor', BrokenCtorConnector as unknown as TIdpConnectorConstructor)
    const list = mgr.listConnectors()
    assert.equal(list.length, 1, 'el roto se descarta, el sano se sirve')
    assert.equal(list[0].id, 'fake')
})
