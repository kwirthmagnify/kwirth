import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { AddressInfo } from 'net'
import { KwirthData, IProviderSubscriber } from '@kwirthmagnify/kwirth-common-back'
import { MetricsProvider, IMetricsCluster } from '../../src/back/index'

/*
    The metrics provider along the real route: a fake kubelet answers fetch() (cAdvisor text and
    /stats/summary JSON), the provider reads it on its tick, and what is checked is what its subscribers
    receive and what its configRouter serves.

    The numbers are chosen so that each formula gives a round value: if a conversion is lost in a refactor
    (seconds, vCPUs, bytes) the value stops being round and the test says which one.
*/

const NODE = 'n1'
const VCPUS = 4
const MEMORY = 1000          // bytes, so 250 bytes of working set is exactly 25 %
const INTERVAL = 15

interface IKubelet {
    cpuSeconds: number       // container_cpu_usage_seconds_total of shop/web-1/app
    txEth0: number           // pod network bytes sent on eth0
    txEth1: number           // and on eth1: a pod metric seen twice adds up
    usageNanoCores: number
    failNodes: string[]      // IPs whose kubelet does not answer (in cluster the kubelet is reached by IP)
    lastOptions?: RequestInit
}

const cadvisor = (k: IKubelet): string => [
    '# HELP container_cpu_usage_seconds_total Cumulative cpu time consumed in seconds.',
    '# TYPE container_cpu_usage_seconds_total counter',
    '# HELP container_memory_working_set_bytes Current working set in bytes.',
    '# TYPE container_memory_working_set_bytes gauge',
    'machine_cpu_cores{boot_id="b"} ' + VCPUS,
    'machine_memory_bytes{boot_id="b"} ' + MEMORY,
    `container_cpu_usage_seconds_total{container="app",namespace="shop",pod="web-1",scope="container"} ${k.cpuSeconds} 1700000000000`,
    'container_memory_working_set_bytes{container="app",namespace="shop",pod="web-1"} 250 1700000000000',
    `container_network_transmit_bytes_total{container="",image="pause",interface="eth0",namespace="shop",pod="web-1"} ${k.txEth0} 1700000000000`,
    `container_network_transmit_bytes_total{container="",image="pause",interface="eth1",namespace="shop",pod="web-1"} ${k.txEth1} 1700000000000`,
    ''
].join('\n')

const summary = (k: IKubelet) => ({
    node: {
        nodeName: NODE,
        memory: { usageBytes: 300, availableBytes: 700 },
        cpu: { usageNanoCores: k.usageNanoCores },
        network: { interfaces: [{ txBytes: 0, rxBytes: 0, txErrors: 0, rxErrors: 0 }] }
    },
    pods: [{}, {}]
})

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

const fakeKubelet = (k: IKubelet): void => {
    globalThis.fetch = (async (url: string, options?: RequestInit) => {
        k.lastOptions = options
        if (k.failNodes.some(ip => String(url).includes(`//${ip}:`))) throw new TypeError('fetch failed')
        if (String(url).endsWith('/metrics/cadvisor')) return new Response(cadvisor(k), { status: 200 })
        if (String(url).endsWith('/stats/summary')) return new Response(JSON.stringify(summary(k)), { status: 200 })
        return new Response('', { status: 404 })
    }) as typeof fetch
}

const newKubelet = (): IKubelet => ({ cpuSeconds: 10, txEth0: 0, txEth1: 0, usageNanoCores: 2e9, failNodes: [] })

const kwirthData = (over: Partial<Record<string, unknown>> = {}): KwirthData => ({
    clusterType: 'kubernetes', inCluster: true, isDesktop: false, metricsInterval: INTERVAL, ...over
} as unknown as KwirthData)

const nodeInfo = (name: string) => ({ name, ip: `10.0.0.${name.length}`, maxPods: 110 })

const clusterInfoWith = (nodeNames: string[] = [NODE], token: string | undefined = 'a-token') => {
    const nodes = new Map(nodeNames.map(n => [n, nodeInfo(n)]))
    return {
        token,
        nodes: new Map(nodes),
        getNodes: async () => new Map(nodes),
        kubeConfig: {
            getCurrentCluster: () => ({ server: 'https://api' }),
            applyToFetchOptions: async () => ({ headers: { Authorization: 'Bearer from-kubeconfig' } }) as RequestInit
        }
    }
}

interface ILogs { warnings: string[], errors: string[] }

