import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RouterManager } from '../../src/tools/RouterManager'
import { ExtensionConfigStore } from '../../src/tools/ExtensionConfigStore'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { ISecrets } from '../../src/tools/ISecrets'
import { IRouterContext } from '@kwirthmagnify/kwirth-common-back'
import tar from 'tar'
import os from 'os'
import path from 'path'
import fs from 'fs'

/*
    Manager of the `router` type (plans/router-extension, S2). Pinned down: the core owns ONE live instance per
    router, started with its saved config and replaced hot on an update; the config is a SECRET, returned
    real and applied at once; a router that cannot start is left with its cause and tumbles nothing;
    uninstalling stops it and removes its config.
*/

const fakeStore = (): { configMaps: IConfigMaps, secrets: ISecrets, keys: Map<string, unknown> } => {
    const keys = new Map<string, unknown>()
    const store = {
        read: async (name: string, def?: unknown) => keys.has(name) ? keys.get(name) : def,
        write: async (name: string, data: unknown) => { if (data === null) keys.delete(name); else keys.set(name, data); return {} },
        delete: async (name: string) => { keys.delete(name) },
        writeKey: async () => {},
        readAllKeys: async () => ({}),
        list: async () => [],
        storeLimit: () => undefined
    }
    return { configMaps: store as unknown as IConfigMaps, secrets: store as unknown as ISecrets, keys }
}

// A router whose every lifecycle call is recorded in global.__routerLog, so the test sees what the manager did
const routerJs = (id: string, declaredId = id) => `
const log = (global.__routerLog ??= [])
class R {
    constructor(context) { this.context = context; this.config = {}; log.push('new:${id}:' + context.clusterName) }
    getRouterData() { return { id: '${declaredId}', pathTemplate: '/{routeTicket}/{clusterUid}', needsTicket: true } }
    getConfigSchema() { return [{ name: 'peerUrl', label: 'Peer URL', type: 'text' }, { name: 'peerAccessKey', label: 'Peer key', type: 'password' }] }
    getScopeCatalog() { return [{ scope: '${id}$peer', label: 'Peer', description: 'a peer link' }] }
    async startRouter(config) { this.config = config; log.push('start:${id}:' + JSON.stringify(config)) }
    async applyConfig(config) { this.config = config; log.push('apply:${id}:' + JSON.stringify(config)) }
    async stopRouter() { log.push('stop:${id}') }
    getStatus() { return { started: true, detail: 'peer ' + (this.config.peerUrl ?? 'none') } }
}
module.exports.default = R
`

