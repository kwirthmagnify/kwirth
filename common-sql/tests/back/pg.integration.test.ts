import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { configure, ensureDb, getDb, ensureSchemaOnce, createDb, dropDb, dbExists, listDbs, listPools, serverStats, closeDb, physicalDbName } from '../../src/back'

// Integration against the dev Postgres (port-forward svc/defender-postgres 5432).
// It skips itself unless COMMON_SQL_PG=1, so `npm test` does not break without a cluster.
const RUN = !!process.env.COMMON_SQL_PG

const server = {
    id: 'dev', name: 'dev', client: 'pg',
    host: process.env.COMMON_SQL_PG_HOST || 'localhost',
    port: Number(process.env.COMMON_SQL_PG_PORT || 5432),
    user: process.env.COMMON_SQL_PG_USER || 'defender',
    password: process.env.COMMON_SQL_PG_PASS || 'defender',
    ssl: false,
    maintenanceDb: process.env.COMMON_SQL_PG_MAINT || 'defender'
}

const CONSUMER = 'sqlit'
const DBNAME = physicalDbName(CONSUMER)   // kwirth_sqlit

after(async () => { if (RUN) { try { await dropDb(DBNAME) } catch { /* */ } await closeDb() } })

test('pg: createDb/dbExists/listDbs + ensureDb + schema + insert + tx (Defender-compat)', { skip: !RUN }, async () => {
    configure(server)
    await dropDb(DBNAME)                       // arranque limpio
    assert.equal(await dbExists(DBNAME), false)

    const db = await ensureDb(CONSUMER)        // crea kwirth_sqlit y abre pool
    assert.equal(await dbExists(DBNAME), true)
    assert.ok((await listDbs()).includes(DBNAME))

    // the synchronous getDb returns the same pool
    assert.equal(getDb(CONSUMER), db)

    await ensureSchemaOnce(db, CONSUMER, async d => {
        if (!(await d.schema.hasTable('kv'))) await d.schema.createTable('kv', x => { x.string('k'); x.integer('v') })
    })
    await db('kv').insert({ k: 'a', v: 1 })
    await db.transaction(async trx => { await trx('kv').insert({ k: 'b', v: 2 }) })
    const rows = await db<{ k: string, v: number }>('kv').orderBy('k')
    assert.equal(rows.length, 2)
    assert.equal(rows[0].v, 1)

    // createDb is idempotent (it does not fail when it already exists)
    await createDb(DBNAME)
    assert.equal(await dbExists(DBNAME), true)
})

test('🔴 pg: a pool remembers its peak, and serverStats() reads the server, the database and its tables', { skip: !RUN }, async () => {
    configure(server)
    const db = await ensureDb(CONSUMER)
    await ensureSchemaOnce(db, `${CONSUMER}-stats`, async d => {
        if (!(await d.schema.hasTable('kv'))) await d.schema.createTable('kv', x => { x.string('k'); x.integer('v') })
    })
    // Three connections in use at once: pg_sleep holds each one while the others are acquired.
    await Promise.all([1, 2, 3].map(() => db.raw('select pg_sleep(0.3)')))
    const pool = listPools().find(p => p.consumerId === CONSUMER)!
    assert.ok(pool.peak >= 3, `peak ${pool.peak} after three at once`)
    assert.ok(pool.peakAt && Date.parse(pool.peakAt) >= Date.parse(pool.openedAt), 'the peak is timed, after the pool opened')
    // Once they are back, in use goes down; the peak does not.
    assert.ok(pool.used < pool.peak)

    const s = await serverStats()
    assert.match(s.serverVersion, /^\d+/)
    assert.ok(Date.parse(s.startedAt) < Date.now())
    assert.ok(s.maxConnections > 0)
    assert.ok(s.connections.active + s.connections.idle >= 1, 'this very test is connected')
    const mine = s.databases.find(d => d.name === DBNAME)!
    assert.ok(mine, 'its own database is listed')
    assert.ok(mine.sizeBytes > 0)
    assert.ok(mine.commits > 0, 'the inserts above committed')
    const kv = mine.tables?.find(t => t.name === 'kv')
    assert.ok(kv && kv.totalBytes > 0, 'its table, with a size')
})
