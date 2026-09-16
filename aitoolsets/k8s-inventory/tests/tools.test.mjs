/*
    Harness del toolset `k8s-inventory`. Corre contra el dist construido (igual que el core carga el
    paquete) y con clientes de Kubernetes FALSOS: aqui no hay cluster, y no debe hacer falta — `npm test`
    tiene que pasar en cualquier maquina. La llamada real al cluster la prueba `verify.mjs`, a mano.

    Lo que se fija es lo que el contrato de S1 promete y es caro de arreglar tarde:
      · una tool que necesita cluster y no lo recibe lo DICE, en vez de reventar por dentro
      · cada invocacion deja traza
      · el filtro de namespace elige la llamada correcta (namespaced vs all-namespaces)
      · los fallos del cluster vuelven como DATO, no como excepcion: el modelo tiene que poder leerlos
*/
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const commonAi = require('@kwirthmagnify/kwirth-common-ai')
const commonAiBack = require('@kwirthmagnify/kwirth-common-ai/back')

// El bundle resuelve los comunes contra el global del back del core; se simula para cargarlo suelto.
globalThis.__kwirth_back__ = { kwirthCommonAi: commonAi, kwirthCommonAiBack: commonAiBack }

const toolset = require('../dist/back.js').default
const tool = (name) => {
    const t = toolset.tools.find(x => x.name === name)
    assert.ok(t, `no existe la tool '${name}'`)
    return t
}

/** Registra que metodo se llamo, para poder afirmar CUAL — no solo que devolvio algo. */
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

// ── el contrato ──────────────────────────────────────────────────────────────────────────────────────

test('el toolset declara lo que necesita y sus ocho tools', () => {
    assert.equal(toolset.id, 'k8s-inventory')
    assert.deepEqual(toolset.requires, [commonAi.ECapability.K8S])
    assert.equal(toolset.tools.length, 8)
    // Ninguna escribe: es un inventario. Si alguna dejara de ser READ, este test lo para.
    assert.deepEqual([...new Set(toolset.tools.map(t => t.effect))], [commonAi.EToolEffect.READ])
})

test('enumerar los Secrets de un deployment es READ pero NO es public', () => {
    // Los dos ejes son independientes: no cambia nada del cluster y aun asi revela mas que las demas.
    assert.equal(tool('get_workload_config_refs').sensitivity, commonAi.EToolSensitivity.INTERNAL)
    assert.equal(tool('list_namespaces').sensitivity, commonAi.EToolSensitivity.PUBLIC)
})

test('sin capability de cluster, la tool lo dice en vez de reventar por dentro', async () => {
    // Es el caso de un host mal construido. El mensaje tiene que nombrar la tool y el motivo: un
    // "cannot read properties of undefined" no le sirve a nadie.
    const host = { trace: () => {} }
    await assert.rejects(() => tool('list_namespaces').execute({}, host), /list_namespaces.*cluster access/)
})

test('toda invocacion deja traza, con sus argumentos', async () => {
    const { host, traced } = fakeHost()
    await tool('list_namespaces').execute({}, host)
    await tool('get_space_data').execute({ namespace: 'kube-system' }, host)

    assert.deepEqual(traced.map(t => t.tool), ['list_namespaces', 'get_space_data'])
    assert.deepEqual(traced[1].args, { namespace: 'kube-system' })
})

// ── el filtro de namespace ───────────────────────────────────────────────────────────────────────────

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
    // El resultado de una tool va al modelo: una excepcion cortaria la conversacion, un {error} lo deja
    // decidir (reintentar, preguntar, seguir por otro lado).
    const { host } = fakeHost()
    host.k8s.coreApi.listNamespace = async () => { throw new Error('403 forbidden') }
    assert.deepEqual(await tool('list_namespaces').execute({}, host), { error: '403 forbidden' })
})

test('get_space_data sobrevive a que falten quotas y limitranges', async () => {
    // Suele ser falta de RBAC para ESOS recursos. Que no haya no puede ocultar el resto del namespace.
    const { host } = fakeHost()
    host.k8s.coreApi.listNamespacedResourceQuota = async () => { throw new Error('forbidden') }
    host.k8s.coreApi.listNamespacedLimitRange = async () => { throw new Error('forbidden') }

    const res = await tool('get_space_data').execute({ namespace: 'kube-system' }, host)
    assert.equal(res.error, undefined)
    assert.deepEqual(res.resourceQuotas, [])
    assert.equal(res.namespace, 'kube-system')
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
    // ⚠️ managedFields[].time llega como Date. Ordenar Dates con el sort por defecto las compara como
    // texto ('Apr' < 'Aug' < 'Dec') y devuelve la fecha equivocada; por eso se pasan a ISO ANTES.
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
