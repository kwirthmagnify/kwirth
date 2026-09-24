import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { EClusterType, EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType, IBackChannelObject, IInstanceConfig, IInstanceMessage } from '@kwirthmagnify/kwirth-common-back'
import SenderDebugChannel from '../../src/back/index'
import { ESenderDebugCommand, ESenderDebugKind } from '../../src/common/SenderDebugTypes'
import { FakeRegistry, FakeSender, MockWs, instanceConfigFor, makeBackObj, makeClusterInfo } from '../helpers'

const makeChannel = (registry?: FakeRegistry) => {
    const { obj, warnings } = makeBackObj()
    const channel = new SenderDebugChannel(makeClusterInfo(registry), obj as unknown as IBackChannelObject)
    return { channel, warnings }
}

const start = async (channel: SenderDebugChannel, ws: MockWs, instance = 'i1') => {
    const config = instanceConfigFor(instance) as unknown as IInstanceConfig
    await channel.addObject(ws as unknown as WebSocket, config, '*all', '*all', '*all')
    return config
}

const command = (instance: string, cmd: ESenderDebugCommand, data?: unknown): IInstanceMessage => ({
    action: EInstanceMessageAction.COMMAND,
    flow: EInstanceMessageFlow.REQUEST,
    type: EInstanceMessageType.DATA,
    channel: 'sender-debug',
    instance,
    ...(data ? { data } : {}),
    command: cmd
} as unknown as IInstanceMessage)

describe('channel contract', () => {
    test('declares itself as a cluster channel that starts nothing', () => {
        const { channel } = makeChannel(new FakeRegistry())
        const data = channel.getChannelData()

        assert.equal(data.id, 'sender-debug')
        assert.equal(data.cluster, true)
        assert.equal(data.resourced, false)
        assert.equal(data.pauseable, false)
        assert.equal(data.modifiable, false)
        assert.equal(data.routable, false)
        assert.deepEqual(data.endpoints, [])
        assert.deepEqual(data.sources, [EClusterType.KUBERNETES])
        // vacío es la decisión: un depurador no arranca nada por estar instalado
        assert.deepEqual(channel.requirements.providers, [])
        assert.equal(channel.requirements.storage, false)
    })

    test('scope levels go none < cluster', () => {
        const { channel } = makeChannel()
        assert.equal(channel.getChannelScopeLevel('none'), 1)
        assert.equal(channel.getChannelScopeLevel('cluster'), 2)
        assert.equal(channel.getChannelScopeLevel('whatever'), -1)
    })
})

