import test from 'node:test'
import assert from 'node:assert/strict'
import { scaleController, nodeCordon, nodeUnCordon, nodeDrain, throttleExcute, cronJobTrigger, cronJobStatus, podEvict, podWork, setIngressClassAsDefault, imageDelete, applyResource } from '../src/KubernetesTools'

/*
    The cluster operations Magnify runs, moved from the core. Each one is checked against a fake API object
    that records what it is asked: the request is the whole behaviour, since the API server does the rest.
    Errors are swallowed and logged, as in the core, so the logs of the failure cases are silenced.
*/

interface ICall { method: string, args: Record<string, unknown> }

/** An API object whose every method records its call and answers what 'answers' says (or {}). */
const fakeApi = (answers: Record<string, (args: Record<string, unknown>) => unknown> = {}) => {
    const calls: ICall[] = []
    const api = new Proxy({}, {
        get: (_t, method: string) => async (args: Record<string, unknown>) => {
            calls.push({ method, args })
            const answer = answers[method]
            return answer ? answer(args) : {}
        }
    })
    return { api: api as any, calls }
}

const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
    const { log, error } = console
    console.log = () => { }
    console.error = () => { }
    try { return await fn() }
    finally { console.log = log; console.error = error }
}

test('scaleController patches the replicas of each kind through its own API', async () => {
    const apps = fakeApi()
    const core = fakeApi()
    const clusterInfo = { appsApi: apps.api, coreApi: core.api }
    await quiet(async () => {
        for (const kind of ['Deployment', 'StatefulSet', 'ReplicaSet', 'ReplicationController', 'Pod']) {
            await scaleController(kind, 'ns', 'w', 3, clusterInfo)
        }
    })
    assert.deepEqual(apps.calls.map(c => c.method), ['patchNamespacedDeployment', 'patchNamespacedStatefulSet', 'patchNamespacedReplicaSet'])
    assert.deepEqual(core.calls.map(c => c.method), ['patchNamespacedReplicationController'])
    assert.deepEqual(apps.calls[0].args, { name: 'w', namespace: 'ns', body: [{ op: 'replace', path: '/spec/replicas', value: 3 }] })
})

test('cordon and uncordon set spec.unschedulable on the node', async () => {
    const core = fakeApi()
    await quiet(async () => {
        await nodeCordon(core.api, 'n1')
        await nodeUnCordon(core.api, 'n1')
    })
    assert.deepEqual(core.calls.map(c => [c.method, (c.args.body as { value: boolean }[])[0].value]), [['patchNode', true], ['patchNode', false]])
})

test('🔴 drain cordons the node and evicts its pods, but not DaemonSet nor static ones', async () => {
    const core = fakeApi({
        listPodForAllNamespaces: () => ({
            items: [
                { metadata: { name: 'app', namespace: 'a' } },
                { metadata: { name: 'ds', namespace: 'kube-system', ownerReferences: [{ kind: 'DaemonSet' }] } },
                { metadata: { name: 'static', namespace: 'kube-system', annotations: { 'kubernetes.io/config.mirror': 'x' } } },
                { metadata: { name: 'other', namespace: 'b' } }
            ]
        })
    })
    await quiet(() => nodeDrain(core.api, 'n1'))
    assert.equal(core.calls[0].method, 'patchNode')
    assert.deepEqual(core.calls[1].args, { fieldSelector: 'spec.nodeName=n1' })
    const evicted = core.calls.filter(c => c.method === 'createNamespacedPodEviction').map(c => `${c.args.namespace}/${c.args.name}`)
    assert.deepEqual(evicted.sort(), ['a/app', 'b/other'])
})

test('podEvict sends a policy/v1 Eviction for the pod', async () => {
    const core = fakeApi()
    await quiet(() => podEvict(core.api, 'ns', 'p'))
    assert.deepEqual(core.calls[0], {
        method: 'createNamespacedPodEviction',
        args: { name: 'p', namespace: 'ns', body: { apiVersion: 'policy/v1', kind: 'Eviction', metadata: { name: 'p', namespace: 'ns' } } }
    })
})

test('throttleExcute runs once when it works, waits and repeats on a 429, and gives up on anything else', async () => {
    let runs = 0
    assert.equal(await throttleExcute('ok', async () => { runs++ }), true)
    assert.equal(runs, 1)

    runs = 0
    const throttled = await quiet(() => throttleExcute('429', async () => {
        runs++
        if (runs === 1) throw { code: 429, headers: { 'retry-after': '0.01' } }
    }))
    assert.equal(throttled, true)
    assert.equal(runs, 2)

    runs = 0
    const failed = await quiet(() => throttleExcute('boom', async () => { runs++; throw new Error('boom') }))
    assert.equal(failed, false)
    assert.equal(runs, 1)
})

