import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LibreClient } from '../src/back/LibreClient'
import { Poller } from '../src/back/Poller'
import {
    EGlucoseUnit, ESugarlessErrorKind, ESugarlessPayload, ISugarlessEvent
} from '../src/common/Sugarless'
import {
    connection, connectionsEmpty, isConnections, isLogin, loginOk, makeFetcher, measurement, testConfig
} from './fixtures'

/*
    Los tests llaman a tick() a mano en vez de a start(): asi no hay temporizadores de verdad y cada
    ciclo es un paso explicito.
*/

interface IHarness {
    poller: Poller
    events: ISugarlessEvent[]
}

/*
    Monta un poller cuyas lecturas sucesivas devuelven las marcas de tiempo dadas. Un null en la lista
    simula un ciclo sin lectura (glucoseMeasurement a null).
*/
const harness = (timestamps: (string | null)[], maxSamples = 10): IHarness => {
    let reads = 0
    const { fetcher } = makeFetcher(request => {
        if (isLogin(request)) return { status: 200, body: loginOk() }
        const index = Math.min(reads, timestamps.length - 1)
        reads++
        const stamp = timestamps[index]
        return {
            status: 200,
            body: {
                status: 0,
                data: [connection({
                    glucoseMeasurement: stamp === null ? null : measurement({ FactoryTimestamp: stamp })
                })]
            }
        }
    })

    const config = testConfig({ maxSamples })
    const client = new LibreClient(config, fetcher)
    const events: ISugarlessEvent[] = []
    return { poller: new Poller(config, client, event => events.push(event)), events }
}

const samplesOf = (events: ISugarlessEvent[]): ISugarlessEvent[] =>
    events.filter(e => e.payloadType === ESugarlessPayload.SAMPLE)

test('emits one sample per new reading, with the target range and the unit', async () => {
    const { poller, events } = harness(['7/4/2026 7:00:00 AM'])
    await poller.tick()

    assert.equal(events.length, 1)
    assert.equal(events[0].payloadType, ESugarlessPayload.SAMPLE)
    assert.equal(events[0].unit, EGlucoseUnit.MGDL)
    assert.equal(events[0].targetLow, 70)
    assert.equal(events[0].targetHigh, 150)
    assert.equal(events[0].sample!.timestamp, Date.UTC(2026, 6, 4, 7, 0, 0))
})

test('de-duplicates by timestamp: the same reading polled again emits nothing', async () => {
    // El sensor produce un valor cada ~15 min y se le pregunta cada minuto: la mayoria de los ciclos
    // devuelven exactamente la misma lectura.
    const { poller, events } = harness(['7/4/2026 7:00:00 AM'])

    await poller.tick()
    await poller.tick()
    await poller.tick()

    assert.equal(samplesOf(events).length, 1)
    assert.equal(poller.sampleCount(), 1)
})

test('emits again as soon as the timestamp advances', async () => {
    const { poller, events } = harness([
        '7/4/2026 7:00:00 AM',
        '7/4/2026 7:00:00 AM',
        '7/4/2026 7:15:00 AM'
    ])

    await poller.tick()
    await poller.tick()
    await poller.tick()

    const samples = samplesOf(events)
    assert.equal(samples.length, 2)
    assert.equal(samples[1].sample!.timestamp, Date.UTC(2026, 6, 4, 7, 15, 0))
    assert.equal(poller.sampleCount(), 2)
})

test('discards a reading older than the last one, which would zigzag the chart', async () => {
    const { poller, events } = harness([
        '7/4/2026 7:15:00 AM',
        '7/4/2026 7:00:00 AM'
    ])

    await poller.tick()
    await poller.tick()

    assert.equal(samplesOf(events).length, 1)
    assert.equal(poller.sampleCount(), 1)
})