describe('sender catalogue', () => {
    test('addObject sends the installed senders, with their configurations', async () => {
        const registry = new FakeRegistry()
            .install(new FakeSender('email-smtp', ['ops', 'devs']), { displayName: 'SMTP mail', version: '0.3.1' })
            .install(new FakeSender('console', ['dev-console']))
        const { channel } = makeChannel(registry)
        const ws = new MockWs()
        await start(channel, ws)

        assert.deepEqual(ws.senders(), [
            { id: 'console', configNames: ['dev-console'], instantiated: false, kind: ESenderDebugKind.UNKNOWN, supportsBatch: false },
            { id: 'email-smtp', displayName: 'SMTP mail', version: '0.3.1', configNames: ['ops', 'devs'], instantiated: false, kind: ESenderDebugKind.UNKNOWN, supportsBatch: false }
        ])
    })

    test('listing does NOT instantiate anything: a sender nobody sent to stays cold', async () => {
        const registry = new FakeRegistry().install(new FakeSender('teams'))
        const { channel } = makeChannel(registry)
        await start(channel, new MockWs())

        assert.equal(registry.isInstantiated('teams'), false)
    })

    test('an already instantiated sender is marked, and reports its type and batch support', async () => {
        const registry = new FakeRegistry()
            .instantiate(new FakeSender('loki', ['prod']).withBatch().withType('output'))
            .instantiate(new FakeSender('ratelimit', ['slow']).withType('filter'))
        const { channel } = makeChannel(registry)
        const ws = new MockWs()
        await start(channel, ws)

        const senders = ws.senders()!
        const loki = senders.find(s => s.id === 'loki')!
        assert.equal(loki.instantiated, true)
        assert.equal(loki.supportsBatch, true)
        assert.equal(loki.kind, ESenderDebugKind.OUTPUT)

        const ratelimit = senders.find(s => s.id === 'ratelimit')!
        assert.equal(ratelimit.kind, ESenderDebugKind.FILTER)
        assert.equal(ratelimit.supportsBatch, false)
    })

    test('senders come sorted by id, so the dropdown does not dance', async () => {
        const registry = new FakeRegistry()
            .install(new FakeSender('zulip'))
            .install(new FakeSender('email-resend'))
            .install(new FakeSender('console'))
        const ws = new MockWs()
        const { channel } = makeChannel(registry)
        await start(channel, ws)

        assert.deepEqual(ws.senders()!.map(s => s.id), ['console', 'email-resend', 'zulip'])
    })

    /*
        El core concatena el indice de instalados con los senders de dev y no deduplica
        (SenderManager.listInstalled), asi que en un entorno de desarrollo el mismo sender llega dos
        veces y el desplegable lo pintaba repetido. Lo cazo el e2e.
    */
    test('a sender served twice by the core is listed once, keeping the dev entry', async () => {
        const registry = new FakeRegistry()
            .install(new FakeSender('console', ['dev-console']), { displayName: 'Console Sender', version: '0.2.0' })
            .withDuplicate('console', { displayName: 'Console Sender', version: 'dev' })
        const ws = new MockWs()
        const { channel } = makeChannel(registry)
        await start(channel, ws)

        const senders = ws.senders()!
        assert.equal(senders.length, 1)
        assert.equal(senders[0].id, 'console')
        // gana la ultima, que es la de dev: es la que el core acaba resolviendo por getSender()
        assert.equal(senders[0].version, 'dev')
    })

    test('without listInstalled (an older core) the catalogue falls back to what is instantiated', async () => {
        const registry = new FakeRegistry()
            .instantiate(new FakeSender('console', ['dev-console']))
            .install(new FakeSender('teams', ['ops']))
            .withoutListInstalled()
        const ws = new MockWs()
        const { channel } = makeChannel(registry)
        await start(channel, ws)

        // 'teams' está instalado pero no instanciado: sin listInstalled no hay forma de saberlo
        assert.deepEqual(ws.senders(), [
            { id: 'console', configNames: ['dev-console'], instantiated: true, kind: ESenderDebugKind.UNKNOWN, supportsBatch: false }
        ])
    })

    test('a registry that fails to list the installed ones warns and falls back, it does not throw', async () => {
        const registry = new FakeRegistry().instantiate(new FakeSender('console')).withInstalledError()
        const ws = new MockWs()
        const { channel, warnings } = makeChannel(registry)
        await start(channel, ws)

        assert.deepEqual(ws.senders()!.map(s => s.id), ['console'])
        assert.equal(warnings.some(w => w.includes('boom listing installed')), true)
    })

    test('a registry that fails to list the live ones still returns the installed catalogue', async () => {
        const registry = new FakeRegistry().install(new FakeSender('console')).withLiveError()
        const ws = new MockWs()
        const { channel, warnings } = makeChannel(registry)
        await start(channel, ws)

        const senders = ws.senders()!
        assert.equal(senders.length, 1)
        assert.equal(senders[0].instantiated, false)
        assert.equal(warnings.some(w => w.includes('boom listing live')), true)
    })

    test('no sender registry at all: the catalogue is empty and it is said out loud', async () => {
        const ws = new MockWs()
        const { channel } = makeChannel(undefined)
        await start(channel, ws)

        assert.deepEqual(ws.senders(), [])
        assert.equal(ws.signals().some(s => s.includes('Sender registry is not available')), true)
    })

    test('the LIST command refreshes the catalogue', async () => {
        const registry = new FakeRegistry().install(new FakeSender('console'))
        const ws = new MockWs()
        const { channel } = makeChannel(registry)
        await start(channel, ws)
        ws.clear()

        registry.install(new FakeSender('teams', ['ops']))
        await channel.processCommand(ws as unknown as WebSocket, command('i1', ESenderDebugCommand.LIST))

        assert.deepEqual(ws.senders()!.map(s => s.id), ['console', 'teams'])
    })
})

