/*
    S2: de "estos toolsets, en este orden" a "estas tools, listas para el LLM".

    Lo que se fija aqui es la PRECEDENCIA (decision del usuario, 2026-09-17) y los dos ganchos. Es la
    semantica que se va a persistir en la configuracion de cada plugin, asi que equivocarse aqui no se
    arregla con un refactor: se arregla migrando configuraciones de clientes.
*/
import test from 'node:test'
import assert from 'node:assert/strict'
import back from '../dist/back.js'
import * as iso from '../dist/index.js'

const { registerToolset, unregisterToolset, resolveTools, buildAgentTools, tools: tools43 } = back
const { EToolEffect, EToolSensitivity, ECapability } = iso

const fakeTool = (name, over = {}) => ({
    name,
    description: `tool ${name}`,
    effect: EToolEffect.READ,
    sensitivity: EToolSensitivity.PUBLIC,
    inputSchema: {},
    execute: async () => 'ok',
    ...over
})

const fakeToolset = (id, tools = [], over = {}) => ({
    id,
    version: '0.0.1',
    displayName: id,
    description: `toolset ${id}`,
    requires: [],
    tools: tools.map(t => fakeTool(t)),
    ...over
})

const fakeContext = () => ({
    origin: 'test',
    nodes: new Map(),
    clusterInfo: {
        name: 'k3d-test', flavour: 'k3d', vcpus: 4, memory: 1024, appsApi: {}, networkApi: {},
        coreApi: { listNamespace: async () => ({ items: [{ metadata: { name: 'default', uid: 'u1' }, status: { phase: 'Active' } }] }) }
    },
    clusterMetrics: [],
    clusterEvents: [],
    trace: () => {}
})

// ── precedencia ──────────────────────────────────────────────────────────────────────────────────────
//
// The case the user raised, verbatim: ts1(ta tb tc td) + ts2(tf td tg), assigned [ts1, ts2] →
// what runs is ta tb tc td(from ts1) tf tg, and ts2's td is SHADOWED.

const conTresToolsets = () => {
    registerToolset(fakeToolset('ts1', ['ta', 'tb', 'tc', 'td']))
    registerToolset(fakeToolset('ts2', ['tf', 'td', 'tg']))
    registerToolset(fakeToolset('ts3', ['th']))
}
const limpiar = (...ids) => ids.forEach(unregisterToolset)

test('con solape, manda el toolset de mas precedencia', () => {
    conTresToolsets()
    const r = resolveTools({ activeToolsets: ['ts1', 'ts2'], disabledTools: [] })

    assert.deepEqual(r.effective.map(e => e.name), ['ta', 'tb', 'tc', 'td', 'tf', 'tg'])
    assert.equal(r.effective.find(e => e.name === 'td').toolsetId, 'ts1')
    assert.deepEqual(r.shadowed, [{ name: 'td', ref: 'ts2/td', toolsetId: 'ts2', shadowedBy: 'ts1' }])

    limpiar('ts1', 'ts2', 'ts3')
})

test('cambiar el orden cambia QUE CODIGO se ejecuta', () => {
    // Not cosmetic: with [ts2, ts1] a different 'td' runs. Hence the editor must warn when reordering,
    // and the trace must record the toolset and not just the name.
    conTresToolsets()
    const r = resolveTools({ activeToolsets: ['ts2', 'ts1'], disabledTools: [] })

    assert.equal(r.effective.find(e => e.name === 'td').toolsetId, 'ts2')
    assert.deepEqual(r.shadowed.map(s => s.ref), ['ts1/td'])

    limpiar('ts1', 'ts2', 'ts3')
})

test('apagar una tool NO mata el nombre: aflora la del siguiente toolset', () => {
    // What gets turned off is a REFERENCE ('ts1/td'), not a name.
    conTresToolsets()
    const r = resolveTools({ activeToolsets: ['ts1', 'ts2'], disabledTools: ['ts1/td'] })

    assert.equal(r.effective.find(e => e.name === 'td').toolsetId, 'ts2')
    assert.deepEqual(r.shadowed, [])   // la de ts1 ya no esta en juego, asi que no tapa a nadie

    limpiar('ts1', 'ts2', 'ts3')
})

test('para que un nombre desaparezca hay que apagarlo en los dos', () => {
    conTresToolsets()
    const r = resolveTools({ activeToolsets: ['ts1', 'ts2'], disabledTools: ['ts1/td', 'ts2/td'] })

    assert.equal(r.effective.find(e => e.name === 'td'), undefined)
    assert.deepEqual(r.effective.map(e => e.name), ['ta', 'tb', 'tc', 'tf', 'tg'])

    limpiar('ts1', 'ts2', 'ts3')
})

