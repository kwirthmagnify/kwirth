// The Routes tab's logic (src/front/StatusRoutes.ts). The finding that matters is the COLLISION: the same
// method at the same path from two owners, where Express answers with the first and the other is silently
// unreachable. The core records both, so it is only visible here.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collisions, countByOwner, filterLines, isColliding, sortRoutes, toLines } from '../../src/front/StatusRoutes'
import { ERouteOwnerKind, IPublishedRoute } from '@kwirthmagnify/kwirth-common'

const route = (ownerKind: ERouteOwnerKind, ownerId: string, method: string, path: string): IPublishedRoute => ({ ownerKind, ownerId, method, path })

test('🔴 two owners at the same method and path collide; each side is flagged', () => {
    const a = route(ERouteOwnerKind.PROVIDER, 'events-a', 'GET', '/provider/events')
    const b = route(ERouteOwnerKind.PROVIDER, 'events-b', 'GET', '/provider/events')
    const clashes = collisions([a, b])
    assert.deepEqual([...clashes], ['GET /provider/events'])
    assert.equal(isColliding(a, clashes), true)
    assert.equal(isColliding(b, clashes), true)
})

test('the same owner at one path with two methods is NOT a collision', () => {
    const clashes = collisions([
        route(ERouteOwnerKind.CORE, 'config', 'GET', '/config'),
        route(ERouteOwnerKind.CORE, 'config', 'POST', '/config')
    ])
    assert.equal(clashes.size, 0)
})

test('different methods at one path from two owners do not collide — ALL collides with any', () => {
    assert.equal(collisions([
        route(ERouteOwnerKind.CORE, 'a', 'GET', '/x'),
        route(ERouteOwnerKind.PROVIDER, 'b', 'POST', '/x')
    ]).size, 0)
    const clashes = collisions([
        route(ERouteOwnerKind.WEBHOOK, 'receiver', 'ALL', '/x'),
        route(ERouteOwnerKind.PROVIDER, 'b', 'POST', '/x')
    ])
    assert.equal(isColliding(route(ERouteOwnerKind.PROVIDER, 'b', 'POST', '/x'), clashes), true)
    assert.equal(isColliding(route(ERouteOwnerKind.WEBHOOK, 'receiver', 'ALL', '/x'), clashes), true)
})

test('the order is by owner kind (core first), then path, then method', () => {
    const sorted = sortRoutes([
        route(ERouteOwnerKind.PROVIDER, 'otel', 'POST', '/provider/otlp'),
        route(ERouteOwnerKind.CORE, 'config', 'POST', '/config'),
        route(ERouteOwnerKind.CORE, 'config', 'GET', '/config'),
        route(ERouteOwnerKind.CORE, 'auth', 'GET', '/auth')
    ])
    assert.deepEqual(sorted.map(r => `${r.ownerId} ${r.method} ${r.path}`), [
        'auth GET /auth', 'config GET /config', 'config POST /config', 'otel POST /provider/otlp'
    ])
})

test('🔴 one line per path and owner, with all its methods together and in CRUD order', () => {
    const lines = toLines([
        route(ERouteOwnerKind.CORE, 'config', 'DELETE', '/config'),
        route(ERouteOwnerKind.CORE, 'config', 'GET', '/config'),
        route(ERouteOwnerKind.CORE, 'config', 'POST', '/config'),
        route(ERouteOwnerKind.CORE, 'config', 'GET', '/config/info')
    ])
    assert.deepEqual(lines.map(l => `${l.path} ${l.methods.join(',')}`), ['/config GET,POST,DELETE', '/config/info GET'])
})

test('🔴 two owners at the same path stay on two lines, both flagged as colliding', () => {
    const lines = toLines([
        route(ERouteOwnerKind.PROVIDER, 'events-a', 'GET', '/provider/events'),
        route(ERouteOwnerKind.PROVIDER, 'events-b', 'GET', '/provider/events'),
        route(ERouteOwnerKind.CORE, 'config', 'GET', '/config')
    ])
    assert.equal(lines.length, 3)
    assert.deepEqual(lines.filter(l => l.colliding).map(l => l.ownerId).sort(), ['events-a', 'events-b'])
})

test('a method repeated for one path and owner is shown once', () => {
    const lines = toLines([route(ERouteOwnerKind.CORE, 'a', 'GET', '/x'), route(ERouteOwnerKind.CORE, 'a', 'GET', '/x')])
    assert.deepEqual(lines[0].methods, ['GET'])
})

test('the filter matches the path, an exact method, the owner id and the owner kind — and keeps the whole line', () => {
    const lines = toLines([
        route(ERouteOwnerKind.CORE, 'config', 'GET', '/kwirth/config/info'),
        route(ERouteOwnerKind.PROVIDER, 'otel', 'POST', '/provider/otlp'),
        route(ERouteOwnerKind.PROVIDER, 'otel', 'GET', '/provider/otlp'),
        route(ERouteOwnerKind.CHANNEL, 'agora', 'GET', '/channel/agora/report')
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
        route(ERouteOwnerKind.PROVIDER, 'otel', 'POST', '/a'),
        route(ERouteOwnerKind.CORE, 'config', 'GET', '/b'),
        route(ERouteOwnerKind.CORE, 'config', 'POST', '/b')
    ])
    assert.deepEqual(counts, [[ERouteOwnerKind.CORE, 2], [ERouteOwnerKind.PROVIDER, 1]])
})
