// Fase 1 tests for the events-provider: guard against undefined 'kinds', kind filtering in dispatch,
// and the kube-log handler (handleKubeEvent): forces kind='Event', timestamp gate and opt-in.
// Private handlers are invoked via cast (no real kubernetes watch is started).

import test from 'node:test'
import assert from 'node:assert/strict'
import { EventsProvider } from '../../src/providers/events/EventsProvider'

// The events-provider delivers processProviderEvent('events', { type, obj }) → we capture the whole payload.
class MockChannel {
    public received: Array<{ providerId: string, payload: { type: string, obj: any } }> = []
    processProviderEvent(providerId: string, payload: any) { this.received.push({ providerId, payload }) }
    getChannelData() { return { id: 'mock' } }
}

const newProvider = () => new EventsProvider({} as any, {} as any)
const subsOf = (p: any) => p.subscribers as Map<any, any>

// deterministic fixed gate: events before this date are discarded
const GATE = new Date('2020-01-01T00:00:00Z').getTime()
const OLD = '2019-06-01T00:00:00Z'
const NEW = '2021-06-01T00:00:00Z'

test('dispatch: guard de kinds undefined no crashea ni entrega (landmine montag {})', async () => {
    const p = newProvider()
    const ch = new MockChannel()
    await p.addSubscriber(ch as any, {} as any)   // kinds queda undefined
    assert.doesNotThrow(() => (p as any).dispatch('ADDED', { kind: 'Pod' }, subsOf(p)))
    assert.equal(ch.received.length, 0)
})

test('dispatch: filtra por kind del suscriptor', () => {
    const p = newProvider()
    const ch = new MockChannel()
    subsOf(p).set(ch, { kinds: ['Pod'], crdInstances: [], syncCrdInstances: false })
    ;(p as any).dispatch('ADDED', { kind: 'Pod' }, subsOf(p))
    ;(p as any).dispatch('ADDED', { kind: 'Service' }, subsOf(p))
    assert.equal(ch.received.length, 1)
    assert.equal(ch.received[0].providerId, 'events')
    assert.equal(ch.received[0].payload.type, 'ADDED')
    assert.equal(ch.received[0].payload.obj.kind, 'Pod')
})

test('handleKubeEvent: fuerza kind=Event y lo entrega al suscriptor con Event', () => {
    const p = newProvider()
    ;(p as any).eventsWatchStartTime = GATE
    const ch = new MockChannel()
    subsOf(p).set(ch, { kinds: ['Event'], crdInstances: [], syncCrdInstances: false })
    // an object from /api/v1/events may come WITHOUT kind
    ;(p as any).handleKubeEvent('ADDED', { metadata: {}, reason: 'BackOff', lastTimestamp: NEW }, subsOf(p))
    assert.equal(ch.received.length, 1)
    assert.equal(ch.received[0].payload.obj.kind, 'Event')
    assert.equal(ch.received[0].payload.obj.reason, 'BackOff')
})

test('handleKubeEvent: gate por timestamp descarta el backlog previo al watch', () => {
    const p = newProvider()
    ;(p as any).eventsWatchStartTime = GATE
    const ch = new MockChannel()
    subsOf(p).set(ch, { kinds: ['Event'], crdInstances: [], syncCrdInstances: false })
    ;(p as any).handleKubeEvent('ADDED', { metadata: {}, lastTimestamp: OLD }, subsOf(p))   // old → discarded
    assert.equal(ch.received.length, 0)
    ;(p as any).handleKubeEvent('MODIFIED', { metadata: {}, lastTimestamp: NEW }, subsOf(p)) // new → passes
    assert.equal(ch.received.length, 1)
})

test('handleKubeEvent: suscriptor sin Event no recibe log de kube', () => {
    const p = newProvider()
    ;(p as any).eventsWatchStartTime = GATE
    const ch = new MockChannel()
    subsOf(p).set(ch, { kinds: ['Pod'], crdInstances: [], syncCrdInstances: false })
    ;(p as any).handleKubeEvent('ADDED', { metadata: {}, lastTimestamp: NEW }, subsOf(p))
    assert.equal(ch.received.length, 0)
})

test('handleKubeEvent: gate usa eventTime/creationTimestamp como fallback', () => {
    const p = newProvider()
    ;(p as any).eventsWatchStartTime = GATE
    const ch = new MockChannel()
    subsOf(p).set(ch, { kinds: ['Event'], crdInstances: [], syncCrdInstances: false })
    ;(p as any).handleKubeEvent('ADDED', { metadata: { creationTimestamp: NEW }, eventTime: null }, subsOf(p))
    assert.equal(ch.received.length, 1)
})
