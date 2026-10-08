import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveMasterKey, MASTERKEY_STORE_KEY } from '../../src/tools/MasterKey'
import { IConfigMaps } from '../../src/tools/IConfigMap'

/*
    A1/A2 of plans/auth-hardening: when MASTERKEY is not supplied the core generates one and persists it in
    the PLAIN store (configMaps), and reuses it on the next boot. An explicit MASTERKEY always wins.
*/

// A minimal in-memory configMaps: enough for read/write, the only two methods resolveMasterKey uses.
const fakeConfigMaps = (initial: Record<string, any> = {}): IConfigMaps & { store: Record<string, any> } => {
    const store: Record<string, any> = { ...initial }
    return {
        store,
        write: async (name: string, data: any) => { store[name] = data },
        read: async (name: string, def?: any) => (name in store ? store[name] : def),
        writeKey: async () => {},
        readAllKeys: async () => ({}),
        storeLimit: () => undefined
    }
}

test('an explicit MASTERKEY is used verbatim and nothing is persisted', async () => {
    const cm = fakeConfigMaps()
    const key = await resolveMasterKey('my-explicit-key', cm, true)
    assert.equal(key, 'my-explicit-key')
    assert.equal(MASTERKEY_STORE_KEY in cm.store, false)
})

test('a key already in the store is reused', async () => {
    const cm = fakeConfigMaps({ [MASTERKEY_STORE_KEY]: { value: 'persisted-key' } })
    const key = await resolveMasterKey(undefined, cm, true)
    assert.equal(key, 'persisted-key')
})

test('with nothing, a random key is generated and persisted', async () => {
    const cm = fakeConfigMaps()
    const key = await resolveMasterKey(undefined, cm, true)
    assert.match(key, /^[0-9a-f]{64}$/)                       // 32 random bytes as hex
    assert.equal(cm.store[MASTERKEY_STORE_KEY].value, key)    // persisted for next boot
})

test('the generated key is stable across restarts (reads back the same)', async () => {
    const cm = fakeConfigMaps()
    const first = await resolveMasterKey(undefined, cm, true)
    const second = await resolveMasterKey(undefined, cm, true)   // "restart": same store
    assert.equal(second, first)
})

test('a non-durable store still works (just warns); key is generated', async () => {
    const cm = fakeConfigMaps()
    const key = await resolveMasterKey(undefined, cm, false)
    assert.match(key, /^[0-9a-f]{64}$/)
})
