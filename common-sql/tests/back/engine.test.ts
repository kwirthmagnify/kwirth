import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getDb, ensureSchemaOnce, physicalDbName, describeError } from '../../src/back'

// Pure-logic unit tests (no DB driver). Behaviour against a real DB (pg) lives in pg.integration.test.ts.

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

/*
    El formateo de errores. Importa porque el caso que lo motiva es justo aquel en el que MENOS
    información hay: con la base de datos caída, toda llamada falla a la vez y todas dicen lo mismo.
*/
test('describeError saca las causas de dentro de un AggregateError', () => {
    const err = new AggregateError([
        Object.assign(new Error('connect ECONNREFUSED 10.43.1.5:5432'), { code: 'ECONNREFUSED', address: '10.43.1.5', port: 5432 }),
        Object.assign(new Error('connect ECONNREFUSED ::1:5432'), { code: 'ECONNREFUSED', address: '::1', port: 5432 })
    ])
    // 🔴 Without this, String(err) is literally 'AggregateError' and says nothing whatsoever.
    assert.equal(String(err), 'AggregateError')
    assert.equal(describeError(err), 'AggregateError: ECONNREFUSED 10.43.1.5:5432 · ECONNREFUSED ::1:5432')
})

// Trying six addresses and failing at all of them is not six pieces of news, it is one.
test('describeError deduplica causas idénticas', () => {
    const one = () => Object.assign(new Error('x'), { code: 'ETIMEDOUT', address: '10.0.0.1', port: 5432 })
    assert.equal(describeError(new AggregateError([one(), one(), one()])), 'AggregateError: ETIMEDOUT 10.0.0.1:5432')
})

test('describeError con un error normal da su código y su destino', () => {
    assert.equal(describeError(Object.assign(new Error('nope'), { code: 'ECONNREFUSED', address: '127.0.0.1', port: 5433 })),
        'ECONNREFUSED 127.0.0.1:5433')
})

test('describeError cae al mensaje cuando no hay código', () => {
    assert.equal(describeError(new Error('relation "foo" does not exist')), 'relation "foo" does not exist')
})

test('describeError tolera basura sin romper', () => {
    assert.equal(describeError(undefined), 'undefined')
    assert.equal(describeError('plain string'), 'plain string')
})
