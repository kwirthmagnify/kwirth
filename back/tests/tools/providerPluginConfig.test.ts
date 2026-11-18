import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IConfigFieldDef } from '@kwirthmagnify/kwirth-common'
import { ProviderManager, liveConfigSchema } from '../../src/tools/ProviderManager'
import { PluginManager } from '../../src/tools/PluginManager'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { fakeConfigStore, fakeSecrets } from './fakeExtensionConfigStore'
import tar from 'tar'
import os from 'os'
import path from 'path'
import fs from 'fs'

/*
    Providers and plugins keep their installation config in the common ExtensionConfigStore
    (plans/extension-config, S3): a Secret, defaults on reading, validation on saving, kept on uninstall
    unless deleteConfig is asked (P5).
*/

// In-memory ConfigMaps, seeded: the managers read their index and the cached provider schema from here
const fakeConfigMaps = (seed: Record<string, unknown> = {}): IConfigMaps & { keys: Map<string, unknown> } => {
    const keys = new Map<string, unknown>(Object.entries(seed))
    return {
        keys,
        read: async (name: string, def?: unknown) => keys.has(name) ? keys.get(name) : def,
        write: async (name: string, data: unknown) => { if (data === null) keys.delete(name); else keys.set(name, data) },
        writeKey: async () => {},
        readAllKeys: async () => ({}),
        list: async () => [],
        delete: async (name: string) => { keys.delete(name) },
        storeLimit: () => undefined
    } as unknown as IConfigMaps & { keys: Map<string, unknown> }
}

const SCHEMA: IConfigFieldDef[] = [
    { name: 'url', label: 'URL', required: true },
    { name: 'password', label: 'Password', type: 'password' },
    { name: 'interval', label: 'Interval', type: 'number', default: 60 },
    { name: 'region', label: 'Region', type: 'select', options: ['eu', 'us'], default: 'eu' }
]

// ── Providers ───────────────────────────────────────────────────────────────────────────────────────

const providerManager = (secrets = fakeSecrets()) => {
    const configMaps = fakeConfigMaps({
        'kwirth-provider-p-schema': SCHEMA,
        'kwirth-providers-index': [{ id: 'p', name: '@t/p', version: '1.0.0', description: 'p' }]
    })
    return { manager: new ProviderManager(configMaps, fakeConfigStore(secrets)), configMaps, secrets }
}

test('provider never configured: getConfig gives the cached schema defaults, getSavedConfig gives nothing', async () => {
    const { manager } = providerManager()
    assert.deepEqual(await manager.getConfig('p'), { interval: 60, region: 'eu' })
    assert.equal(await manager.getSavedConfig('p'), undefined, 'a provider nobody configured is not configured')
})

test('🔴 provider config is saved in a Secret, not in the old ConfigMap, and comes back REAL with defaults', async () => {
    const { manager, configMaps, secrets } = providerManager()
    assert.deepEqual(await manager.saveConfig('p', { url: 'https://x', password: 's3cr3t' }), [])
    assert.ok(secrets.objects.has('kwirth-provider-p-config'))
    assert.equal(configMaps.keys.has('kwirth-provider-p-config'), false)
    const expected = { url: 'https://x', password: 's3cr3t', interval: 60, region: 'eu' }
    assert.deepEqual(await manager.getConfig('p'), expected)
    assert.deepEqual(await manager.getSavedConfig('p'), expected, 'saved: configured, with its defaults')
})

test('🔴 provider: what does not fit is refused, every field named, and nothing is saved', async () => {
    const { manager, secrets } = providerManager()
    const errors = await manager.saveConfig('p', { interval: 'often', region: 'mars' })
    assert.deepEqual(errors.map(e => e.field), ['url', 'interval', 'region'])
    assert.equal(secrets.objects.has('kwirth-provider-p-config'), false)
})

test('provider: the LIVE schema wins over the cached one (options generated hot)', async () => {
    const { manager } = providerManager()
    const live: IConfigFieldDef[] = [{ name: 'url', label: 'URL', required: true }, { name: 'region', label: 'Region', type: 'select', options: ['ap-south'] }]
    assert.deepEqual((await manager.saveConfig('p', { url: 'u', region: 'eu' }, live)).map(e => e.field), ['region'], 'eu is no longer offered')
    assert.deepEqual(await manager.saveConfig('p', { url: 'u', region: 'ap-south' }, live), [])
    assert.deepEqual(await manager.getConfig('p', live), { url: 'u', region: 'ap-south' })
})

test('provider: saving drops what the schema no longer declares', async () => {
    const { manager } = providerManager()
    await manager.saveConfig('p', { url: 'u', legacy: 'gone' })
    assert.equal('legacy' in (await manager.getConfig('p')), false)
})

test('🔴 provider uninstalled without asking: its config Secret is kept', async () => {
    const { manager, secrets } = providerManager()
    await manager.saveConfig('p', { url: 'u' })
    await manager.uninstall('p', new Map())
    assert.equal(secrets.objects.has('kwirth-provider-p-config'), true)
})

