import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EInstanceConfigView, EInstanceMessageType, ESignalMessageLevel, IInstanceConfig } from '@kwirthmagnify/kwirth-common'
import { MetricsChannel } from '../../src/back/index'
import { EMetricsConfigMode, IMetricsInstanceConfig, IMetricsMessageResponse } from '../../src/common/MetricsTypes'
import { IMetricsCluster, IMetricsValue } from '../../src/back/MetricsProviderTypes'

/*
    The metrics channel's back end, along the real route: readings arrive from the 'metrics' provider
    (processProviderEvent), an instance is added the way the core does (addObject), and what is checked
    is what goes out through the socket, which is all the front end will ever see.

    The numbers are chosen so that each formula gives a round value: if a conversion is lost in a
    refactor (seconds, vCPUs, bits, MiB) the value stops being round and the test says which one.
*/

const NAMESPACE = 'shop'
const NODE = 'n1'
const INTERVAL = 15          // seconds between provider readings
const VCPUS = 2
const CLUSTER_MEMORY = 1000  // bytes, so that 250 bytes is exactly 25 %

interface ISent {
    messages: Record<string, unknown>[]
}

/** A fake socket that only records what is sent to it. */
const fakeSocket = (sent: ISent) => ({
    send: (raw: string) => { sent.messages.push(JSON.parse(raw)) }
}) as unknown as WebSocket

interface IFakeClusterInfo {
    subscribed: string[]
    unsubscribed: string[]
    nodeOf: Record<string, string | undefined>
}

/** The slice of clusterInfo the channel reads. Every pod runs on NODE unless nodeOf says otherwise. */
const fakeClusterInfo = (state: IFakeClusterInfo) => ({
    coreApi: {
        readNamespacedPod: async (params: { name: string, namespace: string }) => ({
            metadata: { ownerReferences: [{ controller: true, kind: 'ReplicaSet', name: 'web-5d8f' }] },
            spec: { nodeName: params.name in state.nodeOf ? state.nodeOf[params.name] : NODE }
        })
    },
    addSubscriber: (providerId: string) => { state.subscribed.push(providerId) },
    removeSubscriber: (providerId: string) => { state.unsubscribed.push(providerId) }
})

const newState = (): IFakeClusterInfo => ({ subscribed: [], unsubscribed: [], nodeOf: {} })

interface ILogs {
    errors: unknown[]
}

const newChannel = (state: IFakeClusterInfo, logs: ILogs = { errors: [] }) =>
    new MetricsChannel(fakeClusterInfo(state), { logInfo: () => { }, logWarning: () => { }, logError: (m: unknown) => { logs.errors.push(m) } })

/** A provider reading: one node, with the given pod-level and container-level values. */
const reading = (pod: Record<string, number>, container: Record<string, number>): IMetricsCluster => {
    const toMap = (values: Record<string, number>) => new Map<string, IMetricsValue>(Object.entries(values).map(([k, value]) => [k, { value, timestamp: 0 }]))
    return {
        metricsInterval: INTERVAL,
        cluster: { vcpus: VCPUS, memory: CLUSTER_MEMORY },
        nodes: [{ name: NODE, timestamp: Date.now(), podMetricValues: toMap(pod), containerMetricValues: toMap(container) }],
        clusterMetricValues: new Map([['kwirth_cluster_cpu_percentage', { value: 42, timestamp: 0 }]])
    }
}

/** An access key with the given scope over the whole cluster: 'id|type|scopes:namespaces:groups:pods:containers' */
const accessKey = (scope: string) => `a1|volatile|${scope}::::`

const instanceConfig = (view: EInstanceConfigView, data: Partial<IMetricsInstanceConfig>, scope = 'stream'): IInstanceConfig => ({
    instance: 'i1',
    channel: 'metrics',
    view,
    accessKey: accessKey(scope),
    namespace: NAMESPACE,
    group: '',
    pod: '',
    container: '',
    data: { mode: EMetricsConfigMode.STREAM, aggregate: false, interval: INTERVAL, metrics: [], ...data }
}) as unknown as IInstanceConfig

/** The metric values of the last data message, by asset and metric name. */
const lastValues = (sent: ISent): Map<string, Map<string, number>> => {
    const data = sent.messages.filter(m => m.type === EInstanceMessageType.DATA) as unknown as IMetricsMessageResponse[]
    assert.ok(data.length > 0, 'no data message was sent')
    const result = new Map<string, Map<string, number>>()
    for (const asset of data[data.length - 1].assets) {
        result.set(asset.assetName, new Map(asset.values.map(v => [v.metricName, v.metricValue])))
    }
    return result
}

