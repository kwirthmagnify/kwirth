import { BackChannelData, CLUSTER_ROUTE_LOOPBACK_TICKET, EChannelMode, IClusterRouteResolver, resolveClusterRouteUrl } from '@kwirthmagnify/kwirth-common'
import { ERemoteConnState, IChannel, IClusterEndpoint, IRemoteChannelHandle, IRemoteChannelHandlers } from '@kwirthmagnify/kwirth-common-back'
import { Router } from 'express'

/*
    PROXIED cluster-list entries, back side (see ClusterRoute in common).

    Two jobs: deciding which channels may announce themselves as resolvers, and resolving the endpoint a
    plugin hands to openRemoteChannel. An entry without a route never enters any of this: the endpoint
    goes through untouched, exactly as before proxied entries existed.
*/

/*
    The resolver a channel may announce, or undefined. A resolved url points at the channel's router, so a
    declaration is only honoured when that router is really mounted at /channel/<routerAlias> and the
    declared id IS that alias. Anything else would send the traffic to a path nobody serves.
*/
export const validClusterRouteResolver = (channelId: string, declared: IClusterRouteResolver | undefined, mountedAlias: string | undefined, logWarning?: (message: string) => void): IClusterRouteResolver | undefined => {
    if (!declared) return undefined
    if (!mountedAlias) {
        if (logWarning) logWarning(`Channel '${channelId}' declares a cluster route resolver but mounts no router with an alias: the resolver is ignored`)
        return undefined
    }
    if (declared.id !== mountedAlias) {
        if (logWarning) logWarning(`Channel '${channelId}' declares the cluster route resolver '${declared.id}' but its router alias is '${mountedAlias}': the resolver is ignored`)
        return undefined
    }
    return declared
}

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

// What the core announces for a channel hosted HERE: its data, with the resolver only if it is valid.
export const announcedLocalChannelData = (channel: IChannel, logWarning?: (message: string) => void): BackChannelData => {
    const data = channel.getChannelData()
    return { ...data, mode: EChannelMode.LOCAL, clusterRouteResolver: validClusterRouteResolver(data.id, data.clusterRouteResolver, mountedRouterAlias(channel), logWarning) }
}

// What the core announces for a channel hosted ELSEWHERE: never a resolver, its router is not mounted here.
export const announcedRemoteChannelData = (channel: IChannel): BackChannelData =>
    ({ ...channel.getChannelData(), mode: EChannelMode.REMOTE, clusterRouteResolver: undefined })

// The resolvers of THIS core: those of its LOCAL channels (a REMOTE channel's router is not mounted here).
export const clusterRouteResolversOf = (channels: BackChannelData[]): IClusterRouteResolver[] =>
    channels.filter(c => c.mode !== EChannelMode.REMOTE && c.clusterRouteResolver).map(c => c.clusterRouteResolver!)

/*
    The endpoint openRemoteChannel has to dial. Without a route, the same object. With a route, a copy whose
    url is the resolver's endpoint on THIS core, reached through 'loopbackBaseUrl' (the back talks to itself:
    it never goes out to its own public url, which some networks do not route back). Undefined when the route
    cannot be resolved — never the real url, which is precisely the one this core cannot reach.
*/
export const resolveRemoteEndpoint = (endpoint: IClusterEndpoint, loopbackBaseUrl: string, resolvers: IClusterRouteResolver[]): IClusterEndpoint | undefined => {
    if (!endpoint.route) return endpoint
    // Over loopback the back talks to itself: the resolver accepts this ticket only from a loopback address.
    const url = resolveClusterRouteUrl(loopbackBaseUrl, endpoint.route, resolvers, CLUSTER_ROUTE_LOOPBACK_TICKET)
    if (!url) return undefined
    return { ...endpoint, url }
}

/*
    The handle for an endpoint whose route cannot be resolved: it reports DOWN once and does nothing else (no
    retries: retrying would not make a missing resolver appear). DOWN is notified on the next tick, so the
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