test('🔴 provider uninstalled with deleteConfig: its config Secret goes with it', async () => {
    const { manager, secrets } = providerManager()
    await manager.saveConfig('p', { url: 'u' })
    await manager.uninstall('p', new Map(), true)
    assert.equal(secrets.objects.has('kwirth-provider-p-config'), false)
})

test('provider uninstalled by its pack: deleteConfig decides the same way', async () => {
    const { manager, secrets } = providerManager()
    await manager.saveConfig('p', { url: 'u' })
    await manager.uninstallFromPack('p', new Map())
    assert.equal(secrets.objects.has('kwirth-provider-p-config'), true)
    await manager.uninstallFromPack('p', new Map(), true)
    assert.equal(secrets.objects.has('kwirth-provider-p-config'), false)
})

test('🔴 a provider installed with `export schema` is listed with hasSchema (the gear on its card)', async () => {
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-test-provider-schema-'))
    fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ id: 'schemed', name: '@t/schemed', version: '1.0.0', description: 'schemed', extensionType: 'provider' }))
    fs.writeFileSync(path.join(stage, 'back.js'), `class P { constructor () { this.id = 'schemed' } }\nmodule.exports.default = P\nmodule.exports.schema = ${JSON.stringify(SCHEMA)}`)
    const tgz = `${stage}.tgz`
    await tar.c({ gzip: true, file: tgz, cwd: stage }, ['.'])
    const configMaps = fakeConfigMaps()
    const manager = new ProviderManager(configMaps, fakeConfigStore())
    await manager.init()
    await manager.install(tgz, new Map())
    const listed = (await manager.listInstalled()).find(m => m.id === 'schemed')
    assert.equal(listed?.hasSchema, true, 'persisted in the index, not only in the meta returned')
    assert.equal((configMaps.keys.get('kwirth-provider-schemed-meta') as { hasSchema?: boolean })?.hasSchema, true)
    fs.rmSync(stage, { recursive: true, force: true })
})

test('liveConfigSchema: the instance\'s fields, or undefined when it has none or throws', () => {
    assert.deepEqual(liveConfigSchema({ id: 'a', getConfigSchema: () => SCHEMA }), SCHEMA)
    assert.equal(liveConfigSchema({ id: 'b' }), undefined)
    assert.equal(liveConfigSchema({ id: 'c', getConfigSchema: () => [] }), undefined)
    assert.equal(liveConfigSchema({ id: 'd', getConfigSchema: () => { throw new Error('boom') } }), undefined)
})

// ── Plugins ─────────────────────────────────────────────────────────────────────────────────────────

const pluginManager = async (configSchema?: IConfigFieldDef[], secrets = fakeSecrets()) => {
    const configMaps = fakeConfigMaps({ 'kwirth-plugins-index': [{ id: 'pl', name: '@t/pl', version: '1.0.0', description: 'pl', configSchema }] })
    const manager = new PluginManager(configMaps, fakeConfigStore(secrets))
    await manager.init()
    return { manager, configMaps, secrets }
}

test('🔴 plugin with a configSchema: defaults on reading, validation on saving, kept in a Secret', async () => {
    const { manager, configMaps, secrets } = await pluginManager(SCHEMA)
    assert.deepEqual(await manager.getConfig('pl'), { interval: 60, region: 'eu' })
    assert.deepEqual((await manager.saveConfig('pl', {})).map(e => e.field), ['url'])
    assert.deepEqual(await manager.saveConfig('pl', { url: 'u' }), [])
    assert.ok(secrets.objects.has('kwirth-plugin-pl-config'))
    assert.equal(configMaps.keys.has('kwirth-plugin-pl-config'), false)
    assert.deepEqual(await manager.getConfig('pl'), { url: 'u', interval: 60, region: 'eu' })
})

test('plugin without a configSchema (all of them today): saved as it comes, nothing validated', async () => {
    const { manager } = await pluginManager(undefined)
    assert.deepEqual(await manager.saveConfig('pl', { anything: 1 }), [])
    assert.deepEqual(await manager.getConfig('pl'), { anything: 1 })
})

test('🔴 plugin uninstalled without asking: its config Secret is kept', async () => {
    const { manager, secrets } = await pluginManager(SCHEMA)
    await manager.saveConfig('pl', { url: 'u' })
    await manager.uninstall('pl', new Map())
    assert.equal(secrets.objects.has('kwirth-plugin-pl-config'), true)
})

test('🔴 plugin uninstalled with deleteConfig: its config Secret goes with it', async () => {
    const { manager, secrets } = await pluginManager(SCHEMA)
    await manager.saveConfig('pl', { url: 'u' })
    await manager.uninstall('pl', new Map(), true)
    assert.equal(secrets.objects.has('kwirth-plugin-pl-config'), false)
})
