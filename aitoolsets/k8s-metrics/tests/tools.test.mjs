/*
    Harness del toolset `k8s-metrics`. Con host FALSO: `npm test` pasa sin cluster.

    Lo que merece red aqui es la ARITMETICA y el reparto: convertir unidades mal, o sumar solo los pods
    del primer nodo, da una cifra que parece correcta y no lo es. Un error asi no revienta nada — hace
    que el modelo diagnostique sobre datos falsos.
*/
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const commonAi = require('@kwirthmagnify/kwirth-common-ai')
const commonAiBack = require('@kwirthmagnify/kwirth-common-ai/back')

globalThis.__kwirth_back__ = { kwirthCommonAi: commonAi, kwirthCommonAiBack: commonAiBack }

const toolset = require('../dist/back.js').default
const tool = (name) => {
    const t = toolset.tools.find(x => x.name === name)
    assert.ok(t, `no existe la tool '${name}'`)
    return t
}

const GB = 1024 * 1024 * 1024
const MB = 1024 * 1024

/** Un pod dentro del resumen de un nodo. cpu en nanocores, memoria en bytes, como los da kubelet. */
const pod = (namespace, name, millicores, mb) => ({
    podRef: { namespace, name },
    cpu: { usageNanoCores: millicores * 1_000_000 },
    memory: { workingSetBytes: mb * MB }
})

const node = (name, millicores, mb, pods = [], over = {}) => ({
    name,
    timestamp: 1700000000,
    summary: {
        cpu: { usageNanoCores: millicores * 1_000_000 },
        memory: { workingSetBytes: mb * MB },
        network: { rxBytes: 5 * MB, txBytes: 3 * MB },
        pods,
        ...over
    }
})

const sample = (cpuPct, nodes) => ({
    metricsInterval: 30,
    cluster: { vcpus: 4, memory: 8 * GB, cpuUsage: cpuPct, memoryUsage: 40.456, txmbps: 1.234, rxmbps: 2.345 },
    nodes
})

const fakeHost = (samples = []) => {
    const traced = []
    return {
        traced,
        host: {
            trace: (t, a) => traced.push({ tool: t, args: a }),
            metrics: { samples },
            k8s: {
                name: 'k3d', flavour: 'k3d', vcpus: 4, memory: 8 * GB, nodes: new Map(),
                appsApi: { readNamespacedDeployment: async () => ({ spec: { selector: { matchLabels: { app: 'api' } } } }) },
                coreApi: { listNamespacedPod: async () => ({ items: [{ metadata: { name: 'api-1' } }, { metadata: { name: 'api-2' } }] }) },
                networkApi: {}
            }
        }
    }
}

// ── el contrato ──────────────────────────────────────────────────────────────────────────────────────

test('declara sus siete tools y las dos capabilities que usa', () => {
    assert.equal(toolset.id, 'k8s-metrics')
    assert.deepEqual(toolset.requires.sort(), [commonAi.ECapability.K8S, commonAi.ECapability.METRICS].sort())
    assert.equal(toolset.tools.length, 7)
    assert.deepEqual([...new Set(toolset.tools.map(t => t.effect))], [commonAi.EToolEffect.READ])
    assert.deepEqual([...new Set(toolset.tools.map(t => t.sensitivity))], [commonAi.EToolSensitivity.PUBLIC])
})

test('sin metricas provisionadas, la tool lo dice', async () => {
    await assert.rejects(() => tool('get_cluster_usage').execute({}, { trace: () => {} }), /cluster metrics/)
})

test('con metricas vacias NO es un error del sistema: aun no hay lecturas', async () => {
    // Pasa siempre al arrancar. Devolver un error tecnico haria que el modelo se pusiera a diagnosticar
    // un problema que no existe.
    const { host } = fakeHost([])
    assert.deepEqual(await tool('get_cluster_usage').execute({}, host), { error: 'No metrics available yet' })
})

// ── unidades ─────────────────────────────────────────────────────────────────────────────────────────

test('el uso del cluster sale de la ULTIMA lectura, con las unidades convertidas', async () => {
    const { host } = fakeHost([sample(10, []), sample(87.6543, [])])

    const res = await tool('get_cluster_usage').execute({}, host)

    assert.equal(res.cpuUsagePercent, 87.65)       // redondeo a dos decimales
    assert.equal(res.memoryGB, 8)                  // bytes -> GB
    assert.equal(res.memoryUsagePercent, 40.46)
    assert.equal(res.networkTxMbps, 1.23)
    assert.equal(res.metricsIntervalSeconds, 30)   // sin esto, una serie no dice a que ritmo pasa el tiempo
})