const makeRouterTgz = async (id: string, backJs: string, version = '1.0.0', extensionType = 'router'): Promise<string> => {
    const dir = path.join(os.tmpdir(), `kwirth-test-router-${id}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ id, name: `@test/kwirth-router-${id}`, version, description: `test router ${id}`, extensionType }))
    fs.writeFileSync(path.join(dir, 'back.js'), backJs)
    const tgz = `${dir}.tgz`
    await tar.c({ gzip: true, file: tgz, cwd: dir }, ['.'])
    fs.rmSync(dir, { recursive: true, force: true })
    return tgz
}

const context = (): IRouterContext => ({ clusterUid: 'u1', clusterName: 'k3d', kwirthVersion: '0.6.117', loopbackUrl: 'http://localhost:3883', logger: { info: () => {}, trace: () => {}, warning: () => {}, error: () => {} } })
const routerLog = (): string[] => ((global as unknown as Record<string, string[]>)['__routerLog'] ??= [])

test('🔴 installed: one live instance, started with its saved config, announced and with its scopes', async () => {
    routerLog().length = 0
    const { configMaps, secrets } = fakeStore()
    const manager = new RouterManager(configMaps, new ExtensionConfigStore(secrets), context)
    let changes = 0
    manager.setOnChange(() => changes++)
    await manager.init()
    const meta = await manager.install(await makeRouterTgz('bridge', routerJs('bridge')))
    assert.equal(meta.requiresRestart, false, 'routers come and go without a restart')
    assert.ok(manager.router('bridge'))
    assert.deepEqual(routerLog(), ['new:bridge:k3d', 'start:bridge:{}'])
    assert.deepEqual(manager.routerData(), [{ id: 'bridge', pathTemplate: '/{routeTicket}/{clusterUid}', needsTicket: true }])
    assert.deepEqual(manager.scopeCatalog().map(s => s.scope), ['bridge$peer'])
    assert.deepEqual(manager.status('bridge'), { started: true, detail: 'peer none' })
    assert.ok(changes > 0, 'the core is told to re-announce')
    assert.deepEqual((await manager.listInstalled()).map(m => m.id), ['bridge'])
})

test('🔴 the config is a SECRET, comes back real, and saving applies it to the live router at once', async () => {
    routerLog().length = 0
    const { configMaps, secrets, keys } = fakeStore()
    const manager = new RouterManager(configMaps, new ExtensionConfigStore(secrets), context)
    await manager.init()
    await manager.install(await makeRouterTgz('bridge', routerJs('bridge')))
    await manager.saveConfig('bridge', { peerUrl: 'https://b.example', peerAccessKey: 'k|permanent|bridge$peer::::' })
    assert.deepEqual(await manager.getConfig('bridge'), { peerUrl: 'https://b.example', peerAccessKey: 'k|permanent|bridge$peer::::' })
    const stored = keys.get('kwirth-router-bridge-config') as { data: string }
    assert.ok(stored?.data && !stored.data.includes('permanent'), 'stored base64 in the Secret, not as plain fields')
    assert.equal(routerLog().at(-1), 'apply:bridge:{"peerUrl":"https://b.example","peerAccessKey":"k|permanent|bridge$peer::::"}')
    assert.deepEqual(manager.getSchema('bridge').map(f => f.name), ['peerUrl', 'peerAccessKey'])
})

test('an update replaces the instance hot: the old one stops, the new one starts with the same config', async () => {
    routerLog().length = 0
    const { configMaps, secrets } = fakeStore()
    const manager = new RouterManager(configMaps, new ExtensionConfigStore(secrets), context)
    await manager.init()
    await manager.install(await makeRouterTgz('bridge', routerJs('bridge')))
    await manager.saveConfig('bridge', { peerUrl: 'x' })
    const first = manager.router('bridge')
    await assert.rejects(manager.install(await makeRouterTgz('bridge', routerJs('bridge'), '1.1.0')), /already installed/)
    await manager.install(await makeRouterTgz('bridge', routerJs('bridge'), '1.1.0'), undefined, undefined, undefined, true)
    assert.notEqual(manager.router('bridge'), first)
    assert.deepEqual(routerLog().slice(-3), ['stop:bridge', 'new:bridge:k3d', 'start:bridge:{"peerUrl":"x"}'])
})

test('a router that declares another id, or exports nothing, is left FAILED with the cause; the core goes on', async () => {
    const { configMaps, secrets } = fakeStore()
    const manager = new RouterManager(configMaps, new ExtensionConfigStore(secrets), context)
    await manager.init()
    await manager.install(await makeRouterTgz('liar', routerJs('liar', 'other')))
    assert.equal(manager.router('liar'), undefined)
    assert.match(manager.status('liar').lastError ?? '', /declares the id 'other'/)
    await manager.install(await makeRouterTgz('empty', 'module.exports = {}'))
    assert.match(manager.status('empty').lastError ?? '', /exports no router class/)
    assert.deepEqual(manager.routerData(), [], 'a failed router is not announced')
})

test('another type\'s package is refused by name', async () => {
    const { configMaps, secrets } = fakeStore()
    const manager = new RouterManager(configMaps, new ExtensionConfigStore(secrets), context)
    await manager.init()
    await assert.rejects(manager.install(await makeRouterTgz('p', routerJs('p'), '1.0.0', 'plugin')), /Not a router package/)
})

test('🔴 uninstalled: stopped, out of the table, and its config Secret removed', async () => {
    routerLog().length = 0
    const { configMaps, secrets, keys } = fakeStore()
    const manager = new RouterManager(configMaps, new ExtensionConfigStore(secrets), context)
    await manager.init()
    await manager.install(await makeRouterTgz('bridge', routerJs('bridge')))
    await manager.saveConfig('bridge', { peerUrl: 'x' })
    await manager.uninstall('bridge')
    assert.equal(manager.router('bridge'), undefined)
    assert.equal(routerLog().at(-1), 'stop:bridge')
    assert.equal(keys.has('kwirth-router-bridge-config'), false)
    assert.deepEqual(await manager.listInstalled(), [])
})

test('at startup, the installed ones are loaded and started again from what was stored', async () => {
    routerLog().length = 0
    const store = fakeStore()
    const first = new RouterManager(store.configMaps, new ExtensionConfigStore(store.secrets), context)
    await first.init()
    await first.install(await makeRouterTgz('bridge', routerJs('bridge')))
    await first.saveConfig('bridge', { peerUrl: 'x' })
    const restarted = new RouterManager(store.configMaps, new ExtensionConfigStore(store.secrets), context)
    await restarted.init()
    await restarted.loadAll()
    assert.ok(restarted.router('bridge'))
    assert.equal(routerLog().at(-1), 'start:bridge:{"peerUrl":"x"}')
})

// A plugin channel that is also a router: only what the manager reads of it
const pluter = (id: string) => ({
    getRouterData: () => ({ id, pathTemplate: '/{routeTicket}/{clusterUid}', needsTicket: true }),
    getConfigSchema: () => [],
    startRouter: async () => {}, applyConfig: async () => {}, stopRouter: async () => {}
})

test('🔴 a PLUTER (a plugin that is also a router) is served under its channel id, announced, and dropped when it goes', async () => {
    const { configMaps, secrets } = fakeStore()
    const manager = new RouterManager(configMaps, new ExtensionConfigStore(secrets), context)
    let changes = 0
    manager.setOnChange(() => changes++)
    await manager.init()
    const ianus = pluter('ianus')
    assert.equal(manager.adoptPluter('ianus', ianus), true)
    assert.equal(manager.router('ianus'), ianus)
    assert.deepEqual(manager.routerData().map(r => r.id), ['ianus'])
    assert.equal(changes, 1)
    // a hot reload replaces it: the table points at the NEW instance
    const reloaded = pluter('ianus')
    manager.adoptPluter('ianus', reloaded)
    assert.equal(manager.router('ianus'), reloaded)
    // it is a plugin: the Routers manager does not list it as an installed router
    assert.deepEqual(await manager.listInstalled(), [])
    manager.dropPluter('ianus')
    assert.equal(manager.router('ianus'), undefined)
    assert.deepEqual(manager.routerData(), [])
})

test('a pluter declaring another id, or clashing with an installed router, is not registered', async () => {
    const { configMaps, secrets } = fakeStore()
    const manager = new RouterManager(configMaps, new ExtensionConfigStore(secrets), context)
    await manager.init()
    assert.equal(manager.adoptPluter('ianus', pluter('other')), false)
    assert.equal(manager.router('ianus'), undefined)
    await manager.install(await makeRouterTgz('bridge', routerJs('bridge')))
    assert.equal(manager.adoptPluter('bridge', pluter('bridge')), false, 'an installed router keeps its id')
    assert.equal(manager.isPluter('bridge'), false)
})

// ── The common ExtensionConfigStore (plans/extension-config, S2) ──────────────────────────────────────

// A router whose schema has a required field, a number with a default and a select
const strictRouterJs = (id: string) => routerJs(id).replace(
    /getConfigSchema\(\) \{[^\n]*\}/,
    `getConfigSchema() { return [{ name: 'peerUrl', label: 'Peer URL', required: true }, { name: 'retries', label: 'Retries', type: 'number', default: 3 }, { name: 'mode', label: 'Mode', type: 'select', options: ['push', 'pull'], default: 'pull' }] }`
)

test('🔴 the schema defaults reach the router at start and come back from getConfig', async () => {
    routerLog().length = 0
    const { configMaps, secrets } = fakeStore()
    const manager = new RouterManager(configMaps, new ExtensionConfigStore(secrets), context)
    await manager.init()
    await manager.install(await makeRouterTgz('strict', strictRouterJs('strict')))
    assert.equal(routerLog().at(-1), 'start:strict:{"retries":3,"mode":"pull"}', 'never configured: the defaults')
    assert.deepEqual(await manager.getConfig('strict'), { retries: 3, mode: 'pull' })
})

test('🔴 a value that does not fit the schema is refused: nothing saved, nothing applied, every field named', async () => {
    routerLog().length = 0
    const { configMaps, secrets, keys } = fakeStore()
    const manager = new RouterManager(configMaps, new ExtensionConfigStore(secrets), context)
    await manager.init()
    await manager.install(await makeRouterTgz('strict', strictRouterJs('strict')))
    const before = routerLog().length
    const errors = await manager.saveConfig('strict', { retries: 'many', mode: 'sideways' })
    assert.deepEqual(errors.map(e => e.field), ['peerUrl', 'retries', 'mode'])
    assert.equal(keys.has('kwirth-router-strict-config'), false, 'nothing saved')
    assert.equal(routerLog().length, before, 'nothing applied')
})

test('saving drops the fields the schema no longer declares, and applies the values with their defaults', async () => {
    routerLog().length = 0
    const { configMaps, secrets } = fakeStore()
    const manager = new RouterManager(configMaps, new ExtensionConfigStore(secrets), context)
    await manager.init()
    await manager.install(await makeRouterTgz('strict', strictRouterJs('strict')))
    assert.deepEqual(await manager.saveConfig('strict', { peerUrl: 'https://p', obsolete: 'x' }), [])
    assert.deepEqual(await manager.getConfig('strict'), { peerUrl: 'https://p', retries: 3, mode: 'pull' })
    assert.equal(routerLog().at(-1), 'apply:strict:{"peerUrl":"https://p","retries":3,"mode":"pull"}')
})

test('a router with no live instance has no schema: its config is saved as it comes, to be able to fix it', async () => {
    const { configMaps, secrets } = fakeStore()
    const manager = new RouterManager(configMaps, new ExtensionConfigStore(secrets), context)
    await manager.init()
    await manager.install(await makeRouterTgz('broken', 'module.exports = {}'))
    assert.deepEqual(manager.getSchema('broken'), [])
    assert.deepEqual(await manager.saveConfig('broken', { anything: 1 }), [])
    assert.deepEqual(await manager.getConfig('broken'), { anything: 1 })
})
