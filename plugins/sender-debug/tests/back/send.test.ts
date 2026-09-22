import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType, IBackChannelObject, IInstanceConfig, IInstanceMessage, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'
import SenderDebugChannel from '../../src/back/index'
import { ESenderDebugCommand, ISenderDebugSendRequest } from '../../src/common/SenderDebugTypes'
import { FakeRegistry, FakeSender, MockWs, instanceConfigFor, makeBackObj, makeClusterInfo } from '../helpers'

const makeChannel = (registry?: FakeRegistry) => {
    const { obj, logs, warnings } = makeBackObj()
    const channel = new SenderDebugChannel(makeClusterInfo(registry), obj as unknown as IBackChannelObject)
    return { channel, logs, warnings }
}

const start = async (channel: SenderDebugChannel, ws: MockWs, instance = 'i1') => {
    await channel.addObject(ws as unknown as WebSocket, instanceConfigFor(instance) as unknown as IInstanceConfig, '*all', '*all', '*all')
}

const message = (body = 'hello'): ISenderMessage => ({ subject: 'test', body, level: 'info', origin: { source: 'sender-debug' } })

const request = (patch: Partial<ISenderDebugSendRequest> = {}): ISenderDebugSendRequest => ({
    id: 'send-1',
    senderId: 'console',
    configName: 'default',
    message: message(),
    ...patch
})

const sendCommand = (instance: string, data: unknown, batch = false): IInstanceMessage => ({
    action: EInstanceMessageAction.COMMAND,
    flow: EInstanceMessageFlow.REQUEST,
    type: EInstanceMessageType.DATA,
    channel: 'sender-debug',
    instance,
    command: batch ? ESenderDebugCommand.SENDBATCH : ESenderDebugCommand.SEND,
    data
} as unknown as IInstanceMessage)

const send = async (channel: SenderDebugChannel, ws: MockWs, data: unknown, batch = false) =>
    channel.processCommand(ws as unknown as WebSocket, sendCommand('i1', data, batch))

describe('sending one message', () => {
    test('the sender receives exactly the message that was composed, on the chosen configuration', async () => {
        const sender = new FakeSender('console', ['default', 'other'])
        const { channel } = makeChannel(new FakeRegistry().install(sender))
        const ws = new MockWs()
        await start(channel, ws)

        await send(channel, ws, request({ configName: 'other', message: message('a hand written body') }))

        assert.equal(sender.received.length, 1)
        assert.equal(sender.received[0].configName, 'other')
        assert.equal(sender.received[0].message.body, 'a hand written body')
        assert.equal(sender.received[0].message.subject, 'test')
        assert.equal(sender.received[0].message.origin?.source, 'sender-debug')
    })

    test('a delivered message answers ok, with its own id and how long it took', async () => {
        const { channel } = makeChannel(new FakeRegistry().install(new FakeSender('console')))
        const ws = new MockWs()
        await start(channel, ws)

        await send(channel, ws, request({ id: 'abc-123' }))

        const result = ws.lastResult()!
        assert.equal(result.id, 'abc-123')
        assert.equal(result.ok, true)
        assert.equal(result.senderId, 'console')
        assert.equal(result.configName, 'default')
        assert.equal(result.batch, false)
        assert.equal(result.count, 1)
        assert.equal(result.error, undefined)
        assert.equal(typeof result.elapsed, 'number')
        assert.equal(result.elapsed >= 0, true)
    })

    test('what the sender RETURNS comes back whole (a ticketing sender returns its key)', async () => {
        const sender = new FakeSender('jira').withResult({ issueKey: 'OPS-42', url: 'https://jira/OPS-42' })
        const { channel } = makeChannel(new FakeRegistry().install(sender))
        const ws = new MockWs()
        await start(channel, ws)

        await send(channel, ws, request({ senderId: 'jira' }))

        assert.deepEqual(ws.lastResult()!.result, { issueKey: 'OPS-42', url: 'https://jira/OPS-42' })
    })

    test('a sender of pure notification returns nothing, and that is not an error', async () => {
        const { channel } = makeChannel(new FakeRegistry().install(new FakeSender('console')))
        const ws = new MockWs()
        await start(channel, ws)

        await send(channel, ws, request())

        const result = ws.lastResult()!
        assert.equal(result.ok, true)
        assert.equal(result.result, undefined)
    })

    /*
        EL test del plugin. Por la vía oficial del core esto sería un logError que nadie ve y un
        undefined indistinguible de un envío correcto. Aquí sube con su texto.
    */
    test('a sender that throws answers ok:false with the error text', async () => {
        const sender = new FakeSender('teams').withSendError('401 Unauthorized from the webhook')
        const { channel, warnings } = makeChannel(new FakeRegistry().install(sender))
        const ws = new MockWs()
        await start(channel, ws)

        await send(channel, ws, request({ senderId: 'teams' }))

        const result = ws.lastResult()!
        assert.equal(result.ok, false)
        assert.equal(result.error?.includes('401 Unauthorized from the webhook'), true)
        assert.equal(warnings.some(w => w.includes('401 Unauthorized')), true)
    })

    test('the first send INSTANTIATES a sender nobody had used yet', async () => {
        const registry = new FakeRegistry().install(new FakeSender('console'))
        const { channel } = makeChannel(registry)
        const ws = new MockWs()
        await start(channel, ws)
        assert.equal(registry.isInstantiated('console'), false)

        await send(channel, ws, request())

        assert.equal(registry.isInstantiated('console'), true)
        assert.equal(ws.lastResult()!.ok, true)
    })
})

