// Magnify's USAGE answer says whether the 'metrics' and 'events' providers are installed, and its events
// feed is read through the providers' one-off read (getData).
//
// Both providers are installable extensions. Without the flags, a cluster with no provider and one whose
// provider has not read yet look the same (zeros), and the overview drew three empty charts with no
// explanation; with them the front shows why there is nothing to draw.
//
// Moved from the core's harness (back/tests/channels/magnifyUsage.test.ts) with Magnify. The core's
// ClusterInfo is not importable from a plugin, so the cluster is a fake with the behaviour Magnify relies
// on: 'providers', and 'getProvider', whose handle rejects getData when the provider does not serve it.

import test from 'node:test'
import assert from 'node:assert/strict'
import { MagnifyChannel } from '../../src/back/index'
import { IMagnifyClusterUsage } from '../../src/back/MagnifyMetricsTypes'

interface IFakeProvider {
    id: string
    getData?: (request: Record<string, unknown>) => Promise<unknown>
}

const fakeCluster = (providers: IFakeProvider[]) => ({
    providers,
    addSubscriber: () => { },
    getProvider: (providerId: string) => {
        const target = providers.find(p => p.id === providerId)
        if (!target) return undefined
        return {
            id: providerId,
            subscribe: () => undefined,
            updateSubscription: () => undefined,
            unsubscribe: () => undefined,
            getData: (request: Record<string, unknown>) => typeof target.getData !== 'function'
                ? Promise.reject(new Error(`Provider '${providerId}' does not serve getData`))
                : target.getData(request)
        }
    }
})

// The channel takes the core's ClusterInfo; the fake has only what Magnify uses here
type TClusterInfo = ConstructorParameters<typeof MagnifyChannel>[0]
const channelOn = (providers: IFakeProvider[]) => new MagnifyChannel(fakeCluster(providers) as unknown as TClusterInfo, {})
const channelWith = (providerIds: string[]) => channelOn(providerIds.map(id => ({ id })))

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
    const usage = await channelWith([]).getUsage('cluster') as IMagnifyClusterUsage
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
    const provider: IFakeProvider = { id: 'events', ...(getData ? { getData: async (r: Record<string, unknown>) => { requests.push(r); return getData(r) } } : {}) }
    const channel = channelOn([provider]) as unknown as { getEventsForObject: (command: string, namespace: string, kind: string, name: string, limit: number) => Promise<unknown[]> }
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
