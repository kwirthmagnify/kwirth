/*
    Harness del toolset `k8s-describe`. Contra el dist construido y con clientes FALSOS: `npm test` tiene
    que pasar en una maquina sin cluster.

    Lo que merece red aqui no son las llamadas, es lo que el toolset DECIDE: resolver quien manda sobre un
    pod, distinguir un DaemonSet de un Deployment, ordenar las revisiones, y no ahogarse cuando falta una
    pieza opcional.
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

const fakeHost = (over = {}) => {
    const calls = []
    const traced = []
    const log = (name, ret) => async (p) => { calls.push({ name, p }); return typeof ret === 'function' ? ret(p) : ret }
    return {
        calls,
        traced,
        host: {
            trace: (t, a) => traced.push({ tool: t, args: a }),
            k8s: {
                name: 'k3d-test', flavour: 'k3d', vcpus: 4, memory: 1024, nodes: new Map(),
                coreApi: {
                    readNamespacedPod: log('readNamespacedPod', { metadata: {}, spec: {}, status: {} }),
                    readNamespacedService: log('readNamespacedService', { spec: {}, status: {} }),
                    readNamespacedEndpoints: log('readNamespacedEndpoints', { subsets: [] }),
                    readNamespace: log('readNamespace', { metadata: { name: 'prod' } })
                },
                appsApi: {
                    readNamespacedDeployment: log('readNamespacedDeployment', { spec: {}, status: {} }),
                    readNamespacedStatefulSet: log('readNamespacedStatefulSet', { spec: {}, status: {} }),
                    readNamespacedDaemonSet: log('readNamespacedDaemonSet', { spec: {}, status: {} }),
                    readNamespacedReplicaSet: log('readNamespacedReplicaSet', { metadata: {}, spec: {}, status: {} }),
                    listNamespacedReplicaSet: log('listNamespacedReplicaSet', { items: [] })
                },
                networkApi: {
                    readNamespacedIngress: log('readNamespacedIngress', { spec: {}, status: {} })
                }
            },
            ...over
        }
    }
}

// ── el contrato ──────────────────────────────────────────────────────────────────────────────────────

test('declara sus doce tools, todas de lectura', () => {
    assert.equal(toolset.id, 'k8s-describe')
    assert.deepEqual(toolset.requires, [commonAi.ECapability.K8S])
    assert.equal(toolset.tools.length, 12)
    // get_space_data vino de k8s-inventory el 2026-09-17: describir un namespace es de este paquete.
    assert.ok(toolset.tools.find(t => t.name === 'get_space_data'))
    assert.deepEqual([...new Set(toolset.tools.map(t => t.effect))], [commonAi.EToolEffect.READ])
})

test('lo que enseña variables de entorno en claro NO es public', () => {
    // Un manifest de pod o de controlador trae los env con sus valores; ahi es donde la gente mete
    // contraseñas sin darse cuenta. Un Service o un Namespace no tienen ese problema.
    const s = (n) => tool(n).sensitivity
    const { INTERNAL, PUBLIC } = commonAi.EToolSensitivity

    assert.deepEqual(
        ['get_pod_yaml', 'get_deployment_yaml', 'get_controller_yaml', 'get_rollout_history'].map(s),
        [INTERNAL, INTERNAL, INTERNAL, INTERNAL]
    )
    assert.deepEqual(
        ['describe_pod', 'describe_service', 'get_service_yaml', 'get_ingress_yaml', 'get_namespace_yaml'].map(s),
        [PUBLIC, PUBLIC, PUBLIC, PUBLIC, PUBLIC]
    )
})

test('sin cluster, la tool lo dice en vez de reventar por dentro', async () => {
    await assert.rejects(() => tool('describe_pod').execute({ namespace: 'n', name: 'p' }, { trace: () => {} }), /describe_pod.*cluster access/)
})

// ── describe_pod ─────────────────────────────────────────────────────────────────────────────────────

test('resuelve quien manda de verdad: pod -> ReplicaSet -> Deployment', async () => {
    // Sin este salto, el modelo recibiria el nombre del ReplicaSet y llamaria a get_rollout_history con
    // un nombre que no existe como Deployment.
    const { host } = fakeHost()
    host.k8s.coreApi.readNamespacedPod = async () => ({
        metadata: { ownerReferences: [{ kind: 'ReplicaSet', name: 'api-7f66' }] }, spec: {}, status: {}
    })
    host.k8s.appsApi.readNamespacedReplicaSet = async () => ({
        metadata: { ownerReferences: [{ kind: 'Deployment', name: 'api' }] }
    })

    const res = await tool('describe_pod').execute({ namespace: 'prod', name: 'api-1' }, host)
    assert.deepEqual(res.controlledBy, { kind: 'Deployment', name: 'api' })
})

test('si el ReplicaSet no se puede leer, se informa del ReplicaSet y no se pierde el pod', async () => {
    const { host } = fakeHost()
    host.k8s.coreApi.readNamespacedPod = async () => ({
        metadata: { ownerReferences: [{ kind: 'ReplicaSet', name: 'api-7f66' }] }, spec: {}, status: { phase: 'Running' }
    })
    host.k8s.appsApi.readNamespacedReplicaSet = async () => { throw new Error('403 forbidden') }

    const res = await tool('describe_pod').execute({ namespace: 'prod', name: 'api-1' }, host)
    assert.deepEqual(res.controlledBy, { kind: 'ReplicaSet', name: 'api-7f66' })
    assert.equal(res.phase, 'Running')   // un fallo al resolver el dueño no tumba el describe entero
})

test('un StatefulSet manda directamente, sin salto intermedio', async () => {
    const { host, calls } = fakeHost()
    host.k8s.coreApi.readNamespacedPod = async () => ({
        metadata: { ownerReferences: [{ kind: 'StatefulSet', name: 'db' }] }, spec: {}, status: {}
    })

    const res = await tool('describe_pod').execute({ namespace: 'prod', name: 'db-0' }, host)
    assert.deepEqual(res.controlledBy, { kind: 'StatefulSet', name: 'db' })
    assert.equal(calls.some(c => c.name === 'readNamespacedReplicaSet'), false)
})

test('la procedencia del codigo sale de las anotaciones OCI, con respaldo kwirth', async () => {
    const { host } = fakeHost()
    const conAnotaciones = (ann) => async () => ({ metadata: { annotations: ann }, spec: {}, status: {} })

    host.k8s.coreApi.readNamespacedPod = conAnotaciones({
        'org.opencontainers.image.source': 'https://github.com/acme/api',
        'org.opencontainers.image.revision': 'abc123'
    })
    assert.deepEqual((await tool('describe_pod').execute({ namespace: 'p', name: 'x' }, host)).source,
        { repo: 'https://github.com/acme/api', revision: 'abc123' })

    host.k8s.coreApi.readNamespacedPod = conAnotaciones({ 'kwirth.io/source-repo': 'acme/api', 'kwirth.io/source-ref': 'v2' })
    assert.deepEqual((await tool('describe_pod').execute({ namespace: 'p', name: 'x' }, host)).source,
        { repo: 'acme/api', revision: 'v2' })

    host.k8s.coreApi.readNamespacedPod = conAnotaciones({})
    assert.equal((await tool('describe_pod').execute({ namespace: 'p', name: 'x' }, host)).source, undefined)
})

test('el estado de un contenedor conserva por que murio el anterior', async () => {
    // exitCode 137 = OOMKilled. Es el dato que categoriza el fallo, y vive en lastState, no en state.
    const { host } = fakeHost()
    host.k8s.coreApi.readNamespacedPod = async () => ({
        metadata: {}, spec: {},
        status: {
            containerStatuses: [{
                name: 'app', image: 'api:1.2', imageID: 'sha256:deadbeef', ready: false, restartCount: 5,
                state: { waiting: { reason: 'CrashLoopBackOff', message: 'back-off 5m' } },
                lastState: { terminated: { reason: 'OOMKilled', exitCode: 137, signal: 9, finishedAt: 'ayer' } }
            }]
        }
    })

    const c = (await tool('describe_pod').execute({ namespace: 'p', name: 'x' }, host)).containers[0]
    assert.deepEqual(c.state, { waiting: { reason: 'CrashLoopBackOff', message: 'back-off 5m' } })
    assert.deepEqual(c.lastTerminated, { reason: 'OOMKilled', exitCode: 137, signal: 9, finishedAt: 'ayer' })
    assert.equal(c.imageID, 'sha256:deadbeef')   // el digest delata una etiqueta mutable re-publicada
})

// ── describe_service ─────────────────────────────────────────────────────────────────────────────────

test('los endpoints distinguen los que sirven de los que no', async () => {
    // Endpoints vacios o todos not-ready es LA respuesta a "por que no llega el trafico".
    const { host } = fakeHost()
    host.k8s.coreApi.readNamespacedService = async () => ({ spec: { type: 'ClusterIP', selector: { app: 'api' } }, status: {} })
    host.k8s.coreApi.readNamespacedEndpoints = async () => ({
        subsets: [{
            ports: [{ port: 8080 }],
            addresses: [{ ip: '10.1.0.1', targetRef: { kind: 'Pod', name: 'api-1' } }],
            notReadyAddresses: [{ ip: '10.1.0.2', targetRef: { kind: 'Pod', name: 'api-2' } }]
        }]
    })

    const res = await tool('describe_service').execute({ namespace: 'prod', name: 'api' }, host)

    assert.equal(res.endpointCount, 2)
    assert.deepEqual(res.endpoints.map(e => [e.ip, e.ready, e.targetRef]), [
        ['10.1.0.1', true, 'Pod/api-1'],
        ['10.1.0.2', false, 'Pod/api-2']
    ])
    assert.deepEqual(res.endpoints[0].ports, [8080])
})

test('si no se pueden leer los endpoints, el servicio se describe igual', async () => {
    const { host } = fakeHost()
    host.k8s.coreApi.readNamespacedService = async () => ({ spec: { type: 'NodePort' }, status: {} })
    host.k8s.coreApi.readNamespacedEndpoints = async () => { throw new Error('403 forbidden') }

    const res = await tool('describe_service').execute({ namespace: 'prod', name: 'api' }, host)
    assert.equal(res.error, undefined)
    assert.equal(res.type, 'NodePort')
    assert.equal(res.endpointCount, 0)
})

// ── describe_controller ──────────────────────────────────────────────────────────────────────────────

test('cada kind se lee con su llamada', async () => {
    const { host, calls } = fakeHost()
    for (const kind of ['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet']) {
        await tool('describe_controller').execute({ namespace: 'p', kind, name: 'x' }, host)
    }
    assert.deepEqual(calls.map(c => c.name), [
        'readNamespacedDeployment', 'readNamespacedStatefulSet', 'readNamespacedDaemonSet', 'readNamespacedReplicaSet'
    ])
})

test('un DaemonSet informa de sus contadores, no de replicas a cero', async () => {
    // Un DaemonSet no tiene replicas: tiene nodos donde toca correr. Leer spec.replicas daria 0 y
    // pareceria caido estando perfectamente.
    const { host } = fakeHost()
    host.k8s.appsApi.readNamespacedDaemonSet = async () => ({
        spec: { updateStrategy: { type: 'RollingUpdate' } },
        status: { desiredNumberScheduled: 3, currentNumberScheduled: 3, numberReady: 2, numberAvailable: 2, updatedNumberScheduled: 3 }
    })

    const res = await tool('describe_controller').execute({ namespace: 'p', kind: 'DaemonSet', name: 'agent' }, host)
    assert.deepEqual(res.replicas, { desired: 3, current: 3, ready: 2, available: 2, updated: 3 })
    assert.equal(res.strategy, 'RollingUpdate')
})

test('un Deployment informa de replicas, con ceros explicitos si no hay nada listo', async () => {
    const { host } = fakeHost()
    host.k8s.appsApi.readNamespacedDeployment = async () => ({
        spec: { replicas: 3, strategy: { type: 'RollingUpdate' } },
        status: { conditions: [{ type: 'Progressing', status: 'False', reason: 'ProgressDeadlineExceeded', message: 'timed out' }] }
    })

    const res = await tool('describe_controller').execute({ namespace: 'p', kind: 'Deployment', name: 'api' }, host)
    assert.deepEqual(res.replicas, { desired: 3, ready: 0, available: 0, updated: 0 })
    assert.deepEqual(res.conditions[0], { type: 'Progressing', status: 'False', reason: 'ProgressDeadlineExceeded', message: 'timed out' })
})

// ── get_rollout_history ──────────────────────────────────────────────────────────────────────────────

test('solo cuenta los ReplicaSets de ESE deployment, y los ordena del mas nuevo al mas viejo', async () => {
    const { host } = fakeHost()
    const rs = (revision, name, owner) => ({
        metadata: { name, annotations: { 'deployment.kubernetes.io/revision': String(revision) }, ownerReferences: [{ kind: 'Deployment', name: owner }] },
        spec: { replicas: 1, template: { spec: { containers: [{ name: 'app', image: `api:${revision}` }] } } },
        status: { readyReplicas: 1 }
    })
    host.k8s.appsApi.listNamespacedReplicaSet = async () => ({ items: [rs(1, 'api-a', 'api'), rs(3, 'api-c', 'api'), rs(2, 'api-b', 'otro')] })

    const res = await tool('get_rollout_history').execute({ namespace: 'prod', name: 'api' }, host)

    assert.equal(res.revisionCount, 2)                            // el de 'otro' no entra
    assert.deepEqual(res.revisions.map(r => r.revision), [3, 1])  // la mas nueva primero
    assert.equal(res.revisions[0].containers[0].image, 'api:3')
})

test('el env de cada revision lleva el valor Y de donde sale', async () => {
    // El valor, para poder comparar revisiones; la procedencia, para saber cual hay que mirar aparte
    // (un cambio dentro de un ConfigMap no crea revision).
    const { host } = fakeHost()
    host.k8s.appsApi.listNamespacedReplicaSet = async () => ({
        items: [{
            metadata: { name: 'api-a', annotations: { 'deployment.kubernetes.io/revision': '1' }, ownerReferences: [{ kind: 'Deployment', name: 'api' }] },
            spec: { replicas: 1, template: { spec: { containers: [{ name: 'app', env: [
                { name: 'LEVEL', value: 'debug' },
                { name: 'PASS', valueFrom: { secretKeyRef: { name: 'creds', key: 'pass' } } },
                { name: 'CFG', valueFrom: { configMapKeyRef: { name: 'conf', key: 'k' } } },
                { name: 'POD_IP', valueFrom: { fieldRef: { fieldPath: 'status.podIP' } } }
            ] }] } } },
            status: {}
        }]
    })

    const env = (await tool('get_rollout_history').execute({ namespace: 'p', name: 'api' }, host)).revisions[0].containers[0].env

    assert.deepEqual(env, [
        { name: 'LEVEL', value: 'debug', from: undefined },
        { name: 'PASS', value: undefined, from: 'secret:creds/pass' },
        { name: 'CFG', value: undefined, from: 'configMap:conf/k' },
        { name: 'POD_IP', value: undefined, from: 'field:status.podIP' }
    ])
})

// ── manifests ────────────────────────────────────────────────────────────────────────────────────────

test('los manifests se devuelven tal cual vienen', async () => {
    const { host } = fakeHost()
    host.k8s.coreApi.readNamespacedPod = async () => ({ kind: 'Pod', metadata: { name: 'api-1' } })
    assert.deepEqual(await tool('get_pod_yaml').execute({ namespace: 'p', name: 'api-1' }, host), { kind: 'Pod', metadata: { name: 'api-1' } })
})

test('get_controller_yaml tambien despacha por kind', async () => {
    const { host, calls } = fakeHost()
    await tool('get_controller_yaml').execute({ namespace: 'p', kind: 'StatefulSet', name: 'db' }, host)
    assert.equal(calls[0].name, 'readNamespacedStatefulSet')
})

test('un fallo del cluster vuelve como dato en cualquiera de las once', async () => {
    const { host } = fakeHost()
    host.k8s.coreApi.readNamespace = async () => { throw new Error('404 not found') }
    assert.deepEqual(await tool('get_namespace_yaml').execute({ name: 'nope' }, host), { error: '404 not found' })
})

test('toda invocacion deja traza con sus argumentos', async () => {
    const { host, traced } = fakeHost()
    await tool('describe_controller').execute({ namespace: 'prod', kind: 'DaemonSet', name: 'agent' }, host)
    assert.deepEqual(traced[0], { tool: 'describe_controller', args: { namespace: 'prod', kind: 'DaemonSet', name: 'agent' } })
})

// ── get_space_data (llegada desde k8s-inventory) ─────────────────────────────────────────────────────

test('describir un namespace sobrevive a que falten quotas y limitranges', async () => {
    // Suele ser falta de RBAC para ESOS recursos. Que no haya no puede ocultar el resto del namespace.
    const { host } = fakeHost()
    host.k8s.coreApi.listNamespacedPod = async () => ({ items: [{ metadata: { name: 'api-1' }, status: { phase: 'Running', containerStatuses: [{ restartCount: 3 }] }, spec: {} }] })
    host.k8s.coreApi.listNamespacedConfigMap = async () => ({ items: [{ metadata: { name: 'conf' } }] })
    host.k8s.coreApi.listNamespacedResourceQuota = async () => { throw new Error('forbidden') }
    host.k8s.coreApi.listNamespacedLimitRange = async () => { throw new Error('forbidden') }
    host.k8s.appsApi.listNamespacedDeployment = async () => ({ items: [] })
    host.k8s.coreApi.listNamespacedService = async () => ({ items: [] })

    const res = await tool('get_space_data').execute({ namespace: 'kube-system' }, host)

    assert.equal(res.error, undefined)
    assert.deepEqual(res.resourceQuotas, [])
    assert.equal(res.namespace, 'kube-system')
    assert.equal(res.pods[0].restartCount, 3)
    assert.deepEqual(res.configMaps, ['conf'])
})
