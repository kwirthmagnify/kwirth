import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ApiKeyApi } from '../../src/api/ApiKeyApi'
import { IConfigMaps } from '../../src/tools/IConfigMap'

// refreshKeys se llama desde validKey, o sea en el camino de autenticacion de CADA peticion cuya clave
// no este en la cache. Si escribiera siempre el configmap, dos peticiones concurrentes se pisarian y la
// segunda recibiria un 409 Conflict de kubernetes. Solo debe escribir cuando algo ha caducado.

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
    // el caso que producia los 409: rafagas de peticiones autenticadas concurrentes
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
