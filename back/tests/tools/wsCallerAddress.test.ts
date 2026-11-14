// K2: the address of each WebSocket's client, for the channels. Resolved when the socket connects, the same
// way as the login: X-Forwarded-For only from a trusted proxy.

import test from 'node:test'
import assert from 'node:assert/strict'
import { WsCallerAddresses } from '../../src/tools/WsCallerAddress'

const socket = (): WebSocket => ({}) as unknown as WebSocket

// a clock the test moves by hand
const clock = () => {
    let t = 1_000_000
    return { now: () => t, advance: (ms: number) => { t += ms } }
}

test('without a proxy in between, the client is the connection\'s address', async () => {
    const callers = new WsCallerAddresses(async () => [])
    await callers.refresh()
    const ws = socket()
    callers.remember(ws, '::ffff:10.1.2.3', undefined)
    assert.deepEqual(callers.addressOf(ws), { ip: '10.1.2.3', remoteAddress: '10.1.2.3', forwardedIgnored: false })
})

test('🔴 X-Forwarded-For from an untrusted hop is ignored, and it says so', async () => {
    const callers = new WsCallerAddresses(async () => ['10.0.0.0/8'])
    await callers.refresh()
    const ws = socket()
    callers.remember(ws, '192.168.1.1', '6.6.6.6')
    assert.deepEqual(callers.addressOf(ws), { ip: '192.168.1.1', remoteAddress: '192.168.1.1', forwardedIgnored: true })
})

test('behind a trusted proxy (an ingress), the client is the one the proxy vouches for', async () => {
    const callers = new WsCallerAddresses(async () => ['10.0.0.0/8'])
    await callers.refresh()
    const ws = socket()
    callers.remember(ws, '10.42.0.7', '203.0.113.9, 10.42.0.1')
    assert.equal(callers.addressOf(ws)?.ip, '203.0.113.9')
    assert.equal(callers.addressOf(ws)?.remoteAddress, '10.42.0.7')
})

test('each socket keeps its own address; one it never saw has none', async () => {
    const callers = new WsCallerAddresses(async () => [])
    await callers.refresh()
    const a = socket()
    const b = socket()
    callers.remember(a, '10.0.0.1', undefined)
    callers.remember(b, '10.0.0.2', undefined)
    assert.equal(callers.addressOf(a)?.ip, '10.0.0.1')
    assert.equal(callers.addressOf(b)?.ip, '10.0.0.2')
    assert.equal(callers.addressOf(socket()), undefined)
})

test('the trusted proxies are read again when they are old, and the change reaches the NEXT sockets', async () => {
    const c = clock()
    let list: string[] = []
    let reads = 0
    const callers = new WsCallerAddresses(async () => { reads++; return list }, c.now)
    await callers.refresh()
    assert.equal(reads, 1)

    callers.remember(socket(), '10.0.0.9', '1.2.3.4')     // fresh: no new read
    assert.equal(reads, 1)

    list = ['10.0.0.0/8']
    c.advance(30_000)
    const before = socket()
    callers.remember(before, '10.0.0.9', '1.2.3.4')       // stale: it reads again, in the background
    assert.equal(reads, 2)
    assert.equal(callers.addressOf(before)?.ip, '10.0.0.9', 'this one was resolved with the old list')
    await new Promise(r => setImmediate(r))
    const after = socket()
    callers.remember(after, '10.0.0.9', '1.2.3.4')
    assert.equal(callers.addressOf(after)?.ip, '1.2.3.4', 'this one, with the new list')
})

test('settings that cannot be read keep the last list known', async () => {
    let fail = false
    const c = clock()
    const callers = new WsCallerAddresses(async () => { if (fail) throw new Error('configmap unreachable'); return ['10.0.0.0/8'] }, c.now)
    await callers.refresh()
    fail = true
    c.advance(30_000)
    await callers.refresh()
    const ws = socket()
    callers.remember(ws, '10.0.0.9', '1.2.3.4')
    assert.equal(callers.addressOf(ws)?.ip, '1.2.3.4')
})
