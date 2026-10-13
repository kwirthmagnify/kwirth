import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { AddressInfo } from 'node:net'
import express from 'express'
import { KubeConfig } from '@kubernetes/client-node'
import { KwirthData, IProviderSubscriber } from '@kwirthmagnify/kwirth-common-back'
import { EventsProvider, IKubeEvent } from '../../src/back/index'

/*
    The events provider. The first block moved here from the core (back/tests/providers/events.test.ts)
    with the provider: the kinds filter, the guard for a subscription without kinds, and the kube-log
    handler (kind forced to 'Event', the backlog gate). Then what is new as an extension: the one-off read
    (getData, and getEvents for excubitor), the route behind the accessKey, staying idle without
    Kubernetes, a subscriber that throws, and a run against a fake API server with real watches.
*/

interface IReceived { providerId: string, payload: { type: string, obj: { kind?: string, [k: string]: unknown } } }

const recorder = () => {
    const received: IReceived[] = []
    const subscriber: IProviderSubscriber = { processProviderEvent: (providerId: string, payload: unknown) => { received.push({ providerId, payload: payload as IReceived['payload'] }) } }
    return { received, subscriber }
}

const silent = { info: () => { }, trace: () => { }, warning: () => { }, error: () => { } }
const kwirthData = (clusterType = 'kubernetes'): KwirthData => ({ clusterType } as unknown as KwirthData)

interface ICalls { namespaced: unknown[], all: unknown[] }
const eventsClusterInfo = (events: IKubeEvent[], calls: ICalls = { namespaced: [], all: [] }, kubeConfig: unknown = undefined) => ({
    coreApi: {
        listNamespacedEvent: async (params: unknown) => { calls.namespaced.push(params); return { items: [...events] } },
        listEventForAllNamespaces: async (params: unknown) => { calls.all.push(params); return { items: [...events] } }
    },
    kubeConfig
})

const newProvider = (clusterInfo: unknown = eventsClusterInfo([]), data = kwirthData()): EventsProvider => {
    const provider = new EventsProvider(clusterInfo, data)
    provider.setLogger(silent)
    return provider
}

// a fixed gate: events before this date are the replayed backlog
const GATE = new Date('2020-01-01T00:00:00Z').getTime()
const OLD = '2019-06-01T00:00:00Z'
const NEW = '2021-06-01T00:00:00Z'
const setGate = (p: EventsProvider) => { (p as unknown as { eventsWatchStartTime: number }).eventsWatchStartTime = GATE }

// ── moved from the core ──────────────────────────────────────────────────────────────────────────────────

test('a subscription without kinds receives nothing and breaks nothing (montag sends {})', async () => {
    const p = newProvider()
    const { received, subscriber } = recorder()
    await p.addSubscriber(subscriber, {})
    assert.doesNotThrow(() => p.dispatch('ADDED', { kind: 'Pod' }))
    assert.equal(received.length, 0)
})

test('dispatch filters by the kinds the subscriber asked for', async () => {
    const p = newProvider()
    const { received, subscriber } = recorder()
    await p.addSubscriber(subscriber, { kinds: ['Pod'] })
    p.dispatch('ADDED', { kind: 'Pod' })
    p.dispatch('ADDED', { kind: 'Service' })
    assert.equal(received.length, 1)
    assert.equal(received[0].providerId, 'events')
    assert.equal(received[0].payload.type, 'ADDED')
    assert.equal(received[0].payload.obj.kind, 'Pod')
})

test('a kube Event arrives with kind forced to Event, to whoever asked for Event', async () => {
    const p = newProvider()
    setGate(p)
    const { received, subscriber } = recorder()
    await p.addSubscriber(subscriber, { kinds: ['Event'] })
    // an object from /api/v1/events may come WITHOUT kind
    p.handleKubeEvent('ADDED', { metadata: {}, reason: 'BackOff', lastTimestamp: NEW })
    assert.equal(received.length, 1)
    assert.equal(received[0].payload.obj.kind, 'Event')
    assert.equal(received[0].payload.obj.reason, 'BackOff')
})

test('the backlog Kubernetes replays when the watch starts is not delivered again', async () => {
    const p = newProvider()
    setGate(p)
    const { received, subscriber } = recorder()
    await p.addSubscriber(subscriber, { kinds: ['Event'] })
    p.handleKubeEvent('ADDED', { metadata: {}, lastTimestamp: OLD })
    assert.equal(received.length, 0)
    p.handleKubeEvent('MODIFIED', { metadata: {}, lastTimestamp: NEW })
    assert.equal(received.length, 1)
})

