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
    resolveToolRef, isBuiltInToolsetId
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