/** The two readings most tests use: pod 'web-1' with container 'app', its counters moving between them. */
const feedTwoReadings = async (channel: MetricsChannel): Promise<void> => {
    await channel.processProviderEvent('metrics', reading(
        { [`${NAMESPACE}/web-1/container_network_transmit_bytes_total`]: 0 },
        { [`${NAMESPACE}/web-1/app/container_cpu_usage_seconds_total`]: 10, [`${NAMESPACE}/web-1/app/container_memory_working_set_bytes`]: 200 }
    ))
    await channel.processProviderEvent('metrics', reading(
        // 1966080 bytes in 15 s: *8 bits / 1 MiB / 15 s = exactly 1 Mbps
        { [`${NAMESPACE}/web-1/container_network_transmit_bytes_total`]: 1966080 },
        // 3 more CPU seconds in 15 s over 2 vCPUs: 3 / 30 = 10 %; 250 of 1000 bytes: 25 %
        { [`${NAMESPACE}/web-1/app/container_cpu_usage_seconds_total`]: 13, [`${NAMESPACE}/web-1/app/container_memory_working_set_bytes`]: 250 }
    ))
}

test('it subscribes to the metrics provider on start, and drops the subscription on cleanup', async () => {
    const state = newState()
    const channel = newChannel(state)
    await channel.startChannel()
    assert.deepEqual(state.subscribed, ['metrics'])
    assert.deepEqual(channel.requirements.providers, ['metrics'])

    channel.cleanup()
    assert.deepEqual(state.unsubscribed, ['metrics'])
})

test('derived metrics come out with their unit conversions: CPU %, memory % and Mbps', async () => {
    const state = newState()
    const channel = newChannel(state)
    await feedTwoReadings(channel)
    const sent: ISent = { messages: [] }
    const ok = await channel.addObject(fakeSocket(sent), instanceConfig(EInstanceConfigView.POD, {
        metrics: ['kwirth_container_cpu_percentage', 'kwirth_container_memory_percentage', 'kwirth_container_transmit_mbps']
    }), NAMESPACE, 'web-1', '')
    channel.cleanup()

    assert.equal(ok, true)
    const values = lastValues(sent).get('web-1')!
    assert.equal(values.get('kwirth_container_cpu_percentage'), 10)
    assert.equal(values.get('kwirth_container_memory_percentage'), 25)
    assert.equal(values.get('kwirth_container_transmit_mbps'), 1)
})

test('the first message after adding an object is marked as initial (timestamp 0)', async () => {
    // The front end uses timestamp 0 to replace the first sample instead of appending a duplicate
    const channel = newChannel(newState())
    await feedTwoReadings(channel)
    const sent: ISent = { messages: [] }
    await channel.addObject(fakeSocket(sent), instanceConfig(EInstanceConfigView.POD, { metrics: ['kwirth_container_memory_percentage'] }), NAMESPACE, 'web-1', '')
    channel.cleanup()
    assert.equal(sent.messages[0].timestamp, 0)
})

test('cluster metrics travel once, in a series of their own named Cluster', async () => {
    /*
        They are one value for the whole cluster. They used to be repeated inside every asset, which drew
        one identical line per namespace or pod, each named after something the value has nothing to do with.
    */
    const sentFor = async (aggregate: boolean) => {
        const channel = newChannel(newState())
        await feedTwoReadings(channel)
        const sent: ISent = { messages: [] }
        const socket = fakeSocket(sent)
        const config = instanceConfig(EInstanceConfigView.POD, { aggregate, metrics: ['kwirth_container_memory_percentage', 'kwirth_cluster_cpu_percentage'] })
        await channel.addObject(socket, config, NAMESPACE, 'web-1', '')
        await channel.addObject(socket, config, NAMESPACE, 'web-2', '')
        channel.cleanup()
        return lastValues(sent)
    }

    const separate = await sentFor(false)
    assert.deepEqual([...separate.keys()], ['web-1', 'web-2', 'Cluster'])
    assert.deepEqual([...separate.get('Cluster')!.entries()], [['kwirth_cluster_cpu_percentage', 42]])
    assert.equal(separate.get('web-1')!.has('kwirth_cluster_cpu_percentage'), false)
    assert.equal(separate.get('web-2')!.has('kwirth_cluster_cpu_percentage'), false)

    // aggregated, the pods' series no longer carries the cluster's value under the pods' names either
    const aggregated = await sentFor(true)
    assert.deepEqual([...aggregated.keys()], ['web-1,web-2', 'Cluster'])
    assert.equal(aggregated.get('web-1,web-2')!.has('kwirth_cluster_cpu_percentage'), false)
})

