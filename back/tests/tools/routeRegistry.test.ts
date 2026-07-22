// Registro central de rutas: colisión exacta (dos providers mismo alias), prefijos reservados del core,
// normalización de barra final, y que el core sí puede montar en lo reservado. Puro (sin Express).

import test from 'node:test'
import assert from 'node:assert/strict'
import { RouteRegistry, ERouteOwnerKind } from '../../src/tools/RouteRegistry'

test('registro OK y aparece en list()', () => {
    const r = new RouteRegistry()
    assert.deepEqual(r.tryRegister('/provider/events', ERouteOwnerKind.PROVIDER, 'events'), { ok: true })
    assert.equal(r.list().length, 1)
    assert.equal(r.list()[0].ownerId, 'events')
})

test('colisión exacta: dos providers con el mismo alias → duplicate + conflicto', () => {
    const r = new RouteRegistry()
    r.tryRegister('/provider/events', ERouteOwnerKind.PROVIDER, 'events-a')
    const res = r.tryRegister('/provider/events', ERouteOwnerKind.PROVIDER, 'events-b')
    assert.equal(res.ok, false)
    if (!res.ok && res.reason === 'duplicate') assert.equal(res.conflict.ownerId, 'events-a')
    else assert.fail('esperaba duplicate')
    assert.equal(r.list().length, 1, 'la 2ª no se registra')
})

test('normaliza barra final: /x y /x/ son el mismo path', () => {
    const r = new RouteRegistry()
    r.tryRegister('/channel/foo', ERouteOwnerKind.CHANNEL, 'a')
    const res = r.tryRegister('/channel/foo/', ERouteOwnerKind.CHANNEL, 'b')
    assert.equal(res.ok, false)
})

test('prefijo reservado: una extensión NO puede montar bajo un reservado', () => {
    const r = new RouteRegistry()
    r.reserve('/core')
    assert.equal(r.tryRegister('/core', ERouteOwnerKind.LOGIN, 'x').ok, false)          // exacto
    assert.equal(r.tryRegister('/core/plugins', ERouteOwnerKind.LOGIN, 'x').ok, false)  // por debajo
    const res = r.tryRegister('/core/plugins', ERouteOwnerKind.LOGIN, 'x')
    if (!res.ok) assert.equal(res.reason, 'reserved')
})

test('el propio core SÍ puede montar en un prefijo reservado', () => {
    const r = new RouteRegistry()
    r.reserve('/core')
    assert.deepEqual(r.tryRegister('/core/plugins', ERouteOwnerKind.CORE, 'pluginApi'), { ok: true })
})

test('reservado NO afecta a un path parecido pero distinto (front vs frontend)', () => {
    const r = new RouteRegistry()
    r.reserve('/front')
    assert.equal(r.tryRegister('/frontend/x', ERouteOwnerKind.LOGIN, 'x').ok, true, "'/frontend' no cuelga de '/front'")
})
