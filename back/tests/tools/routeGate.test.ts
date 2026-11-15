// The core's door to the routers (plans/router-extension, S3): route tickets, which path belongs to which
// router, and who is calling — decided before a router sees a byte.

import test from 'node:test'
import assert from 'node:assert/strict'
import { AccessKey, IRouterData } from '@kwirthmagnify/kwirth-common'
import { ERouteCallerVia } from '@kwirthmagnify/kwirth-common-back'
import { RouteKeySockets, RouteTickets, authenticateRoute, routerPathOf } from '../../src/tools/RouteGate'

const KEY: AccessKey = { id: 'k1', type: 'permanent', resources: 'admin::::' } as AccessKey
const OTHER: AccessKey = { id: 'k2', type: 'permanent', resources: 'bridge$peer::::' } as AccessKey
const TICKETED: IRouterData = { id: 'bridge', pathTemplate: '/{routeTicket}/{clusterUid}', needsTicket: true }
const KEY_ONLY: IRouterData = { id: 'echo', pathTemplate: '/{clusterUid}', needsTicket: false }
const noKey = async () => undefined
const keyIs = (header: string, key: AccessKey) => async (authorization: string | undefined) => authorization === header ? key : undefined

test('a ticket stands for its key until it expires; an unknown one for nobody', () => {
    const clock = { t: 1_000 }
    const tickets = new RouteTickets(() => clock.t, 60_000)
    const { routeTicket, expiresAt } = tickets.issue(KEY, 'admin')
    assert.equal(expiresAt, 61_000)
    assert.ok(routeTicket.length >= 32, 'opaque and long')
    assert.deepEqual(tickets.check(routeTicket), { via: ERouteCallerVia.TICKET, accessKey: KEY, user: 'admin' })
    assert.equal(tickets.check('made-up'), undefined)
    clock.t = 61_001
    assert.equal(tickets.check(routeTicket), undefined, 'expired')
})

test('each ticket is different, and deleting a key takes its tickets with it', () => {
    const tickets = new RouteTickets()
    const a = tickets.issue(KEY).routeTicket
    const b = tickets.issue(KEY).routeTicket
    const c = tickets.issue(OTHER).routeTicket
    assert.notEqual(a, b)
    tickets.revokeKey('k1')
    assert.equal(tickets.check(a), undefined)
    assert.equal(tickets.check(b), undefined)
    assert.ok(tickets.check(c))
})

test('a router path: its id and the rest; anything else is not one', () => {
    assert.deepEqual(routerPathOf('/kwirth/router/bridge/t1/u1?x=1', '/kwirth'), { id: 'bridge', rest: '/t1/u1?x=1' })
    assert.deepEqual(routerPathOf('/router/bridge', ''), { id: 'bridge', rest: '/' })
    assert.deepEqual(routerPathOf('/router/bridge?x', '/'), { id: 'bridge', rest: '/?x' })
    assert.deepEqual(routerPathOf('/router/a%2Fb/x', ''), { id: 'a/b', rest: '/x' })
    for (const url of [undefined, '', '/kwirth/channel/bridge/x', '/router/', '/routers/bridge', '/kwirth2/router/bridge'])
        assert.equal(routerPathOf(url, '/kwirth'), undefined, String(url))
})

test('🔴 a ticket in the first segment: the caller is its session, and the router does not see the ticket', async () => {
    const tickets = new RouteTickets()
    const { routeTicket } = tickets.issue(KEY)
    const auth = await authenticateRoute(TICKETED, `/${routeTicket}/u1/api?x=1`, '203.0.113.9', undefined, tickets, noKey)
    assert.equal(auth?.caller.via, ERouteCallerVia.TICKET)
    assert.equal(auth?.caller.accessKey, KEY)
    assert.equal(auth?.path, '/u1/api?x=1')
})

test('🔴 the loopback ticket counts ONLY from a loopback address', async () => {
    const tickets = new RouteTickets()
    for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
        const auth = await authenticateRoute(TICKETED, '/loopback/u1', address, undefined, tickets, noKey)
        assert.deepEqual(auth, { caller: { via: ERouteCallerVia.LOOPBACK }, path: '/u1' }, address)
    }
    for (const address of ['10.0.0.5', '203.0.113.9', '', undefined])
        assert.equal(await authenticateRoute(TICKETED, '/loopback/u1', address, undefined, tickets, noKey), undefined, String(address))
})

test('an access key of this core in Authorization: the path goes untouched', async () => {
    const tickets = new RouteTickets()
    const auth = await authenticateRoute(TICKETED, '/link', '203.0.113.9', 'Bearer x', tickets, keyIs('Bearer x', OTHER))
    assert.equal(auth?.caller.via, ERouteCallerVia.ACCESS_KEY)
    assert.equal(auth?.caller.accessKey, OTHER)
    assert.equal(auth?.path, '/link')
    // a router that needs no ticket is used with a key, always
    assert.equal((await authenticateRoute(KEY_ONLY, '/u1', '203.0.113.9', 'Bearer x', tickets, keyIs('Bearer x', OTHER)))?.path, '/u1')
})

test('🔴 a ticketed request carrying the DESTINATION\'s key is still the ticket\'s session (the key passes through)', async () => {
    const tickets = new RouteTickets()
    const { routeTicket } = tickets.issue(KEY)
    const auth = await authenticateRoute(TICKETED, `/${routeTicket}/u1`, '203.0.113.9', 'Bearer of-cluster-B', tickets, noKey)
    assert.equal(auth?.caller.via, ERouteCallerVia.TICKET)
})

test('nothing valid is refused: no ticket, a bad ticket, a key of another core, a router without tickets and no key', async () => {
    const tickets = new RouteTickets()
    assert.equal(await authenticateRoute(TICKETED, '/u1', '203.0.113.9', undefined, tickets, noKey), undefined)
    assert.equal(await authenticateRoute(TICKETED, '/bad-ticket/u1', '203.0.113.9', 'Bearer of-B', tickets, noKey), undefined)
    assert.equal(await authenticateRoute(KEY_ONLY, '/u1', '127.0.0.1', undefined, tickets, noKey), undefined)
    // a router without tickets does not take the first segment as one, even 'loopback'
    assert.equal(await authenticateRoute(KEY_ONLY, '/loopback/u1', '127.0.0.1', undefined, tickets, noKey), undefined)
})

test('deleting a key closes the router WebSockets made with it, and only those', () => {
    const sockets = new RouteKeySockets()
    const closed: string[] = []
    const ws = (name: string) => {
        const listeners: (() => void)[] = []
        return { name, close: () => { closed.push(name); listeners.forEach(l => l()) }, addEventListener: (_e: string, l: () => void) => listeners.push(l) } as unknown as WebSocket
    }
    sockets.remember('k1', ws('a'))
    sockets.remember('k1', ws('b'))
    sockets.remember('k2', ws('c'))
    assert.equal(sockets.revoke('k1'), 2)
    assert.deepEqual(closed, ['a', 'b'])
    assert.equal(sockets.revoke('k1'), 0)
    assert.equal(sockets.revoke('nope'), 0)
})