test('asking only for cluster metrics sends only the Cluster series, and one reading is enough', async () => {
    // A rate needs two readings; a cluster metric is a plain value, so it does not have to wait
    const channel = newChannel(newState())
    await channel.processProviderEvent('metrics', reading({}, {}))
    const sent: ISent = { messages: [] }
    await channel.addObject(fakeSocket(sent), instanceConfig(EInstanceConfigView.NAMESPACE, { metrics: ['kwirth_cluster_cpu_percentage', 'kwirth_cluster_memory_percentage'] }), NAMESPACE, 'web-1', '')
    channel.cleanup()

    const values = lastValues(sent)
    assert.deepEqual([...values.keys()], ['Cluster'])
    assert.equal(values.get('Cluster')!.get('kwirth_cluster_cpu_percentage'), 42)
    // a metric the provider did not report comes out as 0, not missing
    assert.equal(values.get('Cluster')!.get('kwirth_cluster_memory_percentage'), 0)
})

test('with fewer than two readings nothing is sent: a rate needs two points', async () => {
    const channel = newChannel(newState())
    await channel.processProviderEvent('metrics', reading({}, {}))
    const sent: ISent = { messages: [] }
    await channel.addObject(fakeSocket(sent), instanceConfig(EInstanceConfigView.POD, { metrics: ['kwirth_container_cpu_percentage'] }), NAMESPACE, 'web-1', '')
    channel.cleanup()
    assert.equal(sent.messages.filter(m => m.type === EInstanceMessageType.DATA).length, 0)
})

test('a pod on a node missing from the readings is skipped and logged, it does not stop the process', async () => {
    /*
        This was a process.exit(1). In the core it took the back down; inside a plugin it would take the
        whole Kwirth down with it. The other pod of the instance still gets its value.
    */
    const state = newState()
    state.nodeOf['ghost'] = 'gone-node'
    const logs: ILogs = { errors: [] }
    const channel = newChannel(state, logs)
    await feedTwoReadings(channel)
    const sent: ISent = { messages: [] }
    const socket = fakeSocket(sent)
    const config = instanceConfig(EInstanceConfigView.POD, { metrics: ['kwirth_container_memory_percentage'] })
    await channel.addObject(socket, config, NAMESPACE, 'web-1', '')
    await channel.addObject(socket, config, NAMESPACE, 'ghost', '')
    channel.cleanup()

    const values = lastValues(sent)
    assert.equal(values.get('web-1')!.get('kwirth_container_memory_percentage'), 25)
    assert.equal(values.get('ghost')!.get('kwirth_container_memory_percentage'), 0)
    assert.ok(logs.errors.some(e => String(e).includes("No node 'gone-node'")), `expected the skip to be logged, got: ${logs.errors.join(' | ')}`)
})

test('aggregate merges the pods of an instance into one series; without it, one series per pod', async () => {
    const twoPods = async (aggregate: boolean) => {
        const channel = newChannel(newState())
        const memory = { [`${NAMESPACE}/web-1/app/container_memory_working_set_bytes`]: 250, [`${NAMESPACE}/web-2/app/container_memory_working_set_bytes`]: 100 }
        await channel.processProviderEvent('metrics', reading({}, memory))
        await channel.processProviderEvent('metrics', reading({}, memory))
        const sent: ISent = { messages: [] }
        const socket = fakeSocket(sent)
        const config = instanceConfig(EInstanceConfigView.POD, { aggregate, metrics: ['kwirth_container_memory_percentage'] })
        await channel.addObject(socket, config, NAMESPACE, 'web-1', '')
        await channel.addObject(socket, config, NAMESPACE, 'web-2', '')
        channel.cleanup()
        return lastValues(sent)
    }

    const aggregated = await twoPods(true)
    assert.deepEqual([...aggregated.keys()], ['web-1,web-2'])
    assert.equal(aggregated.get('web-1,web-2')!.get('kwirth_container_memory_percentage'), 35)

    const separate = await twoPods(false)
    assert.deepEqual([...separate.keys()], ['web-1', 'web-2'])
    assert.equal(separate.get('web-2')!.get('kwirth_container_memory_percentage'), 10)
})

