// The Home tab's figures (src/front/StatusHome.ts). Each box makes a claim about a tab, so what matters
// is that the counts are exact: a box that says "3 failed" when there are two is worse than no box.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarize } from '../../src/front/StatusHome'
import { EComponentHealth, EComponentKind, IStatusComponent, IStatusEdge, IStatusInventory } from '../../src/common/StatusTypes'

const componente = (id: string, kind: EComponentKind, health: EComponentHealth, campos: Partial<IStatusComponent> = {}): IStatusComponent =>
    ({ kind, id, displayName: id, health, ...campos })

const arista = (providerId: string, consumerId: string): IStatusEdge => ({ providerId, consumerId, since: 1 })

const inventario = (components: IStatusComponent[], edges: IStatusEdge[] = []): IStatusInventory =>
    ({ cluster: 'c', takenAt: 1000, components, edges })

const DEV = inventario([
    componente('events', EComponentKind.PROVIDER, EComponentHealth.ACTIVE, { subscribers: 2, knownConsumers: 2 }),
    componente('metrics', EComponentKind.PROVIDER, EComponentHealth.IDLE, { subscribers: 0, knownConsumers: 0 }),
    componente('trivy', EComponentKind.PROVIDER, EComponentHealth.FAILED),
    componente('cloud-config', EComponentKind.PROVIDER, EComponentHealth.NOT_INSTANTIATED),
    componente('plugin:agora', EComponentKind.PLUVIDER, EComponentHealth.ACTIVE, { subscribers: 1, knownConsumers: 1 }),
    componente('teams', EComponentKind.SENDER, EComponentHealth.INSTANTIATED),
    componente('smtp', EComponentKind.SENDER, EComponentHealth.PENDING_RESTART),
    componente('jira', EComponentKind.WEBHOOK, EComponentHealth.UNKNOWN),
    // Channels are not inventory rows: they exist only as consumers in the graph.
    componente('agora', EComponentKind.CHANNEL, EComponentHealth.ACTIVE)
], [
    arista('events', 'agora'),
    arista('events', 'montag'),
    arista('plugin:agora', 'provider-debug')
])

test('Providers: only providers and pluviders, counted by kind', () => {
    const s = summarize(DEV).providers
    assert.equal(s.total, 5)
    assert.equal(s.byKind[EComponentKind.PROVIDER], 4)
    assert.equal(s.byKind[EComponentKind.PLUVIDER], 1)
    assert.equal(s.byKind[EComponentKind.SENDER], 0, 'a sender is not a producer')
    assert.equal(s.byKind[EComponentKind.CHANNEL], 0, 'a channel is not a row')
})

test('Providers: every state counted, and the ones with nobody at zero', () => {
    const s = summarize(DEV).providers
    assert.equal(s.byHealth[EComponentHealth.ACTIVE], 2)
    assert.equal(s.byHealth[EComponentHealth.IDLE], 1)
    assert.equal(s.byHealth[EComponentHealth.FAILED], 1)
    assert.equal(s.byHealth[EComponentHealth.NOT_INSTANTIATED], 1)
    assert.equal(s.byHealth[EComponentHealth.PENDING_RESTART], 0)
    assert.equal(s.byHealth[EComponentHealth.INSTANTIATED], 0)
    assert.equal(s.byHealth[EComponentHealth.UNKNOWN], 0)
})

test('🔴 attention = failed + needs restart + not started; idle and not reported are NOT attention', () => {
    // Idle is information, not a fault; not reported is a missing datum. Neither is something to fix.
    const s = summarize(DEV)
    assert.equal(s.providers.attention, 2, 'trivy (failed) and cloud-config (not started)')
    assert.equal(s.extensions.attention, 1, 'smtp (needs restart); jira (not reported) does not count')
})

test('Extensions: senders and webhooks, and nothing else', () => {
    const s = summarize(DEV).extensions
    assert.equal(s.total, 3)
    assert.equal(s.byKind[EComponentKind.SENDER], 2)
    assert.equal(s.byKind[EComponentKind.WEBHOOK], 1)
    assert.equal(s.byKind[EComponentKind.PROVIDER], 0)
    assert.equal(s.byHealth[EComponentHealth.INSTANTIATED], 1)
    assert.equal(s.byHealth[EComponentHealth.PENDING_RESTART], 1)
    assert.equal(s.byHealth[EComponentHealth.UNKNOWN], 1)
})

test('Graph: every producer is a node, a consumer is counted once, an edge is one line', () => {
    const g = summarize(DEV).graph
    assert.equal(g.producers, 5, 'all producers, consumed or not')
    assert.equal(g.consumers, 3, 'agora, montag, provider-debug — not four lines')
    assert.equal(g.edges, 3)
    assert.equal(g.unbrokered, 0)
})

test('Graph: consumers the core did not broker are reported, the same way the graph does', () => {
    const inv = inventario([
        componente('sugarless', EComponentKind.PROVIDER, EComponentHealth.ACTIVE, { subscribers: 2, knownConsumers: 0 }),
        componente('events', EComponentKind.PROVIDER, EComponentHealth.ACTIVE, { subscribers: 1, knownConsumers: 1 })
    ], [arista('events', 'agora')])
    assert.equal(summarize(inv).graph.unbrokered, 2)
})

test('an empty snapshot gives zeros everywhere, and does not blow up', () => {
    const s = summarize(inventario([]))
    assert.equal(s.providers.total, 0)
    assert.equal(s.extensions.total, 0)
    assert.equal(s.providers.attention, 0)
    assert.deepEqual(s.graph, { producers: 0, consumers: 0, edges: 0, unbrokered: 0 })
})
