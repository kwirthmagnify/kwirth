/*
    Verificacion contra un cluster DE VERDAD: node verify.mjs [namespace]

    Por que no es un test del harness: `npm test` tiene que pasar en cualquier maquina, y esto necesita un
    kubeconfig con un cluster detras. Y por que no es un e2e: el e2e mira la SPA, y esto es back puro.
    Asi que es un script que se corre a mano cuando se toca el toolset — es la unica forma honesta de
    decir "llama al cluster" sin abrir un endpoint de invocacion en el core (que es S4, cuando exista
    autorizacion al invocar).

    Monta el host de K8S tal y como lo montara el core (buildToolHost con requires: [K8S]) y ejecuta las
    ocho tools contra el cluster activo, en SOLO LECTURA.
*/
import { createRequire } from 'module'
import { KubeConfig, CoreV1Api, AppsV1Api, NetworkingV1Api } from '@kubernetes/client-node'

const require = createRequire(import.meta.url)
const commonAi = require('@kwirthmagnify/kwirth-common-ai')
const commonAiBack = require('@kwirthmagnify/kwirth-common-ai/back')

// El bundle del toolset resuelve los paquetes comunes contra el global del back del core: aqui se simula
// ese global para poder cargarlo fuera de Kwirth. Es exactamente lo que hace el core al instalarlo.
globalThis.__kwirth_back__ = { kwirthCommonAi: commonAi, kwirthCommonAiBack: commonAiBack }

const toolset = require('./dist/back.js').default
const { buildToolHost } = commonAiBack
const { ECapability } = commonAi

const kc = new KubeConfig()
kc.loadFromDefault()
const coreApi = kc.makeApiClient(CoreV1Api)
const appsApi = kc.makeApiClient(AppsV1Api)
const networkApi = kc.makeApiClient(NetworkingV1Api)

// El core rellena esto desde su ClusterInfo; aqui se deriva del propio cluster para no depender de Kwirth.
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

// La octava necesita un deployment de verdad: se coge el primero que haya en el namespace de prueba.
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

// Que la traza llegue no es un detalle: es lo que permitira ver que tools llamo el modelo y con que.
console.log(`\ntrazas recibidas: ${traced.length} (${traced.map(t => t.tool).join(', ')})`)
console.log(failures ? `\n${failures} tool(s) con error` : '\nlas 8 tools han respondido desde el cluster')
process.exit(failures ? 1 : 0)
