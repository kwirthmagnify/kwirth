// A PROVIDER that consumes another provider. Until now only a channel could subscribe to a producer,
// because the handle asked for an IChannel and named the consumer through getChannelData(); a provider
// has neither, so it was left with reaching into clusterInfo.providers behind the core's back — which
// is exactly what the handle exists to prevent.
//
// What is pinned down here is the identity of the consumer, because that is the part that decides
// whether the registry of who-consumes-what tells the truth. Everything else in the handle was already
// covered by subscriptionRegistry.test.ts.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ClusterInfo } from '../../src/model/ClusterInfo'
import { IChannel } from '../../src/channels/IChannel'
import { IProvider } from '../../src/providers/IProvider'
import { consumerIdOf, isChannelConsumer, providerConsumerId, wireProviderConsumers, PROVIDER_CONSUMER_ID_PREFIX } from '../../src/providers/Consumer'

const channel = (id: string): IChannel => ({ getChannelData: () => ({ id }) }) as never
const providerConsumer = (id: string) => ({ id })

/*
    A pluvider is a channel that ALSO produces, so it carries both shapes at once. It is the reason the
    channel check comes first, and the only case where the order of the checks is observable.
*/
const pluviderLike = (id: string) => ({ id, getChannelData: () => ({ id }), getPluviderData: () => ({}) })

const fakeProvider = (id: string) => {
    const state = { adds: 0, removes: 0, provider: undefined as unknown as IProvider }
    state.provider = {
        id,
        addSubscriber: async () => { state.adds++ },
        removeSubscriber: async () => { state.removes++ }
    } as never
    return state
}

const clusterInfoWith = (...ids: string[]) => {
    const ci = new ClusterInfo()
    const fakes = ids.map(fakeProvider)
    ci.providers = fakes.map(f => f.provider)
    return { ci, fakes }
}

// ── consumer identity ────────────────────────────────────────────────────────────────────────────

test('a channel names itself with its bare id', () => {
    assert.equal(consumerIdOf(channel('agora')), 'agora')
})

test('a provider names itself with the provider: prefix', () => {
    assert.equal(consumerIdOf(providerConsumer('aws') as never), 'provider:aws')
    assert.equal(providerConsumerId('aws'), PROVIDER_CONSUMER_ID_PREFIX + 'aws')
})

/*
    THE reason the namespace exists. Without it, a channel 'aws' and a provider 'aws' consuming the same
    producer collapse into ONE edge, and the graph shows one consumer where there are two. Not a
    correctness bug —the subscriber Set still counts both, so the edge does not die early— but a lie in
    the one place built to tell the truth about this.
*/
test('a channel and a provider with the SAME name are different consumers', () => {
    assert.notEqual(consumerIdOf(channel('aws')), consumerIdOf(providerConsumer('aws') as never))
})

/*
    A pluvider carries an 'id' as well as getChannelData(). Asking about 'id' first would file every
    pluvider as a provider, and its edges would silently move to another name in the registry.
*/
test('a pluvider is a CHANNEL consumer: the channel check wins over the id', () => {
    assert.ok(isChannelConsumer(pluviderLike('agora') as never))
    assert.equal(consumerIdOf(pluviderLike('agora') as never), 'agora')
})

test('a consumer that cannot name itself yields undefined instead of a made-up id', () => {
    assert.equal(consumerIdOf({} as never), undefined)
    assert.equal(consumerIdOf({ id: '' } as never), undefined)
    assert.equal(consumerIdOf({ id: 7 } as never), undefined)
})

// ── the handle, with a provider on the consuming end ─────────────────────────────────────────────

test('a provider can get a handle to another provider and subscribe', async () => {
    const { ci, fakes } = clusterInfoWith('cloud-config')
    const consumer = providerConsumer('aws')
    const handle = ci.getProvider('cloud-config', consumer as never)

    assert.ok(handle, 'a provider must be able to ask for a producer')
    await handle!.subscribe({ processProviderEvent: () => {} })

    assert.equal(fakes[0].adds, 1)
    const edges = ci.getSubscriptions()
    assert.equal(edges.length, 1)
    assert.equal(edges[0].providerId, 'cloud-config')
    assert.equal(edges[0].consumerId, 'provider:aws')
})

