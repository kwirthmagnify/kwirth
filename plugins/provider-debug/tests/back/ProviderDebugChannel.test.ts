import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { EInstanceMessageAction, IBackChannelObject, IInstanceConfig } from '@kwirthmagnify/kwirth-common-back'
import ProviderDebugChannel from '../../src/back/index'
import { EProviderDebugPayload } from '../../src/common/ProviderDebugTypes'
import { FakeProvider, MockWs, instanceConfigFor, makeBackObj, makeClusterInfo } from '../helpers'

const makeChannel = (providers: FakeProvider[]) => {
    const { obj } = makeBackObj()
    const channel = new ProviderDebugChannel(makeClusterInfo(providers), obj as unknown as IBackChannelObject)
    return channel
}

const start = async (channel: ProviderDebugChannel, ws: MockWs, instance: string, providerId: string, subscriptionData = '') => {
    const config = instanceConfigFor(instance, providerId, subscriptionData) as unknown as IInstanceConfig
    await channel.addObject(ws as unknown as WebSocket, config, '*all', '*all', '*all')
    return config
}

describe('provider catalogue', () => {
    test('addObject sends the ids and router flags of the running providers', async () => {
        const channel = makeChannel([new FakeProvider('events'), new FakeProvider('syslog', true)])
        const ws = new MockWs()
        await start(channel, ws, 'i1', '')

        const catalogue = ws.providersCatalogue()
        assert.deepEqual(catalogue, [
            { id: 'events', providesRouter: false },
            { id: 'syslog', providesRouter: true }
        ])
    })

    test('the catalogue is sent even when no provider was chosen, and nothing is subscribed', async () => {
        const events = new FakeProvider('events')
        const channel = makeChannel([events])
        const ws = new MockWs()
        await start(channel, ws, 'i1', '')

        assert.equal(ws.providersCatalogue()?.length, 1)
        assert.equal(events.subscribers.size, 0)
        assert.equal(ws.events().length, 0)
    })

    test('an empty cluster reports an empty catalogue instead of failing', async () => {
        const channel = makeChannel([])
        const ws = new MockWs()
        await start(channel, ws, 'i1', '')

        assert.deepEqual(ws.providersCatalogue(), [])
    })
})

describe('subscription help', () => {
    const HELP = {
        usage: 'Strict opt-in: nothing arrives without kinds.',
        example: { kinds: ['Pod'] },
        fields: [{ name: 'kinds', type: 'string[]' as const, required: true, description: 'Kinds to receive' }]
    }

    test('the catalogue carries the help of the providers that publish it', async () => {
        const channel = makeChannel([new FakeProvider('events').withHelp(HELP)])
        const ws = new MockWs()
        await start(channel, ws, 'i1', '')

        const entry = ws.providersCatalogue()?.find(p => p.id === 'events')
        assert.deepEqual(entry?.help, HELP)
    })

    test('a provider that does not implement it simply reports no help', async () => {
        const channel = makeChannel([new FakeProvider('otel')])
        const ws = new MockWs()
        await start(channel, ws, 'i1', '')

        const entry = ws.providersCatalogue()?.find(p => p.id === 'otel')
        assert.equal(entry?.help, undefined)
        assert.equal(entry?.id, 'otel')
    })

    test('a provider whose help throws does not break the catalogue for the rest', async () => {
        const channel = makeChannel([
            new FakeProvider('broken').withBrokenHelp(),
            new FakeProvider('events').withHelp(HELP)
        ])
        const ws = new MockWs()
        await start(channel, ws, 'i1', '')

        const catalogue = ws.providersCatalogue()
        assert.equal(catalogue?.length, 2)
        assert.equal(catalogue?.find(p => p.id === 'broken')?.help, undefined)
        assert.deepEqual(catalogue?.find(p => p.id === 'events')?.help, HELP)
    })

    test('malformed help is dropped instead of forwarded', async () => {
        const bad = new FakeProvider('bad')
        bad.getSubscriptionHelp = () => ({ example: { a: 1 } } as unknown as typeof HELP)
        const channel = makeChannel([bad])
        const ws = new MockWs()
        await start(channel, ws, 'i1', '')

        assert.equal(ws.providersCatalogue()?.[0].help, undefined)
    })

    test('help without fields is forwarded as is', async () => {
        const help = { usage: 'Pushes every 15s, payload ignored.', example: { pod: true } }
        const channel = makeChannel([new FakeProvider('metrics').withHelp(help)])
        const ws = new MockWs()
        await start(channel, ws, 'i1', '')

        const entry = ws.providersCatalogue()?.find(p => p.id === 'metrics')
        assert.equal(entry?.help?.usage, 'Pushes every 15s, payload ignored.')
        assert.deepEqual(entry?.help?.example, { pod: true })
        assert.equal(entry?.help?.fields, undefined)
    })
})

