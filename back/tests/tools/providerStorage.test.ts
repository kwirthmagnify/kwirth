import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildProviderStorage } from '../../src/tools/ProviderStorage'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { ISecrets } from '../../src/tools/ISecrets'

// Persistence injected into providers. It is the counterpart of what channels receive through
// IBackChannelObject: a provider decides IN CODE what goes to a Secret (credentials) and what goes to a
// ConfigMap (the rest). What is checked here is the contract the provider takes for granted:
//   - the real destination according to the 'secret' boolean
//   - the namespaces, which must NOT overwrite the channel's nor the core-managed config's
//   - the round trip of values (including the Secret's base64)

interface IStore {
    configMaps: Map<string, any>
    secrets: Map<string, any>
}

const makeStorage = () => {
    const store: IStore = { configMaps: new Map(), secrets: new Map() }
    const configMaps: IConfigMaps = {
        write: async (name: string, data: any) => { store.configMaps.set(name, data) },
        read: async (name: string, defaultValue?: any) => store.configMaps.has(name) ? store.configMaps.get(name) : defaultValue,
        writeKey: async () => {},
        readAllKeys: async () => ({})
    }
    const secrets: ISecrets = {
        write: async (name: string, content: {}) => { store.secrets.set(name, content) },
        read: async (name: string, defaultValue?: any) => store.secrets.has(name) ? store.secrets.get(name) : defaultValue,
        writeKey: async () => {},
        readAllKeys: async () => ({})
    }
    return { storage: buildProviderStorage(configMaps, secrets), store }
}

test('writeStorage with secret=false lands on a ConfigMap, under the provider namespace', async () => {
    const { storage, store } = makeStorage()

    await storage.writeStorage('http-pull-push-configs', false, [{ name: 'rss', enabled: true }])

    assert.deepEqual([...store.configMaps.keys()], ['kwirth-store-provider-http-pull-push-configs'])
    assert.equal(store.secrets.size, 0)
    assert.deepEqual(JSON.parse(store.configMaps.get('kwirth-store-provider-http-pull-push-configs')), [{ name: 'rss', enabled: true }])
})

test('writeStorage with secret=true lands on a Secret, base64 encoded', async () => {
    const { storage, store } = makeStorage()

    await storage.writeStorage('http-pull-push-creds', true, { rss: { token: 's3cr3t' } })

    assert.equal(store.configMaps.size, 0)
    const written = store.secrets.get('kwirth-store-provider-http-pull-push-creds')
    assert.ok(written, 'the secret must exist')
    const decoded = JSON.parse(Buffer.from(written.data, 'base64').toString('utf8'))
    assert.deepEqual(decoded, { rss: { token: 's3cr3t' } })
    // the plain value must not remain in the stored field itself
    assert.ok(!written.data.includes('s3cr3t'))
})

test('readStorage round-trips values in both modes', async () => {
    const { storage } = makeStorage()

    await storage.writeStorage('cfg', false, { interval: 60, urls: ['a', 'b'] })
    await storage.writeStorage('creds', true, { user: 'kwirth', password: 'p@ss' })

    assert.deepEqual(await storage.readStorage('cfg', false), { interval: 60, urls: ['a', 'b'] })
    assert.deepEqual(await storage.readStorage('creds', true), { user: 'kwirth', password: 'p@ss' })
})

test('readStorage returns undefined when nothing was written', async () => {
    const { storage } = makeStorage()

    assert.equal(await storage.readStorage('missing', false), undefined)
    assert.equal(await storage.readStorage('missing', true), undefined)
})

test('a secret is not readable as a configmap and viceversa', async () => {
    const { storage } = makeStorage()

    await storage.writeStorage('same-id', true, { kind: 'secret' })

    assert.equal(await storage.readStorage('same-id', false), undefined)
    assert.deepEqual(await storage.readStorage('same-id', true), { kind: 'secret' })
})

test('the Common variants use the shared namespace, not the provider one', async () => {
    const { storage, store } = makeStorage()

    await storage.writeStorageCommon('llms', false, [{ id: 'gpt' }])
    await storage.writeStorageCommon('llmproviders', true, [{ apiKey: 'abc' }])

    assert.ok(store.configMaps.has('kwirth-store-common-llms'))
    assert.ok(store.secrets.has('kwirth-store-common-llmproviders'))
    assert.deepEqual(await storage.readStorageCommon('llms', false), [{ id: 'gpt' }])
    assert.deepEqual(await storage.readStorageCommon('llmproviders', true), [{ apiKey: 'abc' }])
})

test('provider and common namespaces do not collide for the same id', async () => {
    const { storage } = makeStorage()

    await storage.writeStorage('shared-id', false, { scope: 'provider' })
    await storage.writeStorageCommon('shared-id', false, { scope: 'common' })

    assert.deepEqual(await storage.readStorage('shared-id', false), { scope: 'provider' })
    assert.deepEqual(await storage.readStorageCommon('shared-id', false), { scope: 'common' })
})

test('the provider namespace does not collide with the channel one nor with the core-managed provider config', async () => {
    const { storage, store } = makeStorage()

    await storage.writeStorage('syslog', false, { port: 514 })

    const key = [...store.configMaps.keys()][0]
    assert.equal(key, 'kwirth-store-provider-syslog')
    // 'kwirth-store-channel-<id>' is used by channels; 'kwirth-provider-<id>-config' is the core-managed
    // config (deprecated). Neither of the two must be affected.
    assert.notEqual(key, 'kwirth-store-channel-syslog')
    assert.notEqual(key, 'kwirth-provider-syslog-config')
})
