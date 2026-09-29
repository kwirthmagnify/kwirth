// The central route registry: an exact clash (two providers with the same alias), the core's reserved
// prefixes, trailing-slash normalisation, and that the core can indeed mount on what is reserved. Pure
// (no Express).

import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
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

// ── record / listRoutes: what IS mounted, for the Status channel's Routes tab ─────────────────────────

const listed = (r: RouteRegistry) => r.listRoutes().map(x => `${x.ownerKind}:${x.ownerId} ${x.method} ${x.path}`).sort()

test('a recorded router lists each route with its method and FULL path', () => {
    const router = express.Router()
    router.get('/list', (_q, s) => { s.end() })
    router.post('/item/:id', (_q, s) => { s.end() })
    router.route('/both').get((_q, s) => { s.end() }).delete((_q, s) => { s.end() })
    const r = new RouteRegistry()
    r.record({ path: '/kwirth/core/providers', ownerKind: ERouteOwnerKind.CORE, ownerId: 'providers', router })
    assert.deepEqual(listed(r), [
        'core:providers DELETE /kwirth/core/providers/both',
        'core:providers GET /kwirth/core/providers/both',
        'core:providers GET /kwirth/core/providers/list',
        'core:providers POST /kwirth/core/providers/item/:id'
    ])
})

test('router.all() is ALL, and the list carries PATTERNS, never values', () => {
    const router = express.Router()
    router.all('/:provider/:token', (_q, s) => { s.end() })
    const r = new RouteRegistry()
    r.record({ path: '/webhook', ownerKind: ERouteOwnerKind.WEBHOOK, ownerId: 'receiver', router })
    assert.deepEqual(listed(r), ['webhook:receiver ALL /webhook/:provider/:token'])
})

test('routers mounted INSIDE a router come out with the whole path, params included', () => {
    const inner = express.Router()
    inner.get('/metrics', (_q, s) => { s.end() })
    const withParam = express.Router()
    withParam.get('/info', (_q, s) => { s.end() })
    const outer = express.Router()
    outer.use('/v1', inner)
    outer.use('/items/:id', withParam)
    const r = new RouteRegistry()
    r.record({ path: '/provider/otlp', ownerKind: ERouteOwnerKind.PROVIDER, ownerId: 'otel', router: outer })
    assert.deepEqual(listed(r), [
        'provider:otel GET /provider/otlp/items/:id/info',
        'provider:otel GET /provider/otlp/v1/metrics'
    ])
})

test('a mount without routes of its own (a static folder) is still listed', () => {
    const r = new RouteRegistry()
    r.record({ path: '/kwirth/front', ownerKind: ERouteOwnerKind.FRONT, ownerId: 'spa', methods: ['GET'] })
    assert.deepEqual(listed(r), ['front:spa GET /kwirth/front'])
})

test('🔴 recording REJECTS nothing: two owners at one path are both listed', () => {
    // That is a collision, and exactly what the Routes tab must be able to show. Rejecting is pending.
    const r = new RouteRegistry()
    r.reserve('/core')
    r.record({ path: '/provider/events', ownerKind: ERouteOwnerKind.PROVIDER, ownerId: 'events-a', methods: ['GET'] })
    r.record({ path: '/provider/events', ownerKind: ERouteOwnerKind.PROVIDER, ownerId: 'events-b', methods: ['GET'] })
    r.record({ path: '/core/x', ownerKind: ERouteOwnerKind.CHANNEL, ownerId: 'rogue', methods: ['GET'] })
    assert.deepEqual(listed(r), [
        'channel:rogue GET /core/x',
        'provider:events-a GET /provider/events',
        'provider:events-b GET /provider/events'
    ])
    // And recording does not touch the validator's own registry.
    assert.equal(r.list().length, 0)
})

