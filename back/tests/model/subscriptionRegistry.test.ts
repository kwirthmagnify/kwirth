// The registry of who consumes what (ClusterInfo.getSubscriptions), which is where the Kwirth Status
// graph comes from. What is pinned down here is that a live edge SURVIVES one of its subscribers
// leaving: the original defect removed the edge on the first unsubscribe, so the graph emptied itself
// while the provider kept delivering to everyone else.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ClusterInfo } from '../../src/model/ClusterInfo'
import { IChannel } from '../../src/channels/IChannel'
import { IProvider } from '../../src/providers/IProvider'

// A channel only contributes its id to the registry. Two objects with the SAME id are two subscribers
// of the same channel: exactly the case of two tabs, or of a channel that gets re-instantiated.
const channel = (id: string): IChannel => ({ getChannelData: () => ({ id }) }) as never

interface IFakeProvider {
    provider: IProvider
    adds: number
    removes: number
    /** What the provider was actually handed, to check the core does not slip a wrapper in between. */
    lastSubscriber?: unknown
}

const provider = (id: string): IFakeProvider => {
    const fake: IFakeProvider = { adds: 0, removes: 0, provider: undefined as never }
    fake.provider = {
        id,
        addSubscriber: async (subscriber: unknown) => { fake.adds++; fake.lastSubscriber = subscriber },
        removeSubscriber: async () => { fake.removes++ }
    } as never
    return fake
}

const clusterInfoWith = (...ids: string[]) => {
    const ci = new ClusterInfo()
    const fakes = ids.map(provider)
    ci.providers = fakes.map(f => f.provider)
    return { ci, fakes }
}

test('a subscription registers the edge, with who produces and who consumes', () => {
    const { ci } = clusterInfoWith('events')
    ci.addSubscriber('events', channel('agora'), {})

    const edges = ci.getSubscriptions()
    assert.equal(edges.length, 1)
    assert.equal(edges[0].providerId, 'events')
    assert.equal(edges[0].consumerId, 'agora')
})

test('two subscribers of the same channel are ONE edge, and the first unsubscribe does not take it', () => {
    const { ci, fakes } = clusterInfoWith('events')
    const tab1 = channel('agora')
    const tab2 = channel('agora')

    ci.addSubscriber('events', tab1, {})
    ci.addSubscriber('events', tab2, {})
    assert.equal(ci.getSubscriptions().length, 1, 'the graph says who feeds whom, not how many times')
    assert.equal(fakes[0].adds, 2, 'the provider does get both subscriptions')

    ci.removeSubscriber('events', tab1)
    assert.equal(ci.getSubscriptions().length, 1, 'a live subscriber remains: the edge still exists')

    ci.removeSubscriber('events', tab2)
    assert.equal(ci.getSubscriptions().length, 0, 'the last one left: now it does disappear')
})

test('the same object subscribed twice counts once, as it does in the provider Map', () => {
    const { ci } = clusterInfoWith('metrics')
    const c = channel('magnify')

    ci.addSubscriber('metrics', c, {})
    ci.addSubscriber('metrics', c, {})
    assert.equal(ci.getSubscriptions().length, 1)

    // One unsubscribe is enough, because for the provider there is a single subscriber too.
    ci.removeSubscriber('metrics', c)
    assert.equal(ci.getSubscriptions().length, 0)
})

test('since belongs to the edge: a later subscriber does not overwrite it', async () => {
    const { ci } = clusterInfoWith('events')
    ci.addSubscriber('events', channel('iter'), {})
    const first = ci.getSubscriptions()[0].since

    await new Promise(r => setTimeout(r, 5))
    ci.addSubscriber('events', channel('iter'), {})

    assert.equal(ci.getSubscriptions()[0].since, first)
})

test('an unsubscribe from someone who never subscribed does not remove anyone else edge', () => {
    const { ci } = clusterInfoWith('trivy')
    const live = channel('excubitor')
    ci.addSubscriber('trivy', live, {})

    ci.removeSubscriber('trivy', channel('excubitor'))   // same id, different object: never subscribed
    assert.equal(ci.getSubscriptions().length, 1)

    ci.removeSubscriber('trivy', live)
    assert.equal(ci.getSubscriptions().length, 0)
})

test('a channel can feed from several providers, and each edge lives on its own', () => {
    const { ci } = clusterInfoWith('events', 'metrics')
    const c = channel('agora')
    ci.addSubscriber('events', c, {})
    ci.addSubscriber('metrics', c, {})

    ci.removeSubscriber('events', c)
    const edges = ci.getSubscriptions()
    assert.equal(edges.length, 1)
    assert.equal(edges[0].providerId, 'metrics')
})

test('what comes back is a copy: touching it does not alter the core registry', () => {
    const { ci } = clusterInfoWith('events')
    ci.addSubscriber('events', channel('agora'), {})

    const edges = ci.getSubscriptions()
    edges[0].consumerId = 'other'
    edges.length = 0

    const after = ci.getSubscriptions()
    assert.equal(after.length, 1)
    assert.equal(after[0].consumerId, 'agora')
})

