/*
    Harness del toolset `k8s-secrets`. Con clientes FALSOS: `npm test` pasa sin cluster.

    El test que de verdad importa aqui es uno: QUE LOS VALORES DE UN SECRET NUNCA SALEN. Es el contrato de
    la tool, no una recomendacion, y si alguien lo rompe mientras "mejora" algo, esto tiene que ponerse
    rojo inmediatamente.
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

const fakeHost = () => {
    const traced = []
    return {
        traced,
        host: {
            trace: (t, a) => traced.push({ tool: t, args: a }),
            k8s: {
                name: 'k3d-test', flavour: 'k3d', vcpus: 4, memory: 1024, nodes: new Map(),
                coreApi: {
                    readNamespacedConfigMap: async () => ({ metadata: { resourceVersion: '5' }, data: { 'app.yaml': 'debug: true' } }),
                    readNamespacedSecret: async () => ({ metadata: { resourceVersion: '9' }, type: 'Opaque', data: { pass: 'c3VwZXJzZWNyZXRv' } })
                },
                appsApi: {}, networkApi: {}
            }
        }
    }
}

// ── el contrato ──────────────────────────────────────────────────────────────────────────────────────

test('declara sus tres tools, todas de lectura', () => {
    assert.equal(toolset.id, 'k8s-secrets')
    assert.deepEqual(toolset.tools.map(t => t.name), ['get_configmap', 'get_secret', 'get_certificate_info'])
    assert.deepEqual([...new Set(toolset.tools.map(t => t.effect))], [commonAi.EToolEffect.READ])
})

test('la sensibilidad va al reves de lo que sugiere el nombre, y a proposito', () => {
    // get_configmap devuelve los valores EN CRUDO, y un ConfigMap es donde acaban las contraseñas de quien
    // no quiso usar un Secret. get_secret, en cambio, no devuelve valores: solo claves.
    assert.equal(tool('get_configmap').sensitivity, commonAi.EToolSensitivity.SECRET)
    assert.equal(tool('get_secret').sensitivity, commonAi.EToolSensitivity.INTERNAL)
    assert.equal(tool('get_certificate_info').sensitivity, commonAi.EToolSensitivity.PUBLIC)
})

// ── lo que nunca puede salir ─────────────────────────────────────────────────────────────────────────

test('🔴 los VALORES de un Secret no salen NUNCA', async () => {
    const { host } = fakeHost()
    const res = await tool('get_secret').execute({ namespace: 'prod', name: 'creds' }, host)

    assert.deepEqual(res.keys, ['pass'])                       // las claves si
    assert.equal(res.data, undefined)                          // los valores no
    assert.equal(JSON.stringify(res).includes('c3VwZXJzZWNyZXRv'), false, 'se ha filtrado el valor del secret')
    assert.equal(res.type, 'Opaque')
    assert.equal(res.resourceVersion, '9')                     // suficiente para saber que cambio
})

test('un ConfigMap si devuelve sus datos: es su razon de ser', async () => {
    const { host } = fakeHost()
    const res = await tool('get_configmap').execute({ namespace: 'prod', name: 'conf' }, host)

    assert.deepEqual(res.data, { 'app.yaml': 'debug: true' })
    assert.deepEqual(res.binaryDataKeys, [])
})

test('de lo binario de un ConfigMap solo salen las claves', async () => {
    // Un binario no le dice nada al modelo y se come la ventana de contexto.
    const { host } = fakeHost()
    host.k8s.coreApi.readNamespacedConfigMap = async () => ({ metadata: {}, binaryData: { 'logo.png': 'iVBORw0KGgo=' } })

    const res = await tool('get_configmap').execute({ namespace: 'p', name: 'c' }, host)
    assert.deepEqual(res.binaryDataKeys, ['logo.png'])
    assert.equal(JSON.stringify(res).includes('iVBORw0KGgo='), false)
})

// ── cuando cambio ────────────────────────────────────────────────────────────────────────────────────

test('lastModified sale del managedFields mas reciente, normalizado a ISO', async () => {
    // ⚠️ Llegan como Date. Ordenarlas con el sort por defecto las compara como texto ('Apr' < 'Aug' <
    // 'Dec') y diria que un Secret cambio cuando no, que es justo lo que se viene a averiguar.
    const { host } = fakeHost()
    host.k8s.coreApi.readNamespacedSecret = async () => ({
        metadata: {
            managedFields: [
                { time: new Date('2026-04-01T00:00:00Z') },
                { time: new Date('2026-12-01T00:00:00Z') },
                { time: new Date('2026-08-01T00:00:00Z') }
            ]
        },
        data: {}
    })

    const res = await tool('get_secret').execute({ namespace: 'p', name: 's' }, host)
    assert.equal(res.lastModified, '2026-12-01T00:00:00.000Z')
})

test('sin managedFields se cae a la fecha de creacion', async () => {
    const { host } = fakeHost()
    host.k8s.coreApi.readNamespacedConfigMap = async () => ({ metadata: { creationTimestamp: new Date('2025-01-02T03:04:05Z') }, data: {} })

    const res = await tool('get_configmap').execute({ namespace: 'p', name: 'c' }, host)
    assert.equal(res.lastModified, '2025-01-02T03:04:05.000Z')
})

// ── errores y trazas ─────────────────────────────────────────────────────────────────────────────────

test('sin cluster, las dos de kubernetes lo dicen', async () => {
    const soloTrace = { trace: () => {} }
    await assert.rejects(() => tool('get_configmap').execute({ namespace: 'p', name: 'c' }, soloTrace), /cluster access/)
    await assert.rejects(() => tool('get_secret').execute({ namespace: 'p', name: 's' }, soloTrace), /cluster access/)
})

test('la de certificados NO necesita cluster: abre un socket', async () => {
    // Declararlo importa: es la unica del toolset que funcionaria con un host sin k8s.
    const traced = []
    const res = await tool('get_certificate_info').execute({ hostname: '127.0.0.1', port: 1 }, { trace: (t, a) => traced.push({ t, a }) })

    assert.deepEqual(traced[0].t, 'get_certificate_info')
    assert.ok(res.error, 'contra un puerto cerrado debe devolver error, no colgarse')
})

test('un fallo del cluster vuelve como dato', async () => {
    const { host } = fakeHost()
    host.k8s.coreApi.readNamespacedSecret = async () => { throw new Error('403 forbidden') }
    assert.deepEqual(await tool('get_secret').execute({ namespace: 'p', name: 's' }, host), { error: '403 forbidden' })
})

test('toda invocacion deja traza con sus argumentos', async () => {
    const { host, traced } = fakeHost()
    await tool('get_configmap').execute({ namespace: 'prod', name: 'conf' }, host)
    assert.deepEqual(traced[0], { tool: 'get_configmap', args: { namespace: 'prod', name: 'conf' } })
})
