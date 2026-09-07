import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ConfigStore } from '../src/back/ConfigStore'
import { EAuthType, EHttpMethod, IHttpPullConfig, newHttpPullConfig } from '../src/common/HttpPullPush'

// El criterio de reparto es el mismo que usan los canales: lo que no es sensible queda en un ConfigMap
// (auditable con kubectl) y las credenciales van a un Secret. Lo que se comprueba aqui es que el reparto
// es real y que la lectura vuelve a componer la conexion completa.

interface IFakeStorage {
    plain: Map<string, any>
    secret: Map<string, any>
}

const makeStorage = () => {
    const written: IFakeStorage = { plain: new Map(), secret: new Map() }
    const storage = {
        writeStorage: async (id: string, secret: boolean, data: any) => { (secret ? written.secret : written.plain).set(id, data) },
        readStorage: async (id: string, secret: boolean) => (secret ? written.secret : written.plain).get(id),
        writeStorageCommon: async () => {},
        readStorageCommon: async () => undefined
    }
    return { storage, written }
}

const basicConfig = (): IHttpPullConfig => ({
    ...newHttpPullConfig('stocks'),
    url: 'https://api.example.com/quotes',
    method: EHttpMethod.GET,
    auth: {
        type: EAuthType.BASIC,
        username: 'kwirth',
        password: 'p@ssw0rd'
    }
})

test('saving splits credentials out of the configmap and into the secret', async () => {
    const { storage, written } = makeStorage()
    const store = new ConfigStore(storage)

    await store.save([basicConfig()])

    const plain = JSON.stringify(written.plain.get('http-pull-push-configs'))
    assert.ok(!plain.includes('p@ssw0rd'), 'the password must not reach the configmap')
    assert.ok(plain.includes('api.example.com'), 'the url does stay in the configmap')
    assert.ok(plain.includes('kwirth'), 'the username is not a secret and stays')
    assert.deepEqual(written.secret.get('http-pull-push-creds'), { stocks: { password: 'p@ssw0rd' } })
})

test('loading puts the credentials back together with their connection', async () => {
    const { storage } = makeStorage()
    const store = new ConfigStore(storage)

    await store.save([basicConfig()])
    const loaded = await store.load()

    assert.equal(loaded.length, 1)
    assert.equal(loaded[0].name, 'stocks')
    assert.equal(loaded[0].auth.username, 'kwirth')
    assert.equal(loaded[0].auth.password, 'p@ssw0rd')
    assert.equal(loaded[0].url, 'https://api.example.com/quotes')
})

test('bearer and header credentials are split too', async () => {
    const { storage, written } = makeStorage()
    const store = new ConfigStore(storage)

    await store.save([
        { ...newHttpPullConfig('news'), url: 'https://n/1', auth: { type: EAuthType.BEARER, token: 'tok-123' } },
        { ...newHttpPullConfig('rss'), url: 'https://r/1', auth: { type: EAuthType.HEADER, headerName: 'X-Api-Key', headerValue: 'key-456' } }
    ])

    const plain = JSON.stringify(written.plain.get('http-pull-push-configs'))
    assert.ok(!plain.includes('tok-123'))
    assert.ok(!plain.includes('key-456'))
    assert.ok(plain.includes('X-Api-Key'), 'the header NAME is not a secret')
    assert.deepEqual(written.secret.get('http-pull-push-creds'), {
        news: { token: 'tok-123' },
        rss: { headerValue: 'key-456' }
    })
})

test('a credential left over from a deleted connection is not resurrected', async () => {
    const { storage } = makeStorage()
    const store = new ConfigStore(storage)

    await store.save([basicConfig()])
    await store.save([{ ...newHttpPullConfig('other'), url: 'https://other/1' }])
    const loaded = await store.load()

    assert.deepEqual(loaded.map(c => c.name), ['other'])
    assert.equal(loaded[0].auth.password, undefined)
})

test('a connection with no credentials writes an empty secret, not a broken one', async () => {
    const { storage, written } = makeStorage()
    const store = new ConfigStore(storage)

    await store.save([{ ...newHttpPullConfig('open'), url: 'https://open/1' }])

    assert.deepEqual(written.secret.get('http-pull-push-creds'), {})
    assert.equal((await store.load())[0].name, 'open')
})

test('saving without injected storage fails loudly instead of losing the config', async () => {
    const store = new ConfigStore(undefined)

    assert.equal(store.available, false)
    await assert.rejects(() => store.save([basicConfig()]), /no storage available/)
    assert.deepEqual(await store.load(), [])
})