// The regression the prefix prevents, end to end: two consumers, two edges.
test('a channel and a provider sharing a name produce TWO edges, not one', async () => {
    const { ci } = clusterInfoWith('cloud-config')
    await ci.getProvider('cloud-config', channel('aws'))!.subscribe({ processProviderEvent: () => {} })
    await ci.getProvider('cloud-config', providerConsumer('aws') as never)!.subscribe({ processProviderEvent: () => {} })

    assert.deepEqual(ci.getSubscriptions().map(s => s.consumerId).sort(), ['aws', 'provider:aws'])
})

test('unsubscribing a provider consumer takes its edge down', async () => {
    const { ci, fakes } = clusterInfoWith('cloud-config')
    const handle = ci.getProvider('cloud-config', providerConsumer('aws') as never)!
    const subscriber = { processProviderEvent: () => {} }

    await handle.subscribe(subscriber)
    assert.equal(ci.getSubscriptions().length, 1)

    await handle.unsubscribe(subscriber)
    assert.equal(fakes[0].removes, 1)
    assert.equal(ci.getSubscriptions().length, 0)
})

/*
    Refusing would be worse than an unnamed edge: the subscription is what the consumer actually needs,
    and the registry is a report. So it goes through, and the warning is what says the report is short.
*/
test('a consumer that cannot name itself still gets its subscription', async () => {
    const { ci, fakes } = clusterInfoWith('cloud-config')
    const handle = ci.getProvider('cloud-config', {} as never)

    assert.ok(handle)
    await handle!.subscribe({ processProviderEvent: () => {} })
    assert.equal(fakes[0].adds, 1, 'the subscription must not be refused')
})

test('asking for a producer that is not here answers undefined, without throwing', () => {
    const { ci } = clusterInfoWith('cloud-config')
    assert.equal(ci.getProvider('does-not-exist', providerConsumer('aws') as never), undefined)
})

// ── the wiring phase ─────────────────────────────────────────────────────────────────────────────

const wireable = (id: string, onProvidersReady?: () => void | Promise<void>) => ({ id, onProvidersReady })
const collect = () => { const errs: Array<{ id: string, err: unknown }> = []; return { errs, log: (id: string, err: unknown) => errs.push({ id, err }) } }

test('the wiring phase calls only the providers that implement the hook', async () => {
    const called: string[] = []
    const { errs, log } = collect()
    const wired = await wireProviderConsumers([
        wireable('aws', () => { called.push('aws') }),
        wireable('events'),                                  // no hook: must be skipped, not crashed on
        wireable('azure', async () => { called.push('azure') })
    ], log)

    assert.deepEqual(called, ['aws', 'azure'])
    assert.equal(wired, 2)
    assert.deepEqual(errs, [])
})

/*
    Consuming another producer is a SOFT dependency: one provider failing to wire up must not stop the
    rest, exactly as a channel subscribing to an absent pluvider does not stop its channel.
*/
test('one provider failing to wire up does not take the others down', async () => {
    const called: string[] = []
    const { errs, log } = collect()
    const wired = await wireProviderConsumers([
        wireable('aws', () => { throw new Error('its producer is not installed') }),
        wireable('azure', () => { called.push('azure') })
    ], log)

    assert.deepEqual(called, ['azure'], 'the one after the failure still runs')
    assert.equal(wired, 1, 'only the ones that actually wired up are counted')
    assert.equal(errs.length, 1)
    assert.equal(errs[0].id, 'aws')
})

test('a rejected promise from the hook is caught, not left unhandled', async () => {
    const { errs, log } = collect()
    await wireProviderConsumers([wireable('aws', async () => { throw new Error('boom') })], log)
    assert.equal(errs.length, 1)
})

test('the wiring phase tolerates an empty or absent list', async () => {
    const { log } = collect()
    assert.equal(await wireProviderConsumers([], log), 0)
    assert.equal(await wireProviderConsumers(undefined as never, log), 0)
})
