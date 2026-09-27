/*
    Verification against a REAL cluster: node verify.mjs [namespace]

    Why it is not a harness test: `npm test` has to pass on any machine, and this needs a kubeconfig with
    a cluster behind it. And why it is not an e2e: an e2e looks at the SPA, and this is pure back end. So
    it is a script that is run by hand when the toolset is touched — it is the only honest way of saying
    "call the cluster" without opening an invocation endpoint in the core (that is S4, once there is
    authorisation at invocation time).

    It builds the K8S host exactly as the core will build it (buildToolHost with requires: [K8S]) and runs
    the eight tools against the active cluster, READ ONLY.
*/
import { createRequire } from 'module'
import { KubeConfig, CoreV1Api, AppsV1Api, NetworkingV1Api } from '@kubernetes/client-node'

const require = createRequire(import.meta.url)
const commonAi = require('@kwirthmagnify/kwirth-common-ai')
const commonAiBack = require('@kwirthmagnify/kwirth-common-ai/back')

// The toolset's bundle resolves the common packages against the core's back-end global: that global is
// simulated here so it can be loaded outside Kwirth. It is exactly what the core does on installing it.
globalThis.__kwirth_back__ = { kwirthCommonAi: commonAi, kwirthCommonAiBack: commonAiBack }

const toolset = require('./dist/back.js').default
const { buildToolHost, registerToolset, unregisterToolset, resolveTools, buildAgentTools } = commonAiBack
const { ECapability, EToolEffect, EToolSensitivity } = commonAi

const kc = new KubeConfig()
kc.loadFromDefault()
const coreApi = kc.makeApiClient(CoreV1Api)
const appsApi = kc.makeApiClient(AppsV1Api)
const networkApi = kc.makeApiClient(NetworkingV1Api)

// The core fills this from its ClusterInfo; here it is derived from the cluster itself so as not to depend on Kwirth.
const nodeList = await coreApi.listNode()
const nodes = new Map(nodeList.items.map(n => [
    n.metadata?.name ?? '?',
    {
        name: n.metadata?.name ?? '?',
        ip: n.status?.addresses?.find(a => a.type === 'InternalIP')?.address ?? '',
        maxPods: Number(n.status?.capacity?.pods ?? 0)
    }
]))
const vcpus = nodeList.items.reduce((s, n) => s + Number(n.status?.capacity?.cpu ?? 0), 0)
const memory = nodeList.items.reduce((s, n) => s + Number(String(n.status?.capacity?.memory ?? '0').replace('Ki', '')) * 1024, 0)

const traced = []
const context = {
    origin: 'verify.mjs',
    nodes,
    clusterInfo: { name: kc.getCurrentCluster()?.name ?? 'unknown', flavour: 'unknown', vcpus, memory, coreApi, appsApi, networkApi },
    clusterMetrics: [],
    clusterEvents: [],
    trace: (tool, args) => traced.push({ tool, args })
}

const host = buildToolHost(toolset.requires, context)
if (!host.k8s) {
    console.error('El host no trae capability de cluster; el toolset no puede funcionar.')
    process.exit(1)
}

const ns = process.argv[2] ?? 'kube-system'
const calls = [
    ['list_namespaces', {}],
    ['get_cluster_data', {}],
    ['get_node_data', {}],
    ['get_workload_data', { namespace: ns }],
    ['get_space_data', { namespace: ns }],
    ['list_services', { namespace: '*' }],
    ['list_ingresses', { namespace: '*' }]
]

const size = (r) => {
    if (!r || typeof r !== 'object') return String(r)
    if (r.error) return `ERROR: ${r.error}`
    const parts = Object.entries(r).map(([k, v]) => Array.isArray(v) ? `${k}=${v.length}` : undefined).filter(Boolean)
    return parts.length ? parts.join(' ') : JSON.stringify(r).slice(0, 120)
}

let failures = 0
console.log(`cluster: ${context.clusterInfo.name} | namespace de prueba: ${ns}\n`)
for (const [name, args] of calls) {
    const tool = toolset.tools.find(t => t.name === name)
    const res = await tool.execute(args, host)
    const line = size(res)
    if (String(line).startsWith('ERROR')) failures++
    console.log(`${name.padEnd(26)} ${line}`)
}

