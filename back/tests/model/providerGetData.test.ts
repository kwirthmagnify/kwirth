// The one-off read of the provider contract (IProvider.getData), through the handle ClusterInfo hands out.
//
// A consumer asks a provider for something once — the latest events of a pod, say — with the same handle
// it subscribes with, instead of looking the provider up and calling a method of its own. A provider
// that does not serve reads must say so clearly, not fail with a TypeError on undefined.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ClusterInfo } from '../../src/model/ClusterInfo'
import { IChannel } from '../../src/channels/IChannel'
import { IProvider } from '../../src/providers/IProvider'

const consumer = { getChannelData: () => ({ id: 'magnify' }) } as unknown as IChannel

const clusterInfoWith = (providers: object[]): ClusterInfo => {
    const clusterInfo = new ClusterInfo()
    clusterInfo.providers = providers.map(p => ({ addSubscriber: async () => { }, removeSubscriber: async () => { }, ...p }) as unknown as IProvider)
    return clusterInfo
}

test('the handle hands the request to the provider and returns what it answers', async () => {
    const seen: Record<string, unknown>[] = []
    const clusterInfo = clusterInfoWith([{ id: 'events', getData: async (request: Record<string, unknown>) => { seen.push(request); return ['e1', 'e2'] } }])
    const handle = clusterInfo.getProvider('events', consumer)!
    assert.deepEqual(await handle.getData({ limit: 2 }), ['e1', 'e2'])
    assert.deepEqual(seen, [{ limit: 2 }])
})

test('a provider that does not serve reads is refused with a clear error', async () => {
    const handle = clusterInfoWith([{ id: 'tick' }]).getProvider('tick', consumer)!
    await assert.rejects(handle.getData({}), /Provider 'tick' does not serve getData/)
})

test('a failure inside the provider reaches the consumer as it is', async () => {
    const handle = clusterInfoWith([{ id: 'events', getData: async () => { throw new Error('kube said no') } }]).getProvider('events', consumer)!
    await assert.rejects(handle.getData({}), /kube said no/)
})

test('reading does not subscribe: the registry of subscriptions stays as it was', async () => {
    const clusterInfo = clusterInfoWith([{ id: 'events', getData: async () => [] }])
    await clusterInfo.getProvider('events', consumer)!.getData({})
    assert.deepEqual(clusterInfo.getSubscriptions(), [])
})
