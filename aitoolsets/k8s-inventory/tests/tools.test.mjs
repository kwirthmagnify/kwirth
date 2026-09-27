/*
    Harness of the `k8s-inventory` toolset. It runs against the built dist (the same way the core loads
    the package) and with FAKE Kubernetes clients: there is no cluster here, and there must not need to be
    — `npm test` has to pass on any machine. The real call to the cluster is what `verify.mjs` tests, by hand.

    What is pinned down is what S1's contract promises and is expensive to fix late:
      · a tool that needs a cluster and does not get one SAYS so, instead of blowing up inside
      · every invocation leaves a trace
      · the namespace filter picks the right call (namespaced vs all-namespaces)
      · the cluster's failures come back as DATA, not as an exception: the model has to be able to read them
*/
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const commonAi = require('@kwirthmagnify/kwirth-common-ai')
const commonAiBack = require('@kwirthmagnify/kwirth-common-ai/back')

// The bundle resolves the common packages against the core's back-end global; it is simulated to load it standalone.
globalThis.__kwirth_back__ = { kwirthCommonAi: commonAi, kwirthCommonAiBack: commonAiBack }

const toolset = require('../dist/back.js').default
const tool = (name) => {
    const t = toolset.tools.find(x => x.name === name)
    assert.ok(t, `no existe la tool '${name}'`)
    return t
}

/** Records which method was called, so WHICH one can be asserted — not merely that it returned something. */
const fakeK8s = (over = {}) => {
    const calls = []
    const log = (name, ret) => (...args) => { calls.push({ name, args }); return Promise.resolve(ret) }
    const k8s = {
        name: 'k3d-test',
        flavour: 'k3d',
        vcpus: 4,
        memory: 8 * 1024 * 1024 * 1024,
        nodes: new Map([['n1', { name: 'n1', ip: '10.0.0.1', maxPods: 110 }]]),
        coreApi: {
            listNamespace: log('listNamespace', { items: [{ metadata: { name: 'default', uid: 'u1' }, status: { phase: 'Active' } }] }),
            listNode: log('listNode', { items: [{ metadata: { name: 'n1' }, status: { capacity: { cpu: '4', memory: '8Ki' }, conditions: [{ type: 'Ready', status: 'True' }] }, spec: {} }] }),
            listNamespacedPod: log('listNamespacedPod', { items: [] }),
            listPodForAllNamespaces: log('listPodForAllNamespaces', { items: [] }),
            listNamespacedService: log('listNamespacedService', { items: [] }),
            listServiceForAllNamespaces: log('listServiceForAllNamespaces', { items: [] }),
            listNamespacedConfigMap: log('listNamespacedConfigMap', { items: [] }),
            listNamespacedResourceQuota: log('listNamespacedResourceQuota', { items: [] }),
            listNamespacedLimitRange: log('listNamespacedLimitRange', { items: [] }),
            readNamespace: log('readNamespace', { status: { phase: 'Active' }, metadata: { labels: {} } }),
            readNamespacedConfigMap: log('readNamespacedConfigMap', { metadata: { resourceVersion: '7', managedFields: [{ time: new Date('2026-01-02T03:04:05Z') }] } }),
            readNamespacedSecret: log('readNamespacedSecret', { metadata: { resourceVersion: '9', managedFields: [] , creationTimestamp: new Date('2025-12-31T00:00:00Z') } })
        },
        appsApi: {
            listNamespacedDeployment: log('listNamespacedDeployment', { items: [] }),
            listDeploymentForAllNamespaces: log('listDeploymentForAllNamespaces', { items: [] }),
            listNamespacedStatefulSet: log('listNamespacedStatefulSet', { items: [] }),
            listStatefulSetForAllNamespaces: log('listStatefulSetForAllNamespaces', { items: [] }),
            listNamespacedDaemonSet: log('listNamespacedDaemonSet', { items: [] }),
            listDaemonSetForAllNamespaces: log('listDaemonSetForAllNamespaces', { items: [] }),
            readNamespacedDeployment: log('readNamespacedDeployment', { spec: { template: { spec: {} } } })
        },
        networkApi: {
            listNamespacedIngress: log('listNamespacedIngress', { items: [] }),
            listIngressForAllNamespaces: log('listIngressForAllNamespaces', { items: [] })
        },
        ...over
    }
    return { k8s, calls }
}