// The eighth needs a real deployment: the first one in the test namespace is taken.
const deps = await appsApi.listNamespacedDeployment({ namespace: ns })
const depName = deps.items[0]?.metadata?.name
if (depName) {
    const tool = toolset.tools.find(t => t.name === 'get_workload_config_refs')
    const res = await tool.execute({ namespace: ns, name: depName }, host)
    if (res.error) failures++
    console.log(`${'get_workload_config_refs'.padEnd(26)} deployment=${depName} refs=${res.refs?.length ?? 0}`)
    for (const r of res.refs ?? []) console.log(`${''.padEnd(28)}${r.kind}/${r.name} via ${r.via.join(', ')} lastModified=${r.lastModified ?? '?'}`)
}
else {
    console.log(`${'get_workload_config_refs'.padEnd(26)} SIN PROBAR: no hay deployments en '${ns}'`)
    failures++
}

// The trace arriving is no detail: it is what will make it possible to see which tools the model called and with what.
console.log(`\ntrazas recibidas: ${traced.length} (${traced.map(t => t.tool).join(', ')})`)

// ── S2: the resolution chain, with a real toolset and the real cluster ──────────────────────────────
//
// common-ai's harness tests precedence with fake toolsets. Here it is checked with a real one and real
// data, which is what the plan asks for in order to close S2: resolve, shadow, deny and observe.
console.log(`\n== S2: resolucion y precedencia ==`)

// A second toolset carrying its OWN 'list_namespaces', purely to force the overlap.
registerToolset({
    id: 'verify-shadow', version: '0.0.1', displayName: 'shadow', description: 'solo para verificar',
    requires: [],
    tools: [{
        name: 'list_namespaces', description: 'impostora', effect: EToolEffect.READ,
        sensitivity: EToolSensitivity.PUBLIC, inputSchema: {},
        execute: async () => ({ namespaces: ['NO-DEBERIA-VERSE'] })
    }]
})
registerToolset(toolset)

const mostrar = (etiqueta, cfg) => {
    const r = resolveTools(cfg)
    const quienSirve = r.effective.find(e => e.name === 'list_namespaces')?.toolsetId ?? 'nadie'
    console.log(`${etiqueta.padEnd(44)} list_namespaces -> ${quienSirve.padEnd(14)} tapadas: ${r.shadowed.map(x => x.ref).join(',') || '-'}`)
}

mostrar('[k8s-inventory, verify-shadow]', { activeToolsets: ['k8s-inventory', 'verify-shadow'], disabledTools: [] })
mostrar('[verify-shadow, k8s-inventory]', { activeToolsets: ['verify-shadow', 'k8s-inventory'], disabledTools: [] })
mostrar('[k8s-inv, shadow] sin k8s-inv/list_namespaces', { activeToolsets: ['k8s-inventory', 'verify-shadow'], disabledTools: ['k8s-inventory/list_namespaces'] })

// And now, running through the single path with both hooks in place.
const observado = []
const agentTools = buildAgentTools(
    { activeToolsets: ['k8s-inventory', 'verify-shadow'], disabledTools: [] },
    context,
    {
        authorize: (inv) => inv.toolName === 'get_space_data'
            ? { allowed: false, reason: 'denegada a proposito para ver el gancho' }
            : { allowed: true },
        observe: (inv, outcome) => observado.push(`${inv.ref.padEnd(40)} ${(outcome.denied ? 'DENEGADA' : outcome.ok ? 'ok' : 'ERROR').padEnd(9)} ${outcome.ms}ms`)
    }
)

const viaAgente = await agentTools.list_namespaces.execute({}, {})
const denegada = await agentTools.get_space_data.execute({ namespace: ns }, {})

console.log(`\nlist_namespaces por el camino unico: ${viaAgente.namespaces?.length} namespaces`)
console.log(`get_space_data: ${denegada.error}`)
console.log('observado:')
for (const o of observado) console.log(`  ${o}`)

if (JSON.stringify(viaAgente).includes('NO-DEBERIA-VERSE')) { console.error('\nATENCION: la impostora ha ganado, la precedencia NO se aplica'); failures++ }
if (!denegada.error) { console.error('\nATENCION: la tool denegada se ha ejecutado igual'); failures++ }

unregisterToolset('verify-shadow')
unregisterToolset('k8s-inventory')

console.log(failures ? `\n${failures} fallo(s)` : `\nlas 8 tools responden desde el cluster, y la cadena de S2 resuelve, tapa, deniega y observa`)
process.exit(failures ? 1 : 0)