test('un toolset asignado que no esta instalado se REPORTA, no se ignora', () => {
    // A ceiling naming something uninstalled is a broken config. Without this the symptom would be "the
    // agent answers worse", with no way of knowing why.
    conTresToolsets()
    const r = resolveTools({ activeToolsets: ['ts1', 'no-instalado', 'ts3'], disabledTools: [] })

    assert.deepEqual(r.missing, ['no-instalado'])
    assert.deepEqual(r.effective.map(e => e.name), ['ta', 'tb', 'tc', 'td', 'th'])

    limpiar('ts1', 'ts2', 'ts3')
})

test('un cliente sin toolsets asignados no tiene tools', () => {
    // "A plugin with no config has no tools": deny by default, do not inherit.
    conTresToolsets()
    assert.deepEqual(resolveTools({ activeToolsets: [], disabledTools: [] }).effective, [])
    limpiar('ts1', 'ts2', 'ts3')
})

// ── the single invocation path and its two hooks ─────────────────────────────────────────────────────

test('lo que se le ofrece al LLM lleva el nombre CORTO', () => {
    // A qualified reference ('ts1/ta') would not pass the providers' name filter.
    conTresToolsets()
    const tools = buildAgentTools({ activeToolsets: ['ts1', 'ts2'], disabledTools: [] }, fakeContext())

    assert.deepEqual(Object.keys(tools).sort(), ['ta', 'tb', 'tc', 'td', 'tf', 'tg'])
    assert.equal(Object.keys(tools).some(k => k.includes('/')), false)

    limpiar('ts1', 'ts2', 'ts3')
})

test('el gancho de autorizacion puede negar, y entonces NO se ejecuta', async () => {
    let ejecutada = false
    registerToolset({
        ...fakeToolset('auth-ts'),
        tools: [fakeTool('peligrosa', { execute: async () => { ejecutada = true; return 'hecho' } })]
    })

    const tools = buildAgentTools(
        { activeToolsets: ['auth-ts'], disabledTools: [] },
        fakeContext(),
        { authorize: () => ({ allowed: false, reason: 'sin permiso en produccion' }) }
    )
    const res = await tools.peligrosa.execute({}, {})

    assert.equal(ejecutada, false)
    // As DATA, not as an exception: an exception cuts the conversation short instead of letting the model
    // learn that route is closed and try another.
    assert.match(res.error, /not allowed: sin permiso en produccion/)

    limpiar('auth-ts')
})

test('sin gancho de autorizacion se permite todo: hoy el techo es la seleccion', async () => {
    registerToolset({ ...fakeToolset('open-ts'), tools: [fakeTool('libre', { execute: async () => 'hecho' })] })

    const tools = buildAgentTools({ activeToolsets: ['open-ts'], disabledTools: [] }, fakeContext())
    assert.equal(await tools.libre.execute({}, {}), 'hecho')

    limpiar('open-ts')
})

test('el gancho de observacion ve la referencia cualificada, los argumentos y el tiempo', async () => {
    const visto = []
    registerToolset({
        ...fakeToolset('obs-ts'),
        tools: [fakeTool('mide', { execute: async (args) => ({ doble: args.n * 2 }) })]
    })

    const tools = buildAgentTools(
        { activeToolsets: ['obs-ts'], disabledTools: [] },
        fakeContext(),
        { observe: (inv, outcome) => visto.push({ inv, outcome }) }
    )
    await tools.mide.execute({ n: 21 }, {})

    assert.equal(visto.length, 1)
    // QUALIFIED: under precedence, the short name does not say which code ran.
    assert.equal(visto[0].inv.ref, 'obs-ts/mide')
    assert.deepEqual(visto[0].inv.args, { n: 21 })
    assert.equal(visto[0].outcome.ok, true)
    assert.deepEqual(visto[0].outcome.result, { doble: 42 })
    assert.equal(typeof visto[0].outcome.ms, 'number')

    limpiar('obs-ts')
})

