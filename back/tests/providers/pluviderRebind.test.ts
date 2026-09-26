// Replacing the INSTANCE of a channel that is also a pluvider. Today it only happens in the hot reload of
// a dev plugin, but the problem is always the same: the registry keeps the instance, not the class. If it
// is not redone, the core ends up talking to an object nobody uses any more and keeps serving its
// description, its subscription help and its filter EXACTLY AS THEY WERE — and a freshly reloaded change
// parece no haber surtido efecto.

import test from 'node:test'
import assert from 'node:assert/strict'
import { IChannel } from '../../src/channels/IChannel'
import { rebindPluvider, TPluviderChannel } from '../../src/providers/Pluvider'

interface ILifecycle {
    started: string[]
    stopped: string[]
}

const fakePluvider = (tag: string, life: ILifecycle, failOnStop = false): TPluviderChannel => ({
    getChannelData: () => ({ id: 'agora' }),
    processProviderEvent: () => {},
    getPluviderData: () => ({ description: `soy ${tag}` }),
    addSubscriber: async () => {},
    removeSubscriber: async () => {},
    startProvider: async () => { life.started.push(tag) },
    stopProvider: async () => {
        if (failOnStop) throw new Error(`${tag} no para`)
        life.stopped.push(tag)
    },
    getSubscriptionHelp: () => ({ usage: tag, example: {} })
} as unknown as TPluviderChannel)

// an ordinary channel, which is NOT a pluvider
const fakeChannel = (): IChannel => ({
    getChannelData: () => ({ id: 'log' }),
    processProviderEvent: () => {}
} as unknown as IChannel)

const newLife = (): ILifecycle => ({ started: [], stopped: [] })

test('la instancia nueva REEMPLAZA a la vieja en el registro', async () => {
    const life = newLife()
    const pluviders = new Map<string, TPluviderChannel>([['plugin:agora', fakePluvider('vieja', life)]])

    await rebindPluvider(pluviders, 'plugin:agora', fakePluvider('nueva', life))

    // what the core serves from now on comes from the new one, not from the previous one
    assert.equal(pluviders.get('plugin:agora')?.getPluviderData().description, 'soy nueva')
    assert.equal(pluviders.size, 1)
})

test('la vieja se PARA y la nueva ARRANCA, en ese orden', async () => {
    const life = newLife()
    const pluviders = new Map<string, TPluviderChannel>([['plugin:agora', fakePluvider('vieja', life)]])

    await rebindPluvider(pluviders, 'plugin:agora', fakePluvider('nueva', life))

    assert.deepEqual(life.stopped, ['vieja'])
    assert.deepEqual(life.started, ['nueva'])
})

test('si no habia nada registrado, simplemente se da de alta', async () => {
    const life = newLife()
    const pluviders = new Map<string, TPluviderChannel>()

    await rebindPluvider(pluviders, 'plugin:agora', fakePluvider('nueva', life))

    assert.equal(pluviders.size, 1)
    assert.deepEqual(life.started, ['nueva'])
    assert.deepEqual(life.stopped, [])
})

test('si la instancia nueva ya NO es pluvider, la vieja se da de baja y no se registra nada', async () => {
    // a real case: somebody removes getPluviderData from the plugin and reloads. The registry cannot be
    // left with the previous instance publishing something the current code no longer offers.
    const life = newLife()
    const pluviders = new Map<string, TPluviderChannel>([['plugin:agora', fakePluvider('vieja', life)]])

    await rebindPluvider(pluviders, 'plugin:agora', fakeChannel())

    assert.equal(pluviders.size, 0)
    assert.deepEqual(life.stopped, ['vieja'])
})

test('un canal que nunca fue pluvider no ensucia el registro', async () => {
    const pluviders = new Map<string, TPluviderChannel>()
    await rebindPluvider(pluviders, 'plugin:log', fakeChannel())
    assert.equal(pluviders.size, 0)
})

test('si la vieja revienta al parar, la nueva se registra igual', async () => {
    // an instance that is already broken must not stop the one replacing it from entering service
    const life = newLife()
    const pluviders = new Map<string, TPluviderChannel>([['plugin:agora', fakePluvider('rota', life, true)]])

    await assert.doesNotReject(() => rebindPluvider(pluviders, 'plugin:agora', fakePluvider('nueva', life)))

    assert.equal(pluviders.get('plugin:agora')?.getPluviderData().description, 'soy nueva')
    assert.deepEqual(life.started, ['nueva'])
})

test('rebind no toca a los demas pluviders del registro', async () => {
    const life = newLife()
    const pluviders = new Map<string, TPluviderChannel>([
        ['plugin:agora', fakePluvider('agora-vieja', life)],
        ['plugin:montag', fakePluvider('montag', life)]
    ])

    await rebindPluvider(pluviders, 'plugin:agora', fakePluvider('agora-nueva', life))

    assert.equal(pluviders.get('plugin:montag')?.getPluviderData().description, 'soy montag')
    assert.deepEqual(life.stopped, ['agora-vieja'])
})
