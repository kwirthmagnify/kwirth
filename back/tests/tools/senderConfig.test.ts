import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import tar from 'tar'
import { SenderManager } from '../../src/tools/SenderManager'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { ISecrets } from '../../src/tools/ISecrets'
import { fakeConfigStore, fakeSecrets, IFakeSecrets } from './fakeExtensionConfigStore'
import { pruneCommon, pruneNamedConfig, validateNamedConfig } from '../../src/tools/NamedConfigs'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'

/*
    A sender's configurations in the common extension config store (plans/extension-config, S6): ONE Secret
    per sender holding its common base and its named configurations, written BEFORE memory changes and
    awaited, validated against the sender's schema, and kept on uninstall unless asked (P5).
*/

interface IConfigMapsMem extends IConfigMaps {
    datos: Map<string, unknown>
}

const memConfigMaps = (): IConfigMapsMem => {
    const datos = new Map<string, unknown>()
    return {
        datos,
        storeLimit: () => undefined,
        write: async (name: string, data: unknown) => { if (data === null) datos.delete(name); else datos.set(name, data); return {} },
        read: async (name: string, defaultValue?: unknown) => datos.has(name) ? datos.get(name) : defaultValue,
        writeKey: async (name: string) => { datos.set(`writeKey:${name}`, true) },
        readAllKeys: async () => ({})
    } as unknown as IConfigMapsMem
}

// A mail sender: the server is COMMON to all its configurations, the recipient is each one's. 'route' is a
// json field, saved as an object by a sender's own dialog.
const SENDER_JS = `module.exports.default = class {
    constructor() { this.id = 'mail'; this.received = new Map() }
    getConfigSchema() { return [
        { name: 'name', label: 'Name', required: true },
        { name: 'host', label: 'Host', required: true, common: true },
        { name: 'password', label: 'Password', type: 'password', common: true },
        { name: 'to', label: 'To', required: true },
        { name: 'route', label: 'Route (JSON)', type: 'json' }
    ] }
    addConfig(c) { this.received.set(c.name, c) }
    removeConfig(n) { this.received.delete(n) }
    hasConfig(n) { return this.received.has(n) }
    getConfigNames() { return [...this.received.keys()] }
    async startSender() {}
    async stopSender() {}
    async send() {}
}`

const senderTgz = async (): Promise<string> => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-sender-cfg-'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ id: 'mail', name: '@test/sender-mail', version: '1.0.0' }))
    fs.writeFileSync(path.join(dir, 'back.js'), SENDER_JS)
    const tgz = path.join(dir, 'mail.tgz')
    await tar.c({ gzip: true, file: tgz, cwd: dir }, ['package.json', 'back.js'])
    return tgz
}

const installed = async (secrets: ISecrets = fakeSecrets(), cm: IConfigMapsMem = memConfigMaps()): Promise<SenderManager> => {
    const manager = new SenderManager(cm, fakeConfigStore(secrets))
    await manager.init()
    await manager.install(await senderTgz(), 'test')
    return manager
}

const stored = (secrets: IFakeSecrets): Record<string, unknown> | undefined => {
    const obj = secrets.objects.get('kwirth-sender-mail-config')
    return obj ? JSON.parse(Buffer.from(String(obj.data), 'base64').toString('utf8')) : undefined
}

// what the sender's instance received for a configuration: the common base under it
const received = (manager: SenderManager, name: string): Record<string, unknown> | undefined =>
    (manager.getSender('mail') as unknown as { received: Map<string, Record<string, unknown>> }).received.get(name)

const BASE = { host: 'smtp.example.com', password: 'pw-real' }

test('🔴 one Secret per sender holds its base AND its configs, the password REAL; no shared ConfigMap', async () => {
    const secrets = fakeSecrets()
    const cm = memConfigMaps()
    const manager = await installed(secrets, cm)
    assert.deepEqual(await manager.setSenderStoredConfig('mail', { ...BASE, configs: [] }), [])
    assert.deepEqual(await manager.saveConfig('mail', { name: 'ops', to: 'ops@example.com' }), [])
    assert.deepEqual(stored(secrets), { ...BASE, configs: [{ name: 'ops', to: 'ops@example.com' }] })
    assert.equal(cm.datos.has('writeKey:kwirth-sender-configs'), false, 'the old shared ConfigMap is not written any more')
})

test('🔴 base and configs survive a restart, and the sender gets each config with the base under it', async () => {
    const secrets = fakeSecrets()
    const cm = memConfigMaps()
    const first = await installed(secrets, cm)
    await first.setSenderStoredConfig('mail', { ...BASE, configs: [{ name: 'ops', to: 'ops@example.com' }] })

    const second = new SenderManager(cm, fakeConfigStore(secrets))
    await second.init()
    await second.loadAll()
    await second.loadPersistedConfigs()
    assert.deepEqual(second.getSenderStoredConfig('mail'), { ...BASE, configs: [{ name: 'ops', to: 'ops@example.com' }] })
    assert.deepEqual(received(second, 'ops'), { ...BASE, name: 'ops', to: 'ops@example.com' })
})

test('saving refuses what does not fit, field by field, and stores nothing', async () => {
    const secrets = fakeSecrets()
    const manager = await installed(secrets)
    assert.deepEqual((await manager.saveConfig('mail', { name: 'ops' })).map(e => e.field), ['to'])
    const sinHost = await manager.setSenderStoredConfig('mail', { configs: [] })
    assert.deepEqual(sinHost.map(e => e.field), ['host'])
    assert.equal(stored(secrets), undefined)
})

