/*
    PROXIED clusters in the cluster list.

    An entry of the cluster list normally holds the cluster's REAL url and is reached directly. A proxied
    entry keeps that real url too — it is its identity, it is what the user sees and what gets exported —
    plus a ROUTE: how this core reaches it when there is no direct path. The route is never persisted as a
    url: it is RESOLVED in memory, every time it is used, into an endpoint of THIS core that an extension
    serves (its router, mounted at /channel/<routerAlias>).

    The core knows nothing about how the extension carries the traffic. It only knows which extension
    resolves the route (resolver) and which cluster it is aiming at (clusterUid), and it builds the url
    from the template the extension declares. Without an extension declaring that resolver, a proxied
    entry resolves to nothing — never silently to its real url, which is precisely the one that cannot be
    reached.
*/

// The route of a proxied cluster-list entry. Persisted with the entry, next to its real url.
export interface IClusterRoute {
    resolver: string        // id of the extension that resolves it (its routerAlias)
    clusterUid: string      // uid of the target cluster: typed in, since it cannot be discovered without the route
}

// What a channel declares (in its BackChannelData) to resolve cluster routes.
export interface IClusterRouteResolver {
    id: string              // = the routerAlias of the channel that resolves
    pathTemplate: string    // relative to its router, with the CLUSTER_ROUTE_UID_PLACEHOLDER, e.g. '/x/{clusterUid}'
    /*
        The template also carries CLUSTER_ROUTE_TICKET_PLACEHOLDER: the resolver wants to know WHO is using
        the route, and the url is the only thing every request and every WebSocket shares (a browser cannot
        add headers to a WebSocket, and a channel's extra sockets never pass through the core). The front
        gets the ticket by starting the resolver's channel on its own core with the session's credential;
        the channel sends an IClusterRouteTicket, and a fresh one before that one expires.
    */
    needsTicket?: boolean
}

export const CLUSTER_ROUTE_UID_PLACEHOLDER = '{clusterUid}'
export const CLUSTER_ROUTE_TICKET_PLACEHOLDER = '{routeTicket}'

/*
    The ticket the core's BACK puts in a url it dials over loopback (openRemoteChannel through a route): the
    back talks to itself, and nobody asks themselves for permission. A resolver must accept it ONLY from a
    loopback address — from anywhere else it is just a well-known string.
*/
export const CLUSTER_ROUTE_LOOPBACK_TICKET = 'loopback'

// What the resolver's channel sends (as the 'data' of an IInstanceMessage) each time it issues a ticket.
export interface IClusterRouteTicket {
    routeTicket: string
    expiresAt: number       // epoch ms
}

/*
    The url a proxied entry resolves to, or undefined when it cannot be resolved (no resolver with that id,
    an incomplete route, or a resolver that needs a ticket when there is none yet). 'baseUrl' is the url of
    THIS core as seen by whoever is going to use the result: the front's backend url, or the loopback url in
    the back. Pure: shared by the front and the back so that both resolve exactly the same.
*/
export const resolveClusterRouteUrl = (baseUrl: string, route: IClusterRoute | undefined, resolvers: IClusterRouteResolver[], ticket?: string): string | undefined => {
    if (!route || !route.resolver || !route.clusterUid) return undefined
    const resolver = resolvers.find(r => r.id === route.resolver)
    if (!resolver || !resolver.pathTemplate.includes(CLUSTER_ROUTE_UID_PLACEHOLDER)) return undefined
    if (resolver.needsTicket && (!ticket || !resolver.pathTemplate.includes(CLUSTER_ROUTE_TICKET_PLACEHOLDER))) return undefined
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
    let path = resolver.pathTemplate.startsWith('/') ? resolver.pathTemplate : '/' + resolver.pathTemplate
    path = path.split(CLUSTER_ROUTE_UID_PLACEHOLDER).join(encodeURIComponent(route.clusterUid))
    if (resolver.needsTicket) path = path.split(CLUSTER_ROUTE_TICKET_PLACEHOLDER).join(encodeURIComponent(ticket!))
    return `${base}/channel/${encodeURIComponent(resolver.id)}${path}`
}
