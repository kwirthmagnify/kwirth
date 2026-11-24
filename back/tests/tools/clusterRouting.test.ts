// PROXIED cluster-list entries, back side: how the endpoint handed to openRemoteChannel is resolved through
// the ROUTERS, and where a channel's own HTTP router is mounted. Without a route nothing changes — that is the
// first thing checked.

import test from 'node:test'
import assert from 'node:assert/strict'
import { BackChannelData, CLUSTER_ROUTE_LOOPBACK_TICKET, EChannelMode, IRouterData } from '@kwirthmagnify/kwirth-common'
import { ERemoteConnState, IChannel, IClusterEndpoint } from '@kwirthmagnify/kwirth-common-back'
import type { NextFunction, Request, Response, Router } from 'express'
import { announcedLocalChannelData, announcedRemoteChannelData, channelRouterOf, mountChannelRouter, mountedRouterAlias, resolveRemoteEndpoint, swapChannelRouter, unmountChannelRouters, unresolvableRemoteChannel } from '../../src/tools/ClusterRouting'

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

/*
    The channel router dispatcher: express cannot unmount a router, so a hot reload of a plugin left the OLD
    instance answering its paths (montag's agents kept posting to the dead channel). Each path is mounted once
    and dispatches to the router registered for it when the request arrives.
*/
type THandler = (req: Request, res: Response, next: NextFunction) => void

// a router that answers with its name: what it writes in res.answer
const fakeRouter = (name: string): Router => ((_req: Request, res: Response) => { Reflect.set(res, 'answer', name) }) as unknown as Router

// express, as far as this goes: the handlers mounted on each path, and a request served by the FIRST of them
const fakeHost = () => {
    const mounted = new Map<string, THandler[]>()
    return {
        mounted,
        use: (path: string, handler: THandler) => { mounted.set(path, [...(mounted.get(path) ?? []), handler]) },
        // who answered, or 'next' when the request went on (towards a 404)
        request: (path: string): string => {
            const res = {} as Response
            const first = mounted.get(path)?.[0]
            // nothing mounted on the path: express goes on, towards a 404
            if (!first) return 'next'
            let wentOn = false
            first({} as Request, res, () => { wentOn = true })
            return wentOn ? 'next' : String(Reflect.get(res, 'answer'))
        }
    }
}

test('a channel path is mounted ONCE, and a reload makes the NEW router answer it', () => {
    const host = fakeHost()
    assert.equal(mountChannelRouter(host, '/kwirth/channel/a1', 'a', fakeRouter('old')), false)
    assert.equal(host.request('/kwirth/channel/a1'), 'old')

    assert.equal(mountChannelRouter(host, '/kwirth/channel/a1', 'a', fakeRouter('new')), true, 'a reload replaces')
    assert.equal(host.mounted.get('/kwirth/channel/a1')?.length, 1, 'no second handler piled on the path')
    assert.equal(host.request('/kwirth/channel/a1'), 'new')
    unmountChannelRouters('a')
})

test('an uninstalled channel stops answering its paths; another channel keeps its own', () => {
    const host = fakeHost()
    mountChannelRouter(host, '/kwirth/channel/b1', 'b', fakeRouter('b'))
    mountChannelRouter(host, '/kwirth/x/channel/b/ep', 'b', fakeRouter('b-endpoint'))
    mountChannelRouter(host, '/kwirth/channel/c1', 'c', fakeRouter('c'))

    unmountChannelRouters('b')
    assert.equal(host.request('/kwirth/channel/b1'), 'next', 'goes on to the 404')
    assert.equal(host.request('/kwirth/x/channel/b/ep'), 'next')
    assert.equal(host.request('/kwirth/channel/c1'), 'c')

    // installed again, the same path answers without mounting a second dispatcher
    assert.equal(mountChannelRouter(host, '/kwirth/channel/b1', 'b', fakeRouter('b2')), false)
    assert.equal(host.mounted.get('/kwirth/channel/b1')?.length, 1)
    assert.equal(host.request('/kwirth/channel/b1'), 'b2')
    unmountChannelRouters('b')
    unmountChannelRouters('c')
})

test('the dev reload swaps the router of a path mounted at boot, and never mounts one by itself', () => {
    const host = fakeHost()
    mountChannelRouter(host, '/kwirth/channel/d1', 'd', fakeRouter('boot'))
    assert.equal(swapChannelRouter('/kwirth/channel/d1', 'd', fakeRouter('reloaded')), true)
    assert.equal(host.request('/kwirth/channel/d1'), 'reloaded')
    assert.equal(host.mounted.get('/kwirth/channel/d1')?.length, 1)

    // a path nobody mounted: nothing to swap, and nothing changes
    assert.equal(swapChannelRouter('/kwirth/channel/never', 'e', fakeRouter('e')), false)
    assert.equal(host.request('/kwirth/channel/never'), 'next')
    unmountChannelRouters('d')
})
