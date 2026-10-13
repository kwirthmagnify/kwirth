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
})