test('a subscriber without Event in its kinds does not get the kube log', async () => {
    const p = newProvider()
    setGate(p)
    const { received, subscriber } = recorder()
    await p.addSubscriber(subscriber, { kinds: ['Pod'] })
    p.handleKubeEvent('ADDED', { metadata: {}, lastTimestamp: NEW })
    assert.equal(received.length, 0)
})

test('the gate falls back to eventTime and creationTimestamp', async () => {
    const p = newProvider()
    setGate(p)
    const { received, subscriber } = recorder()
    await p.addSubscriber(subscriber, { kinds: ['Event'] })
    p.handleKubeEvent('ADDED', { metadata: { creationTimestamp: NEW } })
    assert.equal(received.length, 1)
})

// ── new as an extension ──────────────────────────────────────────────────────────────────────────────────

const sample: IKubeEvent[] = [
    { kind: 'Event', metadata: { name: 'old' }, lastTimestamp: '2026-01-01T00:00:00Z' },
    { kind: 'Event', metadata: { name: 'newest' }, eventTime: '2026-03-01T00:00:00Z' },
    { kind: 'Event', metadata: { name: 'middle' }, firstTimestamp: '2026-02-01T00:00:00Z' }
]

test('getData reads the whole cluster newest first, asking Kubernetes for a margin over the limit', async () => {
    const calls: ICalls = { namespaced: [], all: [] }
    const p = newProvider(eventsClusterInfo(sample, calls))
    const events = await p.getData({ limit: 2 })
    assert.deepEqual(events.map(e => e.metadata?.name), ['newest', 'middle'])
    assert.deepEqual(calls.all, [{ limit: 6 }])
})

test('getData about one object asks with a field selector, in its namespace or in all of them', async () => {
    const calls: ICalls = { namespaced: [], all: [] }
    const p = newProvider(eventsClusterInfo(sample, calls))
    await p.getData({ namespace: 'shop', kind: 'Pod', name: 'web-1' })
    await p.getData({ kind: 'Node', name: 'n1' })
    assert.deepEqual(calls.namespaced, [{ namespace: 'shop', fieldSelector: 'involvedObject.name=web-1,involvedObject.kind=Pod' }])
    assert.deepEqual(calls.all, [{ fieldSelector: 'involvedObject.name=n1,involvedObject.kind=Node' }])
})

test('getEvents is the same read, kept for excubitor', async () => {
    const p = newProvider(eventsClusterInfo(sample))
    assert.deepEqual((await p.getEvents({ limit: 1 })).map(e => e.metadata?.name), ['newest'])
    assert.ok(p.getDataHelp().usage.includes('newest first'))
})

test('the configRouter serves the read, caps the limit at 500, and answers 500 with [] on a failure', async () => {
    const calls: ICalls = { namespaced: [], all: [] }
    const p = newProvider(eventsClusterInfo(sample, calls))
    const broken = newProvider({ coreApi: { listEventForAllNamespaces: async () => { throw new Error('boom') } } })
    const app = express()
    app.use('/core/providerconfig/events', p.configRouter)
    app.use('/broken', broken.configRouter)
    const server = app.listen(0)
    try {
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
        const res = await fetch(`${base}/core/providerconfig/events?limit=9999`)
        assert.equal(res.status, 200)
        assert.equal((await res.json() as unknown[]).length, 3)
        assert.deepEqual(calls.all, [{ limit: 1500 }])
        const failed = await fetch(`${base}/broken`)
        assert.equal(failed.status, 500)
        assert.deepEqual(await failed.json(), [])
    }
    finally {
        server.close()
    }
})

test('without a Kubernetes cluster behind Kwirth it stays idle and says so once', async () => {
    const warnings: string[] = []
    const p = new EventsProvider(eventsClusterInfo([]), kwirthData('none'))
    p.setLogger({ ...silent, warning: m => { warnings.push(String(m)) } })
    await p.startProvider()
    assert.equal(warnings.length, 1)
    assert.ok(warnings[0].includes('no Kubernetes cluster'))
    assert.equal((p as unknown as { watchers: Map<string, unknown> }).watchers.size, 0)
})

