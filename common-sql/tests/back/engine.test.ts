import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getDb, ensureSchemaOnce, physicalDbName } from '../../src/back'

// Unit de lógica pura (sin driver de BD). El comportamiento con BD real (pg) va en pg.integration.test.ts.

test('getDb before ensureDb throws', () => {
    assert.throws(() => getDb('nope'), /before ensureDb/)
})

test('ensureSchemaOnce memoizes by schemaId', async () => {
    const db = {} as never
    let calls = 0
    await ensureSchemaOnce(db, 'memo', async () => { calls++ })
    await ensureSchemaOnce(db, 'memo', async () => { calls++ })
    assert.equal(calls, 1)
})

test('ensureSchemaOnce does NOT cache a rejected promise (retries)', async () => {
    const db = {} as never
    let calls = 0
    await assert.rejects(ensureSchemaOnce(db, 'fail', async () => { calls++; throw new Error('boom') }))
    await ensureSchemaOnce(db, 'fail', async () => { calls++ })   // reintenta (no cachea rechazo)
    assert.equal(calls, 2)
})

test('physicalDbName sanitizes and prefixes', () => {
    assert.equal(physicalDbName('Agora'), 'kwirth_agora')
    assert.equal(physicalDbName('my-plugin.x'), 'kwirth_my_plugin_x')
})
