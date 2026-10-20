import { test } from 'node:test'
import assert from 'node:assert/strict'
import { updateIndex, withIndexLock } from '../../src/tools/IndexLock'

/*
    The read-modify-write of an extension index, done concurrently.

    🔴 THE BUG. Every manager read the index, spent several awaits downloading and writing code, and
    then wrote the list it had read. Install two extensions at once — one click after another, which is
    what anybody adding several toolsets does — and A reads [], B reads [], A writes [A], B writes [B]:
    A is gone from the index. Worse, `registerToolset` HAD run, so the live registry still held it:
    installing it again answered "already installed" while the list, which reads the index, did not
    show it. Reported on aitoolsets on 2026-10-20; all ten managers had the same shape.

    These tests drive the helper the way the managers do, with the slow part BETWEEN read and write.
*/

/** A store like ConfigMaps: a value, and a read/write that take a turn of the event loop. */
const fakeStore = (initial: { id: string }[] = []) => {
    let value = initial
    return {
        read: async () => { await new Promise(r => setImmediate(r)); return value },
        write: async (list: { id: string }[]) => { await new Promise(r => setImmediate(r)); value = list },
        get current () { return value }
    }
}

test('🔴 two installs at once: neither entry is lost', async () => {
    const store = fakeStore()
    const key = 'kwirth-test-index'

    const install = async (id: string, slowMs: number) => {
        // what every manager does: read first, THEN the slow part (download, writing the code)
        await store.read()
        await new Promise(r => setTimeout(r, slowMs))
        await updateIndex<{ id: string }>(key, store.read, store.write, (list) => {
            const at = list.findIndex(e => e.id === id)
            if (at >= 0) list[at] = { id }
            else list.push({ id })
            return list
        })
    }

    // B finishes first on purpose: the bug needed the slower one to write last
    await Promise.all([install('a', 40), install('b', 5)])

    assert.deepEqual(store.current.map(e => e.id).sort(), ['a', 'b'])
})

test('🔴 many at once, and all of them are there', async () => {
    const store = fakeStore()
    const key = 'kwirth-test-many'
    const ids = ['one', 'two', 'three', 'four', 'five', 'six']

    await Promise.all(ids.map(async (id, i) => {
        await store.read()
        await new Promise(r => setTimeout(r, (ids.length - i) * 7))
        await updateIndex<{ id: string }>(key, store.read, store.write, (list) => [...list, { id }])
    }))

    assert.deepEqual(store.current.map(e => e.id).sort(), [...ids].sort())
})

test('an uninstall racing an install removes one without losing the other', async () => {
    const store = fakeStore([{ id: 'old' }])
    const key = 'kwirth-test-mixed'

    await Promise.all([
        (async () => {
            await new Promise(r => setTimeout(r, 20))
            await updateIndex<{ id: string }>(key, store.read, store.write, (list) => [...list, { id: 'new' }])
        })(),
        updateIndex<{ id: string }>(key, store.read, store.write, (list) => list.filter(e => e.id !== 'old'))
    ])

    assert.deepEqual(store.current.map(e => e.id), ['new'])
})

test('an update in place does not duplicate the entry', async () => {
    const store = fakeStore([{ id: 'dup' }])
    const key = 'kwirth-test-dup'
    await Promise.all([0, 0].map(() => updateIndex<{ id: string }>(key, store.read, store.write, (list) => {
        const at = list.findIndex(e => e.id === 'dup')
        if (at >= 0) list[at] = { id: 'dup' }
        else list.push({ id: 'dup' })
        return list
    })))
    assert.equal(store.current.filter(e => e.id === 'dup').length, 1)
})

test('🔴 a task that throws does not block the queue, and its error reaches only its own caller', async () => {
    const store = fakeStore()
    const key = 'kwirth-test-throws'

    const boom = withIndexLock(key, async () => { throw new Error('boom') })
    const after = withIndexLock(key, async () => {
        await store.write([{ id: 'after' }])
        return 'done'
    })

    await assert.rejects(boom, /boom/)
    assert.equal(await after, 'done')
    assert.deepEqual(store.current.map(e => e.id), ['after'])
})

test('different indexes do not wait for each other', async () => {
    // one lock per key: a slow plugin install must not hold up a theme install
    const order: string[] = []
    await Promise.all([
        withIndexLock('slow', async () => { await new Promise(r => setTimeout(r, 30)); order.push('slow') }),
        withIndexLock('fast', async () => { order.push('fast') })
    ])
    assert.deepEqual(order, ['fast', 'slow'])
})
