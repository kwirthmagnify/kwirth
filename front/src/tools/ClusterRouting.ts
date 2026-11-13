import { BackChannelData, IClusterRouteResolver, IClusterRouteTicket, resolveClusterRouteUrl } from '@kwirthmagnify/kwirth-common'
import { Cluster } from '../model/Cluster'

/*
    PROXIED cluster-list entries, front side (see ClusterRoute in common).

    🔴 'cluster.url' is ALWAYS the real url: it is what the cluster list persists, exports and shows. Anything
    that CONNECTS to a cluster uses clusterBaseUrl(cluster) instead, which for a proxied entry is the
    resolver's endpoint on the user's own core. Resolving into a separate value, and never into 'url', is
    what makes it impossible to save or export the resolved url by accident.

    The routing context — the url of the user's core and the resolvers it announces — is set once, when the
    home cluster is read at startup. A resolver that needs a ticket gets it later, from its channel
    (tools/RouteTickets): until it arrives, its entries WAIT — they are neither resolved nor reported as broken.
*/

let routingBaseUrl = ''
let routingResolvers: IClusterRouteResolver[] = []
const resolverChannels: Map<string, string> = new Map()      // resolver id → id of the channel that announces it
const routingTickets: Map<string, IClusterRouteTicket> = new Map()   // resolver id → its current ticket

/*
    Called when the home cluster's data is known: at startup, and again every time it is re-read (after a plugin
    loads or is reloaded, an extension that resolves routes may have come or gone). The back only announces
    valid resolvers of LOCAL channels.

    Returns whether the routing changed. The tickets of the resolvers that are still announced are KEPT: a
    re-read that changes nothing must not leave the proxied entries waiting for a ticket they already had.
*/
export const setClusterRouting = (baseUrl: string, homeChannels: BackChannelData[]): boolean => {
    const announcing = homeChannels.filter(c => c.clusterRouteResolver)
    const resolvers = announcing.map(c => c.clusterRouteResolver!)
    // what the routing depends on: the core's url, the resolvers, and which channel announces each one
    const before = JSON.stringify([routingBaseUrl, routingResolvers, routingResolvers.map(r => resolverChannels.get(r.id) ?? '')])
    const after = JSON.stringify([baseUrl, resolvers, announcing.map(c => c.id)])
    routingBaseUrl = baseUrl
    routingResolvers = resolvers
    resolverChannels.clear()
    for (const c of announcing) resolverChannels.set(c.clusterRouteResolver!.id, c.id)
    for (const resolverId of [...routingTickets.keys()]) {
        if (!resolvers.some(r => r.id === resolverId)) routingTickets.delete(resolverId)
    }
    return before !== after
}

export const clusterRouteResolvers = (): IClusterRouteResolver[] => routingResolvers

// The channel to start to get a resolver's tickets.
export const resolverChannelId = (resolverId: string): string | undefined => resolverChannels.get(resolverId)

export const setRouteTicket = (resolverId: string, ticket: IClusterRouteTicket): void => { routingTickets.set(resolverId, ticket) }

// The resolver's ticket while it is still valid: an expired one is as good as none.
const currentTicket = (resolverId: string): string | undefined => {
    const ticket = routingTickets.get(resolverId)
    return ticket && ticket.expiresAt > Date.now() ? ticket.routeTicket : undefined
}

// The url to connect to, or undefined when the entry has a route nobody resolves (or its ticket has not come).
export const resolvedClusterUrl = (cluster: Cluster): string | undefined => {
    if (!cluster.route) return cluster.url
    return resolveClusterRouteUrl(routingBaseUrl, cluster.route, routingResolvers, currentTicket(cluster.route.resolver))
}

// A proxied entry whose resolver is installed and needs a ticket that has not arrived yet: it has to wait.
export const routeAwaitsTicket = (cluster: Cluster): boolean => {
    if (!cluster.route) return false
    const resolver = routingResolvers.find(r => r.id === cluster.route!.resolver)
    return Boolean(resolver?.needsTicket) && !currentTicket(resolver!.id)
}

/*
    Where a proxied entry with an unresolvable route points: a url no browser api accepts, so every fetch
    and every WebSocket on it FAILS, loudly. Never the real url — that is precisely the one that cannot be
    reached — and never '' — a relative url would quietly hit the user's own core and show ITS data.
*/
const UNRESOLVED_ROUTE_URL_PREFIX = 'kwirth-unresolved-route://'

// The url to connect to. Always a string, for the call sites that cannot do anything else with a cluster.
export const clusterBaseUrl = (cluster: Cluster): string =>
    resolvedClusterUrl(cluster) ?? `${UNRESOLVED_ROUTE_URL_PREFIX}${encodeURIComponent(cluster.route?.resolver ?? '')}`

// Why a proxied entry cannot be used, for the user.
export const unresolvedRouteMessage = (cluster: Cluster): string =>
    routeAwaitsTicket(cluster)
        ? `Cluster '${cluster.name}' is reached through the route '${cluster.route?.resolver}', and your Kwirth has not authorized you to use it (yet)`
        : `Cluster '${cluster.name}' is reached through the route '${cluster.route?.resolver}', and no extension installed in your Kwirth resolves it`
