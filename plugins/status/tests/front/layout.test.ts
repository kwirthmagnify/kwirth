// The layer rule runs through the REAL elk (the same version the core serves), with the graph the plugin
// builds (elkGraphOf). depthOf being right is not enough: what matters is where elk puts the nodes — one
// layer per depth, growing downwards — and that no line goes back up.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import ELK from 'elkjs/lib/elk.bundled.js'
import { CHANNEL_NODE_PREFIX, IGraphLine, elkGraphOf } from '../../src/front/StatusGraph'

interface IPlaced {
    id: string
    y: number
}

const layout = async (nodeIds: string[], lines: IGraphLine[]): Promise<Map<string, number>> => {
    const result = await new ELK().layout(elkGraphOf(nodeIds, lines) as never) as { children?: IPlaced[] }
    return new Map((result.children ?? []).map(c => [c.id, c.y]))
}

const line = (source: string, target: string): IGraphLine => ({ id: `${source}->${target}`, source, target })
const PLUGIN = `${CHANNEL_NODE_PREFIX}plugin`

test('🔴 the user example: A and B on top, C below B, the plugin below C', async () => {
    const y = await layout(['a', 'b', 'c', PLUGIN], [
        line('b', 'c'),
        line('a', PLUGIN),
        line('b', PLUGIN),
        line('c', PLUGIN)
    ])
    assert.equal(y.get('a'), y.get('b'), 'A and B share the top layer')
    assert.ok(y.get('c')! > y.get('b')!, 'C sits below the B it reads')
    assert.ok(y.get(PLUGIN)! > y.get('c')!, 'the plugin sits below C')
})

test('every line goes down, whatever the chain', async () => {
    const lines = [line('a', 'b'), line('b', 'c'), line('a', 'c'), line('c', PLUGIN), line('x', PLUGIN)]
    const y = await layout(['a', 'b', 'c', 'x', PLUGIN], lines)
    for (const l of lines) assert.ok(y.get(l.source)! < y.get(l.target)!, `${l.id} does not go down`)
})

test('a lonely producer stays with the top layer, not with the channels', async () => {
    const y = await layout(['a', 'b', 'plugin:montag', PLUGIN], [line('a', 'b'), line('b', PLUGIN)])
    assert.equal(y.get('plugin:montag'), y.get('a'))
})

test('🔴 a pluvider chain: each consumer one layer below what it reads, NOT all channels at the bottom', async () => {
    // events -> agora (publishes) -> specula (publishes) -> x; magnify reads events directly.
    const AGORA = `${CHANNEL_NODE_PREFIX}agora`
    const SPECULA = `${CHANNEL_NODE_PREFIX}specula`
    const X = `${CHANNEL_NODE_PREFIX}x`
    const MAGNIFY = `${CHANNEL_NODE_PREFIX}magnify`
    const y = await layout(['events', AGORA, SPECULA, X, MAGNIFY], [
        line('events', AGORA),
        line(AGORA, SPECULA),
        line(SPECULA, X),
        line('events', MAGNIFY)
    ])
    assert.ok(y.get('events')! < y.get(AGORA)!, 'agora below events')
    assert.ok(y.get(AGORA)! < y.get(SPECULA)!, 'specula below agora')
    assert.ok(y.get(SPECULA)! < y.get(X)!, 'x below specula')
    // The rule that changed: a channel that only reads events sits on the layer right below it, level
    // with agora — not pinned to the bottom with x.
    assert.equal(y.get(MAGNIFY), y.get(AGORA), 'magnify is one layer below events, level with agora')
})

test('a separate pair does not sink the rest: its channel is in the channels layer', async () => {
    // The sugarless -> sugarless case that separateConnectedComponents used to stack on its own.
    const y = await layout(['events', 'sugarless', `${CHANNEL_NODE_PREFIX}magnify`, `${CHANNEL_NODE_PREFIX}sugarless`], [
        line('events', `${CHANNEL_NODE_PREFIX}magnify`),
        line('sugarless', `${CHANNEL_NODE_PREFIX}sugarless`)
    ])
    assert.equal(y.get('events'), y.get('sugarless'))
    assert.equal(y.get(`${CHANNEL_NODE_PREFIX}magnify`), y.get(`${CHANNEL_NODE_PREFIX}sugarless`))
})
