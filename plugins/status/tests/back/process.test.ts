// The Performance tab's back end: what the snapshot says about the Kwirth process, and — above all — that
// the event-loop sampler only runs while somebody is looking. With the channel closed this plugin must not
// run a single instruction; a sampler left on would break that without any symptom.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StatusChannel } from '../../src/back/index'
import { ProcessProbe } from '../../src/back/ProcessProbe'
import { IStatusMessageResponse } from '../../src/common/StatusTypes'

interface ISent {
    messages: IStatusMessageResponse[]
}

const fakeSocket = (sent: ISent) => ({ send: (raw: string) => { sent.messages.push(JSON.parse(raw)) } }) as unknown as WebSocket
const config = (instance: string) => ({ instance }) as never
const channel = () => new StatusChannel({ name: 'c1', providers: [] } as never, {} as never)

test('🔴 the sampler is OFF until a tab opens, and OFF again when the last one goes', async () => {
    const c = channel()
    assert.equal(c.probe.watching, false, 'running with nobody looking')

    const a = fakeSocket({ messages: [] })
    const b = fakeSocket({ messages: [] })
    await c.addObject(a, config('i1'), '', '', '')
    await c.addObject(b, config('i2'), '', '', '')
    assert.equal(c.probe.watching, true)

    c.removeConnection(a)
    assert.equal(c.probe.watching, true, 'switched off while a tab is still open')
    c.stopInstance(b, config('i2'))
    assert.equal(c.probe.watching, false, 'still running after the last tab went')
})

test('cleanup() switches it off: a dev reload must not leave the old sampler running', async () => {
    const c = channel()
    await c.addObject(fakeSocket({ messages: [] }), config('i1'), '', '', '')
    assert.equal(c.probe.watching, true)
    c.cleanup()
    assert.equal(c.probe.watching, false)
})

test('the snapshot carries the process, with real figures of THIS process', async () => {
    const sent: ISent = { messages: [] }
    const c = channel()
    await c.addObject(fakeSocket(sent), config('i1'), '', '', '')
    const p = sent.messages[sent.messages.length - 1].inventory!.process!
    c.cleanup()

    assert.equal(p.pid, process.pid)
    assert.equal(p.nodeVersion, process.version)
    assert.ok(p.rssBytes > 0 && p.heapUsedBytes > 0 && p.heapTotalBytes >= p.heapUsedBytes)
    assert.ok(p.cpuUserMicros > 0, 'CPU time is cumulative since the process started')
    assert.ok(p.uptimeSeconds >= 0)
})

test('🔴 the first snapshot has NO event-loop figure: unknown, not zero', async () => {
    // The sampler has just been switched on: it has seen nothing yet, and saying 0 ms would be a claim.
    const sent: ISent = { messages: [] }
    const c = channel()
    await c.addObject(fakeSocket(sent), config('i1'), '', '', '')
    const p = sent.messages[sent.messages.length - 1].inventory!.process!
    c.cleanup()
    assert.equal(p.eventLoop, undefined)
})

test('after some time the event loop is reported, and each snapshot starts a new interval', async () => {
    const probe = new ProcessProbe()
    probe.watch(true)
    await new Promise(r => setTimeout(r, 120))
    const first = probe.sample().eventLoop
    assert.ok(first, 'nothing measured after 120 ms')
    assert.ok(first.p99Ms >= first.meanMs && first.maxMs >= first.p99Ms && first.meanMs > 0)
    // Read and reset: straight after, there is nothing new to report.
    assert.equal(probe.sample().eventLoop, undefined)
    probe.watch(false)
})

test('watch() is idempotent: switching on twice does not stack samplers', () => {
    const probe = new ProcessProbe()
    probe.watch(true)
    probe.watch(true)
    assert.equal(probe.watching, true)
    probe.watch(false)
    probe.watch(false)
    assert.equal(probe.watching, false)
})
