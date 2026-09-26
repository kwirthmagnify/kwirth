import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ApiKeyApi } from '../../src/api/ApiKeyApi'
import { IConfigMaps } from '../../src/tools/IConfigMap'

// refreshKeys is called from validKey, that is, on the authentication path of EVERY request whose key is
// not in the cache. Were it always to write the configmap, two concurrent requests would collide and the
// second would get a 409 Conflict from kubernetes. It must only write when something has expired.

const key = (id: string, expire: number) => ({
    accessKey: { id, type: 'permanent', resources: 'cluster::::' },
    description: id,
    expire,
    days: 1
})

const FUTURE = Date.now() + 3600_000
const PAST = Date.now() - 3600_000

const countingConfigMaps = (initial: any[]) => {
    let stored = initial
    let writes = 0
    const cm: IConfigMaps = {
        read: (async (name: string, def?: any) => (name === 'kwirth.keys' ? stored : def)) as any,
        write: (async (name: string, data: any) => { if (name === 'kwirth.keys') { stored = data; writes++ } }) as any,
        writeKey: async () => {},
        readAllKeys: async () => ({})
    }
    return { cm, writes: () => writes, stored: () => stored }
}

test('refreshKeys NO escribe cuando no ha caducado ninguna clave', async () => {
    const store = countingConfigMaps([key('a', FUTURE), key('b', FUTURE)])
    const api = await ApiKeyApi.create(store.cm, 'masterx', false)
    await api!.refreshKeys()
    assert.equal(store.writes(), 0, 'una lectura sin caducados no debe provocar escritura')
    assert.equal(api!.apiKeys.length, 2)
})

test('refreshKeys SI escribe cuando alguna ha caducado, y la elimina', async () => {
    const store = countingConfigMaps([key('viva', FUTURE), key('caducada', PAST)])
    const api = await ApiKeyApi.create(store.cm, 'masterx', false)
    await api!.refreshKeys()
    assert.equal(store.writes(), 1, 'al purgar una caducada si hay que persistirlo')
    assert.deepEqual(store.stored().map((k: any) => k.accessKey.id), ['viva'])
    assert.deepEqual(api!.apiKeys.map(k => k.accessKey.id), ['viva'])
})

test('varios refreshKeys seguidos sin caducados no acumulan escrituras', async () => {
    // the case that produced the 409s: bursts of concurrent authenticated requests
    const store = countingConfigMaps([key('a', FUTURE)])
    const api = await ApiKeyApi.create(store.cm, 'masterx', false)
    await Promise.all([api!.refreshKeys(), api!.refreshKeys(), api!.refreshKeys(), api!.refreshKeys()])
    assert.equal(store.writes(), 0)
})

test('refreshKeys tolera un configmap vacio', async () => {
    const store = countingConfigMaps([])
    const api = await ApiKeyApi.create(store.cm, 'masterx', false)
    await api!.refreshKeys()
    assert.equal(store.writes(), 0)
    assert.deepEqual(api!.apiKeys, [])
})
