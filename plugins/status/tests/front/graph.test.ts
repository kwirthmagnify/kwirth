// How the graph turns edges into nodes and layers (src/front/StatusGraph.ts). What is pinned here: ONE node
// per plugin — a pluvider is drawn on its plugin's node, not as one more producer — and layers that grow
// DOWNWARDS by the depth of what each node consumes, so every line goes down and a consumer sits right
// below the deepest thing it reads.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHANNEL_NODE_PREFIX, IGraphLine, channelsOf, consumerNodeId, depthOf, isPluviderId, isProviderConsumer, producerNodeId } from '../../src/front/StatusGraph'
import { IStatusEdge } from '../../src/common/StatusTypes'

const edge = (providerId: string, consumerId: string): IStatusEdge => ({ providerId, consumerId, since: 0 })
const line = (source: string, target: string): IGraphLine => ({ id: `${source}->${target}`, source, target })
const ch = (id: string): string => `${CHANNEL_NODE_PREFIX}${id}`

test('a provider consumer is recognised by the core prefix, and only by it', () => {
    assert.equal(isProviderConsumer('provider:aws'), true)
    assert.equal(isProviderConsumer('agora'), false)
    // A channel whose id merely CONTAINS the word is still a channel.
    assert.equal(isProviderConsumer('my-provider-channel'), false)
})

test('a provider consumer ends on the provider node itself, not on a copy of it', () => {
    assert.equal(consumerNodeId('provider:c'), 'c')
    assert.equal(consumerNodeId('agora'), ch('agora'))
})

test('🔴 a pluvider IS its plugin: its lines leave the plugin node, not a producer node of its own', () => {
    assert.equal(isPluviderId('plugin:agora'), true)
    assert.equal(isPluviderId('events'), false)
    assert.equal(producerNodeId('plugin:agora'), ch('agora'))
    // The very node its own subscriptions end on: one node, not two.
    assert.equal(producerNodeId('plugin:agora'), consumerNodeId('agora'))
    assert.equal(producerNodeId('events'), 'events')
})

test('every plugin is drawn once: consumers, and pluviders even when they consume nothing', () => {
    const edges = [edge('events', 'agora'), edge('plugin:agora', 'specula'), edge('events', 'provider:c')]
    // 'agora' consumes AND publishes: once. 'montag' publishes and consumes nothing: still drawn.
    assert.deepEqual(channelsOf(edges, ['plugin:agora', 'plugin:montag']), ['agora', 'specula', 'montag'])
    // A provider consumer is not a channel; a non-pluvider id in the list is ignored.
    assert.deepEqual(channelsOf([edge('a', 'provider:b')], ['events']), [])
})

test('🔴 layers grow downwards: a pluvider consumer one below it, ITS consumer one more, and so on', () => {
    // events -> agora (pluvider) -> specula (pluvider) -> x; and magnify reading events directly.
    const nodes = ['events', ch('agora'), ch('specula'), ch('x'), ch('magnify')]
    const d = depthOf(nodes, [
        line('events', ch('agora')),
        line(ch('agora'), ch('specula')),
        line(ch('specula'), ch('x')),
        line('events', ch('magnify'))
    ])
    assert.deepEqual([...d.entries()], [['events', 0], [ch('agora'), 1], [ch('specula'), 2], [ch('x'), 3], [ch('magnify'), 1]])
})

test('a node goes one below the DEEPEST thing it reads, not the shallowest', () => {
    // C reads A (depth 0) and B (depth 1): it goes to 2.
    const d = depthOf(['a', 'b', 'c'], [line('a', 'b'), line('a', 'c'), line('b', 'c')])
    assert.equal(d.get('c'), 2)
})

test('a node with no lines is on the top layer, whatever it is', () => {
    const d = depthOf(['events', ch('montag')], [])
    assert.equal(d.get('events'), 0)
    assert.equal(d.get(ch('montag')), 0)
})

test('🔴 a cycle does not hang it: it ends, with finite depths', () => {
    const nodes = ['a', ch('b'), ch('c')]
    const d = depthOf(nodes, [line('a', ch('b')), line(ch('b'), ch('c')), line(ch('c'), ch('b'))])
    for (const n of nodes) assert.ok(Number.isFinite(d.get(n)!), `${n} has no finite depth`)
    assert.ok(d.get(ch('b'))! <= nodes.length && d.get(ch('c'))! <= nodes.length)
})

test('a line to or from a node that is not drawn moves nobody; a self-line neither', () => {
    const d = depthOf(['a', 'b'], [line('ghost', 'a'), line('a', 'ghost'), line('b', 'b')])
    assert.equal(d.get('a'), 0)
    assert.equal(d.get('b'), 0)
})
