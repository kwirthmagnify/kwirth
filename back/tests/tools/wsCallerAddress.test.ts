// K2: the address of each WebSocket's client, for the channels. Resolved when it is asked, with the trusted
// proxies as they are then, the same way as the login: X-Forwarded-For only from a trusted proxy.

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
    // ignored for the address, still carried as it came (to be shown: Ianus' spoke table)
    assert.deepEqual(callers.addressOf(ws), { ip: '192.168.1.1', remoteAddress: '192.168.1.1', forwardedIgnored: true, forwardedFor: '6.6.6.6' })
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

test('the trusted proxies are read again when they are old, and the change reaches the next sockets', async () => {
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
    const ws = socket()
    const first = callers.remember(ws, '10.0.0.9', '1.2.3.4')     // stale: it reads again, in the background
    assert.equal(reads, 2)
    assert.equal(first.ip, '10.0.0.9', 'answered at once, with the list it had')
    await new Promise(r => setImmediate(r))
    assert.equal(callers.addressOf(ws)?.ip, '1.2.3.4', 'and with the new one as soon as it is read')
})

test('🔴 a proxy trusted AFTER a socket connected reaches that socket too: it is resolved when asked, not when it connected', async () => {
    const c = clock()
    let list: string[] = []
    const callers = new WsCallerAddresses(async () => list, c.now)
    await callers.refresh()
    const open = socket()
    callers.remember(open, '10.0.128.207', '34.255.57.205')
    assert.deepEqual(callers.addressOf(open), { ip: '10.0.128.207', remoteAddress: '10.0.128.207', forwardedIgnored: true, forwardedFor: '34.255.57.205' })

    // the ingress is added to the trusted proxies; the socket stays open
    list = ['10.0.128.207']
    c.advance(30_000)
    callers.addressOf(open)                                 // stale: asking reads the list again
    await new Promise(r => setImmediate(r))
    assert.deepEqual(callers.addressOf(open), { ip: '34.255.57.205', remoteAddress: '10.0.128.207', forwardedIgnored: false, forwardedFor: '34.255.57.205' })
})

test('🔴 a failed read (startup: no instance yet) is not a fresh list: the next socket reads again, it does not wait 30 s with none', async () => {
    const c = clock()
    let ready = false
    let reads = 0
    const callers = new WsCallerAddresses(async () => { reads++; if (!ready) throw new Error('no active instance yet'); return ['10.0.128.207'] }, c.now)
    await callers.refresh()                                     // at startup: fails
    ready = true
    c.advance(1_000)                                            // well within 30 s
    const ws = socket()
    callers.remember(ws, '10.0.128.207', '34.255.57.205')      // reads again at once
    assert.equal(reads, 2)
    await new Promise(r => setImmediate(r))
    assert.equal(callers.addressOf(ws)?.ip, '34.255.57.205')
    // and now it is fresh: no read per question
    callers.addressOf(ws)
    assert.equal(reads, 2)
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