test('cronJobTrigger creates a manual Job from the CronJob template', async () => {
    const template = { template: { spec: { containers: [{ name: 'c', image: 'i' }] } } }
    const batch = fakeApi({ readNamespacedCronJob: () => ({ spec: { jobTemplate: { spec: template } } }) })
    await quiet(() => cronJobTrigger('ns', 'nightly', batch.api))
    const created = batch.calls.find(c => c.method === 'createNamespacedJob')!
    const job = created.args.body as { metadata: { name: string, labels: Record<string, string> }, spec: unknown }
    assert.equal(created.args.namespace, 'ns')
    assert.match(job.metadata.name, /^nightly-manual-\d+$/)
    assert.deepEqual(job.metadata.labels, { 'triggered-by': 'node-client' })
    assert.deepEqual(job.spec, template)
})

test('a CronJob without a template creates no Job', async () => {
    const batch = fakeApi({ readNamespacedCronJob: () => ({ spec: {} }) })
    await quiet(() => cronJobTrigger('ns', 'broken', batch.api))
    assert.equal(batch.calls.some(c => c.method === 'createNamespacedJob'), false)
})

test('cronJobStatus suspends and resumes through spec.suspend', async () => {
    const batch = fakeApi()
    await quiet(async () => {
        await cronJobStatus('ns', 'nightly', true, batch.api)
        await cronJobStatus('ns', 'nightly', false, batch.api)
    })
    assert.deepEqual(batch.calls.map(c => (c.args.body as { path: string, value: boolean }[])[0]), [
        { op: 'replace', path: '/spec/suspend', value: true },
        { op: 'replace', path: '/spec/suspend', value: false }
    ])
})

test('podWork creates the pod for each kind of work and answers its name once Running', async () => {
    const images: Record<string, [string, string]> = {
        ubuntu: ['kwirth-ubuntu-pod', 'ubuntu:latest'],
        alpine: ['kwirth-alpine-pod', 'alpine:latest'],
        dnsutils: ['kwirth-dnsutils-pod', 'tutum/dnsutils'],
        jubuntu: ['kwirth-jubuntu-pod', 'jfvilasoutlook/jubuntu']
    }
    for (const [work, [name, image]] of Object.entries(images)) {
        const core = fakeApi({ readNamespacedPodStatus: () => ({ status: { phase: 'Running' } }) })
        assert.equal(await quiet(() => podWork(core.api, work)), name)
        const pod = core.calls[0].args.body as { spec: { containers: { image: string }[] } }
        assert.equal(core.calls[0].args.namespace, 'default')
        assert.equal(pod.spec.containers[0].image, image)
    }
    const unknown = fakeApi()
    assert.equal(await podWork(unknown.api, 'windows'), undefined)
    assert.equal(unknown.calls.length, 0)
})

test('setIngressClassAsDefault sets the is-default-class annotation', async () => {
    const net = fakeApi()
    await quiet(() => setIngressClassAsDefault(net.api, 'nginx'))
    assert.deepEqual(net.calls[0], {
        method: 'patchIngressClass',
        args: { name: 'nginx', body: [{ op: 'replace', path: '/metadata/annotations', value: { 'ingressclass.kubernetes.io/is-default-class': 'true' } }] }
    })
})

test('🔴 imageDelete removes its DaemonSet even when creating it fails, and sanitises the image name', async () => {
    const apps = fakeApi({ createNamespacedDaemonSet: () => { throw new Error('forbidden') } })
    await quiet(() => imageDelete(apps.api, 'evil; rm -rf / && nginx:1.2'))
    const created = apps.calls[0].args.body as { metadata: { name: string }, spec: { template: { spec: { containers: { args: string[] }[] } } } }
    const name = created.metadata.name
    assert.match(name, /^kwirth-image-purger-[0-9a-f]{8}$/)
    // only the characters an image reference can carry reach the shell
    assert.match(created.spec.template.spec.containers[0].args[0], /crictl rmi "evilrm-rf\/nginx:1\.2"/)
    assert.deepEqual(apps.calls[1], { method: 'deleteNamespacedDaemonSet', args: { name, namespace: 'default' } })
})

test('applyResource server-side applies the object without its managedFields', async () => {
    const objects = fakeApi()
    const resource = { kind: 'ConfigMap', metadata: { name: 'cm', managedFields: [{}] } }
    const answer = await quiet(() => applyResource(resource, { objectsApi: objects.api }))
    assert.equal(answer, "ConfigMap 'cm' applied successfully.")
    assert.equal(objects.calls[0].method, 'patch')
    assert.deepEqual(objects.calls[0].args, { kind: 'ConfigMap', metadata: { name: 'cm' } })
})
