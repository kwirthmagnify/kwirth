// S1: contrato y registro de toolsets. Corre contra el dist compilado (build antes), como agent.test.mjs.
//
// Lo que se fija aqui no es "que las funciones no revienten", sino los tres invariantes que el plan
// (plans/ai-tools/PLAN.md) senala como caros de arreglar tarde: una sola puerta de registro, ids de
// built-in reservados, y referencias a tools SIEMPRE cualificadas.

import test from 'node:test'
import assert from 'node:assert/strict'
import back from '../dist/back.js'
import * as iso from '../dist/index.js'

const {
    registerToolset, unregisterToolset, getToolset, listToolsets, listToolsetInfos,
    resolveToolRef, isBuiltInToolsetId, buildToolHost, invokeToolRef
} = back
const { toolRef, parseToolRef, EToolEffect, EToolSensitivity, ECapability } = iso

const fakeTool = (name, over = {}) => ({
    name,
    description: `tool ${name}`,
    effect: EToolEffect.READ,
    sensitivity: EToolSensitivity.PUBLIC,
    inputSchema: {},
    execute: async () => 'ok',
    ...over
})

const fakeToolset = (id, tools = ['alpha'], over = {}) => ({
    id,
    version: '0.0.1',
    displayName: id,
    description: `toolset ${id}`,
    requires: [ECapability.K8S],
    tools: tools.map(t => fakeTool(t)),
    ...over
})

// ── referencias cualificadas ─────────────────────────────────────────────────────────────────────────

test('una referencia de tool se construye y se parsea cualificada', () => {
    const ref = toolRef('k8s-inventory', 'list_namespaces')
    assert.equal(ref, 'k8s-inventory/list_namespaces')
    assert.deepEqual(parseToolRef(ref), { toolsetId: 'k8s-inventory', toolName: 'list_namespaces' })
})

test('un nombre a secas NO es una referencia valida', () => {
    // Es el invariante que evita la ambiguedad el dia que dos toolsets traigan un 'get_pod_logs'
    assert.equal(parseToolRef('list_namespaces'), undefined)
    assert.equal(parseToolRef(''), undefined)
    assert.equal(parseToolRef('/list_namespaces'), undefined)
    assert.equal(parseToolRef('k8s-inventory/'), undefined)
})

test('el nombre de la tool puede llevar separadores; el toolset es lo que va delante del primero', () => {
    assert.deepEqual(parseToolRef('ts/a/b'), { toolsetId: 'ts', toolName: 'a/b' })
})

// ── registro ─────────────────────────────────────────────────────────────────────────────────────────

test('un toolset registrado se encuentra y aparece listado', () => {
    registerToolset(fakeToolset('reg-basic'))
    assert.equal(getToolset('reg-basic')?.id, 'reg-basic')
    assert.ok(listToolsets().some(t => t.id === 'reg-basic'))
    unregisterToolset('reg-basic')
})

test('registrar dos veces el mismo id revienta en vez de pisar al primero', () => {
    registerToolset(fakeToolset('reg-dup'))
    assert.throws(() => registerToolset(fakeToolset('reg-dup')), /already registered/)
    unregisterToolset('reg-dup')
})

test('un toolset de tercero NO puede ocupar el id de un built-in', () => {
    registerToolset(fakeToolset('reg-builtin'), true)
    assert.equal(isBuiltInToolsetId('reg-builtin'), true)
    assert.throws(() => registerToolset(fakeToolset('reg-builtin')), /reserved/)
})

test('un built-in no se puede retirar; uno instalado si', () => {
    // 'reg-builtin' sigue registrado del test anterior: retirarlo debe fallar y dejarlo donde esta
    assert.equal(unregisterToolset('reg-builtin'), false)
    assert.ok(getToolset('reg-builtin'))

    registerToolset(fakeToolset('reg-removable'))
    assert.equal(unregisterToolset('reg-removable'), true)
    assert.equal(getToolset('reg-removable'), undefined)
})

// ── resolucion ───────────────────────────────────────────────────────────────────────────────────────

test('resolveToolRef encuentra toolset y tool, y falla entero si cualquiera de los dos no esta', () => {
    registerToolset(fakeToolset('reg-resolve', ['alpha', 'beta']))

    const found = resolveToolRef('reg-resolve/beta')
    assert.equal(found?.toolset.id, 'reg-resolve')
    assert.equal(found?.tool.name, 'beta')

    assert.equal(resolveToolRef('reg-resolve/no-existe'), undefined)
    assert.equal(resolveToolRef('no-existe/beta'), undefined)
    assert.equal(resolveToolRef('beta'), undefined)   // sin cualificar, no resuelve

    unregisterToolset('reg-resolve')
})