test('el uso de un nodo pasa nanocores a milicores y bytes a MB', async () => {
    const { host } = fakeHost([sample(10, [node('n1', 250, 512)])])

    const [n] = await tool('get_node_usage').execute({}, host)

    assert.equal(n.cpuMillicores, 250)
    assert.equal(n.memoryMB, 512)
    assert.equal(n.networkRxMB, 5)
    assert.equal(n.networkTxMB, 3)
})

test('el filtro de nodo deja solo el pedido', async () => {
    const { host } = fakeHost([sample(10, [node('n1', 100, 100), node('n2', 200, 200)])])

    assert.deepEqual((await tool('get_node_usage').execute({}, host)).map(n => n.name), ['n1', 'n2'])
    assert.deepEqual((await tool('get_node_usage').execute({ nodeName: 'n2' }, host)).map(n => n.name), ['n2'])
    assert.deepEqual(await tool('get_node_usage').execute({ nodeName: 'no-existe' }, host), [])
})

// ── agregacion por deployment y por namespace ────────────────────────────────────────────────────────

test('los pods de un deployment se suman AUNQUE esten en nodos distintos', async () => {
    // Sumar solo el primer nodo da una cifra baja que parece correcta: el error mas caro de esta tool.
    const { host } = fakeHost([sample(10, [
        node('n1', 0, 0, [pod('prod', 'api-1', 100, 50)]),
        node('n2', 0, 0, [pod('prod', 'api-2', 200, 70)])
    ])])

    const res = await tool('get_deployment_usage').execute({ namespace: 'prod', name: 'api' }, host)

    assert.equal(res.podCount, 2)
    assert.equal(res.cpuMillicores, 300)
    assert.equal(res.memoryMB, 120)
})

test('no se cuelan pods de otro namespace con el mismo nombre', async () => {
    const { host } = fakeHost([sample(10, [
        node('n1', 0, 0, [pod('prod', 'api-1', 100, 50), pod('dev', 'api-1', 999, 999)])
    ])])

    const res = await tool('get_deployment_usage').execute({ namespace: 'prod', name: 'api' }, host)

    assert.equal(res.podCount, 1)
    assert.equal(res.cpuMillicores, 100)
})

test('por namespace se suman TODOS los pods, sin preguntar al cluster', async () => {
    const { host } = fakeHost([sample(10, [
        node('n1', 0, 0, [pod('prod', 'api-1', 100, 50), pod('prod', 'otro-9', 50, 20), pod('dev', 'x', 999, 999)])
    ])])
    // Si intentara resolver un deployment, esto reventaria: no hay appsApi util aqui.
    host.k8s.appsApi.readNamespacedDeployment = async () => { throw new Error('no deberia llamarse') }

    const [r] = await tool('get_prev_space_data').execute({ namespace: 'prod', count: 1 }, host)

    assert.equal(r.podCount, 2)
    assert.equal(r.cpuMillicores, 150)
})

// ── historico ────────────────────────────────────────────────────────────────────────────────────────

test('el historico devuelve las ULTIMAS N lecturas, en orden', async () => {
    const { host } = fakeHost([sample(10, []), sample(20, []), sample(30, []), sample(40, [])])

    const res = await tool('get_prev_cluster_usage').execute({ count: 3 }, host)

    assert.deepEqual(res.map(r => r.cpuUsagePercent), [20, 30, 40])
})

test('sin count se devuelven cinco lecturas', async () => {
    const { host } = fakeHost([1, 2, 3, 4, 5, 6, 7].map(n => sample(n, [])))
    const res = await tool('get_prev_cluster_usage').execute({}, host)
    assert.deepEqual(res.map(r => r.cpuUsagePercent), [3, 4, 5, 6, 7])
})

test('el historico de un deployment agrega cada lectura por separado', async () => {
    const { host } = fakeHost([
        sample(10, [node('n1', 0, 0, [pod('prod', 'api-1', 100, 10)])]),
        sample(20, [node('n1', 0, 0, [pod('prod', 'api-1', 300, 30), pod('prod', 'api-2', 100, 10)])])
    ])

    const res = await tool('get_prev_deployment_usage').execute({ namespace: 'prod', name: 'api', count: 2 }, host)

    assert.deepEqual(res.map(r => [r.podCount, r.cpuMillicores]), [[1, 100], [2, 400]])
})

test('un fallo resolviendo el deployment vuelve como dato', async () => {
    const { host } = fakeHost([sample(10, [])])
    host.k8s.appsApi.readNamespacedDeployment = async () => { throw new Error('404 not found') }
    assert.deepEqual(await tool('get_deployment_usage').execute({ namespace: 'p', name: 'x' }, host), { error: '404 not found' })
})

test('toda invocacion deja traza con sus argumentos', async () => {
    const { host, traced } = fakeHost([sample(10, [])])
    await tool('get_prev_node_usage').execute({ count: 2 }, host)
    assert.deepEqual(traced[0], { tool: 'get_prev_node_usage', args: { nodeName: '*', count: 2 } })
})
