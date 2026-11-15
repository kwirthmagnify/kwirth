/*
    PROXIED clusters in the cluster list, and the ROUTERS that reach them.

    An entry of the cluster list normally holds the cluster's REAL url and is reached directly. A proxied
    entry keeps that real url too — it is its identity, it is what the user sees and what gets exported —
    plus a ROUTE: which router reaches it when there is no direct path. The route is never persisted as a
    url: it is RESOLVED in memory, every time it is used, into an endpoint of THIS core that the router
    serves: <rootPath>/router/<id>/...

    A router is an extension of its own type (EExtensionType.ROUTER; a plugin that is also one is a
    "pluter"). The core knows nothing about how it carries the traffic. It only knows which router resolves
    the route and which cluster it is aiming at (clusterUid), and it builds the url from the template the
    router declares. Without that router installed, a proxied entry resolves to nothing — never silently to
    its real url, which is precisely the one that cannot be reached.

    Plan: plans/router-extension/PRD.md.
*/

// The route of a proxied cluster-list entry. Persisted with the entry, next to its real url.
export interface IClusterRoute {
    resolver: string        // id of the ROUTER that resolves it (the field keeps its name: it is persisted)
    clusterUid: string      // uid of the target cluster: typed in, since it cannot be discovered without the route
}

// What a router declares about itself (IRouter.getRouterData), and what the core announces of each router installed.
export interface IRouterData {
    id: string              // the router's id: its traffic arrives at <rootPath>/router/<id>/...
    pathTemplate: string    // relative to <rootPath>/router/<id>, with CLUSTER_ROUTE_UID_PLACEHOLDER, e.g. '/{routeTicket}/{clusterUid}'
    /*
        The template carries CLUSTER_ROUTE_TICKET_PLACEHOLDER: the router wants to know WHO is using the
        route, and the url is the only thing every request and every WebSocket shares (a browser cannot add
        headers to a WebSocket). The CORE issues the ticket (POST /core/routes/ticket) and validates it before
        handing the traffic to the router, with who is calling (IRouteCaller).
    */
    needsTicket: boolean
}

export const CLUSTER_ROUTE_UID_PLACEHOLDER = '{clusterUid}'
export const CLUSTER_ROUTE_TICKET_PLACEHOLDER = '{routeTicket}'

// Where every router's traffic arrives, below the core's root path
export const ROUTER_PATH_SEGMENT = 'router'

/*
    The ticket the core's BACK puts in a url it dials over loopback (openRemoteChannel through a route): the
    back talks to itself, and nobody asks themselves for permission. The core accepts it ONLY from a
    loopback address — from anywhere else it is just a well-known string.
*/
export const CLUSTER_ROUTE_LOOPBACK_TICKET = 'loopback'

// What the core answers to POST /core/routes/ticket; the front asks for a fresh one before it expires.
export interface IClusterRouteTicket {
    routeTicket: string
    expiresAt: number       // epoch ms
}

/*
    The url a proxied entry resolves to, or undefined when it cannot be resolved (no router with that id,
    an incomplete route, or a router that needs a ticket when there is none yet). 'baseUrl' is the url of
    THIS core as seen by whoever is going to use the result: the front's backend url, or the loopback url in
    the back. Pure: shared by the front and the back so that both resolve exactly the same.
*/
export const resolveClusterRouteUrl = (baseUrl: string, route: IClusterRoute | undefined, routers: IRouterData[], ticket?: string): string | undefined => {
    if (!route || !route.resolver || !route.clusterUid) return undefined
    const router = routers.find(r => r.id === route.resolver)
    if (!router || !router.pathTemplate.includes(CLUSTER_ROUTE_UID_PLACEHOLDER)) return undefined
    if (router.needsTicket && (!ticket || !router.pathTemplate.includes(CLUSTER_ROUTE_TICKET_PLACEHOLDER))) return undefined
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
    let path = router.pathTemplate.startsWith('/') ? router.pathTemplate : '/' + router.pathTemplate
    path = path.split(CLUSTER_ROUTE_UID_PLACEHOLDER).join(encodeURIComponent(route.clusterUid))
    if (router.needsTicket) path = path.split(CLUSTER_ROUTE_TICKET_PLACEHOLDER).join(encodeURIComponent(ticket!))
    return `${base}/${ROUTER_PATH_SEGMENT}/${encodeURIComponent(router.id)}${path}`
}
