import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildProviderStorage } from '../../src/tools/ProviderStorage'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { ISecrets } from '../../src/tools/ISecrets'

// Persistencia inyectada a los providers. Es la contraparte de lo que los canales reciben via
// IBackChannelObject: un provider decide EN CODIGO que va a un Secret (credenciales) y que va a un
// ConfigMap (el resto). Lo que se comprueba aqui es el contrato que el provider da por supuesto:
//   - el destino real segun el booleano 'secret'
//   - los espacios de nombres, que NO deben pisar los del canal ni la config gestionada por el core
//   - el round-trip de valores (incluido el base64 del Secret)

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
    // el valor en claro no debe quedar en el propio campo almacenado
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
    // 'kwirth-store-channel-<id>' lo usan los canales; 'kwirth-provider-<id>-config' es la config que
    // gestiona el core (deprecada). Ninguno de los dos debe verse afectado.
    assert.notEqual(key, 'kwirth-store-channel-syslog')
    assert.notEqual(key, 'kwirth-provider-syslog-config')
})
