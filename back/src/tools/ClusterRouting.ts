import { BackChannelData, CLUSTER_ROUTE_LOOPBACK_TICKET, EChannelMode, IRouterData, resolveClusterRouteUrl } from '@kwirthmagnify/kwirth-common'
import { ERemoteConnState, IChannel, IClusterEndpoint, IRemoteChannelHandle, IRemoteChannelHandlers } from '@kwirthmagnify/kwirth-common-back'
import { Router } from 'express'

/*
    Two unrelated jobs that used to share this file:

      · where a channel's own HTTP router is mounted (providesRouter + routerAlias: a STABLE url for a
        channel, e.g. montag's). That stays here.
      · PROXIED cluster-list entries: resolving the endpoint a plugin hands to openRemoteChannel. Since
        plans/router-extension it resolves against the ROUTERS (RouterManager), not against channels. An
        entry without a route never enters any of this: the endpoint goes through untouched.
*/

/*
    A channel's HTTP router, or undefined when it mounts none (providesRouter + router). Read without widening
    the channel's type: those members are not part of IChannel. THE condition the core mounts routers by —
    every place that mounts one, or asks where it is, goes through here.
*/
export const channelRouterOf = (channel: object): Router | undefined =>
    Reflect.get(channel, 'providesRouter') === true ? (Reflect.get(channel, 'router') as Router | undefined) || undefined : undefined

/*
    The alias a channel's router is mounted at (<rootPath>/channel/<alias>), or undefined when it mounts none,
    or mounts it without an alias (then it goes under the per-boot <rootPath>/<ri.id>/channel/<id>).
*/
export const mountedRouterAlias = (channel: object): string | undefined => {
    const alias = Reflect.get(channel, 'routerAlias')
    return channelRouterOf(channel) && typeof alias === 'string' && alias !== '' ? alias : undefined
}

// What the core announces for a channel hosted HERE
export const announcedLocalChannelData = (channel: IChannel): BackChannelData =>
    ({ ...channel.getChannelData(), mode: EChannelMode.LOCAL })

// What the core announces for a channel hosted ELSEWHERE
export const announcedRemoteChannelData = (channel: IChannel): BackChannelData =>
    ({ ...channel.getChannelData(), mode: EChannelMode.REMOTE })

/*
    The endpoint openRemoteChannel has to dial. Without a route, the same object. With a route, a copy whose
    url is the router's endpoint on THIS core, reached through 'loopbackBaseUrl' (the back talks to itself:
    it never goes out to its own public url, which some networks do not route back). Undefined when the route
    cannot be resolved — never the real url, which is precisely the one this core cannot reach.
*/
export const resolveRemoteEndpoint = (endpoint: IClusterEndpoint, loopbackBaseUrl: string, routers: IRouterData[]): IClusterEndpoint | undefined => {
    if (!endpoint.route) return endpoint
    // Over loopback the back talks to itself: the core accepts this ticket only from a loopback address.
    const url = resolveClusterRouteUrl(loopbackBaseUrl, endpoint.route, routers, CLUSTER_ROUTE_LOOPBACK_TICKET)
    if (!url) return undefined
    return { ...endpoint, url }
}

/*
    The handle for an endpoint whose route cannot be resolved: it reports DOWN once and does nothing else (no
    retries: retrying would not make a missing router appear). DOWN is notified on the next tick, so the
    consumer already holds the handle when its onState runs — the same order as a real connection.
*/
export const unresolvableRemoteChannel = (handlers: IRemoteChannelHandlers): IRemoteChannelHandle => {
    let closed = false
    queueMicrotask(() => {
        if (closed) return
        try { handlers.onState(ERemoteConnState.DOWN) }
        catch { /* the consumer's problem: the core keeps running */ }
    })
    return {
        send: () => { /* nothing to send to */ },
        close: () => { closed = true }
    }
}
