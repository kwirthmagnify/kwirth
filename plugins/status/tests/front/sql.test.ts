// The SQL tab's arithmetic (src/front/StatusSql.ts). What is pinned: a rate needs two readings and is
// unknown otherwise — never a zero — and a counter that went backwards (a reset) gives no rate at all.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ISqlDatabaseStats, ISqlServerStats } from '@kwirthmagnify/kwirth-common-sql'
import { cacheHit, formatRate, previousOf, ratePerSecond, tablesSize, totalConnections, totalSize, uptimeOf } from '../../src/front/StatusSql'

const db = (name: string, over: Partial<ISqlDatabaseStats> = {}): ISqlDatabaseStats => ({
    name, sizeBytes: 0, connections: 0, commits: 0, rollbacks: 0, blocksRead: 0, blocksHit: 0,
    rowsRead: 0, rowsWritten: 0, deadlocks: 0, tempBytes: 0, ...over
})

const server = (databases: ISqlDatabaseStats[]): ISqlServerStats => ({
    serverVersion: '16.4', startedAt: '2026-11-01T00:00:00Z', maxConnections: 100,
    connections: { active: 2, idle: 10, idleInTransaction: 1, other: 0 }, databases
})

test('cache hit is the share read from memory; unknown when nothing was read', () => {
    assert.equal(cacheHit(db('a', { blocksHit: 99, blocksRead: 1 })), 0.99)
    assert.equal(cacheHit(db('a', { blocksHit: 0, blocksRead: 10 })), 0)
    assert.equal(cacheHit(db('a')), undefined)
})

test('🔴 a rate is the growth between two readings, per second', () => {
    assert.equal(ratePerSecond(150, 100, 10), 5)
    assert.equal(ratePerSecond(100, 100, 10), 0)
})

test('🔴 no rate without a previous reading, without time between, or when the counter went backwards', () => {
    assert.equal(ratePerSecond(150, undefined, 10), undefined)
    assert.equal(ratePerSecond(150, 100, 0), undefined)
    // Statistics reset, or the server restarted: there is nothing to divide.
    assert.equal(ratePerSecond(5, 100, 10), undefined)
})

test('the previous reading is the SAME database, or none', () => {
    const prev = server([db('kwirth_iter', { commits: 7 })])
    assert.equal(previousOf('kwirth_iter', prev)?.commits, 7)
    assert.equal(previousOf('kwirth_agora', prev), undefined)
    assert.equal(previousOf('kwirth_iter', undefined), undefined)
})

test('totals: every database\'s size, every connection whatever its state', () => {
    const s = server([db('a', { sizeBytes: 1000 }), db('b', { sizeBytes: 24 })])
    assert.equal(totalSize(s), 1024)
    assert.equal(totalConnections(s), 13)
})

test('🔴 the tables size adds up its own tables; unknown when they could not be read', () => {
    const t = (name: string, totalBytes: number) => ({ schema: 'public', name, totalBytes, rows: 0 })
    assert.equal(tablesSize(db('a', { sizeBytes: 8_000_000, tables: [t('x', 1000), t('y', 24)] })), 1024)
    assert.equal(tablesSize(db('a', { tables: [] })), 0)
    assert.equal(tablesSize(db('a')), undefined)
})

test('uptime reads as people read it', () => {
    const start = '2026-11-01T00:00:00Z'
    const at = (iso: string) => Date.parse(iso)
    assert.equal(uptimeOf(start, at('2026-11-01T00:45:00Z')), '45m')
    assert.equal(uptimeOf(start, at('2026-11-01T03:12:00Z')), '3h 12m')
    assert.equal(uptimeOf(start, at('2026-11-03T04:00:00Z')), '2d 4h')
    // A clock behind the server's: never a negative uptime.
    assert.equal(uptimeOf(start, at('2026-10-31T00:00:00Z')), '0m')
})

test('rates: a dash when unknown, two decimals under one, whole above', () => {
    assert.equal(formatRate(undefined), '—')
    assert.equal(formatRate(0), '0/s')
    assert.equal(formatRate(0.256), '0.26/s')
    assert.equal(formatRate(41.6), '42/s')
})
