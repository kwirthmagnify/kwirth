// How the graph turns edges into nodes and layers (src/front/StatusGraph.ts). What is pinned here is that
// no line goes back up now that a provider can consume another provider: with A and B on top and C
// reading B, C has to end up BELOW B, and the channel reading all three below C.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHANNEL_NODE_PREFIX, channelsOf, consumerNodeId, isProviderConsumer, layerOf } from '../../src/front/StatusGraph'
import { EGraphLayer, IStatusEdge } from '../../src/common/StatusTypes'

const edge = (providerId: string, consumerId: string): IStatusEdge => ({ providerId, consumerId, since: 0 })

// The user's example: providers A and B, provider C subscribed to B, and a plugin reading A, B and C.
const EXAMPLE: IStatusEdge[] = [
    edge('b', 'provider:c'),
    edge('a', 'plugin'),
    edge('b', 'plugin'),
    edge('c', 'plugin')
]
const targetsOf = (edges: IStatusEdge[]): Set<string> => new Set(edges.map(e => consumerNodeId(e.consumerId)))

test('a provider consumer is recognised by the core prefix, and only by it', () => {
    assert.equal(isProviderConsumer('provider:aws'), true)
    assert.equal(isProviderConsumer('agora'), false)
    // A channel whose id merely CONTAINS the word is still a channel.
    assert.equal(isProviderConsumer('my-provider-channel'), false)
})

test('a provider consumer ends on the provider node itself, not on a copy of it', () => {
    assert.equal(consumerNodeId('provider:c'), 'c')
    assert.equal(consumerNodeId('agora'), `${CHANNEL_NODE_PREFIX}agora`)
})

test('only real channels become channel nodes, each once', () => {
    assert.deepEqual(channelsOf(EXAMPLE), ['plugin'])
})

test('🔴 the user example: A and B on top, C free (below B), the plugin at the bottom', () => {
    const targets = targetsOf(EXAMPLE)
    assert.equal(layerOf('a', targets), EGraphLayer.FIRST)
    assert.equal(layerOf('b', targets), EGraphLayer.FIRST)
    // Not pinned: pinning C to the first layer is what would draw the B -> C line sideways or upwards.
    assert.equal(layerOf('c', targets), undefined)
    assert.equal(layerOf(`${CHANNEL_NODE_PREFIX}plugin`, targets), EGraphLayer.LAST)
})

test('a producer with no lines at all stays on top, it does not sink with the channels', () => {
    assert.equal(layerOf('plugin:montag', targetsOf(EXAMPLE)), EGraphLayer.FIRST)
})

test('a channel is always last, even with nothing drawn', () => {
    assert.equal(layerOf(`${CHANNEL_NODE_PREFIX}magnify`, new Set()), EGraphLayer.LAST)
})

test('a chain of providers leaves every consumer in it unpinned', () => {
    // a -> b -> c: only 'a' consumes nothing.
    const targets = targetsOf([edge('a', 'provider:b'), edge('b', 'provider:c')])
    assert.equal(layerOf('a', targets), EGraphLayer.FIRST)
    assert.equal(layerOf('b', targets), undefined)
    assert.equal(layerOf('c', targets), undefined)
})
