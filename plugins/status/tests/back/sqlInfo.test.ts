import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StatusChannel } from '../../src/back/index'
import { EStatusPayload, IStatusMessageResponse } from '../../src/common/StatusTypes'

/*
    The SQL info the status plugin gathers from common-sql (through the __kwirth_back__ global). What matters
    is that the connection config is read, the database list comes through, an unreachable server is reported
    as such (not a crash), and an older core without the global leaves the field absent — "unknown".
*/

interface IEnviado { mensajes: IStatusMessageResponse[] }

const socketFalso = (enviado: IEnviado) => ({
    send: (raw: string) => { enviado.mensajes.push(JSON.parse(raw)) }
}) as unknown as WebSocket

const configFalsa = (instance: string) => ({ instance }) as never

const inventarioDe = async (clusterInfo: unknown) => {
    const enviado: IEnviado = { mensajes: [] }
    const canal = new StatusChannel(clusterInfo as never, {} as never)
    await canal.addObject(socketFalso(enviado), configFalsa('i1'), '', '', '')
    const ultimo = enviado.mensajes[enviado.mensajes.length - 1]
    assert.equal(ultimo.payloadType, EStatusPayload.INVENTORY)
    return ultimo.inventory!
}

/** Saves and restores the global + the env vars the back reads, so tests do not leak. */
const conSqlGlobal = <T>(mock: { listDbs: () => Promise<string[]>, listPools: () => { consumerId: string, dbName: string, used: number, free: number, max: number }[], describeError: (err: unknown) => string }, env: Record<string, string>, fn: () => Promise<T>): Promise<T> => {
    const g = global as { __kwirth_back__?: unknown }
    const prevGlobal = g.__kwirth_back__
    const prevEnv: Record<string, string | undefined> = {}
    for (const k of Object.keys(env)) { prevEnv[k] = process.env[k]; process.env[k] = env[k] }
    g.__kwirth_back__ = { kwirthCommonSql: mock }
    return fn().finally(() => {
        g.__kwirth_back__ = prevGlobal
        for (const k of Object.keys(prevEnv)) { if (prevEnv[k] === undefined) delete process.env[k]; else process.env[k] = prevEnv[k]! }
    })
}

test('a reachable server lists its databases and the connection config', async () => {
    const inv = await conSqlGlobal(
        { listDbs: async () => ['kwirth_plugin_agora', 'kwirth_iter', 'postgres'], listPools: () => [], describeError: (e) => String(e) },
        { KWIRTH_SQL_HOST: 'db.example', KWIRTH_SQL_PORT: '6543', KWIRTH_SQL_USER: 'kwirth', KWIRTH_SQL_SSL: 'true', KWIRTH_SQL_CLIENT: 'pg', KWIRTH_SQL_MAINTDB: 'maint' },
        () => inventarioDe({ name: 'c1' })
    )
    assert.ok(inv.sql, 'the SQL field is present')
    assert.equal(inv.sql!.reachable, true)
    assert.deepEqual(inv.sql!.databases, ['kwirth_plugin_agora', 'kwirth_iter', 'postgres'])
    assert.equal(inv.sql!.host, 'db.example')
    assert.equal(inv.sql!.port, 6543)
    assert.equal(inv.sql!.user, 'kwirth')
    assert.equal(inv.sql!.ssl, true)
    assert.equal(inv.sql!.client, 'pg')
    assert.equal(inv.sql!.maintenanceDb, 'maint')
    assert.equal(inv.sql!.error, undefined)
    assert.deepEqual(inv.sql!.pools, [])
})

test('🔴 an unreachable server is reported, not a crash, and the error says what happened', async () => {
    const inv = await conSqlGlobal(
        { listDbs: async () => { throw new Error('ECONNREFUSED 127.0.0.1:5432') }, listPools: () => [], describeError: (e) => (e as Error).message },
        { KWIRTH_SQL_HOST: 'localhost' },
        () => inventarioDe({ name: 'c1' })
    )
    assert.ok(inv.sql)
    assert.equal(inv.sql!.reachable, false)
    assert.deepEqual(inv.sql!.databases, [])
    assert.equal(inv.sql!.error, 'ECONNREFUSED 127.0.0.1:5432')
})

test('connection pool stats are reported per consumer', async () => {
    const inv = await conSqlGlobal(
        { listDbs: async () => ['kwirth_plugin_agora'], listPools: () => [
            { consumerId: 'plugin:agora', dbName: 'kwirth_plugin_agora', used: 3, free: 1, max: 10 },
            { consumerId: 'iter', dbName: 'kwirth_iter', used: 0, free: 2, max: 4 }
        ], describeError: (e) => String(e) },
        {},
        () => inventarioDe({ name: 'c1' })
    )
    assert.equal(inv.sql!.pools.length, 2)
    assert.equal(inv.sql!.pools[0].consumerId, 'plugin:agora')
    assert.equal(inv.sql!.pools[0].used, 3)
    assert.equal(inv.sql!.pools[0].free, 1)
    assert.equal(inv.sql!.pools[0].max, 10)
    assert.equal(inv.sql!.pools[1].consumerId, 'iter')
})

test('🔴 an older core without the common-sql global leaves SQL absent — unknown, not "no SQL"', async () => {
    const g = global as { __kwirth_back__?: unknown }
    const prev = g.__kwirth_back__
    delete g.__kwirth_back__
    try {
        const inv = await inventarioDe({ name: 'c1' })
        assert.equal(inv.sql, undefined, 'the field is absent, not an object with zeros')
    }
    finally { g.__kwirth_back__ = prev }
})

test('defaults match the core: localhost:5432/postgres when no env is set', async () => {
    const inv = await conSqlGlobal(
        { listDbs: async () => [], listPools: () => [], describeError: (e) => String(e) },
        {},
        () => inventarioDe({ name: 'c1' })
    )
    assert.equal(inv.sql!.host, 'localhost')
    assert.equal(inv.sql!.port, 5432)
    assert.equal(inv.sql!.user, 'postgres')
    assert.equal(inv.sql!.ssl, false)
    assert.equal(inv.sql!.maintenanceDb, 'postgres')
    assert.equal(inv.sql!.client, 'pg')
})
