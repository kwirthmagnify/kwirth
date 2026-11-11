/*
    S2: from "these toolsets, in this order" to "these tools, ready for the LLM".

    What is pinned down here is the PRECEDENCE (the user's decision, 2026-09-17) and the two hooks. It is
    the semantics that will be persisted in every plugin's configuration, so getting it wrong here is not
    fixed with a refactor: it is fixed by migrating customers' configurations.
*/
import test from 'node:test'
import assert from 'node:assert/strict'
import back from '../dist/back.js'
import * as iso from '../dist/index.js'

const { registerToolset, unregisterToolset, resolveTools, buildAgentTools } = back
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

/*
    A test used to live here proving that a tool written against the OLD contract still ran through this
    path: buildAgentTools wraps every run in runWithToolContext, and that is what let S3 migrate the 43
    one package at a time. It was removed on 2026-09-26 together with the 43 themselves — it ran a REAL
    one (list_namespaces), and with them gone there is nothing honest left to test it with: the context
    accessor is deliberately not exported, so a fake tool could not read it and the test would prove
    nothing. The wrapper is still in place; see the backlog in plans/ai-tools/PLAN.md for retiring it.
*/
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

const { setToolsetGrants, getToolsetGrants, isToolsetGrantedTo, isToolGrantedTo } = back

// Grant helpers: every tool (the "All" switch) and an explicit list.
const all = (...pluginIds) => pluginIds.map(pluginId => ({ pluginId, allTools: true, tools: [] }))
const only = (pluginId, ...tools) => ({ pluginId, allTools: false, tools })

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
    setToolsetGrants('grant-uno', all('pinocchio'))

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
    setToolsetGrants('grant-dos', all('otro-plugin'))

    const r = resolveTools({ activeToolsets: ['grant-dos', 'ni-instalado'], disabledTools: [] }, 'pinocchio')

    assert.deepEqual(r.notGranted, ['grant-dos'])
    assert.deepEqual(r.missing, ['ni-instalado'])

    limpiar('grant-dos')
})

test('🔴 un plugin NO puede servirse lo que no le han concedido', () => {
    // Even when it asks for it explicitly in its config: the filter sits on the side the plugin does not control.
    registerToolset({ ...fakeToolset('grant-ops'), tools: [fakeTool('borrar')] })
    setToolsetGrants('grant-ops', all('otro'))

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
    setToolsetGrants('grant-reem', all('a', 'b'))
    setToolsetGrants('grant-reem', [only('c', 'ta')])

    assert.deepEqual(getToolsetGrants('grant-reem'), [{ pluginId: 'c', allTools: false, tools: ['ta'] }])
    limpiar('grant-reem')
})

test('desinstalar se lleva la concesion por delante', () => {
    // If it were left orphaned, reinstalling the toolset would resurrect permissions nobody granted again.
    registerToolset(fakeToolset('grant-vuelve', ['ta']))
    setToolsetGrants('grant-vuelve', all('pinocchio'))
    unregisterToolset('grant-vuelve')

    registerToolset(fakeToolset('grant-vuelve', ['ta']))
    assert.deepEqual(getToolsetGrants('grant-vuelve'), [], 'la concesion no puede sobrevivir a la desinstalacion')

    limpiar('grant-vuelve')
})

// ── the grant per tool (plans/ai-tool-grants, T1) ────────────────────────────────────────────────────

test('concesion parcial: solo llegan las tools concedidas, el resto se reporta aparte', () => {
    registerToolset(fakeToolset('gt-parcial', ['scale', 'restart', 'delete_pod']))
    setToolsetGrants('gt-parcial', [only('pinocchio', 'scale', 'restart')])

    const r = resolveTools({ activeToolsets: ['gt-parcial'], disabledTools: [] }, 'pinocchio')
    assert.deepEqual(r.effective.map(e => e.name), ['scale', 'restart'])
    assert.deepEqual(r.notGrantedTools, ['gt-parcial/delete_pod'])
    assert.deepEqual(r.notGranted, [])
    assert.equal(isToolGrantedTo('gt-parcial', 'scale', 'pinocchio'), true)
    assert.equal(isToolGrantedTo('gt-parcial', 'delete_pod', 'pinocchio'), false)

    limpiar('gt-parcial')
})

test('🔴 la ejecucion tampoco ofrece una tool no concedida', () => {
    registerToolset(fakeToolset('gt-exec', ['scale', 'delete_pod']))
    setToolsetGrants('gt-exec', [only('pinocchio', 'scale')])

    const tools = buildAgentTools({ activeToolsets: ['gt-exec'], disabledTools: [] }, fakeContext(), {}, 'pinocchio')
    assert.deepEqual(Object.keys(tools), ['scale'])

    limpiar('gt-exec')
})

test('"no concedida" y "apagada por mi" se reportan por separado', () => {
    registerToolset(fakeToolset('gt-sep', ['ta', 'tb', 'tc']))
    setToolsetGrants('gt-sep', [only('pinocchio', 'ta', 'tb')])

    const r = resolveTools({ activeToolsets: ['gt-sep'], disabledTools: ['gt-sep/tb'] }, 'pinocchio')
    assert.deepEqual(r.effective.map(e => e.name), ['ta'])
    assert.deepEqual(r.notGrantedTools, ['gt-sep/tc'])

    limpiar('gt-sep')
})

