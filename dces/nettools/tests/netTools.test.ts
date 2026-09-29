// The orchestration: how many attempts, what they add up to, and the shape of an error. No network is
// opened here — the probes are a parameter — which is exactly what lets every branch be exercised.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createNetTools, normalizeCount, normalizePort, normalizeTimeout, summarize } from '../src/back/NetToolsImpl'
import { INetProbes, IProbeOutcome } from '../src/back/probes'
import { EDnsRecordType } from '../src/common/NetTools'

/** What each probe was asked, so the test can assert on the CALL and not only on the answer. */
interface ICalls {
    tcp: Array<{ target: string, port: number, timeoutMs: number }>
    resolve: Array<{ name: string, type: EDnsRecordType, servers: string[] | undefined, timeoutMs: number }>
    reverse: Array<{ address: string, servers: string[] | undefined, timeoutMs: number }>
}

/**
 * Probes with a scripted answer. `outcomes` is consumed one per attempt; when it runs out the last one
 * repeats, so a test that only cares about four identical attempts writes one.
 */
const fake = (options: {
    outcomes?: IProbeOutcome[]
    records?: string[]
    hostnames?: string[]
    throws?: Error
    clock?: number[]
} = {}): { probes: INetProbes, calls: ICalls } => {
    const calls: ICalls = { tcp: [], resolve: [], reverse: [] }
    const outcomes = options.outcomes ?? [{ ok: true, timeMs: 10 }]
    let attempt = 0
    const nextOutcome = (): IProbeOutcome => outcomes[Math.min(attempt++, outcomes.length - 1)]
    const clock = options.clock ? [...options.clock] : undefined

    const probes: INetProbes = {
        tcp: async (target, port, timeoutMs) => { calls.tcp.push({ target, port, timeoutMs }); return nextOutcome() },
        resolve: async (name, type, servers, timeoutMs) => {
            calls.resolve.push({ name, type, servers, timeoutMs })
            if (options.throws) throw options.throws
            return options.records ?? []
        },
        reverse: async (address, servers, timeoutMs) => {
            calls.reverse.push({ address, servers, timeoutMs })
            if (options.throws) throw options.throws
            return options.hostnames ?? []
        },
        now: () => clock && clock.length > 0 ? (clock.shift() as number) : 0
    }
    return { probes, calls }
}

const netTools = (options?: Parameters<typeof fake>[0]) => {
    const built = fake(options)
    return { ...built, tools: createNetTools('nettools', built.probes) }
}

/* ── normalising the options ───────────────────────────────────────────────────────────────────── */

test('the defaults are 4 attempts, 2000 ms and port 443', () => {
    assert.equal(normalizeCount(undefined), 4)
    assert.equal(normalizeTimeout(undefined), 2000)
    assert.equal(normalizePort(undefined), 443)
})

test('🔴 an option out of range is clamped, never rejected: the caller has no better answer than the limit', () => {
    assert.equal(normalizeCount(0), 1)
    assert.equal(normalizeCount(100), 10)
    assert.equal(normalizeCount(-7), 1)
    assert.equal(normalizeTimeout(1), 100)
    assert.equal(normalizeTimeout(999999), 30000)
    assert.equal(normalizePort(0), 1)
    assert.equal(normalizePort(70000), 65535)
})

test('a fractional count is truncated, and NaN or Infinity fall back to the default', () => {
    assert.equal(normalizeCount(3.9), 3)
    assert.equal(normalizeCount(NaN), 4)
    // Infinity is not 'the maximum': it is not a number of attempts at all, so it falls back like NaN.
    assert.equal(normalizeCount(Infinity), 4)
    assert.equal(normalizeCount(-Infinity), 4)
    assert.equal(normalizeTimeout(NaN), 2000)
})

/* ── the statistics ────────────────────────────────────────────────────────────────────────────── */

test('min, avg and max come only from the attempts that answered', () => {
    assert.deepEqual(summarize([
        { seq: 1, ok: true, timeMs: 10 },
        { seq: 2, ok: false, error: 'timed out after 2000 ms' },
        { seq: 3, ok: true, timeMs: 30 }
    ]), { sent: 3, received: 2, lossPercent: 33.3, minMs: 10, avgMs: 20, maxMs: 30 })
})

test('with nothing answering there are no statistics at all, and the loss is 100', () => {
    assert.deepEqual(summarize([{ seq: 1, ok: false, error: 'x' }]), { sent: 1, received: 0, lossPercent: 100 })
})

