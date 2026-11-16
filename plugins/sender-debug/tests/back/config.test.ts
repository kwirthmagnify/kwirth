import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType, IBackChannelObject, IInstanceConfig, IInstanceMessage } from '@kwirthmagnify/kwirth-common-back'
import { IConfigFieldDef } from '@kwirthmagnify/kwirth-common'
import SenderDebugChannel from '../../src/back/index'
import { ESenderDebugCommand } from '../../src/common/SenderDebugTypes'
import { FakeRegistry, FakeSender, MockWs, instanceConfigFor, makeBackObj, makeClusterInfo } from '../helpers'

/*
    S2 · the chosen configuration in view: CONFIG answers with the sender's fields and the configuration's REAL values
    (secrets included — the tab masks them), and says in the view itself why it could not, when it could not.
*/

const FIELDS: IConfigFieldDef[] = [
    { name: 'name', label: 'Name', required: true },
    { name: 'webhookUrl', label: 'Webhook URL', required: true },
    { name: 'token', label: 'Token', type: 'password' },
    { name: 'retries', label: 'Retries', type: 'number', default: 3 }
]

const makeChannel = (registry?: FakeRegistry) => {
    const { obj } = makeBackObj()
    return new SenderDebugChannel(makeClusterInfo(registry), obj as unknown as IBackChannelObject)
}

const start = async (channel: SenderDebugChannel, ws: MockWs, instance = 'i1') => {
    await channel.addObject(ws as unknown as WebSocket, instanceConfigFor(instance) as unknown as IInstanceConfig, '*all', '*all', '*all')
}

const config = (instance: string, data?: unknown): IInstanceMessage => ({
    action: EInstanceMessageAction.COMMAND,
    flow: EInstanceMessageFlow.REQUEST,
    type: EInstanceMessageType.DATA,
    channel: 'sender-debug',
    instance,
    ...(data ? { data } : {}),
    command: ESenderDebugCommand.CONFIG
} as unknown as IInstanceMessage)

describe('configuration view', () => {
    test('🔴 the fields and the chosen configuration\'s values, the secret REAL', async () => {
        const registry = new FakeRegistry()
            .install(new FakeSender('teams', ['ops', 'devs']))
            .withConfigs('teams', FIELDS, [
                { name: 'ops', webhookUrl: 'https://hooks.example/ops', token: 's3cr3t', retries: 5 },
                { name: 'devs', webhookUrl: 'https://hooks.example/devs' }
            ])
        const channel = makeChannel(registry)
        const ws = new MockWs()
        await start(channel, ws)

        assert.equal(await channel.processCommand(ws as unknown as WebSocket, config('i1', { senderId: 'teams', configName: 'ops' })), true)
        assert.deepEqual(ws.lastConfig(), {
            senderId: 'teams',
            configName: 'ops',
            fields: FIELDS,
            values: { name: 'ops', webhookUrl: 'https://hooks.example/ops', token: 's3cr3t', retries: 5 }
        })
    })

    test('reading it instantiates a cold sender, the same as sending to it would', async () => {
        const registry = new FakeRegistry().install(new FakeSender('teams', ['ops'])).withConfigs('teams', FIELDS, [{ name: 'ops' }])
        const channel = makeChannel(registry)
        const ws = new MockWs()
        await start(channel, ws)
        assert.equal(registry.isInstantiated('teams'), false)

        await channel.processCommand(ws as unknown as WebSocket, config('i1', { senderId: 'teams', configName: 'ops' }))
        assert.equal(registry.isInstantiated('teams'), true)
    })

    test('a configuration that is gone says so, and still brings the fields', async () => {
        const registry = new FakeRegistry().install(new FakeSender('teams', ['ops'])).withConfigs('teams', FIELDS, [{ name: 'ops' }])
        const channel = makeChannel(registry)
        const ws = new MockWs()
        await start(channel, ws)

        await channel.processCommand(ws as unknown as WebSocket, config('i1', { senderId: 'teams', configName: 'gone' }))
        const view = ws.lastConfig()!
        assert.equal(view.error, "Sender 'teams' has no configuration 'gone'")
        assert.deepEqual(view.fields, FIELDS)
        assert.deepEqual(view.values, { name: 'gone' })
    })

    test('nothing selected, an older core and a sender that blows up: each one says why, in the view', async () => {
        const cases: Array<{ registry: FakeRegistry, data?: unknown, error: string }> = [
            { registry: new FakeRegistry(), data: { senderId: 'teams', configName: '' }, error: 'No sender or configuration selected' },
            { registry: new FakeRegistry(), data: undefined, error: 'No sender or configuration selected' },
            { registry: new FakeRegistry().withoutConfigRead(), data: { senderId: 'teams', configName: 'ops' }, error: 'This Kwirth does not let a channel read sender configurations' },
            { registry: new FakeRegistry().withSchemaError('kaput'), data: { senderId: 'teams', configName: 'ops' }, error: "Sender 'teams' failed while reading its configuration: Error: kaput" }
        ]
        for (const c of cases) {
            const channel = makeChannel(c.registry)
            const ws = new MockWs()
            await start(channel, ws)
            await channel.processCommand(ws as unknown as WebSocket, config('i1', c.data))
            const view = ws.lastConfig()!
            assert.equal(view.error, c.error)
            assert.deepEqual(view.fields, [])
        }
    })

    test('without a registry at all (a core that does not hand it) it says so too', async () => {
        const channel = makeChannel(undefined)
        const ws = new MockWs()
        await start(channel, ws)
        await channel.processCommand(ws as unknown as WebSocket, config('i1', { senderId: 'teams', configName: 'ops' }))
        assert.equal(ws.lastConfig()?.error, 'This Kwirth does not let a channel read sender configurations')
    })
})