test('🔴 the same owner mounting again at the same path replaces, it does not list twice', () => {
    const first = express.Router()
    first.get('/old', (_q, s) => { s.end() })
    const second = express.Router()
    second.get('/new', (_q, s) => { s.end() })
    const r = new RouteRegistry()
    r.record({ path: '/channel/agora/', ownerKind: ERouteOwnerKind.CHANNEL, ownerId: 'agora', router: first })
    r.record({ path: '/channel/agora', ownerKind: ERouteOwnerKind.CHANNEL, ownerId: 'agora', router: second })
    assert.deepEqual(listed(r), ['channel:agora GET /channel/agora/new'])
})

test('forget() drops everything an owner mounted, and nobody else', () => {
    const r = new RouteRegistry()
    r.record({ path: '/channel/agora', ownerKind: ERouteOwnerKind.CHANNEL, ownerId: 'agora', methods: ['GET'] })
    r.record({ path: '/kwirth/c/channel/agora/report', ownerKind: ERouteOwnerKind.CHANNEL, ownerId: 'agora', methods: ['GET'] })
    r.record({ path: '/channel/iter', ownerKind: ERouteOwnerKind.CHANNEL, ownerId: 'iter', methods: ['GET'] })
    r.forget(ERouteOwnerKind.CHANNEL, 'agora')
    assert.deepEqual(listed(r), ['channel:iter GET /channel/iter'])
})

test('🔴 a route declared as an ARRAY lists each path — it took the whole list down', () => {
    // ConfigApi does exactly this: route(['/:namespace/groups', '/:namespace/controllers']).
    const router = express.Router()
    router.route(['/:namespace/groups', '/:namespace/controllers']).get((_q, s) => { s.end() })
    const r = new RouteRegistry()
    r.record({ path: '/config', ownerKind: ERouteOwnerKind.CORE, ownerId: 'config', router })
    assert.deepEqual(listed(r), [
        'core:config GET /config/:namespace/controllers',
        'core:config GET /config/:namespace/groups'
    ])
})

test('🔴 .all() as middleware next to GET is NOT listed as ALL: the route answers only GET', () => {
    // ConfigApi's pattern: route(...).all(authCheck).get(handler).
    const router = express.Router()
    router.route('/info').all((_q, _s, next) => { next() }).get((_q, s) => { s.end() })
    const r = new RouteRegistry()
    r.record({ path: '/config', ownerKind: ERouteOwnerKind.CORE, ownerId: 'config', router })
    assert.deepEqual(listed(r), ['core:config GET /config/info'])
})

test('a route declared as a regular expression is listed by its pattern', () => {
    const router = express.Router()
    router.get(/^\/files\/.*$/, (_q, s) => { s.end() })
    const r = new RouteRegistry()
    r.record({ path: '/core/docs', ownerKind: ERouteOwnerKind.CORE, ownerId: 'docs', router })
    assert.equal(r.listRoutes().length, 1)
    assert.equal(r.listRoutes()[0].method, 'GET')
})

test('🔴 one unreadable mount does not take the others down', () => {
    const good = express.Router()
    good.get('/ok', (_q, s) => { s.end() })
    // A stack whose layer blows up when read: it stands for anything Express may hold that is not foreseen.
    const bad = { stack: [{ get route(): never { throw new Error('unreadable') } }] }
    const r = new RouteRegistry()
    r.record({ path: '/bad', ownerKind: ERouteOwnerKind.PROVIDER, ownerId: 'x', router: bad })
    r.record({ path: '/good', ownerKind: ERouteOwnerKind.CORE, ownerId: 'g', router: good })
    assert.deepEqual(listed(r), ['core:g GET /good/ok', 'provider:x ALL /bad'])
})

test('routes added to a router AFTER it was recorded are listed too', () => {
    const router = express.Router()
    const r = new RouteRegistry()
    r.record({ path: '/config', ownerKind: ERouteOwnerKind.CORE, ownerId: 'config', router })
    router.get('/late', (_q, s) => { s.end() })
    assert.deepEqual(listed(r), ['core:config GET /config/late'])
})

test('reservado NO afecta a un path parecido pero distinto (front vs frontend)', () => {
    const r = new RouteRegistry()
    r.reserve('/front')
    assert.equal(r.tryRegister('/frontend/x', ERouteOwnerKind.LOGIN, 'x').ok, true, "'/frontend' no cuelga de '/front'")
})
