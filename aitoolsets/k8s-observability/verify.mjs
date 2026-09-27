/*
    Verification against a REAL cluster: node verify.mjs [namespace]

    The same as in k8s-inventory: the harness passes with no cluster, and this one needs one. It is run by
    hand when the toolset is touched.

    ⚠️ With one wrinkle of its own: the event buffer is kept by the CORE, not by Kubernetes's API, so here
    it is built by reading the cluster's Events — which is where the core gets them from — and handed to
    the host in the contract's shape. What is really tested against the cluster is `get_pod_logs`; the two
    event ones are tested with real data, but served by us.
*/
import { createRequire } from 'module'
import { KubeConfig, CoreV1Api } from '@kubernetes/client-node'

const require = createRequire(import.meta.url)
const commonAi = require('@kwirthmagnify/kwirth-common-ai')
const commonAiBack = require('@kwirthmagnify/kwirth-common-ai/back')

globalThis.__kwirth_back__ = { kwirthCommonAi: commonAi, kwirthCommonAiBack: commonAiBack }

const toolset = require('./dist/back.js').default
const { buildToolHost } = commonAiBack

const kc = new KubeConfig()
kc.loadFromDefault()
const coreApi = kc.makeApiClient(CoreV1Api)

const ns = process.argv[2] ?? 'kube-system'

// The core's buffer, reconstructed: each kube Event travels as { type, obj }.
const eventList = await coreApi.listEventForAllNamespaces()
const clusterEvents = eventList.items.map(e => ({ type: 'ADDED', obj: { kind: 'Event', ...e } }))

const traced = []
const context = {
    origin: 'verify.mjs',
    nodes: new Map(),
    clusterInfo: { name: kc.getCurrentCluster()?.name ?? 'unknown', flavour: 'unknown', vcpus: 0, memory: 0, coreApi, appsApi: {}, networkApi: {} },
    clusterMetrics: [],
    clusterEvents,
    trace: (tool, args) => traced.push({ tool, args })
}

const host = buildToolHost(toolset.requires, context)
if (!host.events || !host.k8s) {
    console.error('El host no trae las dos capabilities declaradas; el toolset no puede funcionar.')
    process.exit(1)
}

const tool = (name) => toolset.tools.find(t => t.name === name)
let failures = 0
console.log(`cluster: ${context.clusterInfo.name} | namespace de prueba: ${ns} | eventos en el buffer: ${clusterEvents.length}\n`)

const todos = await tool('get_cluster_events').execute({}, host)
const warnings = await tool('get_cluster_events').execute({ warningsOnly: true }, host)
const delNs = await tool('get_cluster_events').execute({ namespace: ns }, host)
console.log(`get_cluster_events            todos=${todos.count}  warnings=${warnings.count}  en ${ns}=${delNs.count}`)
if (warnings.count > 0) console.log(`  ejemplo: ${warnings.events[0].reason} -> ${String(warnings.events[0].message).slice(0, 80)}`)

// A real pod from the namespace, for the two that are left.
const pods = await coreApi.listNamespacedPod({ namespace: ns })
const pod = pods.items[0]
if (!pod) {
    console.log(`SIN PROBAR get_object_events / get_pod_logs: no hay pods en '${ns}'`)
    failures++
}
else {
    const podName = pod.metadata?.name
    const delObjeto = await tool('get_object_events').execute({ namespace: ns, name: podName }, host)
    console.log(`get_object_events             pod=${podName} eventos=${delObjeto.count}`)

    const logs = await tool('get_pod_logs').execute({ namespace: ns, name: podName, tailLines: 5 }, host)
    if (logs.error) { console.log(`get_pod_logs                  ERROR: ${logs.error}`); failures++ }
    else {
        const lineas = String(logs.logs).split('\n').filter(Boolean).length
        console.log(`get_pod_logs                  pod=${podName} lineas=${lineas} truncado=${logs.truncated}`)
    }
}

console.log(`\ntrazas recibidas: ${traced.length} (${traced.map(t => t.tool).join(', ')})`)
console.log(failures ? `\n${failures} fallo(s)` : `\nlas 3 tools responden`)
process.exit(failures ? 1 : 0)
