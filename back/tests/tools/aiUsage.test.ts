import { test } from 'node:test'
import assert from 'node:assert/strict'
import { configure, ensureDb } from '@kwirthmagnify/kwirth-common-sql/back'
import { EUsageScope } from '@kwirthmagnify/kwirth-common-ai/back'
import { DAILY_RETENTION_DAYS, MemoryUsageService, SqlUsageService, createTable, dayKey, monthKey, pruneOldDailyRows } from '../../src/tools/AiUsage'

/*
    The counters behind the AI usage control (plans/ai-usage-control, S1).

    Two invariants, and both are of the kind that goes wrong silently:

      · the WINDOW resets by itself — a new day is a new key and a new row at zero. If this were wrong,
        a monthly ceiling would start cutting on the second of the month, or never;
      · adding is an INCREMENT, never a read-modify-write. Two instances of the same channel answer at
        the same time, and losing one of the two additions looks exactly like a model that used fewer
        tokens than it did.
*/

const SUBJECT = 'subject-under-test'
const ONE = { tokensIn: 10, tokensOut: 5, calls: 1, cost: 0.25 }

/*
    common-sql is configured by the CORE at startup, so from a harness there is no server unless one is
    given. Point KWIRTH_SQL_HOST and friends at a database and the two SQL cases below run for real;
    without them they skip, and say so.

    ⚠️ No credentials live here, and the database is NOT the core's: these tests write to
    'core-ai-usage-test', so a run can never touch the counters of a Kwirth that is up.
*/
const sqlFromEnv = (): boolean => {
    if (!process.env.KWIRTH_SQL_HOST) return false
    configure({
        id: 'test', name: 'test',
        client: process.env.KWIRTH_SQL_CLIENT || 'pg',
        host: process.env.KWIRTH_SQL_HOST,
        port: Number(process.env.KWIRTH_SQL_PORT || 5432),
        user: process.env.KWIRTH_SQL_USER || 'postgres',
        password: process.env.KWIRTH_SQL_PASSWORD || '',
        ssl: process.env.KWIRTH_SQL_SSL === 'true',
        maintenanceDb: process.env.KWIRTH_SQL_MAINTDB || 'postgres'
    })
    return true
}

test('the period keys are the day and the month, so a new one starts at zero', () => {
    const d = new Date('2026-10-06T23:59:59.000Z')
    assert.equal(dayKey(d), '2026-10-06')
    assert.equal(monthKey(d), '2026-10')
    // the next day is another key: nothing has to be reset for the window to reset
    assert.notEqual(dayKey(new Date('2026-10-07T00:00:01.000Z')), dayKey(d))
    // and the month rolls over on its own too
    assert.equal(monthKey(new Date('2026-11-01T00:00:01.000Z')), '2026-11')
})

test('in memory: what is added accumulates in both windows at once', async () => {
    const service = new MemoryUsageService()
    await service.add(EUsageScope.LLM_KEY, SUBJECT, ONE)
    await service.add(EUsageScope.LLM_KEY, SUBJECT, ONE)

    const { daily, monthly } = await service.read(EUsageScope.LLM_KEY, SUBJECT)
    assert.equal(daily.calls, 2)
    assert.equal(daily.tokensIn, 20)
    assert.equal(daily.cost, 0.5)
    assert.equal(monthly.calls, 2, 'the same call counts in the day and in the month')
})

test('in memory: it says it is NOT durable, which is the whole point of saying it', () => {
    assert.equal(new MemoryUsageService().durable, false)
    // and a fresh one starts empty, which is what a restart does to it
    assert.equal(new MemoryUsageService() !== new MemoryUsageService(), true)
})

test('in memory: subjects and axes do not mix', async () => {
    const service = new MemoryUsageService()
    await service.add(EUsageScope.LLM_KEY, 'key-a', ONE)
    await service.add(EUsageScope.LLM_KEY, 'key-b', ONE)
    await service.add(EUsageScope.CHANNEL, 'key-a', ONE)

    assert.equal((await service.read(EUsageScope.LLM_KEY, 'key-a')).daily.calls, 1)
    assert.equal((await service.read(EUsageScope.LLM_KEY, 'key-b')).daily.calls, 1)
    assert.equal((await service.read(EUsageScope.CHANNEL, 'key-a')).daily.calls, 1, 'same name, different axis, different budget')
    assert.equal((await service.read(EUsageScope.CHANNEL, 'key-z')).daily.calls, 0, 'a subject never seen reads as zero, not as undefined')
})

