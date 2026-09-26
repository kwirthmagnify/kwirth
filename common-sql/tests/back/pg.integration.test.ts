import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { configure, ensureDb, getDb, ensureSchemaOnce, createDb, dropDb, dbExists, listDbs, closeDb, physicalDbName } from '../../src/back'

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
