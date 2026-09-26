// Subscription resolution in ClusterInfo. An id with a prefix ('plugin:agora') points at a PLUVIDER — a
// channel that also produces — and is resolved against its own registry; without a prefix it points at a
// provider and the path is the usual one. The two worlds do not cross: that is precisely why the registry
// is kept apart from 'clusterInfo.providers'.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ClusterInfo } from '../../src/model/ClusterInfo'
import { IChannel } from '../../src/channels/IChannel'
import { IProvider } from '../../src/providers/IProvider'
import { isPluvider, isPluviderId, pluviderId, TPluviderChannel } from '../../src/providers/Pluvider'

interface ISubscriptionCall {
    subscriber: string
    data: unknown
}

// A minimal channel: ClusterInfo only asks it for the id in order to log, and processProviderEvent to receive.
const fakeChannel = (id: string): IChannel => ({
    getChannelData: () => ({ id }),
    processProviderEvent: () => {}
} as unknown as IChannel)

// A minimal pluvider: a channel that also implements the production contract.
const fakePluvider = (id: string, added: ISubscriptionCall[], removed: string[]): TPluviderChannel => ({
    getChannelData: () => ({ id }),
    processProviderEvent: () => {},
    getPluviderData: () => ({ description: `lo que produce ${id}` }),
    addSubscriber: async (c: { getChannelData: () => { id: string } }, data: unknown) => { added.push({ subscriber: c.getChannelData().id, data }) },
    removeSubscriber: async (c: { getChannelData: () => { id: string } }) => { removed.push(c.getChannelData().id) },
    startProvider: async () => {},
    stopProvider: async () => {},
    getSubscriptionHelp: () => ({ usage: '', example: {} })
} as unknown as TPluviderChannel)

const fakeProvider = (id: string, added: ISubscriptionCall[], removed: string[]): IProvider => ({
    id,
    addSubscriber: async (c: IChannel, data: unknown) => { added.push({ subscriber: c.getChannelData().id, data }) },
    removeSubscriber: async (c: IChannel) => { removed.push(c.getChannelData().id) }
} as unknown as IProvider)

interface IHarness {
    ci: ClusterInfo
    toProvider: ISubscriptionCall[]
    toPluvider: ISubscriptionCall[]
    removedFromProvider: string[]
    removedFromPluvider: string[]
}

const harness = (): IHarness => {
    const toProvider: ISubscriptionCall[] = []
    const toPluvider: ISubscriptionCall[] = []
    const removedFromProvider: string[] = []
    const removedFromPluvider: string[] = []
    const ci = new ClusterInfo()
    ci.providers = [fakeProvider('events', toProvider, removedFromProvider)]
    ci.pluviders.set('plugin:agora', fakePluvider('agora', toPluvider, removedFromPluvider))
    return { ci, toProvider, toPluvider, removedFromProvider, removedFromPluvider }
}

test('pluviderId compone el id con el prefijo, y el autor del plugin no lo escribe', () => {
    assert.equal(pluviderId('agora'), 'plugin:agora')
    assert.equal(isPluviderId('plugin:agora'), true)
    assert.equal(isPluviderId('events'), false)
    // a provider named the same as the plugin is still addressable without ambiguity
    assert.notEqual(pluviderId('agora'), 'agora')
})

test('isPluvider declara por la PRESENCIA de getPluviderData, no por tener addSubscriber', () => {
    assert.equal(isPluvider(fakePluvider('agora', [], [])), true)
    assert.equal(isPluvider(fakeChannel('log')), false)
    // an object with addSubscriber but without getPluviderData is NOT a pluvider: addSubscriber is far
    // too generic to decide with
    const impostor = { getChannelData: () => ({ id: 'x' }), addSubscriber: async () => {} } as unknown as IChannel
    assert.equal(isPluvider(impostor), false)
})

test('un id con prefijo se resuelve contra el registro de pluviders y NO toca los providers', () => {
    const h = harness()
    h.ci.addSubscriber('plugin:agora', fakeChannel('montag'), { severity: 'high' })

    assert.equal(h.toPluvider.length, 1)
    assert.equal(h.toPluvider[0].subscriber, 'montag')
    assert.deepEqual(h.toPluvider[0].data, { severity: 'high' })
    assert.equal(h.toProvider.length, 0)
})

test('un id sin prefijo sigue yendo a los providers, con el comportamiento de siempre', () => {
    const h = harness()
    h.ci.addSubscriber('events', fakeChannel('agora'), { kinds: ['Pod'] })

    assert.equal(h.toProvider.length, 1)
    assert.equal(h.toProvider[0].subscriber, 'agora')
    assert.deepEqual(h.toProvider[0].data, { kinds: ['Pod'] })
    assert.equal(h.toPluvider.length, 0)
})

test('un pluvider ausente no rompe al consumidor: la dependencia es blanda', () => {
    const h = harness()
    assert.doesNotThrow(() => h.ci.addSubscriber('plugin:situs', fakeChannel('montag'), {}))
    assert.equal(h.toPluvider.length, 0)
    assert.equal(h.toProvider.length, 0)
})

test('un provider ausente tampoco rompe, y no se cuela por el camino de pluviders', () => {
    const h = harness()
    assert.doesNotThrow(() => h.ci.addSubscriber('metrics', fakeChannel('agora'), {}))
    assert.equal(h.toProvider.length, 0)
    assert.equal(h.toPluvider.length, 0)
})

test('el nombre pelado de un pluvider NO resuelve: hace falta el prefijo', () => {
    const h = harness()
    // a bare 'agora' is the channel's id, not the pluvider's; with no prefix it is looked up among providers
    h.ci.addSubscriber('agora', fakeChannel('montag'), {})
    assert.equal(h.toPluvider.length, 0)
    assert.equal(h.toProvider.length, 0)
})

test('removeSubscriber distingue igual entre pluvider y provider', () => {
    const h = harness()
    h.ci.removeSubscriber('plugin:agora', fakeChannel('montag'))
    assert.deepEqual(h.removedFromPluvider, ['montag'])
    assert.deepEqual(h.removedFromProvider, [])

    h.ci.removeSubscriber('events', fakeChannel('agora'))
    assert.deepEqual(h.removedFromProvider, ['agora'])
    assert.deepEqual(h.removedFromPluvider, ['montag'])
})

test('quitar la suscripcion de un pluvider ausente tampoco rompe', () => {
    const h = harness()
    assert.doesNotThrow(() => h.ci.removeSubscriber('plugin:situs', fakeChannel('montag')))
    assert.deepEqual(h.removedFromPluvider, [])
})

test('un provider y un pluvider con el MISMO nombre conviven sin pisarse', () => {
    const toProvider: ISubscriptionCall[] = []
    const toPluvider: ISubscriptionCall[] = []
    const ci = new ClusterInfo()
    ci.providers = [fakeProvider('agora', toProvider, [])]
    ci.pluviders.set('plugin:agora', fakePluvider('agora', toPluvider, []))

    ci.addSubscriber('agora', fakeChannel('c1'), { via: 'provider' })
    ci.addSubscriber('plugin:agora', fakeChannel('c2'), { via: 'pluvider' })

    assert.equal(toProvider.length, 1)
    assert.deepEqual(toProvider[0].data, { via: 'provider' })
    assert.equal(toPluvider.length, 1)
    assert.deepEqual(toPluvider[0].data, { via: 'pluvider' })
})