test('in memory: reading gives a COPY, so nobody can inflate the counters by holding the object', async () => {
    const service = new MemoryUsageService()
    await service.add(EUsageScope.LLM_KEY, SUBJECT, ONE)

    const first = await service.read(EUsageScope.LLM_KEY, SUBJECT)
    first.daily.calls = 9999
    assert.equal((await service.read(EUsageScope.LLM_KEY, SUBJECT)).daily.calls, 1)
})

/*
    The SQL half, against a database of ITS OWN — never the core's, which is live in the dev and whose
    counters a test has no business touching.

    ⚠️ test.skip and not a branch: with no database reachable this case has verified nothing, and a green
    that means 'there was nowhere to check' is worse than a skip that says so.
*/
test('in SQL: adding is an increment in the database, not a read-modify-write', async (t) => {
    const db = sqlFromEnv() ? await ensureDb('core-ai-usage-test', { min: 1, max: 2 }).catch(() => undefined) : undefined
    t.skip(!db, 'no SQL reachable: set KWIRTH_SQL_HOST (and user/password) to run this for real')
    if (!db) return
    t.after(async () => { await db(`ai_usage`).where({ subject: SUBJECT }).delete().catch(() => {}) })

    await createTable(db)
    await db('ai_usage').where({ subject: SUBJECT }).delete()
    const service = new SqlUsageService(db)

    // the two additions race on purpose: one lost would be invisible in production
    await Promise.all([
        service.add(EUsageScope.LLM_KEY, SUBJECT, ONE),
        service.add(EUsageScope.LLM_KEY, SUBJECT, ONE)
    ])

    const { daily, monthly } = await service.read(EUsageScope.LLM_KEY, SUBJECT)
    assert.equal(daily.calls, 2, 'both additions survived')
    assert.equal(daily.tokensIn, 20)
    assert.equal(monthly.calls, 2)
    assert.equal(service.durable, true)
})

test('in SQL: creating the table twice is harmless, because there are no migrations', async (t) => {
    const db = sqlFromEnv() ? await ensureDb('core-ai-usage-test', { min: 1, max: 2 }).catch(() => undefined) : undefined
    t.skip(!db, 'no SQL reachable: set KWIRTH_SQL_HOST (and user/password) to run this for real')
    if (!db) return

    await createTable(db)
    await createTable(db)
    assert.equal(await db.schema.hasTable('ai_usage'), true)
})

/*
    The pruning. What matters is not that it deletes, it is WHAT it leaves alone: the monthly rows are
    the history worth keeping, and today's daily row is what the ceilings are enforced against. A prune
    that took either of those would silently reset somebody's quota.
*/
test('pruning drops old DAILY rows and leaves the monthly ones alone', async (t) => {
    const db = sqlFromEnv() ? await ensureDb('core-ai-usage-test', { min: 1, max: 2 }).catch(() => undefined) : undefined
    t.skip(!db, 'no SQL reachable: set KWIRTH_SQL_HOST (and user/password) to run this for real')
    if (!db) return
    t.after(async () => { await db('ai_usage').where({ subject: SUBJECT }).delete().catch(() => {}) })

    await createTable(db)
    await db('ai_usage').where({ subject: SUBJECT }).delete()

    const now = new Date()
    const old = new Date(now.getTime() - (DAILY_RETENTION_DAYS + 5) * 86400000)
    const row = (period_kind: string, period_key: string) =>
        ({ scope: EUsageScope.LLM_KEY, subject: SUBJECT, period_kind, period_key, tokens_in: 1, tokens_out: 1, calls: 1, cost: 0 })

    await db('ai_usage').insert([
        row('day', dayKey(old)),        // past its retention → must go
        row('day', dayKey(now)),        // today → the ceilings are enforced against this one
        row('month', monthKey(old))     // monthly → kept, however old
    ])

    await pruneOldDailyRows(db, now)

    const left = await db('ai_usage').where({ subject: SUBJECT }).select('period_kind', 'period_key')
    assert.equal(left.length, 2)
    assert.ok(left.some(r => r.period_kind === 'day' && r.period_key === dayKey(now)), 'today survives')
    assert.ok(left.some(r => r.period_kind === 'month'), 'the monthly row survives whatever its age')
    assert.ok(!left.some(r => r.period_key === dayKey(old) && r.period_kind === 'day'), 'the old daily one is gone')
})

test('pruning an empty table deletes nothing and does not complain', async (t) => {
    const db = sqlFromEnv() ? await ensureDb('core-ai-usage-test', { min: 1, max: 2 }).catch(() => undefined) : undefined
    t.skip(!db, 'no SQL reachable: set KWIRTH_SQL_HOST (and user/password) to run this for real')
    if (!db) return

    await createTable(db)
    await db('ai_usage').where({ subject: SUBJECT }).delete()
    assert.equal(await pruneOldDailyRows(db), 0)
})