describe('subscription', () => {
    test('subscribes to the chosen provider and passes the payload verbatim', async () => {
        const otel = new FakeProvider('otel')
        const channel = makeChannel([new FakeProvider('events'), otel])
        const ws = new MockWs()
        await start(channel, ws, 'i1', 'otel', '{"spaces":[{"name":"debug","signals":["logs"]}]}')

        assert.equal(otel.subscribers.size, 1)
        const subscriber = [...otel.subscribers.keys()][0]
        assert.deepEqual(otel.dataOf(subscriber), { spaces: [{ name: 'debug', signals: ['logs'] }] })
    })

    test('an empty payload subscribes with an empty object', async () => {
        const events = new FakeProvider('events')
        const channel = makeChannel([events])
        const ws = new MockWs()
        await start(channel, ws, 'i1', 'events', '')

        const subscriber = [...events.subscribers.keys()][0]
        assert.deepEqual(events.dataOf(subscriber), {})
    })

    test('a provider that is not running is reported and nothing is subscribed', async () => {
        const events = new FakeProvider('events')
        const channel = makeChannel([events])
        const ws = new MockWs()
        await start(channel, ws, 'i1', 'kafka')

        assert.equal(events.subscribers.size, 0)
        assert.equal(ws.signals().length, 1)
        assert.match(ws.signals()[0], /Provider 'kafka' is not running/)
    })

    test('a malformed payload is reported and nothing is subscribed', async () => {
        const events = new FakeProvider('events')
        const channel = makeChannel([events])
        const ws = new MockWs()
        await start(channel, ws, 'i1', 'events', '{ not json')

        assert.equal(events.subscribers.size, 0)
        assert.match(ws.signals()[0], /Subscription payload is not valid JSON/)
    })

    test('a successful subscription is confirmed with a signal', async () => {
        const channel = makeChannel([new FakeProvider('events')])
        const ws = new MockWs()
        await start(channel, ws, 'i1', 'events')

        assert.match(ws.signals()[0], /Subscribed to provider 'events'/)
    })
})

describe('event delivery', () => {
    test('an emitted event reaches the socket with provider, payload and timestamp intact', async () => {
        const events = new FakeProvider('events')
        const channel = makeChannel([events])
        const ws = new MockWs()
        await start(channel, ws, 'i1', 'events')
        const before = Date.now()

        events.emit({ kind: 'ADDED', pod: 'nginx-1' })

        const received = ws.events()
        assert.equal(received.length, 1)
        assert.equal(received[0].providerId, 'events')
        assert.deepEqual(received[0].event, { kind: 'ADDED', pod: 'nginx-1' })
        assert.ok(received[0].ts >= before && received[0].ts <= Date.now())
    })

    test('the event message carries the channel id, the instance and the EVENT payload type', async () => {
        const events = new FakeProvider('events')
        const channel = makeChannel([events])
        const ws = new MockWs()
        await start(channel, ws, 'i7', 'events')

        events.emit({ any: 'thing' })

        const msg = ws.parsed().find(m => m.payloadType === EProviderDebugPayload.EVENT)
        assert.equal(msg?.channel, 'provider-debug')
        assert.equal(msg?.instance, 'i7')
    })

    test('events are not transformed, even primitives and nulls', async () => {
        const events = new FakeProvider('events')
        const channel = makeChannel([events])
        const ws = new MockWs()
        await start(channel, ws, 'i1', 'events')

        events.emit(null)
        events.emit('plain string')
        events.emit(42)

        assert.deepEqual(ws.events().map(e => e.event), [null, 'plain string', 42])
    })
})

