// Magnify's USAGE answer says whether the 'metrics' provider is installed.
//
// The provider is an installable extension. Without the flag, a cluster with no provider and one whose
// provider has not read yet look the same (zeros), and the overview drew three empty charts with no
// explanation; with it the front shows why there is nothing to draw.

import test from 'node:test'
import assert from 'node:assert/strict'
import { MagnifyChannel } from '../../src/channels/magnify/MagnifyChannel'
import { ClusterInfo } from '../../src/model/ClusterInfo'
import { IProvider } from '../../src/providers/IProvider'
import { IMagnifyClusterUsage } from '../../src/channels/magnify/MagnifyMetricsTypes'

const channelWith = (providerIds: string[]): MagnifyChannel => {
    const clusterInfo = new ClusterInfo()
    clusterInfo.providers = providerIds.map(id => ({ id }) as unknown as IProvider)
    return new MagnifyChannel(clusterInfo, {})
}

test('with the metrics provider installed, the usage says so and carries its figures', async () => {
    const channel = channelWith(['events', 'metrics'])
    channel.processProviderEvent('metrics', { cluster: { vcpus: 4, memory: 1000, cpuUsage: 12.5, memoryUsage: 30, txmbps: 1, rxmbps: 2, pods: 7, maxPods: 110 } })
    const usage = await channel.getUsage('cluster') as IMagnifyClusterUsage
    assert.equal(usage.metricsProvider, true)
    assert.equal(usage.cpuUsage, 12.5)
    assert.equal(usage.pods, 7)
})

test('without it, the usage says the provider is missing instead of passing zeros off as a reading', async () => {
    const usage = await channelWith(['events']).getUsage('cluster') as IMagnifyClusterUsage
    assert.equal(usage.metricsProvider, false)
})

test('a cluster where no provider has been loaded at all counts as missing, not as an error', async () => {
    const clusterInfo = new ClusterInfo()
    const usage = await new MagnifyChannel(clusterInfo, {}).getUsage('cluster') as IMagnifyClusterUsage
    assert.equal(usage.metricsProvider, false)
    assert.equal(usage.eventsProvider, false)
})

test('the usage also says whether the events provider is installed, each flag on its own', async () => {
    assert.equal((await channelWith(['events']).getUsage('cluster') as IMagnifyClusterUsage).eventsProvider, true)
    const onlyMetrics = await channelWith(['metrics']).getUsage('cluster') as IMagnifyClusterUsage
    assert.equal(onlyMetrics.eventsProvider, false)
    assert.equal(onlyMetrics.metricsProvider, true)
})

/*
    The events feed, read through the contract's one-off read (getData) with a handle, not by looking the
    provider up and calling a method of its own.
*/
const eventsChannel = (getData?: (request: Record<string, unknown>) => Promise<unknown>) => {
    const requests: Record<string, unknown>[] = []
    const clusterInfo = new ClusterInfo()
    clusterInfo.providers = [{ id: 'events', addSubscriber: async () => { }, removeSubscriber: async () => { }, ...(getData ? { getData: async (r: Record<string, unknown>) => { requests.push(r); return getData(r) } } : {}) } as unknown as IProvider]
    const channel = new MagnifyChannel(clusterInfo, {}) as unknown as { getEventsForObject: (command: string, namespace: string, kind: string, name: string, limit: number) => Promise<unknown[]> }
    return { channel, requests }
}

test('the events feed of the cluster and of one object is read with getData', async () => {
    const { channel, requests } = eventsChannel(async () => [{ message: 'pulled' }])
    assert.deepEqual(await channel.getEventsForObject('cluster', '', '', '', 25), [{ message: 'pulled' }])
    await channel.getEventsForObject('object', 'shop', 'Pod', 'web-1', 10)
    assert.deepEqual(requests, [{ limit: 25 }, { namespace: 'shop', kind: 'Pod', name: 'web-1', limit: 10 }])
})

test('a provider that does not serve getData leaves the feed empty instead of breaking Magnify', async () => {
    const { channel } = eventsChannel()
    assert.deepEqual(await channel.getEventsForObject('cluster', '', '', '', 25), [])
})