test('una denegacion tambien se observa, y se distingue de un fallo', async () => {
    const visto = []
    registerToolset({ ...fakeToolset('den-ts'), tools: [fakeTool('nope')] })

    const tools = buildAgentTools(
        { activeToolsets: ['den-ts'], disabledTools: [] },
        fakeContext(),
        { authorize: () => ({ allowed: false }), observe: (_i, o) => visto.push(o) }
    )
    await tools.nope.execute({}, {})

    assert.equal(visto[0].ok, false)
    assert.equal(visto[0].denied, true)   // no es lo mismo "no se le dejo" que "reviento"

    limpiar('den-ts')
})

test('si una tool revienta, se observa el fallo y el modelo recibe el error como dato', async () => {
    const visto = []
    registerToolset({
        ...fakeToolset('boom-ts'),
        tools: [fakeTool('revienta', { execute: async () => { throw new Error('403 forbidden') } })]
    })

    const tools = buildAgentTools(
        { activeToolsets: ['boom-ts'], disabledTools: [] },
        fakeContext(),
        { observe: (_i, o) => visto.push(o) }
    )
    const res = await tools.revienta.execute({}, {})

    assert.deepEqual(res, { error: '403 forbidden' })
    assert.equal(visto[0].ok, false)
    assert.equal(visto[0].denied, undefined)
    assert.equal(visto[0].error, '403 forbidden')

    limpiar('boom-ts')
})

test('cada tool recibe el host de SU toolset, no el del vecino', async () => {
    // Two toolsets with different `requires` in the same batch: provisioning is per toolset, not global.
    const recibido = {}
    registerToolset({
        ...fakeToolset('caps-k8s'), requires: [ECapability.K8S],
        tools: [fakeTool('conk8s', { execute: async (_a, host) => { recibido.k8s = host; return 1 } })]
    })
    registerToolset({
        ...fakeToolset('caps-nada'), requires: [],
        tools: [fakeTool('sinnada', { execute: async (_a, host) => { recibido.nada = host; return 2 } })]
    })

    const tools = buildAgentTools({ activeToolsets: ['caps-k8s', 'caps-nada'], disabledTools: [] }, fakeContext())
    await tools.conk8s.execute({}, {})
    await tools.sinnada.execute({}, {})

    assert.ok(recibido.k8s.k8s, 'el que declaro K8S deberia recibir cluster')
    assert.equal(recibido.nada.k8s, undefined, 'el que no declaro nada NO deberia recibir cluster')

    limpiar('caps-k8s', 'caps-nada')
})

test('una tool escrita contra el contrato VIEJO tambien funciona por este camino', async () => {
    // Today's 43 do not receive `host`: they read ctx() from a private AsyncLocalStorage. buildAgentTools
    // wraps the run in runWithToolContext, and that is what allows S3's eight packages to be migrated one
    // at a time instead of rewriting them all before the new path can be used.
    //
    // Tested with a REAL one (`list_namespaces`), not with an imitation: the context accessor is not
    // exported — on purpose, so the whole bag is not handed to third-party packages — so a fake tool could
    // not read it even if it wanted to, and the test would prove nothing.
    registerToolset({
        ...fakeToolset('viejo-ts'),
        tools: [fakeTool('ala_antigua', { execute: async () => tools43.list_namespaces.execute({}, {}) })]
    })

    const res = await buildAgentTools({ activeToolsets: ['viejo-ts'], disabledTools: [] }, fakeContext())
        .ala_antigua.execute({}, {})

    assert.deepEqual(res.namespaces.map(n => n.name), ['default'])

    limpiar('viejo-ts')
})

// ── how the tools are handed to the SDK ──────────────────────────────────────────────────────────────

test('🔴 las tools que se le pasan al SDK NO son dinamicas', async () => {
    // It looks like a detail and it is not. In the SDK:
    //     tool(t)        => t                          (types only)
    //     dynamicTool(t) => { ...t, type: 'dynamic' }  (marks the tool at RUNTIME)
    // A tool marked as dynamic is handled through another path and, combined with Output.object, the
    // invocation ends in AI_NoOutputGeneratedError: the tool runs, returns, and the structured response
    // never arrives. S3's QA caught it with pinocchio, which uses structured output.
    registerToolset({ ...fakeToolset('sdk-ts'), tools: [fakeTool('plana')] })

    const tools = buildAgentTools({ activeToolsets: ['sdk-ts'], disabledTools: [] }, fakeContext())

    assert.equal(tools.plana.type, undefined, "la tool no debe llevar marca 'dynamic'")
    assert.equal(typeof tools.plana.execute, 'function')
    assert.ok(tools.plana.inputSchema, 'el esquema tiene que viajar tal cual')

    limpiar('sdk-ts')
})