// ── lo que viaja al front ────────────────────────────────────────────────────────────────────────────

test('las fichas que van al front NO llevan execute ni inputSchema', () => {
    // El front necesita decidir (mostrar, agrupar, marcar), no ejecutar. Si se le colara el execute,
    // estariamos mandando codigo del back en una respuesta HTTP.
    registerToolset(fakeToolset('reg-info', ['alpha']))

    const info = listToolsetInfos().find(t => t.id === 'reg-info')
    assert.ok(info)
    assert.deepEqual(Object.keys(info).sort(), ['description', 'displayName', 'id', 'requires', 'tools', 'version'])
    assert.deepEqual(Object.keys(info.tools[0]).sort(), ['description', 'effect', 'name', 'sensitivity'])

    unregisterToolset('reg-info')
})

// ── reparto de capabilities ──────────────────────────────────────────────────────────────────────────
//
// La promesa de ECapability es "el host da lo declarado y NADA MAS". Se comprueba de verdad porque es una
// promesa facil de romper sin enterarse: basta con que alguien arme el host a mano en otro sitio y sea
// generoso. Si un dia un toolset sin declarar nada recibe cluster, estos tests caen.

const fakeContext = (over = {}) => ({
    origin: 'test',
    nodes: new Map([['n1', { name: 'n1', ip: '10.0.0.1', maxPods: 110 }]]),
    clusterInfo: {
        name: 'k3d-test', flavour: 'k3d', vcpus: 4, memory: 8 * 1024 * 1024 * 1024,
        coreApi: { listNamespace: async () => ({ items: [] }) },
        appsApi: {}, networkApi: {},
        saToken: 'NO-DEBE-SALIR', token: 'NO-DEBE-SALIR', senders: {}, webhooks: {}
    },
    clusterMetrics: [{ cpu: 1 }],
    clusterEvents: [{ type: 'ADDED' }],
    sourceRepos: [{ host: 'github.com', token: 'x' }],
    trace: () => {},
    ...over
})

test('solo se provisiona lo declarado en requires', () => {
    const ctx = fakeContext()

    const solo = buildToolHost([], ctx)
    assert.deepEqual(Object.keys(solo), ['trace'])   // trace SIEMPRE, y nada mas

    const k8s = buildToolHost([ECapability.K8S], ctx)
    assert.ok(k8s.k8s)
    assert.equal(k8s.metrics, undefined)
    assert.equal(k8s.events, undefined)
    assert.equal(k8s.repos, undefined)

    const todo = buildToolHost([ECapability.K8S, ECapability.METRICS, ECapability.EVENTS, ECapability.REPOS], ctx)
    assert.deepEqual(Object.keys(todo).sort(), ['events', 'k8s', 'metrics', 'repos', 'trace'])
})

test('la fachada de cluster NO deja pasar las credenciales del core', () => {
    // clusterInfo lleva saToken, token, senders y webhooks. Un toolset de terceros no tiene por que verlos,
    // y ceder el objeto entero seria justo el cajon de sastre que este contrato viene a cerrar.
    const host = buildToolHost([ECapability.K8S], fakeContext())
    assert.deepEqual(Object.keys(host.k8s).sort(), ['appsApi', 'coreApi', 'flavour', 'memory', 'name', 'networkApi', 'nodes', 'vcpus'])
    assert.equal(JSON.stringify(host.k8s).includes('NO-DEBE-SALIR'), false)
})

test('sin cluster no se inventa la capability aunque se declare', () => {
    // Mejor que la tool reciba undefined y lo diga, a darle una fachada a medio montar que reviente dentro.
    const host = buildToolHost([ECapability.K8S], fakeContext({ clusterInfo: undefined }))
    assert.equal(host.k8s, undefined)
    assert.equal(typeof host.trace, 'function')
})

test('invocar por referencia construye el host del toolset que la trae', async () => {
    let visto
    registerToolset({
        ...fakeToolset('inv-caps', []),
        requires: [ECapability.METRICS],
        tools: [{ ...fakeTool('peek'), execute: async (args, host) => { visto = host; return args.n } }]
    })

    const res = await invokeToolRef('inv-caps/peek', { n: 7 }, fakeContext())
    assert.equal(res, 7)
    assert.ok(visto.metrics)
    assert.equal(visto.k8s, undefined)   // no lo declaro: no lo recibe

    unregisterToolset('inv-caps')
})

test('invocar una referencia que no existe falla con el ref completo', async () => {
    await assert.rejects(() => invokeToolRef('no-existe/nada', {}, fakeContext()), /no-existe\/nada/)
})
