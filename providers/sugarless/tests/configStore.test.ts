import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IProviderStorage } from '@kwirthmagnify/kwirth-common-back'
import { ConfigStore } from '../src/back/ConfigStore'
import {
    DEFAULT_CLIENT_VERSION, DEFAULT_INTERVAL_SECONDS, DEFAULT_MAX_SAMPLES, ISugarlessConfig
} from '../src/common/Sugarless'
import { testConfig } from './fixtures'

/*
    Almacenamiento de mentira que distingue las dos mitades, que es justo lo que hay que verificar:
    la contraseña tiene que acabar en la mitad 'secret' y NO en la otra. Si se colara en el ConfigMap
    quedaria en claro y legible con kubectl, que es el fallo que motiva que este provider tenga su
    propio ConfigStore en vez de usar el schema generico del core.
*/
interface IFakeStorage {
    storage: IProviderStorage
    configMaps: Map<string, unknown>
    secrets: Map<string, unknown>
}

const fakeStorage = (): IFakeStorage => {
    const configMaps = new Map<string, unknown>()
    const secrets = new Map<string, unknown>()

    const storage: IProviderStorage = {
        writeStorage: async (id: string, secret: boolean, data: unknown) => {
            (secret ? secrets : configMaps).set(id, data)
        },
        readStorage: async (id: string, secret: boolean) => (secret ? secrets : configMaps).get(id),
        writeStorageCommon: async () => { /* no lo usa este provider */ },
        readStorageCommon: async () => undefined
    }

    return { storage, configMaps, secrets }
}

test('the password goes to the Secret half and never to the ConfigMap half', async () => {
    const { storage, configMaps, secrets } = fakeStorage()
    await new ConfigStore(storage).save(testConfig({ password: 'top-secret' }))

    const stored = configMaps.get('sugarless-config') as Record<string, unknown>
    assert.ok(stored)
    assert.equal('password' in stored, false)
    assert.equal(JSON.stringify(stored).includes('top-secret'), false)

    assert.deepEqual(secrets.get('sugarless-creds'), { password: 'top-secret' })
})

test('the auditable fields do stay in the ConfigMap half', async () => {
    const { storage, configMaps } = fakeStorage()
    await new ConfigStore(storage).save(testConfig({
        email: 'follower@example.com',
        region: 'eu',
        intervalSeconds: 90,
        maxSamples: 500,
        clientVersion: '4.16.0'
    }))

    // El email se queda aqui a proposito: hay que poder auditar que cuenta se esta consultando.
    assert.deepEqual(configMaps.get('sugarless-config'), {
        email: 'follower@example.com',
        region: 'eu',
        intervalSeconds: 90,
        maxSamples: 500,
        clientVersion: '4.16.0'
    })
})

test('load puts the two halves back together', async () => {
    const { storage } = fakeStorage()
    const store = new ConfigStore(storage)
    const original = testConfig({ email: 'a@b.com', password: 'pw', region: 'eu', intervalSeconds: 120 })

    await store.save(original)
    const loaded = await store.load()

    assert.deepEqual(loaded, original)
})

test('load returns the defaults when nothing has been saved yet', async () => {
    const { storage } = fakeStorage()
    const loaded = await new ConfigStore(storage).load()

    assert.equal(loaded.email, '')
    assert.equal(loaded.password, '')
    assert.equal(loaded.region, '')
    assert.equal(loaded.intervalSeconds, DEFAULT_INTERVAL_SECONDS)
    assert.equal(loaded.maxSamples, DEFAULT_MAX_SAMPLES)
    assert.equal(loaded.clientVersion, DEFAULT_CLIENT_VERSION)
})

test('a field missing from an older stored config comes back with its default', async () => {
    const { storage, configMaps } = fakeStorage()
    // Configuracion guardada por una version anterior, sin clientVersion ni maxSamples.
    configMaps.set('sugarless-config', { email: 'a@b.com', region: 'eu', intervalSeconds: 60 })

    const loaded = await new ConfigStore(storage).load()

    assert.equal(loaded.email, 'a@b.com')
    assert.equal(loaded.clientVersion, DEFAULT_CLIENT_VERSION)
    assert.equal(loaded.maxSamples, DEFAULT_MAX_SAMPLES)
})

test('saving without a password leaves the Secret half empty instead of stale', async () => {
    const { storage, secrets } = fakeStorage()
    const store = new ConfigStore(storage)

    await store.save(testConfig({ password: 'pw' }))
    await store.save(testConfig({ password: '' }))

    assert.deepEqual(secrets.get('sugarless-creds'), {})
    assert.equal((await store.load()).password, '')
})

test('without storage it reports itself unavailable, loads defaults and refuses to save', async () => {
    const store = new ConfigStore(undefined)

    assert.equal(store.available, false)
    assert.equal((await store.load()).email, '')
    await assert.rejects(() => store.save(testConfig()), /no storage available/)
})

test('the stored public half is exactly the config minus the password', async () => {
    const { storage, configMaps } = fakeStorage()
    const config: ISugarlessConfig = testConfig({ password: 'pw' })
    await new ConfigStore(storage).save(config)

    const stored = configMaps.get('sugarless-config') as Record<string, unknown>
    const expectedKeys = Object.keys(config).filter(k => k !== 'password').sort()
    assert.deepEqual(Object.keys(stored).sort(), expectedKeys)
})