test('a subscriber that throws does not stop the change reaching the others', async () => {
    const errors: string[] = []
    const p = new EventsProvider(eventsClusterInfo([]), kwirthData())
    p.setLogger({ ...silent, error: m => { errors.push(String(m)) } })
    await p.addSubscriber({ processProviderEvent: () => { throw new Error('boom') } }, { kinds: ['Pod'] })
    const { received, subscriber } = recorder()
    await p.addSubscriber(subscriber, { kinds: ['Pod'] })
    p.dispatch('ADDED', { kind: 'Pod' })
    assert.equal(received.length, 1)
    assert.ok(errors.some(e => e.includes('boom')))
    assert.deepEqual(p.getStats(), { subscribers: 2, events: 2 })
})

// ── against a fake API server, with real watches ──────────────────────────────────────────────────────────

/*
    The fake API server answers every watch: pods with one ADDED Pod, CRDs with one ADDED CRD, the CRD's
    instances with one ADDED instance, and leaves everything else open and silent, like a quiet cluster.
*/
const fakeApi = async () => {
    const requests: string[] = []
    const sockets = new Set<import('node:net').Socket>()
    const send = (res: http.ServerResponse, type: string, object: unknown) => res.write(JSON.stringify({ type, object }) + '\n')
    const server = http.createServer((req, res) => {
        const path = (req.url ?? '').split('?')[0]
        requests.push(path)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        if (path === '/api/v1/pods') send(res, 'ADDED', { kind: 'Pod', metadata: { name: 'web-1' } })
        if (path === '/apis/apiextensions.k8s.io/v1/customresourcedefinitions') {
            send(res, 'ADDED', { kind: 'CustomResourceDefinition', metadata: { name: 'widgets.acme.io' }, spec: { group: 'acme.io', names: { kind: 'Widget', plural: 'widgets' }, versions: [{ name: 'v1' }] } })
        }
        if (path === '/apis/acme.io/v1/widgets') send(res, 'ADDED', { kind: 'Widget', metadata: { name: 'w1' } })
    })
    server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const kubeConfig = new KubeConfig()
    kubeConfig.loadFromOptions({
        clusters: [{ name: 'c', server: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, skipTLSVerify: true }],
        users: [{ name: 'u', token: 't' }],
        contexts: [{ name: 'x', cluster: 'c', user: 'u' }],
        currentContext: 'x'
    })
    return { kubeConfig, requests, close: () => new Promise<void>(resolve => { for (const s of sockets) s.destroy(); server.close(() => resolve()) }) }
}

const until = async (condition: () => boolean, ms = 4000): Promise<void> => {
    const end = Date.now() + ms
    while (!condition() && Date.now() < end) await new Promise(r => setTimeout(r, 20))
}

test('started against a cluster it watches every resource, delivers changes, and follows the CRDs that appear', async () => {
    const api = await fakeApi()
    const p = newProvider(eventsClusterInfo([], undefined, api.kubeConfig))
    const pods = recorder()
    const widgets = recorder()
    await p.addSubscriber(pods.subscriber, { kinds: ['Pod'] })
    // a subscriber that asked for nothing about CRDs still gets the instances of the CRDs it is told about
    await p.addSubscriber(widgets.subscriber, { kinds: [] })
    await p.startProvider()

    await until(() => pods.received.length > 0 && widgets.received.some(r => r.payload.obj.kind === 'Widget'))
    await p.stopProvider()
    await api.close()

    // 28 resources + the kube log + the CRD that appeared
    assert.ok(api.requests.includes('/api/v1/events'))
    assert.ok(api.requests.includes('/apis/acme.io/v1/widgets'), 'the instances of a new CRD are watched')
    assert.equal(new Set(api.requests).size, 30)
    /*
        Faithful to the core's provider, and worth knowing: a CRD that appears is added to EVERY subscriber,
        so the instances of new CRDs reach all of them, even one that only asked for Pods. That is also the
        only thing montag's {} subscription receives. Kept as it was; noted in the plan to review.
    */
    assert.deepEqual(pods.received.map(r => `${r.payload.type} ${r.payload.obj.kind}`), ['ADDED Pod', 'ADDED Widget'])
    assert.ok(widgets.received.some(r => r.payload.obj.kind === 'Widget'), 'CRD instances reach the subscribers')
    assert.equal(widgets.received.some(r => r.payload.obj.kind === 'Pod'), false)
})