test('keeps at most maxSamples, dropping the oldest', async () => {
    const { poller } = harness([
        '7/4/2026 7:00:00 AM',
        '7/4/2026 7:15:00 AM',
        '7/4/2026 7:30:00 AM',
        '7/4/2026 7:45:00 AM',
        '7/4/2026 8:00:00 AM'
    ], 3)

    for (let cycle = 0; cycle < 5; cycle++) await poller.tick()

    const snapshot = poller.snapshotEvent()
    assert.equal(snapshot.samples!.length, 3)
    // Se quedan las tres ultimas, en orden y con la mas reciente al final.
    assert.equal(snapshot.samples![0].timestamp, Date.UTC(2026, 6, 4, 7, 30, 0))
    assert.equal(snapshot.samples![2].timestamp, Date.UTC(2026, 6, 4, 8, 0, 0))
})

test('the snapshot carries the whole window plus unit and targets', async () => {
    const { poller } = harness(['7/4/2026 7:00:00 AM', '7/4/2026 7:15:00 AM'])
    await poller.tick()
    await poller.tick()

    const snapshot = poller.snapshotEvent()
    assert.equal(snapshot.payloadType, ESugarlessPayload.SNAPSHOT)
    assert.equal(snapshot.samples!.length, 2)
    assert.equal(snapshot.unit, EGlucoseUnit.MGDL)
    assert.equal(snapshot.targetLow, 70)
    assert.equal(snapshot.targetHigh, 150)
})

test('the snapshot is a copy: mutating it does not corrupt the history', async () => {
    const { poller } = harness(['7/4/2026 7:00:00 AM'])
    await poller.tick()

    poller.snapshotEvent().samples!.push({
        timestamp: 0, value: 0, trend: 3, isHigh: false, isLow: false
    })

    assert.equal(poller.snapshotEvent().samples!.length, 1)
})

test('a missing reading is reported as NO_DATA, not as an error', async () => {
    const { poller, events } = harness([null])
    await poller.tick()

    assert.equal(events.length, 1)
    assert.equal(events[0].payloadType, ESugarlessPayload.NO_DATA)
    assert.equal(events[0].errorKind, undefined)
    assert.equal(poller.sampleCount(), 0)
})

test('NO_DATA is not repeated on every cycle while nothing changes', async () => {
    const { poller, events } = harness([null])

    await poller.tick()
    await poller.tick()
    await poller.tick()

    assert.equal(events.length, 1)
    // Pero sigue disponible para contarselo a una pestaña que se abra ahora.
    assert.equal(poller.statusEvent()!.payloadType, ESugarlessPayload.NO_DATA)
})

test('a reading after a NO_DATA clears the pending status', async () => {
    const { poller, events } = harness([null, '7/4/2026 7:00:00 AM'])

    await poller.tick()
    await poller.tick()

    assert.equal(events.length, 2)
    assert.equal(events[1].payloadType, ESugarlessPayload.SAMPLE)
    assert.equal(poller.statusEvent(), undefined)
})

test('an error is reported with its kind and collapsed while it persists', async () => {
    const { fetcher } = makeFetcher(request => {
        if (isLogin(request)) return { status: 200, body: loginOk() }
        return { status: 200, body: connectionsEmpty() }
    })
    const config = testConfig()
    const events: ISugarlessEvent[] = []
    const poller = new Poller(config, new LibreClient(config, fetcher), event => events.push(event))

    await poller.tick()
    await poller.tick()

    assert.equal(events.length, 1)
    assert.equal(events[0].payloadType, ESugarlessPayload.ERROR)
    assert.equal(events[0].errorKind, ESugarlessErrorKind.NO_FOLLOWED_PATIENT)
    assert.equal(poller.statusEvent()!.errorKind, ESugarlessErrorKind.NO_FOLLOWED_PATIENT)
})

test('a cycle still in flight does not stack another one on top', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => { release = resolve })
    let reads = 0

    const { fetcher } = makeFetcher(request => {
        if (isLogin(request)) return { status: 200, body: loginOk() }
        reads++
        return { status: 200, body: connectionsEmpty() }
    })

    const config = testConfig()
    const slowClient = new LibreClient(config, async request => {
        const response = await fetcher(request)
        if (isConnections(request)) await gate
        return response
    })

    const poller = new Poller(config, slowClient, () => { /* da igual el evento aqui */ })
    const first = poller.tick()
    const second = poller.tick()   // deberia salirse sin hacer nada
    release!()
    await Promise.all([first, second])

    assert.equal(reads, 1)
})
