// PROXIED cluster-list entries, back side: how the endpoint handed to openRemoteChannel is resolved through
// the ROUTERS, and where a channel's own HTTP router is mounted. Without a route nothing changes — that is the
// first thing checked.

import test from 'node:test'
import assert from 'node:assert/strict'
import { BackChannelData, CLUSTER_ROUTE_LOOPBACK_TICKET, EChannelMode, IRouterData } from '@kwirthmagnify/kwirth-common'
import { ERemoteConnState, IChannel, IClusterEndpoint } from '@kwirthmagnify/kwirth-common-back'
import { announcedLocalChannelData, announcedRemoteChannelData, channelRouterOf, mountedRouterAlias, resolveRemoteEndpoint, unresolvableRemoteChannel } from '../../src/tools/ClusterRouting'

const LOOPBACK = 'http://localhost:3883/kwirth'
const ROUTER: IRouterData = { id: 'relay', pathTemplate: '/to/{clusterUid}', needsTicket: false }

const channelData = (id: string, mode?: EChannelMode): BackChannelData => ({
    id, routable: false, pauseable: false, modifiable: false, reconnectable: false, sources: [], metrics: false,
    endpoints: [], websocket: false, cluster: false, resourced: false, mode
})

const fakeChannel = (data: BackChannelData): IChannel => ({ getChannelData: () => data }) as unknown as IChannel

test('an endpoint WITHOUT a route goes through untouched (the very same object)', () => {
    const endpoint: IClusterEndpoint = { name: 'c1', url: 'https://c1.acme', accessString: 'k' }
    assert.equal(resolveRemoteEndpoint(endpoint, LOOPBACK, [ROUTER]), endpoint)
    assert.equal(resolveRemoteEndpoint(endpoint, LOOPBACK, []), endpoint)
})

test('an endpoint WITH a route is dialled through its router on the loopback; the real url is not mutated', () => {
    const endpoint: IClusterEndpoint = { name: 'c2', url: 'https://c2.private', accessString: 'k', route: { resolver: 'relay', clusterUid: 'u2' } }
    const resolved = resolveRemoteEndpoint(endpoint, LOOPBACK, [ROUTER])
    assert.equal(resolved?.url, 'http://localhost:3883/kwirth/router/relay/to/u2')
    assert.equal(resolved?.accessString, 'k')
    assert.equal(endpoint.url, 'https://c2.private')
})

test('through a router that needs a ticket, the back dials with the LOOPBACK ticket', () => {
    const endpoint: IClusterEndpoint = { name: 'c4', url: 'https://c4.private', accessString: 'k', route: { resolver: 'relay', clusterUid: 'u4' } }
    const resolved = resolveRemoteEndpoint(endpoint, LOOPBACK, [{ id: 'relay', pathTemplate: '/{routeTicket}/to/{clusterUid}', needsTicket: true }])
    assert.equal(resolved?.url, `http://localhost:3883/kwirth/router/relay/${CLUSTER_ROUTE_LOOPBACK_TICKET}/to/u4`)
})

test('a route whose router is not up gives no endpoint — never the unreachable real url', () => {
    const endpoint: IClusterEndpoint = { name: 'c3', url: 'https://c3.private', accessString: 'k', route: { resolver: 'missing', clusterUid: 'u3' } }
    assert.equal(resolveRemoteEndpoint(endpoint, LOOPBACK, [ROUTER]), undefined)
    assert.equal(resolveRemoteEndpoint(endpoint, LOOPBACK, []), undefined)
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

test('a channel is announced LOCAL or REMOTE, the rest of its data intact', () => {
    const local = announcedLocalChannelData(fakeChannel(channelData('a')))
    assert.equal(local.mode, EChannelMode.LOCAL)
    assert.equal(local.id, 'a')
    assert.equal(announcedRemoteChannelData(fakeChannel(channelData('b'))).mode, EChannelMode.REMOTE)
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
