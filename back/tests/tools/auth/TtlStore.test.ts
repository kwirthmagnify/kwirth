import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TtlStore } from '../../../src/tools/auth/TtlStore'

test('put/take hace roundtrip', () => {
    const s = new TtlStore<string>(1000)
    s.put('k', 'v')
    assert.equal(s.take('k'), 'v')
})

test('take es de un solo uso (borra al leer)', () => {
    const s = new TtlStore<string>(1000)
    s.put('k', 'v')
    assert.equal(s.take('k'), 'v')
    assert.equal(s.take('k'), undefined)
})

test('take devuelve undefined si expiro (reloj inyectado)', () => {
    let now = 0
    const s = new TtlStore<string>(1000, () => now)
    s.put('k', 'v')
    now = 1500   // pasa el TTL
    assert.equal(s.take('k'), undefined)
})

test('purge elimina caducadas y deja las vigentes', () => {
    let now = 0
    const s = new TtlStore<string>(1000, () => now)
    s.put('old', 'a')
    now = 500
    s.put('new', 'b')
    now = 1200   // 'old' (createdAt 0) caduco; 'new' (createdAt 500) sigue
    s.purge()
    assert.equal(s.size, 1)
    assert.equal(s.take('new'), 'b')
})