const newProvider = (clusterInfo = clusterInfoWith(), data = kwirthData(), logs: ILogs = { warnings: [], errors: [] }): MetricsProvider => {
    const provider = new MetricsProvider(clusterInfo, data)
    provider.setLogger({ info: () => { }, trace: () => { }, warning: m => { logs.warnings.push(String(m)) }, error: m => { logs.errors.push(String(m)) } })
    return provider
}

/** A subscriber that keeps every reading it gets. */
const recorder = () => {
    const readings: IMetricsCluster[] = []
    const subscriber: IProviderSubscriber = { processProviderEvent: (_id: string, obj: unknown) => { readings.push(obj as IMetricsCluster) } }
    return { readings, subscriber }
}

test('on start it reads the metric list and the capacity from the kubelets, and leaves the core alone', async () => {
    fakeKubelet(newKubelet())
    const clusterInfo = clusterInfoWith()
    const provider = newProvider(clusterInfo)
    await provider.startProvider()
    provider.stopMetricsInterval()

    const names = provider.getMetricsList().map(m => m.metric)
    assert.ok(names.includes('container_cpu_usage_seconds_total'))
    // the synthetic ones are part of the list too, so the setup can offer them
    assert.ok(names.includes('kwirth_container_cpu_percentage'))
    assert.ok(names.includes('kwirth_cluster_total_pods'))
    assert.equal(provider.getClusterUsage().vcpus, VCPUS)
    assert.equal(provider.getClusterUsage().memory, MEMORY)
    // vcpus and memory are the core's business now (from the nodes' capacity): an extension does not write them
    assert.equal('vcpus' in clusterInfo, false)
    assert.equal('memory' in clusterInfo, false)
})

test('a tick delivers the cluster read, with raw values, pod metrics added up and the synthetic metrics', async () => {
    const kubelet = newKubelet()
    fakeKubelet(kubelet)
    const provider = newProvider()
    await provider.startProvider()
    provider.stopMetricsInterval()
    const { readings, subscriber } = recorder()
    await provider.addSubscriber(subscriber, { pod: true, container: true, machine: true })

    await provider.tick()
    // between reads: 3 more CPU seconds, and 1.5 MB more sent across the two interfaces
    kubelet.cpuSeconds = 13
    kubelet.txEth0 = 1_000_000
    kubelet.txEth1 = 500_000
    await provider.tick()

    assert.equal(readings.length, 2)
    const node = readings[1].nodes[0]
    assert.equal(node.containerMetricValues.get('shop/web-1/app/container_cpu_usage_seconds_total')?.value, 13)
    assert.equal(node.podMetricValues.get('shop/web-1/container_network_transmit_bytes_total')?.value, 1_500_000)
    assert.equal(node.machineMetricValues.get('machine_cpu_cores')?.value, VCPUS)
    // 250 of 1000 bytes
    assert.equal(node.containerMetricValues.get('shop/web-1/app/kwirth_container_memory_percentage')?.value, 25)
    // 3 s of CPU in 15 s over 4 vCPUs: 3 / 15 / 4 = 5 %
    assert.equal(node.containerMetricValues.get('shop/web-1/app/kwirth_container_cpu_percentage')?.value, 5)
    // 1.5 MB in 15 s = 0.1 MB/s
    assert.equal(node.podMetricValues.get('shop/web-1/kwirth_container_transmit_mbps')?.value, 0.1)

    const cluster = readings[1].clusterMetricValues
    assert.equal(cluster.get('kwirth_cluster_total_pods')?.value, 1)
    // 2e9 nanocores over 4 vCPUs
    assert.equal(cluster.get('kwirth_cluster_cpu_percentage')?.value, 50)
    // 300 used of 300 + 700
    assert.equal(cluster.get('kwirth_cluster_memory_percentage')?.value, 30)
    assert.equal(readings[1].metricsInterval, INTERVAL)
})

test('a subscriber that throws does not stop the read reaching the others', async () => {
    fakeKubelet(newKubelet())
    const logs: ILogs = { warnings: [], errors: [] }
    const provider = newProvider(clusterInfoWith(), kwirthData(), logs)
    await provider.startProvider()
    provider.stopMetricsInterval()
    await provider.addSubscriber({ processProviderEvent: () => { throw new Error('boom') } })
    const { readings, subscriber } = recorder()
    await provider.addSubscriber(subscriber)

    await provider.tick()

    assert.equal(readings.length, 1)
    assert.ok(logs.errors.some(e => e.includes('boom')))
    assert.deepEqual(provider.getStats(), { subscribers: 2, events: 2 })
})