describe('sending: what can go wrong before the sender is even called', () => {
    test('an unknown sender', async () => {
        const { channel } = makeChannel(new FakeRegistry().install(new FakeSender('console')))
        const ws = new MockWs()
        await start(channel, ws)

        await send(channel, ws, request({ senderId: 'nope' }))

        const result = ws.lastResult()!
        assert.equal(result.ok, false)
        assert.equal(result.error?.includes("Sender 'nope' is not installed"), true)
    })

    test('a sender that blows up while being resolved', async () => {
        const registry = new FakeRegistry().install(new FakeSender('console')).withResolveError('console')
        const { channel, warnings } = makeChannel(registry)
        const ws = new MockWs()
        await start(channel, ws)

        await send(channel, ws, request())

        assert.equal(ws.lastResult()!.ok, false)
        assert.equal(warnings.some(w => w.includes('failed while being resolved')), true)
    })

    test('a configuration the sender does not have', async () => {
        const { channel } = makeChannel(new FakeRegistry().install(new FakeSender('console', ['dev-console'])))
        const ws = new MockWs()
        await start(channel, ws)

        await send(channel, ws, request({ configName: 'prod' }))

        assert.equal(ws.lastResult()!.error, "Sender 'console' has no configuration 'prod'")
    })

    test('a sender that throws while being asked about its configuration', async () => {
        const sender = new FakeSender('console').withConfigError('config store is gone')
        const { channel } = makeChannel(new FakeRegistry().install(sender))
        const ws = new MockWs()
        await start(channel, ws)

        await send(channel, ws, request())

        assert.equal(ws.lastResult()!.error?.includes('config store is gone'), true)
        assert.equal(sender.received.length, 0)
    })

    test('no sender, no configuration, or no body', async () => {
        const { channel } = makeChannel(new FakeRegistry().install(new FakeSender('console')))
        const ws = new MockWs()
        await start(channel, ws)

        await send(channel, ws, request({ senderId: '' }))
        assert.equal(ws.lastResult()!.error, 'No sender selected')

        await send(channel, ws, request({ configName: '' }))
        assert.equal(ws.lastResult()!.error, 'No configuration selected')

        await send(channel, ws, request({ message: { body: undefined } as unknown as ISenderMessage }))
        assert.equal(ws.lastResult()!.error, 'Message body is missing')
    })

    test('with no sender registry the send is refused, not silently dropped', async () => {
        const { channel } = makeChannel(undefined)
        const ws = new MockWs()
        await start(channel, ws)
        ws.clear()

        await send(channel, ws, request())

        assert.equal(ws.lastResult()!.error, 'Sender registry is not available on this Kwirth')
    })

    test('a send command with no payload answers a signal, and nothing is sent', async () => {
        const sender = new FakeSender('console')
        const { channel } = makeChannel(new FakeRegistry().install(sender))
        const ws = new MockWs()
        await start(channel, ws)
        ws.clear()

        await send(channel, ws, undefined)

        assert.equal(ws.results().length, 0)
        assert.equal(ws.signals().some(s => s.includes('no payload')), true)
        assert.equal(sender.received.length, 0)
    })
})

