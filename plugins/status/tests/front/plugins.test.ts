// The Plugins tab's logic (src/front/StatusPlugins.ts). The finding that matters is "not reported": a
// plugin whose channel does not count its instances must never be summed as zero.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EPluginState, IPluginStatus } from '@kwirthmagnify/kwirth-common'
import { filterPlugins, pluginStateLabel, sortPlugins, summarizePlugins } from '../../src/front/StatusPlugins'

const plugin = (id: string, state: EPluginState, over: Partial<IPluginStatus> = {}): IPluginStatus => ({
    id,
    name: id,
    version: '1.0.0',
    requiresRestart: false,
    state,
    ...over
})

test('each state has its own words and colour', () => {
    assert.deepEqual(pluginStateLabel(EPluginState.RUNNING), { label: 'Running', color: 'success' })
    assert.deepEqual(pluginStateLabel(EPluginState.REMOTE), { label: 'Remote', color: 'default' })
    assert.deepEqual(pluginStateLabel(EPluginState.NOT_STARTED), { label: 'Not started', color: 'warning' })
    assert.deepEqual(pluginStateLabel(EPluginState.FAILED), { label: 'Failed', color: 'error' })
})

test('🔴 a state from a newer core is shown as Unknown, not a crash', () => {
    assert.deepEqual(pluginStateLabel('quarantined' as EPluginState), { label: 'Unknown', color: 'default' })
})

test('what needs a look sorts first: failed, not started, unknown, remote, running; then by id', () => {
    const list = [
        plugin('z-run', EPluginState.RUNNING),
        plugin('a-run', EPluginState.RUNNING),
        plugin('remote', EPluginState.REMOTE),
        plugin('new', 'quarantined' as EPluginState),
        plugin('idle', EPluginState.NOT_STARTED),
        plugin('broken', EPluginState.FAILED)
    ]
    assert.deepEqual(sortPlugins(list).map(p => p.id), ['broken', 'idle', 'new', 'remote', 'a-run', 'z-run'])
    // It does not reorder the input.
    assert.equal(list[0].id, 'z-run')
})

test('the filter matches id, name, version and state, case-insensitive', () => {
    const list = [
        plugin('situs', EPluginState.RUNNING, { name: 'Situs Map', version: '0.5.1' }),
        plugin('agora', EPluginState.FAILED, { version: '2.0.0' })
    ]
    assert.deepEqual(filterPlugins(list, '').map(p => p.id), ['situs', 'agora'])
    assert.deepEqual(filterPlugins(list, 'MAP').map(p => p.id), ['situs'])
    assert.deepEqual(filterPlugins(list, '2.0').map(p => p.id), ['agora'])
    assert.deepEqual(filterPlugins(list, 'failed').map(p => p.id), ['agora'])
    assert.deepEqual(filterPlugins(list, 'running').map(p => p.id), ['situs'])
    assert.deepEqual(filterPlugins(list, 'zzz'), [])
})

test('🔴 the summary sums only what is reported, and counts apart who does not report', () => {
    const s = summarizePlugins([
        plugin('status', EPluginState.RUNNING, { instances: { instances: 2, connections: 1 } }),
        plugin('situs', EPluginState.RUNNING),
        plugin('echo', EPluginState.RUNNING, { instances: { instances: 0, connections: 0 } }),
        plugin('broken', EPluginState.FAILED),
        // Not running: not asked, so it is not "not reporting" either.
        plugin('remote', EPluginState.REMOTE)
    ])
    assert.deepEqual(s, { total: 5, failed: 1, instances: 2, unreported: 1 })
    assert.deepEqual(summarizePlugins([]), { total: 0, failed: 0, instances: 0, unreported: 0 })
})