test('the edge does not expose its subscribers: outside, only who with whom is needed', () => {
    const { ci } = clusterInfoWith('events')
    ci.addSubscriber('events', channel('agora'), {})

    assert.deepEqual(Object.keys(ci.getSubscriptions()[0]).sort(), ['consumerId', 'providerId', 'since'])
})

test('subscribing to a provider that does not exist invents no edge', () => {
    const { ci } = clusterInfoWith('events')
    ci.addSubscriber('nosuchthing', channel('agora'), {})
    assert.equal(ci.getSubscriptions().length, 0)
})

test('pluviders register the same way, under their composite id', () => {
    const ci = new ClusterInfo()
    ci.providers = []
    let adds = 0
    ci.pluviders.set('plugin:agora', { addSubscriber: () => { adds++ }, removeSubscriber: () => {} } as never)

    const c = channel('montag')
    ci.addSubscriber('plugin:agora', c, {})
    assert.equal(adds, 1)
    assert.equal(ci.getSubscriptions()[0].providerId, 'plugin:agora')

    ci.removeSubscriber('plugin:agora', c)
    assert.equal(ci.getSubscriptions().length, 0)
})

// ── The handle: subscribing without being able to bypass the core ──────────────────────────────
//
// The handle exists so that the registry above cannot be incomplete. What is pinned here is the part
// that makes it worth having: it is bound to both ends, it counts per SUBSCRIBER (so one channel
// serving several tabs is one edge held up by several subscriptions), and it never stands between
// the producer and the consumer.

test('the handle registers the edge, with both ends, without the channel saying who it is', () => {
    const { ci } = clusterInfoWith('events')
    const handle = ci.getProvider('events', channel('agora'))!
    handle.subscribe({ processProviderEvent: () => {} })

    const edges = ci.getSubscriptions()
    assert.equal(edges.length, 1)
    assert.equal(edges[0].providerId, 'events')
    assert.equal(edges[0].consumerId, 'agora')
})

test('🔴 the handle does NOT wrap the subscriber: the provider gets the very same object', () => {
    /*
        This is the performance guarantee, and it is a real risk: wrapping the subscriber to count
        deliveries would be one closure per event, for everyone, whether or not anybody is looking.
        If someone ever adds that wrapper, this test says so.
    */
    const { ci, fakes } = clusterInfoWith('events')
    const subscriber = { processProviderEvent: () => {} }
    ci.getProvider('events', channel('agora'))!.subscribe(subscriber)

    assert.equal(fakes[0].lastSubscriber, subscriber, 'the provider is being handed something other than the subscriber')
})

test('one subscription per tab: the edge holds until the last one leaves', () => {
    const { ci } = clusterInfoWith('sugarless')
    const handle = ci.getProvider('sugarless', channel('sugarless'))!
    const tab1 = { processProviderEvent: () => {} }
    const tab2 = { processProviderEvent: () => {} }

    handle.subscribe(tab1)
    handle.subscribe(tab2)
    assert.equal(ci.getSubscriptions().length, 1, 'two tabs of one channel are one edge')

    handle.unsubscribe(tab1)
    assert.equal(ci.getSubscriptions().length, 1, 'one tab is still receiving')
    handle.unsubscribe(tab2)
    assert.equal(ci.getSubscriptions().length, 0)
})

test('unsubscribing goes through the provider too, so nothing is left receiving', () => {
    const { ci, fakes } = clusterInfoWith('events')
    const subscriber = { processProviderEvent: () => {} }
    const handle = ci.getProvider('events', channel('iter'))!

    handle.subscribe(subscriber)
    handle.unsubscribe(subscriber)
    assert.equal(fakes[0].removes, 1)
})

test('asking for a producer that is not here answers undefined, and says nothing about it', () => {
    const { ci } = clusterInfoWith('events')
    assert.equal(ci.getProvider('nosuchthing', channel('agora')), undefined)
    assert.equal(ci.getProvider('plugin:notinstalled', channel('agora')), undefined)
})

test('a pluvider is handed out as a handle just the same', () => {
    const ci = new ClusterInfo()
    ci.providers = []
    let adds = 0
    ci.pluviders.set('plugin:agora', { addSubscriber: () => { adds++ }, removeSubscriber: () => {} } as never)

    const subscriber = { processProviderEvent: () => {} }
    const handle = ci.getProvider('plugin:agora', channel('montag'))!
    handle.subscribe(subscriber)

    assert.equal(adds, 1)
    assert.equal(ci.getSubscriptions()[0].providerId, 'plugin:agora')
    handle.unsubscribe(subscriber)
    assert.equal(ci.getSubscriptions().length, 0)
})

test('the old addSubscriber and the handle land in the same registry', () => {
    const { ci } = clusterInfoWith('events')
    ci.addSubscriber('events', channel('agora'), {})
    ci.getProvider('events', channel('iter'))!.subscribe({ processProviderEvent: () => {} })

    assert.deepEqual(ci.getSubscriptions().map(s => s.consumerId).sort(), ['agora', 'iter'])
})