describe('sending a batch', () => {
    test('a sender with sendBatch gets ONE call with the N messages, numbered', async () => {
        const sender = new FakeSender('loki').withBatch()
        const { channel } = makeChannel(new FakeRegistry().install(sender))
        const ws = new MockWs()
        await start(channel, ws)

        await send(channel, ws, request({ senderId: 'loki', count: 3, message: message('line') }), true)

        assert.equal(sender.receivedBatches.length, 1)
        assert.equal(sender.received.length, 0)
        const messages = sender.receivedBatches[0].messages
        assert.deepEqual(messages.map(m => m.body), ['line (1/3)', 'line (2/3)', 'line (3/3)'])
        assert.deepEqual(messages.map(m => m.subject), ['test (1/3)', 'test (2/3)', 'test (3/3)'])

        const result = ws.lastResult()!
        assert.equal(result.ok, true)
        assert.equal(result.batch, true)
        assert.equal(result.count, 3)
        assert.equal(result.emulated, undefined)
    })

    test('a sender WITHOUT sendBatch gets N sends, and the answer says it was emulated', async () => {
        const sender = new FakeSender('console')
        const { channel } = makeChannel(new FakeRegistry().install(sender))
        const ws = new MockWs()
        await start(channel, ws)

        await send(channel, ws, request({ count: 2 }), true)

        assert.equal(sender.receivedBatches.length, 0)
        assert.equal(sender.received.length, 2)
        assert.deepEqual(sender.received.map(r => r.message.body), ['hello (1/2)', 'hello (2/2)'])

        const result = ws.lastResult()!
        assert.equal(result.ok, true)
        assert.equal(result.emulated, true)
        assert.equal(result.count, 2)
    })

    test('the batch size is clamped: never below 1, never above 100', async () => {
        const sender = new FakeSender('loki').withBatch()
        const { channel } = makeChannel(new FakeRegistry().install(sender))
        const ws = new MockWs()
        await start(channel, ws)

        await send(channel, ws, request({ senderId: 'loki', count: 0 }), true)
        assert.equal(sender.receivedBatches[0].messages.length, 1)
        assert.equal(ws.lastResult()!.count, 1)

        await send(channel, ws, request({ senderId: 'loki', count: 5000 }), true)
        assert.equal(sender.receivedBatches[1].messages.length, 100)
        assert.equal(ws.lastResult()!.count, 100)
    })

    test('a batch with no count at all is a batch of one', async () => {
        const sender = new FakeSender('loki').withBatch()
        const { channel } = makeChannel(new FakeRegistry().install(sender))
        const ws = new MockWs()
        await start(channel, ws)

        await send(channel, ws, request({ senderId: 'loki' }), true)

        assert.equal(sender.receivedBatches[0].messages.length, 1)
        assert.equal(ws.lastResult()!.count, 1)
    })

    test('a batch that throws answers ok:false, keeping the batch flag and the count', async () => {
        const sender = new FakeSender('loki').withBatch().withSendError('429 too many requests')
        const { channel } = makeChannel(new FakeRegistry().install(sender))
        const ws = new MockWs()
        await start(channel, ws)

        await send(channel, ws, request({ senderId: 'loki', count: 4 }), true)

        const result = ws.lastResult()!
        assert.equal(result.ok, false)
        assert.equal(result.batch, true)
        assert.equal(result.count, 4)
        assert.equal(result.error?.includes('429 too many requests'), true)
    })
})

describe('answers reach the right place', () => {
    test('every answer carries the instance it belongs to, as a COMMAND response', async () => {
        const { channel } = makeChannel(new FakeRegistry().install(new FakeSender('console')))
        const ws = new MockWs()
        await start(channel, ws, 'i1')
        ws.clear()

        await send(channel, ws, request())

        const raw = ws.parsed().find(m => m.type === EInstanceMessageType.DATA)!
        assert.equal(raw.instance, 'i1')
        assert.equal(raw.channel, 'sender-debug')
        assert.equal(raw.action, EInstanceMessageAction.COMMAND)
        assert.equal(raw.flow, EInstanceMessageFlow.RESPONSE)
        assert.equal(raw.msgtype, 'senderdebugmessageresponse')
    })

    test('a successful send is logged by the core, with the sender and the configuration', async () => {
        const { channel, logs } = makeChannel(new FakeRegistry().install(new FakeSender('console')))
        const ws = new MockWs()
        await start(channel, ws)

        await send(channel, ws, request())

        assert.equal(logs.some(l => l.includes("'console/default'")), true)
    })
})
