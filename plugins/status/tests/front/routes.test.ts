// The Routes tab's logic (src/front/StatusRoutes.ts). The finding that matters is the COLLISION: the same
// method at the same path from two owners, where Express answers with the first and the other is silently
// unreachable. The core records both, so it is only visible here.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collisions, countByOwner, filterLines, isColliding, sortRoutes, toLines } from '../../src/front/StatusRoutes'
import { EStatusRouteOwner, IStatusRoute } from '../../src/common/StatusTypes'

const route = (ownerKind: EStatusRouteOwner, ownerId: string, method: string, path: string): IStatusRoute => ({ ownerKind, ownerId, method, path })

test('🔴 two owners at the same method and path collide; each side is flagged', () => {
    const a = route(EStatusRouteOwner.PROVIDER, 'events-a', 'GET', '/provider/events')
    const b = route(EStatusRouteOwner.PROVIDER, 'events-b', 'GET', '/provider/events')
    const clashes = collisions([a, b])
    assert.deepEqual([...clashes], ['GET /provider/events'])
    assert.equal(isColliding(a, clashes), true)
    assert.equal(isColliding(b, clashes), true)
})

test('the same owner at one path with two methods is NOT a collision', () => {
    const clashes = collisions([
        route(EStatusRouteOwner.CORE, 'config', 'GET', '/config'),
        route(EStatusRouteOwner.CORE, 'config', 'POST', '/config')
    ])
    assert.equal(clashes.size, 0)
})

test('different methods at one path from two owners do not collide — ALL collides with any', () => {
    assert.equal(collisions([
        route(EStatusRouteOwner.CORE, 'a', 'GET', '/x'),
        route(EStatusRouteOwner.PROVIDER, 'b', 'POST', '/x')
    ]).size, 0)
    const clashes = collisions([
        route(EStatusRouteOwner.WEBHOOK, 'receiver', 'ALL', '/x'),
        route(EStatusRouteOwner.PROVIDER, 'b', 'POST', '/x')
    ])
    assert.equal(isColliding(route(EStatusRouteOwner.PROVIDER, 'b', 'POST', '/x'), clashes), true)
    assert.equal(isColliding(route(EStatusRouteOwner.WEBHOOK, 'receiver', 'ALL', '/x'), clashes), true)
})

test('the order is by owner kind (core first), then path, then method', () => {
    const sorted = sortRoutes([
        route(EStatusRouteOwner.PROVIDER, 'otel', 'POST', '/provider/otlp'),
        route(EStatusRouteOwner.CORE, 'config', 'POST', '/config'),
        route(EStatusRouteOwner.CORE, 'config', 'GET', '/config'),
        route(EStatusRouteOwner.CORE, 'auth', 'GET', '/auth')
    ])
    assert.deepEqual(sorted.map(r => `${r.ownerId} ${r.method} ${r.path}`), [
        'auth GET /auth', 'config GET /config', 'config POST /config', 'otel POST /provider/otlp'
    ])
})

test('🔴 one line per path and owner, with all its methods together and in CRUD order', () => {
    const lines = toLines([
        route(EStatusRouteOwner.CORE, 'config', 'DELETE', '/config'),
        route(EStatusRouteOwner.CORE, 'config', 'GET', '/config'),
        route(EStatusRouteOwner.CORE, 'config', 'POST', '/config'),
        route(EStatusRouteOwner.CORE, 'config', 'GET', '/config/info')
    ])
    assert.deepEqual(lines.map(l => `${l.path} ${l.methods.join(',')}`), ['/config GET,POST,DELETE', '/config/info GET'])
})

test('🔴 two owners at the same path stay on two lines, both flagged as colliding', () => {
    const lines = toLines([
        route(EStatusRouteOwner.PROVIDER, 'events-a', 'GET', '/provider/events'),
        route(EStatusRouteOwner.PROVIDER, 'events-b', 'GET', '/provider/events'),
        route(EStatusRouteOwner.CORE, 'config', 'GET', '/config')
    ])
    assert.equal(lines.length, 3)
    assert.deepEqual(lines.filter(l => l.colliding).map(l => l.ownerId).sort(), ['events-a', 'events-b'])
})

test('a method repeated for one path and owner is shown once', () => {
    const lines = toLines([route(EStatusRouteOwner.CORE, 'a', 'GET', '/x'), route(EStatusRouteOwner.CORE, 'a', 'GET', '/x')])
    assert.deepEqual(lines[0].methods, ['GET'])
})

test('the filter matches the path, an exact method, the owner id and the owner kind — and keeps the whole line', () => {
    const lines = toLines([
        route(EStatusRouteOwner.CORE, 'config', 'GET', '/kwirth/config/info'),
        route(EStatusRouteOwner.PROVIDER, 'otel', 'POST', '/provider/otlp'),
        route(EStatusRouteOwner.PROVIDER, 'otel', 'GET', '/provider/otlp'),
        route(EStatusRouteOwner.CHANNEL, 'agora', 'GET', '/channel/agora/report')
    ])
    assert.deepEqual(filterLines(lines, 'otlp').map(l => l.ownerId), ['otel'])
    // Filtering by a method keeps the line WITH all its methods, not only the one typed.
    assert.deepEqual(filterLines(lines, 'post').map(l => l.methods.join(',')), ['GET,POST'])
    assert.deepEqual(filterLines(lines, 'agora').map(l => l.ownerId), ['agora'])
    // 'Plugin' is how a channel's routes are labelled on screen.
    assert.deepEqual(filterLines(lines, 'plugin').map(l => l.ownerId), ['agora'])
    assert.equal(filterLines(lines, '  ').length, 3)
    // A partial method does not match: 'ge' is not GET, and none of these paths or owners contains it.
    assert.deepEqual(filterLines(lines, 'ge').map(l => l.ownerId), [])
})

test('counts only the owner kinds that have routes, in the table order', () => {
    const counts = countByOwner([
        route(EStatusRouteOwner.PROVIDER, 'otel', 'POST', '/a'),
        route(EStatusRouteOwner.CORE, 'config', 'GET', '/b'),
        route(EStatusRouteOwner.CORE, 'config', 'POST', '/b')
    ])
    assert.deepEqual(counts, [[EStatusRouteOwner.CORE, 2], [EStatusRouteOwner.PROVIDER, 1]])
})
