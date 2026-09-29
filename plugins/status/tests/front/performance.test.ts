// The Performance tab's arithmetic (src/front/StatusPerformance.ts): the CPU rate between two snapshots,
// the session series and its limits. The honesty rules are the point: no rate without two snapshots of the
// same process, and no line joining two different processes.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendPoint, cpuPercent, formatUptime, IProcessPoint, pointOf } from '../../src/front/StatusPerformance'
import { IStatusInventory, IStatusProcess } from '../../src/common/StatusTypes'

const MB = 1024 * 1024

const proc = (over: Partial<IStatusProcess> = {}): IStatusProcess => ({
    pid: 100, nodeVersion: 'v20', uptimeSeconds: 10,
    rssBytes: 200 * MB, heapUsedBytes: 80 * MB, heapTotalBytes: 120 * MB, externalBytes: 5 * MB,
    cpuUserMicros: 1_000_000, cpuSystemMicros: 500_000,
    ...over
})

const snap = (takenAt: number, process?: IStatusProcess): IStatusInventory =>
    ({ cluster: 'c', takenAt, components: [], edges: [], ...(process ? { process } : {}) })

test('CPU: time spent over time elapsed, as a percentage of one core', () => {
    // 10 s apart, 2.5 s of CPU spent (2 s user + 0.5 s system) -> 25 %.
    const a = snap(0, proc())
    const b = snap(10_000, proc({ cpuUserMicros: 3_000_000, cpuSystemMicros: 1_000_000 }))
    assert.equal(cpuPercent(a, b), 25)
})

test('CPU can go above 100: Node uses more than one thread, and that is the true figure', () => {
    const a = snap(0, proc())
    const b = snap(1_000, proc({ cpuUserMicros: 2_200_000, cpuSystemMicros: 800_000 }))
    assert.equal(cpuPercent(a, b), 150)
})

test('🔴 no CPU rate without a previous snapshot, across a restart, or with no time elapsed', () => {
    const b = snap(10_000, proc())
    assert.equal(cpuPercent(undefined, b), undefined)
    assert.equal(cpuPercent(snap(0, proc({ pid: 99 })), b), undefined, 'a rate across two processes')
    assert.equal(cpuPercent(snap(10_000, proc()), b), undefined, 'no time elapsed')
    assert.equal(cpuPercent(snap(0, proc({ cpuUserMicros: 9_000_000 })), b), undefined, 'the counter went backwards')
    assert.equal(cpuPercent(snap(0), b), undefined, 'the previous snapshot had no process data')
})

test('a point converts to MB and leaves unknowns out, never as zero', () => {
    const p = pointOf(undefined, snap(5, proc()))!
    assert.equal(p.rssMb, 200)
    assert.equal(p.heapUsedMb, 80)
    assert.equal(p.heapTotalMb, 120)
    assert.equal('cpuPercent' in p, false)
    assert.equal('loopP99Ms' in p, false)
})

test('a point carries the event loop when the snapshot has it', () => {
    const p = pointOf(undefined, snap(5, proc({ eventLoop: { meanMs: 1.5, p99Ms: 4, maxMs: 9 } })))!
    assert.equal(p.loopP99Ms, 4)
    assert.equal(p.loopMeanMs, 1.5)
})

test('an older back end without process data gives no point at all', () => {
    assert.equal(pointOf(undefined, snap(5)), undefined)
})

const point = (takenAt: number, pid = 100): IProcessPoint => ({ takenAt, pid, rssMb: 1, heapUsedMb: 1, heapTotalMb: 1 })

test('the series keeps at most its maximum, dropping the oldest', () => {
    let s: IProcessPoint[] = []
    for (let i = 0; i < 5; i++) s = appendPoint(s, point(i), 3)
    assert.deepEqual(s.map(p => p.takenAt), [2, 3, 4])
})

test('🔴 a new process starts a new series: no line joins two different Kwirths', () => {
    const s = appendPoint([point(1), point(2)], point(3, 200))
    assert.deepEqual(s.map(p => p.takenAt), [3])
})

test('uptime reads like a person would say it', () => {
    assert.equal(formatUptime(45), '45s')
    assert.equal(formatUptime(200), '3m 20s')
    assert.equal(formatUptime(3720), '1h 02m')
    assert.equal(formatUptime(90000), '1d 1h')
})