const fakeHost = (over = {}) => {
    const { k8s, calls } = fakeK8s()
    const traced = []
    return { host: { trace: (t, a) => traced.push({ tool: t, args: a }), k8s, ...over }, calls, traced }
}

// ── the contract ─────────────────────────────────────────────────────────────────────────────────────

test('el toolset declara lo que necesita y sus siete tools', () => {
    assert.equal(toolset.id, 'k8s-inventory')
    assert.deepEqual(toolset.requires, [commonAi.ECapability.K8S])
    assert.equal(toolset.tools.length, 7)
    // get_space_data went to k8s-describe on 2026-09-17: it describes ONE namespace, and that belongs to
    // that package. If it shows up here again, somebody has undone the decision by accident.
    assert.equal(toolset.tools.find(t => t.name === 'get_space_data'), undefined)
    // None of them writes: it is an inventory. If one stopped being READ, this test stops it.
    assert.deepEqual([...new Set(toolset.tools.map(t => t.effect))], [commonAi.EToolEffect.READ])
})

test('enumerar los Secrets de un deployment es READ pero NO es public', () => {
    // The two axes are independent: it changes nothing in the cluster and still reveals more than the rest.
    assert.equal(tool('get_workload_config_refs').sensitivity, commonAi.EToolSensitivity.INTERNAL)
    assert.equal(tool('list_namespaces').sensitivity, commonAi.EToolSensitivity.PUBLIC)
})

test('sin capability de cluster, la tool lo dice en vez de reventar por dentro', async () => {
    // This is the case of a badly built host. The message has to name the tool and the reason: a
    // "cannot read properties of undefined" is of use to nobody.
    const host = { trace: () => {} }
    await assert.rejects(() => tool('list_namespaces').execute({}, host), /list_namespaces.*cluster access/)
})

test('toda invocacion deja traza, con sus argumentos', async () => {
    const { host, traced } = fakeHost()
    await tool('list_namespaces').execute({}, host)
    await tool('list_services').execute({ namespace: 'kube-system' }, host)

    assert.deepEqual(traced.map(t => t.tool), ['list_namespaces', 'list_services'])
    assert.deepEqual(traced[1].args, { namespace: 'kube-system' })
})

// ── the namespace filter ─────────────────────────────────────────────────────────────────────────────

test("'*' y omitir significan todos los namespaces; un nombre acota", async () => {
    const { host, calls } = fakeHost()

    await tool('list_services').execute({ namespace: '*' }, host)
    await tool('list_services').execute({}, host)
    await tool('list_services').execute({ namespace: 'kube-system' }, host)

    assert.deepEqual(calls.map(c => c.name), ['listServiceForAllNamespaces', 'listServiceForAllNamespaces', 'listNamespacedService'])
    assert.deepEqual(calls[2].args[0], { namespace: 'kube-system' })
})

test('get_workload_data pide las cinco familias de recursos', async () => {
    const { host, calls } = fakeHost()
    await tool('get_workload_data').execute({ namespace: 'x' }, host)
    assert.deepEqual(calls.map(c => c.name).sort(), [
        'listNamespacedDaemonSet', 'listNamespacedDeployment', 'listNamespacedPod',
        'listNamespacedService', 'listNamespacedStatefulSet'
    ])
})

// ── datos ────────────────────────────────────────────────────────────────────────────────────────────

test('get_node_data sale del mapa del core, sin llamar al cluster', async () => {
    const { host, calls } = fakeHost()
    const res = await tool('get_node_data').execute({}, host)
    assert.deepEqual(res, { nodes: [{ name: 'n1', ip: '10.0.0.1', maxPods: 110 }] })
    assert.equal(calls.length, 0)
})

