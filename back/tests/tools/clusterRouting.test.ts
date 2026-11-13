// PROXIED cluster-list entries, back side: which channels may announce a resolver, and how the endpoint
// handed to openRemoteChannel is resolved. Without a route nothing changes — that is the first thing checked.

import test from 'node:test'
import assert from 'node:assert/strict'
import { BackChannelData, CLUSTER_ROUTE_LOOPBACK_TICKET, EChannelMode, IClusterRouteResolver } from '@kwirthmagnify/kwirth-common'
import { ERemoteConnState, IChannel, IClusterEndpoint } from '@kwirthmagnify/kwirth-common-back'
import { announcedLocalChannelData, announcedRemoteChannelData, channelRouterOf, clusterRouteResolversOf, mountedRouterAlias, resolveRemoteEndpoint, unresolvableRemoteChannel, validClusterRouteResolver } from '../../src/tools/ClusterRouting'

const LOOPBACK = 'http://localhost:3883/kwirth'
const RESOLVER: IClusterRouteResolver = { id: 'relay', pathTemplate: '/to/{clusterUid}' }

const channelData = (id: string, resolver?: IClusterRouteResolver, mode?: EChannelMode): BackChannelData => ({
    id, routable: false, pauseable: false, modifiable: false, reconnectable: false, sources: [], metrics: false,
    endpoints: [], websocket: false, cluster: false, resourced: false, mode, clusterRouteResolver: resolver
})

// Only what ClusterRouting reads from a channel: getChannelData and the router members.
const fakeChannel = (data: BackChannelData, router: { providesRouter?: boolean, router?: object, routerAlias?: string }): IChannel =>
    ({ getChannelData: () => data, ...router }) as unknown as IChannel

test('an endpoint WITHOUT a route goes through untouched (the very same object)', () => {
    const endpoint: IClusterEndpoint = { name: 'c1', url: 'https://c1.acme', accessString: 'k' }
    assert.equal(resolveRemoteEndpoint(endpoint, LOOPBACK, [RESOLVER]), endpoint)
    assert.equal(resolveRemoteEndpoint(endpoint, LOOPBACK, []), endpoint)
})

test('an endpoint WITH a route is dialled through the resolver on the loopback, the real url is not mutated', () => {
    const endpoint: IClusterEndpoint = { name: 'c2', url: 'https://c2.private', accessString: 'k', route: { resolver: 'relay', clusterUid: 'u2' } }
    const resolved = resolveRemoteEndpoint(endpoint, LOOPBACK, [RESOLVER])
    assert.equal(resolved?.url, 'http://localhost:3883/kwirth/channel/relay/to/u2')
    assert.equal(resolved?.accessString, 'k')
    assert.equal(endpoint.url, 'https://c2.private')
})

test('through a resolver that needs a ticket, the back dials with the LOOPBACK ticket', () => {
    const endpoint: IClusterEndpoint = { name: 'c4', url: 'https://c4.private', accessString: 'k', route: { resolver: 'relay', clusterUid: 'u4' } }
    const resolved = resolveRemoteEndpoint(endpoint, LOOPBACK, [{ id: 'relay', pathTemplate: '/{routeTicket}/to/{clusterUid}', needsTicket: true }])
    assert.equal(resolved?.url, `http://localhost:3883/kwirth/channel/relay/${CLUSTER_ROUTE_LOOPBACK_TICKET}/to/u4`)
})

test('a route nobody resolves gives no endpoint — never the unreachable real url', () => {
    const endpoint: IClusterEndpoint = { name: 'c3', url: 'https://c3.private', accessString: 'k', route: { resolver: 'missing', clusterUid: 'u3' } }
    assert.equal(resolveRemoteEndpoint(endpoint, LOOPBACK, [RESOLVER]), undefined)
    assert.equal(resolveRemoteEndpoint(endpoint, LOOPBACK, []), undefined)
})

