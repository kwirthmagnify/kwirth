import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EPluginState, IChannelInstances } from '@kwirthmagnify/kwirth-common'
import { buildPluginStatuses, instancesOf, IPluginSources } from '../../src/tools/PluginStatus'
import { IPluginMeta } from '../../src/tools/PluginManager'

/*
    The installed plugins as the Status channel shows them (plans/kwirth-status/PLAN-v2.md, S3).

    What is pinned down is above all what canNOT be said: a plugin whose channel does not report its
    figures has none — never a zero, which would read as "nobody uses it" — and a channel that throws
    takes only itself down, not the list.
*/

const meta = (id: string, over: Partial<IPluginMeta> = {}): IPluginMeta => ({ id, name: id, version: '1.0.0', description: '', ...over })

const channel = (getInstances?: () => IChannelInstances) => ({ getInstances })

const sources = (over: Partial<IPluginSources>): IPluginSources => ({
    metas: [],
    registered: new Set(),
    running: new Map(),
    remote: new Set(),
    ...over
})

test('🔴 the four states, from what the core already knows', () => {
    const list = buildPluginStatuses(sources({
        metas: [meta('running'), meta('remote'), meta('idle'), meta('broken')],
        registered: new Set(['running', 'remote', 'idle']),
        running: new Map([['running', channel()]]),
        remote: new Set(['remote'])
    }))
    assert.deepEqual(list.map(p => [p.id, p.state]), [
        ['running', EPluginState.RUNNING],
        ['remote', EPluginState.REMOTE],
        ['idle', EPluginState.NOT_STARTED],
        ['broken', EPluginState.FAILED]
    ])
})

test('a running channel that reports gives its figures', () => {
    const [p] = buildPluginStatuses(sources({
        metas: [meta('status')],
        registered: new Set(['status']),
        running: new Map([['status', channel(() => ({ instances: 3, connections: 2 }))]])
    }))
    assert.deepEqual(p.instances, { instances: 3, connections: 2 })
})

test('🔴 a channel without getInstances has NO figures — not a zero', () => {
    const [p] = buildPluginStatuses(sources({
        metas: [meta('situs')],
        registered: new Set(['situs']),
        running: new Map([['situs', channel()]])
    }))
    assert.equal('instances' in p, false)
})

test('🔴 a getInstances that throws takes only that plugin down', () => {
    const list = buildPluginStatuses(sources({
        metas: [meta('bad'), meta('good')],
        registered: new Set(['bad', 'good']),
        running: new Map([
            ['bad', channel(() => { throw new Error('boom') })],
            ['good', channel(() => ({ instances: 1, connections: 1 }))]
        ])
    }))
    assert.equal('instances' in list[0], false)
    assert.equal(list[0].state, EPluginState.RUNNING)
    assert.deepEqual(list[1].instances, { instances: 1, connections: 1 })
})

test('an answer that is not two counts is discarded, not believed', () => {
    const bad: unknown[] = [undefined, {}, { instances: -1, connections: 0 }, { instances: 1.5, connections: 1 }, { instances: '2', connections: 1 }]
    for (const r of bad) {
        assert.equal(instancesOf('x', channel(() => r as IChannelInstances)), undefined, JSON.stringify(r))
    }
    // Extra fields do not travel: only the two counts.
    assert.deepEqual(instancesOf('x', channel(() => ({ instances: 0, connections: 0, secret: 'x' } as IChannelInstances))), { instances: 0, connections: 0 })
})

test('name, source and requiresRestart come from the metadata, normalised', () => {
    const list = buildPluginStatuses(sources({
        metas: [
            meta('a', { displayName: 'Plugin A', installedFrom: 'dev', requiresRestart: true }),
            meta('b', { name: '@scope/b' }),
            meta('c', { name: '' })
        ]
    }))
    assert.deepEqual(list[0], { id: 'a', name: 'Plugin A', version: '1.0.0', source: 'dev', requiresRestart: true, state: EPluginState.FAILED })
    assert.equal(list[1].name, '@scope/b')
    assert.equal(list[1].requiresRestart, false)
    assert.equal('source' in list[1], false)
    assert.equal(list[2].name, 'c')
})

test('an empty Kwirth gives an empty list', () => {
    assert.deepEqual(buildPluginStatuses(sources({})), [])
})
