// S1: toolset contract and registry. Runs against the compiled dist (build first), like agent.test.mjs.
//
// What this pins down is not "that the functions do not blow up", but the three invariants the plan
// (plans/ai-tools/PLAN.md) flags as expensive to fix late: a single registration door, reserved built-in
// ids, and tool references ALWAYS qualified.

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
    // This is the invariant that avoids ambiguity the day two toolsets both bring a 'get_pod_logs'
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
    // 'reg-builtin' is still registered from the previous test: removing it must fail and leave it in place
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

// ── what travels to the front end ────────────────────────────────────────────────────────────────────

test('las fichas que van al front NO llevan execute ni inputSchema', () => {
    // The front end needs to decide (show, group, flag), not execute. If execute slipped through, we would
    // be shipping back-end code inside an HTTP response.
    registerToolset(fakeToolset('reg-info', ['alpha']))

    const info = listToolsetInfos().find(t => t.id === 'reg-info')
    assert.ok(info)
    assert.deepEqual(Object.keys(info).sort(), ['description', 'displayName', 'id', 'requires', 'tools', 'version'])
    assert.deepEqual(Object.keys(info.tools[0]).sort(), ['description', 'effect', 'name', 'sensitivity'])

    unregisterToolset('reg-info')
})

// ── reparto de capabilities ──────────────────────────────────────────────────────────────────────────
//
// The ECapability promise is "the host gives what was declared and NOTHING ELSE". It is checked for real
// because it is an easy promise to break without noticing: all it takes is someone assembling the host by
// hand elsewhere and being generous. The day a toolset declaring nothing receives a cluster, these fail.

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
    // clusterInfo carries saToken, token, senders and webhooks. A third-party toolset has no business
    // seeing them, and handing over the whole object is exactly the catch-all this contract came to close.
    const host = buildToolHost([ECapability.K8S], fakeContext())
    assert.deepEqual(Object.keys(host.k8s).sort(), ['appsApi', 'coreApi', 'flavour', 'memory', 'name', 'networkApi', 'nodes', 'vcpus'])
    assert.equal(JSON.stringify(host.k8s).includes('NO-DEBE-SALIR'), false)
})

test('sin cluster no se inventa la capability aunque se declare', () => {
    // Better the tool receives undefined and says so, than handing it a half-built facade that blows up inside.
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