test('a node whose kubelet does not answer only costs its own metrics', async () => {
    const kubelet = newKubelet()
    kubelet.failNodes = [nodeInfo('broken').ip]
    fakeKubelet(kubelet)
    const logs: ILogs = { warnings: [], errors: [] }
    const provider = newProvider(clusterInfoWith([NODE, 'broken']), kwirthData(), logs)
    const { readings, subscriber } = recorder()
    await provider.addSubscriber(subscriber)

    await provider.tick()

    assert.deepEqual(readings[0].nodes.map(n => n.name), [NODE])
    assert.ok(logs.errors.some(e => e.includes("node 'broken'")))
})

test('a new interval saved in Kwirth settings reschedules the clock on the next tick', async () => {
    // the core writes it into kwirthData, the same object the provider was handed
    fakeKubelet(newKubelet())
    const data = kwirthData()
    const provider = newProvider(clusterInfoWith(), data)
    await provider.startProvider()
    const before = provider.metricsIntervalRef
    assert.equal(provider.metricsInterval, INTERVAL)

    ;(data as unknown as { metricsInterval: number }).metricsInterval = 30
    await provider.tick()

    assert.equal(provider.metricsInterval, 30)
    assert.notEqual(provider.metricsIntervalRef, before)
    provider.stopMetricsInterval()
})

test('without a Kubernetes cluster behind Kwirth the clock is not started, and it says so once', async () => {
    fakeKubelet(newKubelet())
    const logs: ILogs = { warnings: [], errors: [] }
    const provider = newProvider(clusterInfoWith(), kwirthData({ clusterType: 'none' }), logs)
    await provider.startProvider()
    assert.equal(provider.metricsIntervalRef, undefined)
    assert.equal(logs.warnings.length, 1)
    assert.ok(logs.warnings[0].includes('no Kubernetes cluster'))
})

test('on the desktop the kubelet is reached with the options applyToFetchOptions RETURNS', async () => {
    // the core used to call it and drop the result, so the request went out with no credentials
    const kubelet = newKubelet()
    fakeKubelet(kubelet)
    const provider = newProvider(clusterInfoWith([NODE], undefined), kwirthData({ inCluster: false, isDesktop: true }))
    await provider.readCAdvisorMetrics(nodeInfo(NODE))
    assert.deepEqual(kubelet.lastOptions?.headers, { Authorization: 'Bearer from-kubeconfig' })
})

test('the configRouter serves the metric list and the cluster usage (the core mounts it behind the accessKey)', async () => {
    fakeKubelet(newKubelet())
    const provider = newProvider()
    await provider.startProvider()
    provider.stopMetricsInterval()
    await provider.tick()

    const app = express()
    app.use('/core/providerconfig/metrics', provider.configRouter)
    const server = app.listen(0)
    try {
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/core/providerconfig/metrics`
        // the tests' real fetch, not the fake kubelet
        globalThis.fetch = realFetch
        const list = await (await fetch(base)).json() as { metric: string, help: string }[]
        assert.ok(list.some(m => m.metric === 'container_cpu_usage_seconds_total' && m.help.startsWith('Cumulative')))
        const usage = await (await fetch(`${base}/usage/cluster`)).json() as { vcpus: number, pods: number, maxPods: number }
        assert.equal(usage.vcpus, VCPUS)
        assert.equal(usage.pods, 2)
        assert.equal(usage.maxPods, 110)
    }
    finally {
        server.close()
    }
})

// ── A kubelet that does not answer (2026-10-13) ─────────────────────────────────────────────────────
//
// A fetch with no limit of its own waits five minutes (undici's). Meanwhile 'loadingClusterMetrics' stays
// set and every tick only says 'Still loading cluster metrics': twenty silent ticks, and no word of which
// node or endpoint is stuck. It was seen for hours against a dev cluster whose port forwarding stalled.

/** A kubelet: the IPs in 'hang' never answer (until the request is aborted), the rest answer after 'delayMs'. */
const slowKubelet = (hang: string[], delayMs = 0): void => {
    const k = newKubelet()
    globalThis.fetch = (async (url: string, options?: RequestInit) => {
        if (hang.some(ip => String(url).includes(`//${ip}:`))) {
            return await new Promise<Response>((_resolve, reject) => {
                options?.signal?.addEventListener('abort', () => reject(options.signal!.reason))
            })
        }
        if (delayMs) await new Promise(r => setTimeout(r, delayMs))
        if (String(url).endsWith('/metrics/cadvisor')) return new Response(cadvisor(k), { status: 200 })
        if (String(url).endsWith('/stats/summary')) return new Response(JSON.stringify(summary(k)), { status: 200 })
        return new Response('', { status: 404 })
    }) as typeof fetch
}