test('🔴 no attempt sent is 100% loss, not a division by zero', () => {
    assert.deepEqual(summarize([]), { sent: 0, received: 0, lossPercent: 100 })
})

test('the loss keeps one decimal, and no more', () => {
    const attempts = [1, 2, 3, 4, 5, 6, 7].map((seq, index) => ({ seq, ok: index === 0, timeMs: index === 0 ? 5 : undefined }))
    assert.equal(summarize(attempts).lossPercent, 85.7)
})

/* ── ping ──────────────────────────────────────────────────────────────────────────────────────── */

test('a default ping makes four attempts on port 443 and reports the resolved address once', async () => {
    const { tools, calls } = netTools({ outcomes: [{ ok: true, timeMs: 12.5, address: '93.184.216.34' }] })
    const result = await tools.ping('example.com')

    assert.equal(result.target, 'example.com')
    assert.equal(result.port, 443)
    assert.equal(result.address, '93.184.216.34')
    assert.equal(result.sent, 4)
    assert.equal(result.received, 4)
    assert.equal(result.lossPercent, 0)
    assert.equal(result.avgMs, 12.5)
    assert.deepEqual(result.attempts.map(attempt => attempt.seq), [1, 2, 3, 4])
    assert.equal(result.error, undefined)
    assert.deepEqual(calls.tcp, Array(4).fill({ target: 'example.com', port: 443, timeoutMs: 2000 }))
})

test('the port, the count and the timeout travel to the probe as they were asked for', async () => {
    const { tools, calls } = netTools({ outcomes: [{ ok: true, timeMs: 3, address: '127.0.0.1' }] })
    const result = await tools.ping('kwirth-postgres', { port: 5432, count: 2, timeoutMs: 500 })

    assert.equal(result.port, 5432)
    assert.equal(result.received, 2)
    assert.deepEqual(calls.tcp, Array(2).fill({ target: 'kwirth-postgres', port: 5432, timeoutMs: 500 }))
})

test('an attempt that failed carries its own reason, and the others carry their time', async () => {
    const { tools } = netTools({ outcomes: [
        { ok: true, timeMs: 8 },
        { ok: false, error: 'timed out after 2000 ms' },
        { ok: true, timeMs: 12 }
    ] })
    const result = await tools.ping('example.com', { count: 3 })

    assert.deepEqual(result.attempts, [
        { seq: 1, ok: true, timeMs: 8 },
        { seq: 2, ok: false, error: 'timed out after 2000 ms' },
        { seq: 3, ok: true, timeMs: 12 }
    ])
    assert.equal(result.lossPercent, 33.3)
    assert.equal(result.minMs, 8)
    assert.equal(result.maxMs, 12)
    // The probe as a whole did not fail: two attempts got through.
    assert.equal(result.error, undefined)
})

test('🔴 a port that answers nothing gives 100% loss with every attempt explained, and no error of its own', async () => {
    const { tools, calls } = netTools({ outcomes: [{ ok: false, error: 'connect ECONNREFUSED 10.0.0.1:443' }] })
    const result = await tools.ping('10.0.0.1', { count: 2 })

    assert.equal(calls.tcp.length, 2, 'it stopped before making every attempt')
    assert.equal(result.received, 0)
    assert.equal(result.lossPercent, 100)
    assert.equal(result.minMs, undefined)
    assert.equal(result.avgMs, undefined)
    // A host that does not answer is a reading, not a failure of the probe.
    assert.equal(result.error, undefined)
    assert.equal(result.attempts[1].error, 'connect ECONNREFUSED 10.0.0.1:443')
})

test('🔴 an invalid target opens no socket, and the reason says what was expected', async () => {
    const { tools, calls } = netTools()
    const result = await tools.ping('https://example.com')

    assert.deepEqual(calls.tcp, [])
    assert.deepEqual(result.attempts, [])
    assert.equal(result.sent, 0)
    assert.equal(result.lossPercent, 100)
    assert.equal(result.error, "Invalid target 'https://example.com': a host name or an IP address was expected")
})

test('ping never throws, whatever comes back', async () => {
    const { tools } = netTools({ outcomes: [{ ok: false, error: 'ECONNREFUSED' }] })
    await assert.doesNotReject(() => tools.ping('10.9.9.9', { count: 1 }))
})