test('a declared resolver is honoured only when its id is the mounted router alias', () => {
    const warnings: string[] = []
    const warn = (m: string) => warnings.push(m)
    assert.deepEqual(validClusterRouteResolver('ch', RESOLVER, 'relay', warn), RESOLVER)
    assert.equal(validClusterRouteResolver('ch', RESOLVER, 'other', warn), undefined)
    assert.equal(validClusterRouteResolver('ch', RESOLVER, undefined, warn), undefined)
    assert.equal(warnings.length, 2)
    assert.equal(validClusterRouteResolver('ch', undefined, 'relay', warn), undefined)
    assert.equal(warnings.length, 2, 'not declaring one is not worth a warning')
})

test('the router alias counts only when the core would mount it (providesRouter + router + alias)', () => {
    assert.equal(mountedRouterAlias({ providesRouter: true, router: {}, routerAlias: 'relay' }), 'relay')
    assert.equal(mountedRouterAlias({ providesRouter: false, router: {}, routerAlias: 'relay' }), undefined)
    assert.equal(mountedRouterAlias({ providesRouter: true, routerAlias: 'relay' }), undefined)
    assert.equal(mountedRouterAlias({ providesRouter: true, router: {}, routerAlias: '' }), undefined)
    assert.equal(mountedRouterAlias({ providesRouter: true, router: {} }), undefined)
})

test('the router to mount: only with providesRouter AND a router, alias or not', () => {
    const router = {}
    assert.equal(channelRouterOf({ providesRouter: true, router, routerAlias: 'relay' }), router)
    assert.equal(channelRouterOf({ providesRouter: true, router }), router, 'without alias it is still mounted (per-boot path)')
    assert.equal(channelRouterOf({ providesRouter: false, router }), undefined)
    assert.equal(channelRouterOf({ providesRouter: true }), undefined)
    assert.equal(channelRouterOf({}), undefined)
})

test('a LOCAL announcement keeps a valid resolver and drops an invalid one; the rest of the data is intact', () => {
    const good = announcedLocalChannelData(fakeChannel(channelData('a', RESOLVER), { providesRouter: true, router: {}, routerAlias: 'relay' }))
    assert.equal(good.mode, EChannelMode.LOCAL)
    assert.deepEqual(good.clusterRouteResolver, RESOLVER)
    const bad = announcedLocalChannelData(fakeChannel(channelData('b', RESOLVER), { providesRouter: false }))
    assert.equal(bad.clusterRouteResolver, undefined)
    assert.equal(bad.id, 'b')
    const none = announcedLocalChannelData(fakeChannel(channelData('c'), {}))
    assert.equal(none.clusterRouteResolver, undefined)
    assert.equal(none.mode, EChannelMode.LOCAL)
})

test('a REMOTE announcement never carries a resolver (its router is not mounted here)', () => {
    const remote = announcedRemoteChannelData(fakeChannel(channelData('a', RESOLVER), { providesRouter: true, router: {}, routerAlias: 'relay' }))
    assert.equal(remote.mode, EChannelMode.REMOTE)
    assert.equal(remote.clusterRouteResolver, undefined)
})

test('the resolvers of this core are those of its LOCAL channels', () => {
    const other: IClusterRouteResolver = { id: 'other', pathTemplate: '/{clusterUid}' }
    const channels = [channelData('a', RESOLVER, EChannelMode.LOCAL), channelData('b', other, EChannelMode.REMOTE), channelData('c')]
    assert.deepEqual(clusterRouteResolversOf(channels), [RESOLVER])
})

test('an unresolvable remote channel reports DOWN once, after the handle is returned, and close() silences it', async () => {
    const states: ERemoteConnState[] = []
    const handle = unresolvableRemoteChannel({ onMessage: () => {}, onState: (s) => states.push(s) })
    assert.deepEqual(states, [], 'not synchronously: the consumer must hold the handle first')
    await new Promise(r => setImmediate(r))
    assert.deepEqual(states, [ERemoteConnState.DOWN])
    handle.send({} as never)

    const silenced: ERemoteConnState[] = []
    unresolvableRemoteChannel({ onMessage: () => {}, onState: (s) => silenced.push(s) }).close()
    await new Promise(r => setImmediate(r))
    assert.deepEqual(silenced, [])
})
