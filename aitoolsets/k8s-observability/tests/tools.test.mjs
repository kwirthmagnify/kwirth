/*
    Harness del toolset `k8s-observability`. Contra el dist construido y con host FALSO: `npm test` tiene
    que pasar en una maquina sin cluster.

    Lo que se fija:
      · las dos tools de eventos NO llaman al cluster — leen el buffer que presta el host
      · el filtrado (warnings, namespace, limite) y el resumen de cada clase de elemento
      · que un objeto se encuentre TAMBIEN cuando el evento lo señala con involvedObject
      · que el log se recorte por el final, que es donde esta la causa de una muerte
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

const kubeEvent = (over = {}) => ({
    type: 'ADDED',
    obj: {
        kind: 'Event', type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container',
        involvedObject: { kind: 'Pod', name: 'api-1', namespace: 'prod' },
        count: 7, lastTimestamp: '2026-09-17T06:00:00Z',
        ...over
    }
})

const lifecycle = (over = {}) => ({
    type: 'MODIFIED',
    obj: { kind: 'Deployment', metadata: { name: 'api', namespace: 'prod' }, ...over }
})

const fakeHost = (over = {}) => {
    const traced = []
    const calls = []
    return {
        traced,
        calls,
        host: {
            trace: (t, a) => traced.push({ tool: t, args: a }),
            events: { recent: [] },
            k8s: {
                name: 'k3d-test', flavour: 'k3d', vcpus: 4, memory: 1024, nodes: new Map(),
                coreApi: {
                    readNamespacedPodLog: async (p) => { calls.push(p); return 'linea1\nlinea2\n' }
                },
                appsApi: {}, networkApi: {}
            },
            ...over
        }
    }
}

// ── el contrato ──────────────────────────────────────────────────────────────────────────────────────

test('declara las dos capabilities que usa, y sus tres tools', () => {
    assert.equal(toolset.id, 'k8s-observability')
    assert.deepEqual(toolset.requires.sort(), [commonAi.ECapability.EVENTS, commonAi.ECapability.K8S].sort())
    assert.deepEqual(toolset.tools.map(t => t.name), ['get_cluster_events', 'get_object_events', 'get_pod_logs'])
    assert.deepEqual([...new Set(toolset.tools.map(t => t.effect))], [commonAi.EToolEffect.READ])
})

test('leer logs es READ pero NO es public', () => {
    // Un log es donde acaban tokens, correos y datos de cliente. No cambia nada y enseña mucho.
    assert.equal(tool('get_pod_logs').sensitivity, commonAi.EToolSensitivity.INTERNAL)
    assert.equal(tool('get_cluster_events').sensitivity, commonAi.EToolSensitivity.PUBLIC)
})

test('sin buffer de eventos, la tool lo dice; sin cluster, la de logs tambien', async () => {
    await assert.rejects(() => tool('get_cluster_events').execute({}, { trace: () => {} }), /event buffer/)
    await assert.rejects(() => tool('get_pod_logs').execute({ namespace: 'n', name: 'p' }, { trace: () => {} }), /cluster access/)
})

// ── eventos ──────────────────────────────────────────────────────────────────────────────────────────

test('los eventos salen del buffer del host: no se llama al cluster', async () => {
    const { host, calls } = fakeHost()
    host.events.recent = [kubeEvent(), lifecycle()]

    const res = await tool('get_cluster_events').execute({}, host)

    assert.equal(res.count, 2)
    assert.equal(calls.length, 0)   // ni una llamada a la API
})

test('cada clase de elemento se resume distinto', async () => {
    const { host } = fakeHost()
    host.events.recent = [kubeEvent(), lifecycle()]

    const [ev, cambio] = (await tool('get_cluster_events').execute({}, host)).events

    assert.deepEqual(ev, {
        kind: 'Event', eventType: 'Warning', reason: 'BackOff',
        message: 'Back-off restarting failed container',
        involved: { kind: 'Pod', name: 'api-1', namespace: 'prod' },
        count: 7, lastTimestamp: '2026-09-17T06:00:00Z'
    })
    assert.deepEqual(cambio, { changeType: 'MODIFIED', kind: 'Deployment', name: 'api', namespace: 'prod' })
})

test('warningsOnly deja fuera los Normal Y los cambios de ciclo de vida', async () => {
    const { host } = fakeHost()
    host.events.recent = [kubeEvent(), kubeEvent({ type: 'Normal', reason: 'Pulled' }), lifecycle()]

    const res = await tool('get_cluster_events').execute({ warningsOnly: true }, host)

    assert.equal(res.count, 1)
    assert.equal(res.events[0].reason, 'BackOff')
})

test('el filtro de namespace mira tambien el objeto señalado', async () => {
    const { host } = fakeHost()
    host.events.recent = [
        kubeEvent(),                                                            // involvedObject en prod
        lifecycle({ metadata: { name: 'api', namespace: 'dev' } })              // objeto en dev
    ]

    assert.equal((await tool('get_cluster_events').execute({ namespace: 'prod' }, host)).count, 1)
    assert.equal((await tool('get_cluster_events').execute({ namespace: 'dev' }, host)).count, 1)
    assert.equal((await tool('get_cluster_events').execute({ namespace: 'otro' }, host)).count, 0)
})

test('el limite devuelve los ULTIMOS, no los primeros', async () => {
    // En un buffer de eventos lo viejo casi nunca es lo que se busca.
    const { host } = fakeHost()
    host.events.recent = [1, 2, 3, 4, 5].map(n => lifecycle({ metadata: { name: `api-${n}`, namespace: 'prod' } }))

    const res = await tool('get_cluster_events').execute({ limit: 2 }, host)

    assert.equal(res.count, 5)                                   // cuenta lo que hay...
    assert.deepEqual(res.events.map(e => e.name), ['api-4', 'api-5'])   // ...y devuelve los ultimos
})

test('un objeto se encuentra tanto si ES el evento como si lo SEÑALA', async () => {
    // Los Warning de kube apuntan con involvedObject. Mirar solo metadata deja fuera justo esa mitad.
    const { host } = fakeHost()
    host.events.recent = [
        lifecycle({ metadata: { name: 'api-1', namespace: 'prod' }, kind: 'Pod' }),
        kubeEvent(),                                                                 // involvedObject: api-1/prod
        lifecycle({ metadata: { name: 'otro', namespace: 'prod' } })
    ]

    const res = await tool('get_object_events').execute({ namespace: 'prod', name: 'api-1' }, host)

    assert.equal(res.count, 2)
    assert.deepEqual(res.events.map(e => e.kind), ['Pod', 'Event'])
})

// ── logs ─────────────────────────────────────────────────────────────────────────────────────────────

test('los logs se piden con lo que se le pasa, y previous viaja como booleano', async () => {
    const { host, calls } = fakeHost()
    await tool('get_pod_logs').execute({ namespace: 'prod', name: 'api-1', container: 'app', previous: true, tailLines: 10 }, host)

    assert.deepEqual(calls[0], { name: 'api-1', namespace: 'prod', container: 'app', previous: true, tailLines: 10 })
})

test('sin container ni tailLines, se usan los valores por defecto', async () => {
    const { host, calls } = fakeHost()
    const res = await tool('get_pod_logs').execute({ namespace: 'prod', name: 'api-1' }, host)

    assert.equal(calls[0].container, undefined)
    assert.equal(calls[0].tailLines, 200)
    assert.equal(calls[0].previous, false)
    assert.equal(res.container, null)
    assert.equal(res.truncated, false)
})

test('un log enorme se recorta por el FINAL y se avisa', async () => {
    // Lo ultimo que dijo el contenedor antes de morir es lo que explica la muerte; el arranque no.
    const { host } = fakeHost()
    host.k8s.coreApi.readNamespacedPodLog = async () => 'x'.repeat(20000) + 'EL-FINAL'

    const res = await tool('get_pod_logs').execute({ namespace: 'prod', name: 'api-1' }, host)

    assert.equal(res.truncated, true)
    assert.equal(res.logs.length, 15000)
    assert.ok(res.logs.endsWith('EL-FINAL'), 'se conserva el final, que es lo que importa')
})

test('si el cluster responde un objeto en vez de texto, no se pierde', async () => {
    const { host } = fakeHost()
    host.k8s.coreApi.readNamespacedPodLog = async () => ({ body: 'desde body' })
    assert.equal((await tool('get_pod_logs').execute({ namespace: 'n', name: 'p' }, host)).logs, 'desde body')
})

test('un fallo leyendo logs vuelve como dato', async () => {
    const { host } = fakeHost()
    host.k8s.coreApi.readNamespacedPodLog = async () => { throw new Error('pod not found') }
    assert.deepEqual(await tool('get_pod_logs').execute({ namespace: 'n', name: 'p' }, host), { error: 'pod not found' })
})

test('toda invocacion deja traza con sus argumentos', async () => {
    const { host, traced } = fakeHost()
    await tool('get_cluster_events').execute({ limit: 5 }, host)
    await tool('get_pod_logs').execute({ namespace: 'n', name: 'p' }, host)

    assert.deepEqual(traced.map(t => t.tool), ['get_cluster_events', 'get_pod_logs'])
    assert.deepEqual(traced[0].args, { warningsOnly: false, namespace: '*', limit: 5 })
})