// ── the grant: who may use each toolset (phase 1 of the ceiling) ─────────────────────────────────────
//
// Granting happens FROM the toolset, not from the plugin: `k8s-ops` is the dangerous one and it is
// governed in a single place. And by default nobody uses it — installing is not granting.

const { setToolsetGrants, getToolsetGrants, isToolsetGrantedTo } = back

test('🔴 por defecto un toolset recien registrado no lo puede usar NADIE', () => {
    // Installing k8s-ops must not give anyone write access by accident.
    registerToolset(fakeToolset('grant-nuevo', ['ta']))

    assert.deepEqual(getToolsetGrants('grant-nuevo'), [])
    assert.equal(isToolsetGrantedTo('grant-nuevo', 'pinocchio'), false)

    const r = resolveTools({ activeToolsets: ['grant-nuevo'], disabledTools: [] }, 'pinocchio')
    assert.deepEqual(r.effective, [])
    assert.deepEqual(r.notGranted, ['grant-nuevo'])

    limpiar('grant-nuevo')
})

test('concedido a un plugin, ese lo ve y los demas no', () => {
    registerToolset(fakeToolset('grant-uno', ['ta', 'tb']))
    setToolsetGrants('grant-uno', ['pinocchio'])

    const dePinocchio = resolveTools({ activeToolsets: ['grant-uno'], disabledTools: [] }, 'pinocchio')
    const deAgora = resolveTools({ activeToolsets: ['grant-uno'], disabledTools: [] }, 'agora')

    assert.deepEqual(dePinocchio.effective.map(e => e.name), ['ta', 'tb'])
    assert.deepEqual(dePinocchio.notGranted, [])
    assert.deepEqual(deAgora.effective, [])
    assert.deepEqual(deAgora.notGranted, ['grant-uno'])

    limpiar('grant-uno')
})

test('"no concedido" y "no instalado" se reportan POR SEPARADO', () => {
    // The admin has to be sent to the right place: one is fixed by installing, the other by granting.
    registerToolset(fakeToolset('grant-dos', ['ta']))
    setToolsetGrants('grant-dos', ['otro-plugin'])

    const r = resolveTools({ activeToolsets: ['grant-dos', 'ni-instalado'], disabledTools: [] }, 'pinocchio')

    assert.deepEqual(r.notGranted, ['grant-dos'])
    assert.deepEqual(r.missing, ['ni-instalado'])

    limpiar('grant-dos')
})

test('🔴 un plugin NO puede servirse lo que no le han concedido', () => {
    // Even when it asks for it explicitly in its config: the filter sits on the side the plugin does not control.
    registerToolset({ ...fakeToolset('grant-ops'), tools: [fakeTool('borrar')] })
    setToolsetGrants('grant-ops', ['otro'])

    const tools = buildAgentTools({ activeToolsets: ['grant-ops'], disabledTools: [] }, fakeContext(), {}, 'pinocchio')
    assert.deepEqual(Object.keys(tools), [])

    limpiar('grant-ops')
})

test('sin solicitante NO se filtra: es el core pintando, no ejecutando', () => {
    // The editor needs to see the whole catalogue in order to offer it; whoever executes always identifies itself.
    registerToolset(fakeToolset('grant-pintar', ['ta']))

    const paraPintar = resolveTools({ activeToolsets: ['grant-pintar'], disabledTools: [] })
    assert.deepEqual(paraPintar.effective.map(e => e.name), ['ta'])

    limpiar('grant-pintar')
})

test('reordenar la concesion la REEMPLAZA, no la acumula', () => {
    registerToolset(fakeToolset('grant-reem', ['ta']))
    setToolsetGrants('grant-reem', ['a', 'b'])
    setToolsetGrants('grant-reem', ['c'])

    assert.deepEqual(getToolsetGrants('grant-reem'), ['c'])
    limpiar('grant-reem')
})

test('desinstalar se lleva la concesion por delante', () => {
    // If it were left orphaned, reinstalling the toolset would resurrect permissions nobody granted again.
    registerToolset(fakeToolset('grant-vuelve', ['ta']))
    setToolsetGrants('grant-vuelve', ['pinocchio'])
    unregisterToolset('grant-vuelve')

    registerToolset(fakeToolset('grant-vuelve', ['ta']))
    assert.deepEqual(getToolsetGrants('grant-vuelve'), [], 'la concesion no puede sobrevivir a la desinstalacion')

    limpiar('grant-vuelve')
})