/* ── resolve ───────────────────────────────────────────────────────────────────────────────────── */

test('resolve defaults to A against the system resolvers', async () => {
    const { tools, calls } = netTools({ records: ['93.184.216.34'], clock: [1000, 1042] })
    const result = await tools.resolve('example.com')

    assert.deepEqual(result.records, ['93.184.216.34'])
    assert.equal(result.type, EDnsRecordType.A)
    assert.equal(result.timeMs, 42)
    assert.equal(result.error, undefined)
    assert.deepEqual(calls.resolve, [{ name: 'example.com', type: EDnsRecordType.A, servers: undefined, timeoutMs: 2000 }])
})

test('the record type, the servers and the timeout travel to the probe as they were asked for', async () => {
    const { tools, calls } = netTools({ records: ['10 mail.example.com'] })
    const result = await tools.resolve('example.com', { type: EDnsRecordType.MX, servers: ['1.1.1.1', '9.9.9.9'], timeoutMs: 500 })

    assert.deepEqual(result.records, ['10 mail.example.com'])
    assert.deepEqual(calls.resolve, [{ name: 'example.com', type: EDnsRecordType.MX, servers: ['1.1.1.1', '9.9.9.9'], timeoutMs: 500 }])
})

test('🔴 an empty answer is not an error: the name resolves, it just has no record of that type', async () => {
    const { tools } = netTools({ records: [] })
    const result = await tools.resolve('example.com', { type: EDnsRecordType.AAAA })

    assert.deepEqual(result.records, [])
    assert.equal(result.error, undefined)
})

test('a resolver that throws becomes an error in the result, with the cause', async () => {
    const { tools } = netTools({ throws: new Error('queryA ENOTFOUND nope.invalid') })
    const result = await tools.resolve('nope.invalid')

    assert.deepEqual(result.records, [])
    assert.equal(result.error, 'queryA ENOTFOUND nope.invalid')
    assert.equal(result.type, EDnsRecordType.A)
})

test('an invalid name is refused before the resolver is asked', async () => {
    const { tools, calls } = netTools()
    const result = await tools.resolve('not a host')

    assert.deepEqual(calls.resolve, [])
    assert.equal(result.error, "Invalid name 'not a host': a host name was expected")
    assert.equal(result.timeMs, 0)
})

/* ── reverse ───────────────────────────────────────────────────────────────────────────────────── */

test('reverse answers the PTR names, and passes its own servers on', async () => {
    const { tools, calls } = netTools({ hostnames: ['one.example.com', 'two.example.com'], clock: [100, 115] })
    const result = await tools.reverse('93.184.216.34', { servers: ['1.1.1.1'], timeoutMs: 800 })

    assert.deepEqual(result.hostnames, ['one.example.com', 'two.example.com'])
    assert.equal(result.address, '93.184.216.34')
    assert.equal(result.timeMs, 15)
    assert.deepEqual(calls.reverse, [{ address: '93.184.216.34', servers: ['1.1.1.1'], timeoutMs: 800 }])
})

test('an address with no PTR is an error with the cause, and an empty list', async () => {
    const { tools } = netTools({ throws: new Error('getHostByAddr ENOTFOUND 10.0.0.1') })
    const result = await tools.reverse('10.0.0.1')

    assert.deepEqual(result.hostnames, [])
    assert.equal(result.error, 'getHostByAddr ENOTFOUND 10.0.0.1')
})

test('an invalid address is refused before the resolver is asked', async () => {
    const { tools, calls } = netTools()
    const result = await tools.reverse('10.0.0.1/24')

    assert.deepEqual(calls.reverse, [])
    assert.equal(result.error, "Invalid address '10.0.0.1/24': an IP address was expected")
})

/* ── the instance ──────────────────────────────────────────────────────────────────────────────── */

test('the instance carries the id the core installed it under, not the literal', () => {
    assert.equal(createNetTools('nettools-2', fake().probes).id, 'nettools-2')
})

test('🔴 two calls do not interfere: the object keeps no state between them', async () => {
    const { tools } = netTools({ outcomes: [{ ok: true, timeMs: 5 }] })
    const [first, second] = await Promise.all([tools.ping('a.example.com', { count: 2 }), tools.ping('b.example.com', { count: 2 })])

    assert.equal(first.target, 'a.example.com')
    assert.equal(second.target, 'b.example.com')
    assert.equal(first.sent, 2)
    assert.equal(second.sent, 2)
})
