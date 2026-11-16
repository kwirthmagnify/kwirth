// The cluster list an extension reads: without the entries the user switched off in Manage cluster list.

import test from 'node:test'
import assert from 'node:assert/strict'
import { userStoreValueForExtensions } from '../../src/tools/ClusterListFilter'

test('🔴 the cluster list loses the entries switched off (inUse: false); absent or true stay, as saved', () => {
    const list = [
        { name: 'frs', url: 'https://eks.example/kwirth', id: 'eks' },                                                // saved before the switch existed
        { name: 'eks-ianus', url: 'https://eks.example/kwirth', id: 'eks', route: { resolver: 'ianus', clusterUid: 'eks' }, inUse: true },
        { name: 'old-direct', url: 'https://eks.example/kwirth', id: 'eks', inUse: false }
    ]
    assert.deepEqual((userStoreValueForExtensions('clusters', 'list', list) as { name: string }[]).map(e => e.name), ['frs', 'eks-ianus'])
})

test('anything else in the store goes as it is', () => {
    const settings = [{ inUse: false }]
    assert.equal(userStoreValueForExtensions('settings', 'general', settings), settings, 'another group: untouched')
    assert.equal(userStoreValueForExtensions('clusters', 'other', settings), settings, 'another key: untouched')
    assert.equal(userStoreValueForExtensions('clusters', 'list', undefined), undefined, 'nothing saved: nothing')
    assert.deepEqual(userStoreValueForExtensions('clusters', 'list', 'not a list'), 'not a list')
})