describe('per-instance isolation', () => {
    test('two instances on the same provider keep separate subscribers and payloads', async () => {
        const events = new FakeProvider('events')
        const channel = makeChannel([events])
        const wsA = new MockWs()
        const wsB = new MockWs()
        await start(channel, wsA, 'a', 'events', '{"who":"a"}')
        await start(channel, wsB, 'b', 'events', '{"who":"b"}')

        assert.equal(events.subscribers.size, 2)
        const payloads = [...events.subscribers.values()]
        assert.deepEqual(payloads, [{ who: 'a' }, { who: 'b' }])
    })

    test('an event is delivered once to each instance, on its own socket', async () => {
        const events = new FakeProvider('events')
        const channel = makeChannel([events])
        const wsA = new MockWs()
        const wsB = new MockWs()
        await start(channel, wsA, 'a', 'events')
        await start(channel, wsB, 'b', 'events')

        events.emit({ n: 1 })

        assert.equal(wsA.events().length, 1)
        assert.equal(wsB.events().length, 1)
        assert.equal(wsA.parsed().find(m => m.payloadType === EProviderDebugPayload.EVENT)?.instance, 'a')
        assert.equal(wsB.parsed().find(m => m.payloadType === EProviderDebugPayload.EVENT)?.instance, 'b')
    })

    test('stopping one instance leaves the other one receiving', async () => {
        const events = new FakeProvider('events')
        const channel = makeChannel([events])
        const wsA = new MockWs()
        const wsB = new MockWs()
        const configA = await start(channel, wsA, 'a', 'events')
        await start(channel, wsB, 'b', 'events')

        channel.stopInstance(wsA as unknown as WebSocket, configA)
        events.emit({ n: 1 })

        assert.equal(events.subscribers.size, 1)
        assert.equal(wsA.events().length, 0)
        assert.equal(wsB.events().length, 1)
    })
})

describe('pause and continue', () => {
    test('a paused instance drops events and resumes on continue', async () => {
        const events = new FakeProvider('events')
        const channel = makeChannel([events])
        const ws = new MockWs()
        const config = await start(channel, ws, 'i1', 'events')

        channel.pauseContinueInstance(ws as unknown as WebSocket, config, EInstanceMessageAction.PAUSE)
        events.emit({ n: 1 })
        assert.equal(ws.events().length, 0)

        channel.pauseContinueInstance(ws as unknown as WebSocket, config, EInstanceMessageAction.CONTINUE)
        events.emit({ n: 2 })
        assert.deepEqual(ws.events().map(e => e.event), [{ n: 2 }])
    })

    test('pausing keeps the subscription alive on the provider', async () => {
        const events = new FakeProvider('events')
        const channel = makeChannel([events])
        const ws = new MockWs()
        const config = await start(channel, ws, 'i1', 'events')

        channel.pauseContinueInstance(ws as unknown as WebSocket, config, EInstanceMessageAction.PAUSE)

        assert.equal(events.subscribers.size, 1)
    })
})

