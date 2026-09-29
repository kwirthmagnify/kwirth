// The DCE's factory: what the core gets when it calls create() once, and what it wrote in the log.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import dce from '../src/back/index'
import { IDceBackHost, IDceStore } from '@kwirthmagnify/kwirth-common-back'

/** A host in memory: the factory only needs its id and its logger. */
const fakeHost = (id = 'nettools'): { host: IDceBackHost, logged: string[] } => {
    const store = new Map<string, unknown>()
    const logged: string[] = []
    const memory: IDceStore = {
        read: async (name, def) => store.has(name) ? store.get(name) : def,
        write: async (name, data) => { store.set(name, data) }
    }
    const host: IDceBackHost = {
        id,
        logger: { info: m => logged.push(String(m)), warning: m => logged.push(String(m)), error: m => logged.push(String(m)) },
        configMaps: memory,
        secrets: memory,
        libs: {}
    }
    return { host, logged }
}

test('the factory returns the three tools and says it spawns nothing', async () => {
    const { host, logged } = fakeHost()
    const tools = await dce.create(host)

    assert.equal(tools.id, 'nettools')
    assert.equal(typeof tools.ping, 'function')
    assert.equal(typeof tools.resolve, 'function')
    assert.equal(typeof tools.reverse, 'function')
    assert.equal(logged[0], 'nettools created: tcp reachability and dns through node, no binary is spawned')
})

test('🔴 the instance takes the id the core installed it under, not the literal in the code', async () => {
    const { host } = fakeHost('nettools-staging')
    assert.equal((await dce.create(host)).id, 'nettools-staging')
})

test('🔴 it persists nothing: a DCE with no configuration must not touch the host stores', async () => {
    const { host } = fakeHost()
    let written = 0
    host.configMaps.write = async () => { written++ }
    host.secrets.write = async () => { written++ }
    await dce.create(host)
    assert.equal(written, 0)
})

test('the real instance still refuses an invalid target, without opening anything', async () => {
    const { host } = fakeHost()
    const tools = await dce.create(host)
    const result = await tools.ping('http://example.com')

    assert.deepEqual(result.attempts, [])
    assert.equal(result.sent, 0)
    assert.equal(result.lossPercent, 100)
    assert.equal(result.error, "Invalid target 'http://example.com': a host name or an IP address was expected")
})

test('🔴 the real instance resolves against a loopback that answers nothing, and reports it as a reading', async () => {
    const { host } = fakeHost()
    const tools = await dce.create(host)
    // Port 1 on loopback: refused right away on every platform, so the assertion is about the SHAPE.
    const result = await tools.ping('127.0.0.1', { port: 1, count: 1, timeoutMs: 500 })

    assert.equal(result.port, 1)
    assert.equal(result.sent, 1)
    assert.equal(result.received, 0)
    assert.equal(result.lossPercent, 100)
    assert.equal(result.error, undefined, 'a port that refuses is a reading, not a failure of the probe')
    assert.ok(result.attempts[0].error, 'the attempt says nothing about why it failed')
})