describe('instances and connections', () => {
    test('the same instance is not registered twice', async () => {
        const { channel } = makeChannel(new FakeRegistry())
        const ws = new MockWs()
        await start(channel, ws)
        await start(channel, ws)

        assert.equal(channel.webSockets.length, 1)
        assert.equal(channel.webSockets[0].instances.length, 1)
    })

    test('stopInstance removes it and answers; stopping an unknown one answers an error', async () => {
        const { channel } = makeChannel(new FakeRegistry())
        const ws = new MockWs()
        const config = await start(channel, ws)
        ws.clear()

        channel.stopInstance(ws as unknown as WebSocket, config)
        assert.equal(channel.containsInstance('i1'), false)
        assert.equal(ws.signals().some(s => s.includes('stopped')), true)

        ws.clear()
        channel.stopInstance(ws as unknown as WebSocket, config)
        assert.equal(ws.signals().some(s => s.includes('not found')), true)
    })

    test('deleteObject removes the instance', async () => {
        const { channel } = makeChannel(new FakeRegistry())
        const ws = new MockWs()
        const config = await start(channel, ws)

        await channel.deleteObject(ws as unknown as WebSocket, config, '*all', '*all', '*all')
        assert.equal(channel.containsInstance('i1'), false)
    })

    test('removeConnection drops the socket and all its instances', async () => {
        const { channel } = makeChannel(new FakeRegistry())
        const ws = new MockWs()
        await start(channel, ws, 'i1')
        await start(channel, ws, 'i2')

        assert.equal(channel.containsConnection(ws as unknown as WebSocket), true)
        channel.removeConnection(ws as unknown as WebSocket)
        assert.equal(channel.containsConnection(ws as unknown as WebSocket), false)
        assert.equal(channel.containsInstance('i1'), false)
        assert.equal(channel.containsInstance('i2'), false)
    })

    test('refreshConnection only answers for a known socket', async () => {
        const { channel } = makeChannel(new FakeRegistry())
        const ws = new MockWs()
        await start(channel, ws)

        assert.equal(channel.refreshConnection(ws as unknown as WebSocket), true)
        assert.equal(channel.refreshConnection(new MockWs() as unknown as WebSocket), false)
    })

    test('updateConnection swaps the socket of a reconnecting instance', async () => {
        const { channel } = makeChannel(new FakeRegistry())
        const ws = new MockWs()
        await start(channel, ws)
        const newWs = new MockWs()

        assert.equal(channel.updateConnection(newWs as unknown as WebSocket, 'i1'), true)
        assert.equal(channel.updateConnection(newWs as unknown as WebSocket, 'nope'), false)
        assert.equal(channel.containsConnection(newWs as unknown as WebSocket), true)
    })

    test('containsAsset is always false: senders do not hang from a pod', () => {
        const { channel } = makeChannel(new FakeRegistry())
        assert.equal(channel.containsAsset(new MockWs() as unknown as WebSocket, 'ns', 'pod', 'container'), false)
    })
})

describe('command dispatch', () => {
    test('a command for an unknown instance is refused with a signal', async () => {
        const { channel } = makeChannel(new FakeRegistry())
        const ws = new MockWs()
        await start(channel, ws)
        ws.clear()

        const handled = await channel.processCommand(ws as unknown as WebSocket, command('nope', ESenderDebugCommand.LIST))
        assert.equal(handled, false)
        assert.equal(ws.signals().some(s => s.includes('not found')), true)
    })

    test('an unknown command is refused and said so', async () => {
        const { channel } = makeChannel(new FakeRegistry())
        const ws = new MockWs()
        await start(channel, ws)
        ws.clear()

        const handled = await channel.processCommand(ws as unknown as WebSocket, command('i1', 'whatever' as ESenderDebugCommand))
        assert.equal(handled, false)
        assert.equal(ws.signals().some(s => s.includes("Unknown command 'whatever'")), true)
    })

    test('IMMEDIATE flow and non-COMMAND actions are not ours', async () => {
        const { channel } = makeChannel(new FakeRegistry())
        const ws = new MockWs()
        await start(channel, ws)

        const immediate = { ...command('i1', ESenderDebugCommand.LIST), flow: EInstanceMessageFlow.IMMEDIATE }
        assert.equal(await channel.processCommand(ws as unknown as WebSocket, immediate as IInstanceMessage), false)

        const notCommand = { ...command('i1', ESenderDebugCommand.LIST), action: EInstanceMessageAction.START }
        assert.equal(await channel.processCommand(ws as unknown as WebSocket, notCommand as IInstanceMessage), false)
    })
})
