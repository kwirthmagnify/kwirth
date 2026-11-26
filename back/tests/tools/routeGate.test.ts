// The core's door to the routers (plans/router-extension, S3): route tickets, which path belongs to which
// router, and who is calling — decided before a router sees a byte.

import test from 'node:test'
import assert from 'node:assert/strict'
import { AccessKey, accessKeySerialize, IRouterData } from '@kwirthmagnify/kwirth-common'
import { ERouteCallerVia } from '@kwirthmagnify/kwirth-common-back'
import { RouteKeySockets, RouteTickets, authenticateRoute, routerPathOf } from '../../src/tools/RouteGate'

const KEY: AccessKey = { id: 'k1', type: 'permanent', resources: 'admin::::' } as AccessKey
const OTHER: AccessKey = { id: 'k2', type: 'permanent', resources: 'bridge$peer::::' } as AccessKey
const TICKETED: IRouterData = { id: 'bridge', pathTemplate: '/{routeTicket}/{clusterUid}', needsTicket: true }
const KEY_ONLY: IRouterData = { id: 'echo', pathTemplate: '/{clusterUid}', needsTicket: false }
const noKey = async () => undefined
const keyIs = (header: string, key: AccessKey) => async (authorization: string | undefined) => authorization === header ? key : undefined

const MASTER = 'the-masterkey-of-this-core'
// The keys that are valid here now, as keyOf resolves an Authorization header
const validKeys = (keys: AccessKey[]) => async (authorization: string | undefined) => keys.find(k => authorization === `Bearer ${accessKeySerialize(k)}`)
const issued = (tickets: RouteTickets, key: AccessKey, user?: string): string => tickets.issue(key, user)!.routeTicket

test('a ticket stands for its key until it expires; an unknown one for nobody', async () => {
    const clock = { t: 1_000 }
    const tickets = new RouteTickets(() => MASTER, () => clock.t, 60_000)
    const { routeTicket, expiresAt } = tickets.issue(KEY, 'admin')!
    assert.equal(expiresAt, 61_000)
    assert.ok(routeTicket.length >= 32, 'opaque and long')
    assert.deepEqual(await tickets.check(routeTicket, validKeys([KEY])), { via: ERouteCallerVia.TICKET, accessKey: KEY, user: 'admin' })
    assert.equal(await tickets.check('made-up', validKeys([KEY])), undefined)
    clock.t = 61_001
    assert.equal(await tickets.check(routeTicket, validKeys([KEY])), undefined, 'expired')
})

test('🔴 a ticket survives a restart of the core: another process with the same masterKey takes it (2026-11-26)', async () => {
    const ticket = issued(new RouteTickets(() => MASTER), KEY, 'admin')
    const afterRestart = new RouteTickets(() => MASTER)
    assert.deepEqual(await afterRestart.check(ticket, validKeys([KEY])), { via: ERouteCallerVia.TICKET, accessKey: KEY, user: 'admin' })
})

test('🔴 an access key never travels readable in a ticket (its id IS its secret)', () => {
    const ticket = issued(new RouteTickets(() => MASTER), KEY, 'admin')
    const raw = Buffer.from(ticket, 'base64url').toString('latin1')
    for (const secret of [KEY.id, accessKeySerialize(KEY), 'admin::::']) assert.equal(ticket.includes(secret) || raw.includes(secret), false, secret)
})

test('🔴 a ticket is refused when tampered with, made by another core, or its key is no longer valid', async () => {
    const tickets = new RouteTickets(() => MASTER)
    const ticket = issued(tickets, KEY)
    // a byte changed anywhere: the authentication tag says no
    const raw = Buffer.from(ticket, 'base64url')
    for (const at of [0, 14, raw.length - 1]) {
        const forged = Buffer.from(raw)
        forged[at] ^= 0x01
        assert.equal(await tickets.check(forged.toString('base64url'), validKeys([KEY])), undefined, `byte ${at}`)
    }
    assert.equal(await tickets.check(ticket.slice(0, 20), validKeys([KEY])), undefined, 'cut short')
    // another core (another masterKey) cannot read it
    assert.equal(await new RouteTickets(() => 'another-masterkey').check(ticket, validKeys([KEY])), undefined)
    // the key deleted: its tickets stop at once
    assert.equal(await tickets.check(ticket, validKeys([OTHER])), undefined)
})

test('each ticket is different; no masterKey yet (the core starting): no ticket is issued nor taken', async () => {
    const tickets = new RouteTickets(() => MASTER)
    assert.notEqual(issued(tickets, KEY), issued(tickets, KEY))
    const starting = new RouteTickets(() => undefined)
    assert.equal(starting.issue(KEY), undefined)
    assert.equal(await starting.check(issued(tickets, KEY), validKeys([KEY])), undefined)
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
    const tickets = new RouteTickets(() => MASTER)
    const routeTicket = issued(tickets, KEY)
    const auth = await authenticateRoute(TICKETED, `/${routeTicket}/u1/api?x=1`, '203.0.113.9', undefined, tickets, validKeys([KEY]))
    assert.equal(auth?.caller.via, ERouteCallerVia.TICKET)
    assert.deepEqual(auth?.caller.accessKey, KEY)
    assert.equal(auth?.path, '/u1/api?x=1')
})

test('🔴 the loopback ticket counts ONLY from a loopback address', async () => {
    const tickets = new RouteTickets(() => MASTER)
    for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
        const auth = await authenticateRoute(TICKETED, '/loopback/u1', address, undefined, tickets, noKey)
        assert.deepEqual(auth, { caller: { via: ERouteCallerVia.LOOPBACK }, path: '/u1' }, address)
    }
    for (const address of ['10.0.0.5', '203.0.113.9', '', undefined])
        assert.equal(await authenticateRoute(TICKETED, '/loopback/u1', address, undefined, tickets, noKey), undefined, String(address))
})

test('an access key of this core in Authorization: the path goes untouched', async () => {
    const tickets = new RouteTickets(() => MASTER)
    const auth = await authenticateRoute(TICKETED, '/link', '203.0.113.9', 'Bearer x', tickets, keyIs('Bearer x', OTHER))
    assert.equal(auth?.caller.via, ERouteCallerVia.ACCESS_KEY)
    assert.equal(auth?.caller.accessKey, OTHER)
    assert.equal(auth?.path, '/link')
    // a router that needs no ticket is used with a key, always
    assert.equal((await authenticateRoute(KEY_ONLY, '/u1', '203.0.113.9', 'Bearer x', tickets, keyIs('Bearer x', OTHER)))?.path, '/u1')
})

test('🔴 a ticketed request carrying the DESTINATION\'s key is still the ticket\'s session (the key passes through)', async () => {
    const tickets = new RouteTickets(() => MASTER)
    const routeTicket = issued(tickets, KEY)
    const auth = await authenticateRoute(TICKETED, `/${routeTicket}/u1`, '203.0.113.9', 'Bearer of-cluster-B', tickets, validKeys([KEY]))
    assert.equal(auth?.caller.via, ERouteCallerVia.TICKET)
})

test('nothing valid is refused: no ticket, a bad ticket, a key of another core, a router without tickets and no key', async () => {
    const tickets = new RouteTickets(() => MASTER)
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