test('get_cluster_data convierte la memoria a GB y resume los nodos', async () => {
    const { host } = fakeHost()
    const res = await tool('get_cluster_data').execute({}, host)
    assert.equal(res.name, 'k3d-test')
    assert.equal(res.memoryGB, 8)
    assert.equal(res.nodeCount, 1)
    assert.deepEqual(res.nodes[0], { name: 'n1', cpu: '4', memoryKi: '8Ki', ready: true, unschedulable: false })
})

test('un fallo del cluster vuelve como dato, no como excepcion', async () => {
    // A tool's result goes to the model: an exception would cut the conversation short, an {error} lets
    // it decide (retry, ask, carry on another way).
    const { host } = fakeHost()
    host.k8s.coreApi.listNamespace = async () => { throw new Error('403 forbidden') }
    assert.deepEqual(await tool('list_namespaces').execute({}, host), { error: '403 forbidden' })
})

// ── referencias de configuracion ─────────────────────────────────────────────────────────────────────

test('las referencias a ConfigMap/Secret se deduplican juntando los motivos', async () => {
    const { host } = fakeHost()
    host.k8s.appsApi.readNamespacedDeployment = async () => ({
        spec: { template: { spec: {
            containers: [{
                name: 'app',
                envFrom: [{ configMapRef: { name: 'cfg' } }, { secretRef: { name: 'sec' } }],
                env: [{ name: 'PASS', valueFrom: { secretKeyRef: { name: 'sec' } } }]
            }],
            volumes: [{ name: 'v', configMap: { name: 'cfg' } }]
        } } }
    })

    const res = await tool('get_workload_config_refs').execute({ namespace: 'n', name: 'app' }, host)
    const cfg = res.refs.find(r => r.name === 'cfg')
    const sec = res.refs.find(r => r.name === 'sec')

    assert.equal(res.refs.length, 2)                                  // dos objetos, no cuatro entradas
    assert.deepEqual(cfg.via, ['envFrom(app)', 'volume v'])           // los dos motivos, juntos
    assert.deepEqual(sec.via, ['envFrom(app)', 'env PASS'])
    assert.equal(cfg.resourceVersion, '7')
})

test('lastModified sale de managedFields y se normaliza a ISO', async () => {
    // ⚠️ managedFields[].time arrives as a Date. Sorting Dates with the default sort compares them as
    // text ('Apr' < 'Aug' < 'Dec') and returns the wrong date; hence converting them to ISO BEFORE.
    const { host } = fakeHost()
    host.k8s.appsApi.readNamespacedDeployment = async () => ({
        spec: { template: { spec: { volumes: [{ name: 'v', configMap: { name: 'cfg' } }] } } }
    })
    host.k8s.coreApi.readNamespacedConfigMap = async () => ({
        metadata: {
            resourceVersion: '3',
            managedFields: [
                { time: new Date('2026-04-01T00:00:00Z') },
                { time: new Date('2026-12-01T00:00:00Z') },   // la mas reciente, y la que 'Apr' < 'Dec' acierta
                { time: new Date('2026-08-01T00:00:00Z') }    // con orden alfabetico de mes saldria 'Aug'
            ]
        }
    })

    const res = await tool('get_workload_config_refs').execute({ namespace: 'n', name: 'app' }, host)
    assert.equal(res.refs[0].lastModified, '2026-12-01T00:00:00.000Z')
})

test('si no se puede leer una referencia, se informa de ESA y las demas siguen', async () => {
    const { host } = fakeHost()
    host.k8s.appsApi.readNamespacedDeployment = async () => ({
        spec: { template: { spec: { volumes: [
            { name: 'a', configMap: { name: 'cfg' } },
            { name: 'b', secret: { secretName: 'sec' } }
        ] } } }
    })
    host.k8s.coreApi.readNamespacedSecret = async () => { throw new Error('403 forbidden') }

    const res = await tool('get_workload_config_refs').execute({ namespace: 'n', name: 'app' }, host)
    assert.equal(res.refs.find(r => r.name === 'cfg').error, undefined)
    assert.equal(res.refs.find(r => r.name === 'sec').error, '403 forbidden')
})
