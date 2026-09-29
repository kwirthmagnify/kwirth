// The sample DCE: the object it hands out, and what its back-end factory does with the host.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSample } from '../src/common/SampleDce'
import dce from '../src/back/index'
import { IDceBackHost, IDceStore } from '@kwirthmagnify/kwirth-common-back'

/** A host in memory: the factory only needs to read and write keys and to log. */
const fakeHost = (initial: Record<string, unknown> = {}): { host: IDceBackHost, store: Map<string, unknown>, logged: string[] } => {
    const store = new Map<string, unknown>(Object.entries(initial))
    const logged: string[] = []
    const memory: IDceStore = {
        read: async (name, def) => store.has(name) ? store.get(name) : def,
        write: async (name, data) => { store.set(name, data) }
    }
    const host: IDceBackHost = {
        id: 'sample',
        logger: { info: m => logged.push(String(m)), warning: m => logged.push(String(m)), error: m => logged.push(String(m)) },
        configMaps: memory,
        secrets: memory,
        libs: {}
    }
    return { host, store, logged }
}

test('the counter is shared: whoever calls next() sees the following number', () => {
    const sample = createSample('sample', 1000, 1)
    assert.equal(sample.next(), 1)
    assert.equal(sample.next(), 2)
    // A second object made from the same factory is another counter: what shares it is the ONE instance the core keeps.
    assert.equal(createSample('sample', 1000, 1).next(), 1)
})

test('greet names the DCE by its installed id', () => {
    assert.equal(createSample('sample', 0, 0).greet('kwirth'), "Hello kwirth, from DCE 'sample'")
})

test('the back-end factory counts its boots in the host configMaps and says so in the log', async () => {
    const { host, store, logged } = fakeHost()
    const first = await dce.create(host)
    assert.equal(first.boots, 1)
    assert.equal(store.get('boots'), 1)
    assert.match(logged[0], /boot #1/)
    // Next start of the core: the count survived in the host, the counter did not.
    const second = await dce.create(host)
    assert.equal(second.boots, 2)
    assert.equal(second.next(), 1)
})

test('a boots value that is not a number is treated as a first boot, not as NaN', async () => {
    const { host } = fakeHost({ boots: 'garbage' })
    assert.equal((await dce.create(host)).boots, 1)
})