test('a config error from the base screen says WHICH config it is', async () => {
    const manager = await installed()
    const errors = await manager.setSenderStoredConfig('mail', { ...BASE, configs: [{ name: 'ops' }] })
    assert.deepEqual(errors, [{ field: 'to', message: "Config 'ops': 'To' is required" }])
})

test('🔴 a json field holding an OBJECT is valid: the senders with their own dialog save it that way', async () => {
    const manager = await installed()
    await manager.setSenderStoredConfig('mail', { ...BASE, configs: [] })
    assert.deepEqual(await manager.saveConfig('mail', { name: 'ops', to: 'a@b.c', route: { steps: [1, 2] } }), [])
    assert.deepEqual(manager.getConfig('mail', 'ops')?.route, { steps: [1, 2] }, 'stored as it came, not as text')
    assert.deepEqual((await manager.saveConfig('mail', { name: 'bad', to: 'a@b.c', route: '{not json' })).map(e => e.field), ['route'])
})

test('🔴 a write that fails is THROWN and memory is left as it was (it used to answer OK)', async () => {
    const secrets = fakeSecrets()
    const manager = await installed(secrets)
    secrets.write = async () => { throw new Error('etcd down') }
    await assert.rejects(manager.saveConfig('mail', { name: 'ops', to: 'a@b.c' }), /etcd down/)
    assert.deepEqual(manager.getConfigs('mail'), [])
})

test('the published ISenderAccess.addConfig stays synchronous: false for what does not fit, true and saved otherwise', async () => {
    const secrets = fakeSecrets()
    const manager = await installed(secrets)
    assert.equal(manager.addConfig('mail', { name: 'ops' }), false, "'to' is required")
    assert.equal(manager.addConfig('nobody', { name: 'x' }), false)
    assert.equal(manager.addConfig('mail', { name: 'ops', to: 'a@b.c' }), true)
    await new Promise(r => setImmediate(r))
    assert.deepEqual((stored(secrets)?.configs as unknown[]).length, 1)
})

test('removing a config writes the document without it', async () => {
    const secrets = fakeSecrets()
    const manager = await installed(secrets)
    await manager.saveConfig('mail', { name: 'a', to: 'a@b.c' })
    await manager.saveConfig('mail', { name: 'b', to: 'b@b.c' })
    assert.equal(await manager.removeConfig('mail', 'a'), true)
    assert.deepEqual((stored(secrets)?.configs as { name: string }[]).map(c => c.name), ['b'])
})

test('removing the last config of a sender with no base leaves NO Secret behind, not an empty one', async () => {
    const secrets = fakeSecrets()
    const manager = await installed(secrets)
    await manager.saveConfig('mail', { name: 'a', to: 'a@b.c' })
    await manager.removeConfig('mail', 'a')
    assert.equal(secrets.objects.has('kwirth-sender-mail-config'), false)
})

test('🔴 uninstalled without deleteConfig: the Secret is KEPT, and a reinstall loads it again', async () => {
    const secrets = fakeSecrets()
    const manager = await installed(secrets)
    await manager.setSenderStoredConfig('mail', { ...BASE, configs: [{ name: 'ops', to: 'ops@example.com' }] })
    await manager.uninstall('mail')
    assert.ok(stored(secrets), 'kept')
    assert.deepEqual(manager.getConfigs('mail'), [], 'out of memory meanwhile')

    await manager.install(await senderTgz(), 'test')
    assert.deepEqual(manager.getSenderStoredConfig('mail'), { ...BASE, configs: [{ name: 'ops', to: 'ops@example.com' }] })
    assert.deepEqual(received(manager, 'ops')?.host, 'smtp.example.com', 'and the new instance has it')
})

test('🔴 uninstalled with deleteConfig: the Secret goes, and a reinstall starts empty', async () => {
    const secrets = fakeSecrets()
    const manager = await installed(secrets)
    await manager.saveConfig('mail', { name: 'ops', to: 'ops@example.com' })
    await manager.uninstall('mail', true)
    assert.equal(stored(secrets), undefined)
    await manager.install(await senderTgz(), 'test')
    assert.deepEqual(manager.getConfigs('mail'), [])
})

test('a kept config of a sender that is not installed is left alone at startup', async () => {
    const secrets = fakeSecrets()
    await fakeConfigStore(secrets).write(EExtensionType.SENDER, 'gone', { configs: [{ name: 'x' }] })
    const manager = new SenderManager(memConfigMaps(), fakeConfigStore(secrets))
    await manager.init()
    await manager.loadPersistedConfigs()
    assert.deepEqual(manager.getConfigs('gone'), [])
    assert.ok(secrets.objects.has('kwirth-sender-gone-config'))
})

// ── NamedConfigs: the edges of the shared helper ───────────────────────────────

test('NamedConfigs: a schema with NO common fields keeps no base at all (not "everything", as pruneConfig would)', () => {
    const schema = [{ name: 'name', label: 'Name' }, { name: 'to', label: 'To' }]
    assert.deepEqual(pruneCommon(schema, { leftover: 1 }), {})
})

test('NamedConfigs: with no schema (a broken extension) nothing is pruned nor validated (P2)', () => {
    assert.deepEqual(pruneNamedConfig([], { name: 'x', any: 1 }), { name: 'x', any: 1 })
    assert.deepEqual(pruneCommon([], { any: 1 }), { any: 1 })
    assert.deepEqual(validateNamedConfig([], { name: '' }), [])
})

test('NamedConfigs: the name is required even when the schema does not declare it', () => {
    assert.deepEqual(validateNamedConfig([{ name: 'to', label: 'To' }], { name: ' ' }).map(e => e.field), ['name'])
})