describe('teardown', () => {
    test('stopInstance removes the subscriber from the provider', async () => {
        const events = new FakeProvider('events')
        const channel = makeChannel([events])
        const ws = new MockWs()
        const config = await start(channel, ws, 'i1', 'events')
        assert.equal(events.subscribers.size, 1)

        channel.stopInstance(ws as unknown as WebSocket, config)

        assert.equal(events.subscribers.size, 0)
        assert.equal(channel.containsInstance('i1'), false)
    })

    test('deleteObject removes the subscriber too', async () => {
        const events = new FakeProvider('events')
        const channel = makeChannel([events])
        const ws = new MockWs()
        const config = await start(channel, ws, 'i1', 'events')

        await channel.deleteObject(ws as unknown as WebSocket, config, '*all', '*all', '*all')

        assert.equal(events.subscribers.size, 0)
    })

    test('removeConnection unsubscribes every instance of that socket', async () => {
        const events = new FakeProvider('events')
        const otel = new FakeProvider('otel')
        const channel = makeChannel([events, otel])
        const ws = new MockWs()
        await start(channel, ws, 'i1', 'events')
        await start(channel, ws, 'i2', 'otel')
        assert.equal(events.subscribers.size, 1)
        assert.equal(otel.subscribers.size, 1)

        channel.removeConnection(ws as unknown as WebSocket)

        assert.equal(events.subscribers.size, 0)
        assert.equal(otel.subscribers.size, 0)
        assert.equal(channel.containsConnection(ws as unknown as WebSocket), false)
    })

    test('a stopped instance no longer receives events emitted afterwards', async () => {
        const events = new FakeProvider('events')
        const channel = makeChannel([events])
        const ws = new MockWs()
        const config = await start(channel, ws, 'i1', 'events')
        channel.stopInstance(ws as unknown as WebSocket, config)
        ws.clear()

        events.emit({ n: 1 })

        assert.equal(ws.events().length, 0)
    })
})

describe('reconnection', () => {
    test('updateConnection reroutes events to the new socket', async () => {
        const events = new FakeProvider('events')
        const channel = makeChannel([events])
        const oldWs = new MockWs()
        const newWs = new MockWs()
        await start(channel, oldWs, 'i1', 'events')
        oldWs.clear()

        assert.equal(channel.updateConnection(newWs as unknown as WebSocket, 'i1'), true)
        events.emit({ n: 1 })

        assert.equal(oldWs.events().length, 0)
        assert.deepEqual(newWs.events().map(e => e.event), [{ n: 1 }])
    })

    test('updateConnection reports false for an unknown instance', async () => {
        const channel = makeChannel([new FakeProvider('events')])
        const ws = new MockWs()
        await start(channel, ws, 'i1', 'events')

        assert.equal(channel.updateConnection(new MockWs() as unknown as WebSocket, 'nope'), false)
    })

    test('refreshConnection only acknowledges known sockets', async () => {
        const channel = makeChannel([new FakeProvider('events')])
        const ws = new MockWs()
        await start(channel, ws, 'i1', 'events')

        assert.equal(channel.refreshConnection(ws as unknown as WebSocket), true)
        assert.equal(channel.refreshConnection(new MockWs() as unknown as WebSocket), false)
    })
})

describe('channel contract', () => {
    test('declares no required providers, so installing it starts nothing', () => {
        const channel = makeChannel([])
        assert.deepEqual(channel.requirements, { storage: false, providers: [] })
    })

    test('is cluster scoped and not resource based', () => {
        const channel = makeChannel([])
        const data = channel.getChannelData()
        assert.equal(data.id, 'provider-debug')
        assert.equal(data.cluster, true)
        assert.equal(data.resourced, false)
        assert.equal(data.pauseable, true)
        assert.deepEqual(data.endpoints, [])
    })

    test('adding the same instance twice does not duplicate the subscription', async () => {
        const events = new FakeProvider('events')
        const channel = makeChannel([events])
        const ws = new MockWs()
        await start(channel, ws, 'i1', 'events')
        await start(channel, ws, 'i1', 'events')

        assert.equal(events.subscribers.size, 1)
        events.emit({ n: 1 })
        assert.equal(ws.events().length, 1)
    })
})
