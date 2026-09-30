/*
    The shared history behind the latency chart.

    It is tested without a browser because it is deliberately free of React and of the DOM: what makes
    the chart worth anything is that ONE store serves every consumer on the page, and that is a property
    of the store, not of the component drawing it.

    What is NOT here is the icon and the dialog: they need MUI and a DOM, and asserting that a function
    is a function proves nothing. Those are covered by the e2e, against a real browser.
*/

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_SAMPLES, appended, createSampleStore } from '../src/front/samples'
import { createNetToolsCore } from '../src/front/NetToolsFrontCore'
import { EDnsRecordType } from '../src/common/NetTools'
import { IDnsSample } from '../src/common/NetToolsFront'

const sample = (name: string, timeMs: number, at = 0): IDnsSample =>
    ({ at, name, type: EDnsRecordType.A, timeMs, records: 1 })

/* ── the bound ─────────────────────────────────────────────────────────────────────────────────── */

test('a sample is added at the end: the chart reads oldest first', () => {
    const one = appended([], sample('a.example.com', 10))
    assert.deepEqual(appended(one, sample('b.example.com', 20)).map(s => s.name), ['a.example.com', 'b.example.com'])
})

test('🔴 the history is bounded: a page left open for days must not grow an array for ever', () => {
    let samples: IDnsSample[] = []
    for (let i = 0; i < MAX_SAMPLES + 15; i++) samples = appended(samples, sample(`n${i}.example.com`, i))
    assert.equal(samples.length, MAX_SAMPLES)
    // The OLDEST go, not the newest: a latency chart is read from the right.
    assert.equal(samples[0].name, 'n15.example.com')
    assert.equal(samples[samples.length - 1].name, `n${MAX_SAMPLES + 14}.example.com`)
})

/* ── the store ─────────────────────────────────────────────────────────────────────────────────── */

test('what goes in comes out, with the time the DCE stamped', () => {
    const store = createSampleStore()
    store.record({ name: 'example.com', type: EDnsRecordType.MX, timeMs: 14, records: 1 }, 1000)
    assert.deepEqual(store.samples(), [{ at: 1000, name: 'example.com', type: EDnsRecordType.MX, timeMs: 14, records: 1 }])
})

test('🔴 samples() hands out a COPY: a consumer must not be able to edit what the others read', () => {
    const store = createSampleStore()
    store.record({ name: 'example.com', type: EDnsRecordType.A, timeMs: 14, records: 2 }, 1000)
    store.samples().push(sample('injected.example.com', 999))
    store.samples().splice(0, 1)
    assert.equal(store.samples().length, 1)
    assert.equal(store.samples()[0].name, 'example.com')
})

test('a listener is called on every record and on clear, and stops when it unsubscribes', () => {
    const store = createSampleStore()
    let calls = 0
    const stop = store.subscribe(() => { calls++ })

    store.record({ name: 'a.example.com', type: EDnsRecordType.A, timeMs: 5, records: 1 }, 1)
    store.record({ name: 'b.example.com', type: EDnsRecordType.A, timeMs: 6, records: 1 }, 2)
    store.clear()
    assert.equal(calls, 3)
    assert.deepEqual(store.samples(), [])

    stop()
    store.record({ name: 'c.example.com', type: EDnsRecordType.A, timeMs: 7, records: 1 }, 3)
    assert.equal(calls, 3, 'it kept calling a listener that had unsubscribed')
})

test('🔴 two listeners both hear it: that is what makes the history shared', () => {
    const store = createSampleStore()
    let first = 0
    let second = 0
    store.subscribe(() => { first++ })
    store.subscribe(() => { second++ })
    store.record({ name: 'example.com', type: EDnsRecordType.A, timeMs: 5, records: 1 }, 1)
    assert.equal(first, 1)
    assert.equal(second, 1)
})

/* ── the instance ──────────────────────────────────────────────────────────────────────────────── */

/** The instance as a consumer holds it, minus the components: `createNetToolsCore` returns both. */
const netTools = (id: string, now?: () => number) => createNetToolsCore(id, now).core

test('the instance carries the id the core installed it under, not the literal', () => {
    assert.equal(netTools('nettools-staging').id, 'nettools-staging')
})

test('🔴 the DCE stamps the time, not the consumer: two clocks would draw a line that jumps backwards', () => {
    let tick = 500
    const nettools = netTools('nettools', () => tick)
    nettools.record({ name: 'a.example.com', type: EDnsRecordType.A, timeMs: 10, records: 1 })
    tick = 900
    nettools.record({ name: 'b.example.com', type: EDnsRecordType.AAAA, timeMs: 20, records: 0 })

    assert.deepEqual(nettools.samples().map(s => s.at), [500, 900])
    assert.deepEqual(nettools.samples().map(s => s.timeMs), [10, 20])
    // Zero records is legitimate and still a round trip worth drawing.
    assert.equal(nettools.samples()[1].records, 0)
})

test('🔴 two consumers of the SAME instance write into one history', () => {
    const nettools = netTools('nettools', () => 1)
    // Whoever holds the instance is a consumer: the object is what is shared, not the code.
    const consumerA = nettools
    const consumerB = nettools
    consumerA.record({ name: 'a.example.com', type: EDnsRecordType.A, timeMs: 10, records: 1 })
    consumerB.record({ name: 'b.example.com', type: EDnsRecordType.A, timeMs: 20, records: 1 })

    assert.equal(consumerA.samples().length, 2)
    assert.deepEqual(consumerB.samples().map(s => s.name), ['a.example.com', 'b.example.com'])

    // And a second instance is a second history: that is why the core builds only one.
    assert.equal(netTools('nettools').samples().length, 0)
})

test('clear empties it for everybody', () => {
    const nettools = netTools('nettools', () => 1)
    nettools.record({ name: 'example.com', type: EDnsRecordType.A, timeMs: 10, records: 1 })
    nettools.clear()
    assert.deepEqual(nettools.samples(), [])
})
