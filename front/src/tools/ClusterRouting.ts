import { IClusterRouteTicket, IRouterData, resolveClusterRouteUrl } from '@kwirthmagnify/kwirth-common'
import { Cluster } from '../model/Cluster'

/*
    PROXIED cluster-list entries, front side (see ClusterRoute in common), resolved through the ROUTERS of
    the user's own core (plans/router-extension).

    🔴 'cluster.url' is ALWAYS the real url: it is what the cluster list persists, exports and shows. Anything
    that CONNECTS to a cluster uses clusterBaseUrl(cluster) instead, which for a proxied entry is the
    router's endpoint on the user's own core. Resolving into a separate value, and never into 'url', is
    what makes it impossible to save or export the resolved url by accident.

    The routing context — the url of the user's core and the routers it announces (KwirthData.routers) — is
    set when the home cluster is read. The route ticket is ONE per session, issued by the core
    (tools/RouteTickets): until it arrives, the entries of a router that needs it WAIT — they are neither
    resolved nor reported as broken.
*/

let routingBaseUrl = ''
let routingRouters: IRouterData[] = []
let routingTicket: IClusterRouteTicket | undefined

/*
    Called when the home cluster's data is known: at startup, and again every time it is re-read (a router may
    have been installed or removed since). Returns whether the routing changed. The ticket is KEPT: it is the
    session's, not a router's.
*/
export const setClusterRouting = (baseUrl: string, routers: IRouterData[] | undefined): boolean => {
    const next = routers ?? []
    const changed = JSON.stringify([routingBaseUrl, routingRouters]) !== JSON.stringify([baseUrl, next])
    if (baseUrl !== routingBaseUrl) routingTicket = undefined
    routingBaseUrl = baseUrl
    routingRouters = next
    return changed
}

export const clusterRouters = (): IRouterData[] => routingRouters

// Whether any router of this core needs the session's ticket
export const routersNeedTicket = (): boolean => routingRouters.some(r => r.needsTicket)

export const setRouteTicket = (ticket: IClusterRouteTicket | undefined): void => { routingTicket = ticket }

// The session's ticket while it is still valid: an expired one is as good as none.
const currentTicket = (): string | undefined =>
    routingTicket && routingTicket.expiresAt > Date.now() ? routingTicket.routeTicket : undefined

// The url to connect to, or undefined when the entry has a route no router resolves (or the ticket has not come).
export const resolvedClusterUrl = (cluster: Cluster): string | undefined => {
    if (!cluster.route) return cluster.url
    return resolveClusterRouteUrl(routingBaseUrl, cluster.route, routingRouters, currentTicket())
}

// A proxied entry whose router is installed and needs the ticket, which has not arrived yet: it has to wait.
export const routeAwaitsTicket = (cluster: Cluster): boolean => {
    if (!cluster.route) return false
    const router = routingRouters.find(r => r.id === cluster.route!.resolver)
    return Boolean(router?.needsTicket) && !currentTicket()
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

/*
    channelObject.clusterUrl, LIVE. It used to be the string clusterBaseUrl gave when the tab was created, and for
    a proxied entry that string carries the session's route ticket of THAT moment, which expires in 10 minutes:
    whatever a tab opened later through it (a second shell in Ops, a window in Magnify, a dialog's fetch, the
    reconnection of the tab's own socket) was refused with 4401. Read now, it carries the ticket the front holds
    NOW (renewed in the background), so every plugin gets a working url without changing a line. For an entry
    without a route it is exactly the url it always was.
    A value written to it is kept (pinned) instead of failing: nothing in the core writes it but this.
*/
export const bindClusterUrl = (target: { clusterUrl?: string }, cluster: Cluster): void => {
    let pinned: string | undefined
    Object.defineProperty(target, 'clusterUrl', {
        configurable: true,
        enumerable: true,
        get: () => pinned ?? clusterBaseUrl(cluster),
        set: (value: string | undefined) => { pinned = value }
    })
}

// Why a proxied entry cannot be used, for the user.
export const unresolvedRouteMessage = (cluster: Cluster): string =>
    routeAwaitsTicket(cluster)
        ? `Cluster '${cluster.name}' is reached through the router '${cluster.route?.resolver}', and your Kwirth has not given you a route ticket (yet)`
        : `Cluster '${cluster.name}' is reached through the router '${cluster.route?.resolver}', which is not installed or not started in your Kwirth`
