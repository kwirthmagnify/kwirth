/*
    Verificacion contra un cluster DE VERDAD: node verify.mjs [namespace]

    El harness pasa sin cluster; esto necesita uno. Se corre a mano al tocar el toolset. Busca objetos
    reales en el namespace indicado y llama a las once tools contra ellos, en SOLO LECTURA.
*/
import { createRequire } from 'module'
import { KubeConfig, CoreV1Api, AppsV1Api, NetworkingV1Api } from '@kubernetes/client-node'

const require = createRequire(import.meta.url)
const commonAi = require('@kwirthmagnify/kwirth-common-ai')
const commonAiBack = require('@kwirthmagnify/kwirth-common-ai/back')

globalThis.__kwirth_back__ = { kwirthCommonAi: commonAi, kwirthCommonAiBack: commonAiBack }

const toolset = require('./dist/back.js').default
const { buildToolHost } = commonAiBack

const kc = new KubeConfig()
kc.loadFromDefault()
const coreApi = kc.makeApiClient(CoreV1Api)
const appsApi = kc.makeApiClient(AppsV1Api)
const networkApi = kc.makeApiClient(NetworkingV1Api)

const ns = process.argv[2] ?? 'kube-system'
const traced = []
const context = {
    origin: 'verify.mjs',
    nodes: new Map(),
    clusterInfo: { name: kc.getCurrentCluster()?.name ?? 'unknown', flavour: 'unknown', vcpus: 0, memory: 0, coreApi, appsApi, networkApi },
    clusterMetrics: [],
    clusterEvents: [],
    trace: (tool, args) => traced.push({ tool, args })
}

const host = buildToolHost(toolset.requires, context)
const tool = (name) => toolset.tools.find(t => t.name === name)
let failures = 0

const run = async (name, args, resumen) => {
    const res = await tool(name).execute(args, host)
    if (res?.error) { console.log(`${name.padEnd(22)} ERROR: ${res.error}`); failures++; return res }
    console.log(`${name.padEnd(22)} ${resumen(res)}`)
    return res
}

// Objetos reales del namespace: sin ellos no hay nada que describir.
const [pods, deps, svcs, ings] = await Promise.all([
    coreApi.listNamespacedPod({ namespace: ns }),
    appsApi.listNamespacedDeployment({ namespace: ns }),
    coreApi.listNamespacedService({ namespace: ns }),
    networkApi.listNamespacedIngress({ namespace: ns }).catch(() => ({ items: [] }))
])
const pod = pods.items[0]?.metadata?.name
const dep = deps.items[0]?.metadata?.name
const svc = svcs.items[0]?.metadata?.name
const ing = ings.items[0]?.metadata?.name

console.log(`cluster: ${context.clusterInfo.name} | namespace: ${ns}`)
console.log(`objetos: pod=${pod ?? '-'} deployment=${dep ?? '-'} service=${svc ?? '-'} ingress=${ing ?? '-'}\n`)

if (pod) {
    const d = await run('describe_pod', { namespace: ns, name: pod },
        r => `fase=${r.phase} contenedores=${r.containers?.length} dueño=${r.controlledBy ? `${r.controlledBy.kind}/${r.controlledBy.name}` : '-'} fuente=${r.source?.repo ?? '-'}`)
    await run('get_pod_yaml', { namespace: ns, name: pod }, r => `kind=${r.kind ?? 'Pod'} uid=${String(r.metadata?.uid).slice(0, 8)}…`)

    // Si el pod tiene dueño, se aprovecha para las de controlador: son las que de verdad importan.
    if (d.controlledBy?.kind === 'Deployment') {
        await run('get_rollout_history', { namespace: ns, name: d.controlledBy.name }, r => `revisiones=${r.revisionCount}`)
    }
}
else { console.log('SIN PROBAR describe_pod / get_pod_yaml: no hay pods'); failures++ }

if (dep) {
    await run('describe_controller', { namespace: ns, kind: 'Deployment', name: dep },
        r => `replicas ${r.replicas?.ready}/${r.replicas?.desired} estrategia=${r.strategy} condiciones=${r.conditions?.length}`)
    await run('get_deployment_yaml', { namespace: ns, name: dep }, r => `generacion=${r.metadata?.generation}`)
    await run('get_controller_yaml', { namespace: ns, kind: 'Deployment', name: dep }, r => `contenedores=${r.spec?.template?.spec?.containers?.length}`)
    await run('get_rollout_history', { namespace: ns, name: dep }, r => `revisiones=${r.revisionCount}`)
}
else { console.log('SIN PROBAR las de controlador: no hay deployments'); failures++ }

if (svc) {
    await run('describe_service', { namespace: ns, name: svc }, r => `tipo=${r.type} puertos=${r.ports?.length} endpoints=${r.endpointCount}`)
    await run('get_service_yaml', { namespace: ns, name: svc }, r => `clusterIP=${r.spec?.clusterIP}`)
}
else { console.log('SIN PROBAR las de service: no hay services'); failures++ }

if (ing) {
    await run('describe_ingress', { namespace: ns, name: ing }, r => `clase=${r.ingressClass} reglas=${r.rules?.length} tls=${r.tls?.length}`)
    await run('get_ingress_yaml', { namespace: ns, name: ing }, r => `reglas=${r.spec?.rules?.length}`)
}
else { console.log(`(sin ingresses en '${ns}': describe_ingress / get_ingress_yaml sin probar aqui)`) }

await run('get_namespace_yaml', { name: ns }, r => `fase=${r.status?.phase} uid=${String(r.metadata?.uid).slice(0, 8)}…`)

console.log(`\ntrazas recibidas: ${traced.length}`)
console.log(failures ? `\n${failures} fallo(s)` : `\ntodas las tools probadas han respondido desde el cluster`)
process.exit(failures ? 1 : 0)
