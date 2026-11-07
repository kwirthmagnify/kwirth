import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countConnections, freshTables, IPoolPeak, notePeak, TABLES_TTL_MS } from '../../src/back'

// The pieces behind serverStats() and the pools' peak that do not need a server.

test('🔴 the peak only grows, and says when', () => {
    const p: IPoolPeak = { peak: 0, openedAt: '2026-11-07T10:00:00.000Z' }
    notePeak(p, 3, new Date('2026-11-07T10:01:00Z'))
    assert.deepEqual([p.peak, p.peakAt], [3, '2026-11-07T10:01:00.000Z'])
    // Fewer in use later does not lower it, nor move its time.
    notePeak(p, 1, new Date('2026-11-07T10:02:00Z'))
    assert.deepEqual([p.peak, p.peakAt], [3, '2026-11-07T10:01:00.000Z'])
    // The same number again is not a new peak either.
    notePeak(p, 3, new Date('2026-11-07T10:03:00Z'))
    assert.equal(p.peakAt, '2026-11-07T10:01:00.000Z')
    notePeak(p, 7, new Date('2026-11-07T10:04:00Z'))
    assert.deepEqual([p.peak, p.peakAt], [7, '2026-11-07T10:04:00.000Z'])
})

test('a pool that never lent a connection has a peak of 0 and no time', () => {
    const p: IPoolPeak = { peak: 0, openedAt: 'x' }
    notePeak(p, 0, new Date())
    assert.equal(p.peak, 0)
    assert.equal('peakAt' in p, false)
})

test('🔴 a table list is reused for TABLES_TTL_MS, then read again', () => {
    const cached = { at: 1000, tables: [] }
    assert.equal(freshTables(cached, 1000 + TABLES_TTL_MS - 1), cached)
    assert.equal(freshTables(cached, 1000 + TABLES_TTL_MS), undefined)
    assert.equal(freshTables(undefined, 1000), undefined)
    // A failed read is cached too (tables undefined): a database that refuses is not retried every snapshot.
    const failed = { at: 1000 }
    assert.equal(freshTables(failed, 1500), failed)
})

test('connections are grouped into the four states the tab shows, counts as numbers', () => {
    assert.deepEqual(countConnections([
        { state: 'active', n: '2' },
        { state: 'idle', n: 5 },
        { state: 'idle in transaction', n: '1' },
        { state: 'idle in transaction (aborted)', n: '1' },
        { state: 'fastpath function call', n: '1' },
        { state: null, n: '3' }
    ]), { active: 2, idle: 5, idleInTransaction: 2, other: 4 })
    assert.deepEqual(countConnections([]), { active: 0, idle: 0, idleInTransaction: 0, other: 0 })
})