test('the container view reads the container\'s own value and names it pod[container]', async () => {
    const channel = newChannel(newState())
    const memory = { [`${NAMESPACE}/web-1/app/container_memory_working_set_bytes`]: 250, [`${NAMESPACE}/web-1/sidecar/container_memory_working_set_bytes`]: 50 }
    await channel.processProviderEvent('metrics', reading({}, memory))
    await channel.processProviderEvent('metrics', reading({}, memory))
    const sent: ISent = { messages: [] }
    await channel.addObject(fakeSocket(sent), instanceConfig(EInstanceConfigView.CONTAINER, { metrics: ['kwirth_container_memory_percentage'] }), NAMESPACE, 'web-1', 'sidecar')
    channel.cleanup()
    assert.equal(lastValues(sent).get('web-1[sidecar]')!.get('kwirth_container_memory_percentage'), 5)
})

test('the group view names a replicaset\'s pods after the deployment that was asked for', () => {
    // A pod's owner is the replicaset 'web-5d8f'; the user asked for 'deployment+web'
    const channel = newChannel(newState())
    const config = { ...instanceConfig(EInstanceConfigView.GROUP, {}), group: 'deployment+web' } as IInstanceConfig
    const name = channel.getAssetMetricName(config, [{ podNode: NODE, podNamespace: NAMESPACE, podGroup: 'replicaset+web-5d8f', podName: 'web-1', containerName: '' }])
    assert.equal(name, 'deployment+web')
})

test('without the stream scope the instance is refused with an error signal', async () => {
    const channel = newChannel(newState())
    await feedTwoReadings(channel)
    const sent: ISent = { messages: [] }
    const ok = await channel.addObject(fakeSocket(sent), instanceConfig(EInstanceConfigView.POD, { metrics: ['kwirth_container_memory_percentage'] }, 'snapshot'), NAMESPACE, 'web-1', '')
    channel.cleanup()

    assert.equal(ok, false)
    assert.equal(sent.messages.length, 1)
    assert.equal(sent.messages[0].type, EInstanceMessageType.SIGNAL)
    assert.equal(sent.messages[0].level, ESignalMessageLevel.ERROR)
    assert.equal(sent.messages[0].text, 'Insufficient scope for STREAM')
})

test('the scope ladder ends in admin, and an admin key may stream', async () => {
    const channel = newChannel(newState())
    assert.deepEqual(['snapshot', 'stream', 'cluster', 'admin'].map(s => channel.getChannelScopeLevel(s)), [1, 2, 3, 4])
    await feedTwoReadings(channel)
    const sent: ISent = { messages: [] }
    const ok = await channel.addObject(fakeSocket(sent), instanceConfig(EInstanceConfigView.POD, { metrics: ['kwirth_container_memory_percentage'] }, 'admin'), NAMESPACE, 'web-1', '')
    channel.cleanup()
    assert.equal(ok, true)
    assert.equal(lastValues(sent).get('web-1')!.get('kwirth_container_memory_percentage'), 25)
})

test('getInstances counts instances and the connections that carry them; cleanup leaves none', async () => {
    const channel = newChannel(newState())
    await feedTwoReadings(channel)
    await channel.addObject(fakeSocket({ messages: [] }), instanceConfig(EInstanceConfigView.POD, { metrics: ['kwirth_container_memory_percentage'] }), NAMESPACE, 'web-1', '')
    assert.deepEqual(channel.getInstances(), { instances: 1, connections: 1 })
    channel.cleanup()
    assert.deepEqual(channel.getInstances(), { instances: 0, connections: 0 })
})

test('modify changes only the modifiable fields of a running instance', async () => {
    const channel = newChannel(newState())
    await feedTwoReadings(channel)
    const sent: ISent = { messages: [] }
    const socket = fakeSocket(sent)
    await channel.addObject(socket, instanceConfig(EInstanceConfigView.POD, { metrics: ['kwirth_container_memory_percentage'] }), NAMESPACE, 'web-1', '')
    channel.modifyInstance(socket, instanceConfig(EInstanceConfigView.POD, { mode: EMetricsConfigMode.SNAPSHOT, aggregate: true, interval: 60, metrics: ['kwirth_container_cpu_percentage'] }))
    const running = channel.getInstance(socket, 'i1')!.instanceConfig.data as IMetricsInstanceConfig
    channel.cleanup()

    assert.deepEqual(running.metrics, ['kwirth_container_cpu_percentage'])
    assert.equal(running.aggregate, true)
    assert.equal(running.interval, 60)
    // the mode is not modifiable: it stays as it started
    assert.equal(running.mode, EMetricsConfigMode.STREAM)
})