test('una tool no concedida NO hace sombra: aflora la del siguiente toolset', () => {
    registerToolset(fakeToolset('gt-s1', ['ta', 'td']))
    registerToolset(fakeToolset('gt-s2', ['td']))
    setToolsetGrants('gt-s1', [only('pinocchio', 'ta')])
    setToolsetGrants('gt-s2', all('pinocchio'))

    const r = resolveTools({ activeToolsets: ['gt-s1', 'gt-s2'], disabledTools: [] }, 'pinocchio')
    assert.equal(r.effective.find(e => e.name === 'td').toolsetId, 'gt-s2')
    assert.deepEqual(r.shadowed, [])

    limpiar('gt-s1', 'gt-s2')
})

test('🔴 lista explicita: las tools de una version nueva NO entran solas', () => {
    registerToolset(fakeToolset('gt-nueva', ['ta']))
    setToolsetGrants('gt-nueva', [only('pinocchio', 'ta')])
    // The upgrade: unregister + register drops the grant, and the core restores what was stored.
    const guardada = getToolsetGrants('gt-nueva')
    unregisterToolset('gt-nueva')
    registerToolset(fakeToolset('gt-nueva', ['ta', 'tnueva']))
    setToolsetGrants('gt-nueva', guardada)

    const r = resolveTools({ activeToolsets: ['gt-nueva'], disabledTools: [] }, 'pinocchio')
    assert.deepEqual(r.effective.map(e => e.name), ['ta'])
    assert.deepEqual(r.notGrantedTools, ['gt-nueva/tnueva'])

    limpiar('gt-nueva')
})

test('🔴 switch All: las tools de una version nueva SI entran', () => {
    registerToolset(fakeToolset('gt-all', ['ta']))
    setToolsetGrants('gt-all', all('pinocchio'))
    const guardada = getToolsetGrants('gt-all')
    unregisterToolset('gt-all')
    registerToolset(fakeToolset('gt-all', ['ta', 'tnueva']))
    setToolsetGrants('gt-all', guardada)

    const r = resolveTools({ activeToolsets: ['gt-all'], disabledTools: [] }, 'pinocchio')
    assert.deepEqual(r.effective.map(e => e.name), ['ta', 'tnueva'])
    assert.deepEqual(r.notGrantedTools, [])

    limpiar('gt-all')
})

test('con All encendido la lista se ignora, pero se conserva', () => {
    // Kept so that switching All off gives back the previous selection.
    registerToolset(fakeToolset('gt-allkeep', ['ta', 'tb']))
    setToolsetGrants('gt-allkeep', [{ pluginId: 'pinocchio', allTools: true, tools: ['ta'] }])

    assert.equal(isToolGrantedTo('gt-allkeep', 'tb', 'pinocchio'), true)
    assert.deepEqual(getToolsetGrants('gt-allkeep'), [{ pluginId: 'pinocchio', allTools: true, tools: ['ta'] }])

    limpiar('gt-allkeep')
})

test('conceder NADA es lo mismo que no conceder', () => {
    registerToolset(fakeToolset('gt-vacia', ['ta']))
    setToolsetGrants('gt-vacia', [only('pinocchio')])

    assert.equal(isToolsetGrantedTo('gt-vacia', 'pinocchio'), false)
    assert.deepEqual(getToolsetGrants('gt-vacia'), [])
    const r = resolveTools({ activeToolsets: ['gt-vacia'], disabledTools: [] }, 'pinocchio')
    assert.deepEqual(r.notGranted, ['gt-vacia'])
    assert.deepEqual(r.notGrantedTools, [])

    limpiar('gt-vacia')
})

test('una tool concedida que ya no existe se ignora sin romper', () => {
    registerToolset(fakeToolset('gt-huerfana', ['ta']))
    setToolsetGrants('gt-huerfana', [only('pinocchio', 'ta', 'desaparecida')])

    const r = resolveTools({ activeToolsets: ['gt-huerfana'], disabledTools: [] }, 'pinocchio')
    assert.deepEqual(r.effective.map(e => e.name), ['ta'])
    assert.deepEqual(r.notGrantedTools, [])

    limpiar('gt-huerfana')
})

test('un plugin repetido en la concesion se fusiona', () => {
    registerToolset(fakeToolset('gt-rep', ['ta', 'tb']))
    setToolsetGrants('gt-rep', [only('pinocchio', 'ta'), only('pinocchio', 'tb', 'ta')])

    assert.deepEqual(getToolsetGrants('gt-rep'), [{ pluginId: 'pinocchio', allTools: false, tools: ['ta', 'tb'] }])

    limpiar('gt-rep')
})

test('sin solicitante tampoco se filtra por tool', () => {
    registerToolset(fakeToolset('gt-pintar', ['ta', 'tb']))
    setToolsetGrants('gt-pintar', [only('pinocchio', 'ta')])

    const r = resolveTools({ activeToolsets: ['gt-pintar'], disabledTools: [] })
    assert.deepEqual(r.effective.map(e => e.name), ['ta', 'tb'])
    assert.deepEqual(r.notGrantedTools, [])

    limpiar('gt-pintar')
})