test('🔴 a kubelet that never answers costs one read, not twenty, and the log says which node and endpoint', async () => {
    const logs: ILogs = { warnings: [], errors: [] }
    // n1 → 10.0.0.2 hangs; n333 → 10.0.0.4 answers
    slowKubelet(['10.0.0.2'])
    const provider = newProvider(clusterInfoWith(['n1', 'n333']), kwirthData(), logs)
    provider.metricsInterval = 3   // 40 % of it: 1.2 s per call…
    provider.minKubeletTimeoutMs = 1000   // …once the 10 s floor is lowered, so the test does not wait it

    const started = Date.now()
    const read = await provider.readClusterMetrics()
    const took = Date.now() - started
    assert.ok(took < 2500, `the read waited ${took} ms for a kubelet that does not answer`)
    // the node that answers is there; the stuck one is reported, by name and endpoint
    assert.deepEqual(read?.nodes.map(n => n.name), ['n333'])
    assert.ok(logs.errors.some(e => e.includes("'n1'") && e.includes("'/metrics/cadvisor' did not answer within 1.2s")), logs.errors.join('\n'))

    // and the next read is a read, not a 'Still loading'
    await provider.readClusterMetrics()
    assert.equal(logs.warnings.filter(w => w.includes('Still loading')).length, 0)
})

test('the nodes are read at the same time: a read lasts as long as the slowest node, not the sum', async () => {
    slowKubelet([], 300)
    const provider = newProvider(clusterInfoWith(['n1', 'n22', 'n333', 'n4444']))
    const started = Date.now()
    const read = await provider.readClusterMetrics()
    const took = Date.now() - started
    assert.equal(read?.nodes.length, 4)
    // one node is two calls of 300 ms; four in a row would be 2.4 s
    assert.ok(took < 1500, `four nodes took ${took} ms: they are read one after another`)
})

test('🔴 a short interval never starves the read: the kubelet gets at least the floor, not 40 % of 3 s', async () => {
    // A cAdvisor scrape that takes 1.5 s: 40 % of a 3 s interval (1.2 s) would cut every read and leave the
    // cluster with no metrics at all, which is what happened in the dev with the interval at 3 s.
    slowKubelet([], 1500)
    const logs: ILogs = { warnings: [], errors: [] }
    const provider = newProvider(clusterInfoWith(['n1']), kwirthData(), logs)
    provider.metricsInterval = 3
    const read = await provider.readClusterMetrics()
    assert.equal(read?.nodes.length, 1, logs.errors.join('\n'))
    assert.equal(logs.errors.length, 0)
})

test('a read longer than the interval says so ONCE, and then how long it took and how many ticks it skipped', async () => {
    slowKubelet([], 200)
    const logs: ILogs = { warnings: [], errors: [] }
    const provider = newProvider(clusterInfoWith(['n1']), kwirthData(), logs)
    const reading = provider.readClusterMetrics()
    // three ticks arrive while the read (two calls of 200 ms) is still running
    for (let i = 0; i < 3; i++) assert.equal(await provider.readClusterMetrics(), undefined)
    await reading
    const still = logs.warnings.filter(w => w.startsWith('Still loading cluster metrics'))
    assert.equal(still.length, 1, `it said it ${still.length} times: ${logs.warnings.join(' | ')}`)
    assert.ok(logs.warnings.some(w => /took [\d.]+s and 3 tick\(s\) were skipped/.test(w)), logs.warnings.join(' | '))

    // and a read that does not overlap says nothing at all
    logs.warnings.length = 0
    await provider.readClusterMetrics()
    assert.deepEqual(logs.warnings, [])
})

test('starting the clock twice leaves ONE clock', async () => {
    fakeKubelet(newKubelet())
    const provider = newProvider()
    let ticks = 0
    provider.tick = async () => { ticks++ }
    provider.startMetricsInterval(0.05)
    provider.startMetricsInterval(0.05)
    await new Promise(r => setTimeout(r, 230))
    provider.stopMetricsInterval()
    // one clock of 50 ms gives 4 ticks in 230 ms; two would give 8
    assert.ok(ticks <= 5, `${ticks} ticks: two clocks are running`)
})
