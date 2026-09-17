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
// El caso que planteo el usuario, literal: ts1(ta tb tc td) + ts2(tf td tg), asignados [ts1, ts2] →
// se usan ta tb tc td(de ts1) tf tg, y la td de ts2 queda TAPADA.

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
    // No es cosmetico: con [ts2, ts1] la 'td' que corre es otra. De ahi que el editor tenga que avisar al
    // reordenar, y que la traza guarde el toolset y no solo el nombre.
    conTresToolsets()
    const r = resolveTools({ activeToolsets: ['ts2', 'ts1'], disabledTools: [] })

    assert.equal(r.effective.find(e => e.name === 'td').toolsetId, 'ts2')
    assert.deepEqual(r.shadowed.map(s => s.ref), ['ts1/td'])

    limpiar('ts1', 'ts2', 'ts3')
})

test('apagar una tool NO mata el nombre: aflora la del siguiente toolset', () => {
    // Se apaga una REFERENCIA ('ts1/td'), no un nombre.
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
    // Un techo que nombra algo desinstalado es una config rota. Sin esto el sintoma seria "el agente
    // responde peor" y no habria forma de saber por que.
    conTresToolsets()
    const r = resolveTools({ activeToolsets: ['ts1', 'no-instalado', 'ts3'], disabledTools: [] })

    assert.deepEqual(r.missing, ['no-instalado'])
    assert.deepEqual(r.effective.map(e => e.name), ['ta', 'tb', 'tc', 'td', 'th'])

    limpiar('ts1', 'ts2', 'ts3')
})

test('un cliente sin toolsets asignados no tiene tools', () => {
    // "Un plugin sin config no tiene tools": denegar por defecto, no heredar.
    conTresToolsets()
    assert.deepEqual(resolveTools({ activeToolsets: [], disabledTools: [] }).effective, [])
    limpiar('ts1', 'ts2', 'ts3')
})

// ── el camino unico de invocacion y sus dos ganchos ──────────────────────────────────────────────────

test('lo que se le ofrece al LLM lleva el nombre CORTO', () => {
    // Una referencia cualificada ('ts1/ta') no pasaria el filtro de nombres de los proveedores.
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
    // Como DATO, no como excepcion: una excepcion corta la conversacion en vez de dejar al modelo
    // enterarse de que esa via esta cerrada y probar otra.
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
    // CUALIFICADA: con precedencia, el nombre corto no dice que codigo corrio.
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
    // Dos toolsets con `requires` distintos en la misma tanda: el reparto es por toolset, no global.
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
    // Las 43 de hoy no reciben `host`: leen ctx() de un AsyncLocalStorage privado. buildAgentTools envuelve
    // la ejecucion en runWithToolContext, y eso es lo que permite migrar los ocho paquetes de S3 de uno en
    // uno en vez de reescribirlas todas antes de poder usar el camino nuevo.
    //
    // Se prueba con una de VERDAD (`list_namespaces`), no con una imitacion: el accesor del contexto no se
    // exporta —a proposito, para no repartir el saco entero a paquetes de terceros— asi que una tool de
    // pega no podria leerlo aunque quisiera, y el test no probaria nada.
    registerToolset({
        ...fakeToolset('viejo-ts'),
        tools: [fakeTool('ala_antigua', { execute: async () => tools43.list_namespaces.execute({}, {}) })]
    })

    const res = await buildAgentTools({ activeToolsets: ['viejo-ts'], disabledTools: [] }, fakeContext())
        .ala_antigua.execute({}, {})

    assert.deepEqual(res.namespaces.map(n => n.name), ['default'])

    limpiar('viejo-ts')
})

// ── como se le entregan las tools al SDK ─────────────────────────────────────────────────────────────

test('🔴 las tools que se le pasan al SDK NO son dinamicas', async () => {
    // Parece un detalle y no lo es. En el SDK:
    //     tool(t)        => t                          (solo ayuda de tipos)
    //     dynamicTool(t) => { ...t, type: 'dynamic' }  (marca la tool en RUNTIME)
    // Una tool marcada como dinamica se trata por otro camino y, combinada con Output.object, la
    // invocacion acaba en AI_NoOutputGeneratedError: la tool se ejecuta, devuelve, y la respuesta
    // estructurada nunca llega. Lo detecto el QA de S3 con pinocchio, que usa salida estructurada.
    registerToolset({ ...fakeToolset('sdk-ts'), tools: [fakeTool('plana')] })

    const tools = buildAgentTools({ activeToolsets: ['sdk-ts'], disabledTools: [] }, fakeContext())

    assert.equal(tools.plana.type, undefined, "la tool no debe llevar marca 'dynamic'")
    assert.equal(typeof tools.plana.execute, 'function')
    assert.ok(tools.plana.inputSchema, 'el esquema tiene que viajar tal cual')

    limpiar('sdk-ts')
})
