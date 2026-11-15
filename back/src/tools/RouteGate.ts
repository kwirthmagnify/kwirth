import { randomBytes } from 'crypto'
import { AccessKey, CLUSTER_ROUTE_LOOPBACK_TICKET, CLUSTER_ROUTE_TICKET_PLACEHOLDER, IClusterRouteTicket, IRouterData, ROUTER_PATH_SEGMENT } from '@kwirthmagnify/kwirth-common'
import { ERouteCallerVia, IRouteCaller } from '@kwirthmagnify/kwirth-common-back'

/*
    The core's door to the routers (plan: plans/router-extension/PLAN.md, S3): who may use a route, decided
    BEFORE a router sees a byte. Authentication is the core's; what the caller may do through the route is
    the router's to decide (it gets IRouteCaller).

    Three ways in, tried in this order:
      1. a ROUTE TICKET as the first path segment below /router/<id>/ — a browser, which cannot put headers
         on a WebSocket. The core issued it (POST /core/routes/ticket) to a session; it is stripped before
         the router sees the path.
      2. the literal 'loopback' ticket, ONLY from a loopback address — this core's own back dialling itself
         through the route (openRemoteChannel).
      3. an ACCESS KEY of this core in the Authorization header — another core's back, a script.
    A request with none of them is refused. An Authorization header with a key that is NOT this core's is
    not an error by itself: a request through a route carries the destination's key, untouched.

    Tickets are opaque and live in memory: a credential in a URL must not BE the credential (urls end up in
    logs), and one replica is what serves a session.
*/

export const ROUTE_TICKET_TTL_MS = 10 * 60_000

interface ITicketEntry {
    caller: IRouteCaller
    expiresAt: number
}

export class RouteTickets {
    private tickets = new Map<string, ITicketEntry>()

    constructor(private now: () => number = Date.now, private ttlMs = ROUTE_TICKET_TTL_MS) {}

    issue(accessKey: AccessKey, user?: string): IClusterRouteTicket {
        this.purge()
        const routeTicket = randomBytes(24).toString('base64url')
        const expiresAt = this.now() + this.ttlMs
        this.tickets.set(routeTicket, { caller: { via: ERouteCallerVia.TICKET, accessKey, ...(user ? { user } : {}) }, expiresAt })
        return { routeTicket, expiresAt }
    }

    // The caller a ticket stands for, or undefined (unknown or expired)
    check(routeTicket: string): IRouteCaller | undefined {
        const entry = this.tickets.get(routeTicket)
        if (!entry) return undefined
        if (entry.expiresAt < this.now()) {
            this.tickets.delete(routeTicket)
            return undefined
        }
        return entry.caller
    }

    // The tickets of a deleted key go with it
    revokeKey(keyId: string): void {
        for (const [ticket, entry] of this.tickets) if (entry.caller.accessKey?.id === keyId) this.tickets.delete(ticket)
    }

    private purge(): void {
        const now = this.now()
        for (const [ticket, entry] of this.tickets) if (entry.expiresAt < now) this.tickets.delete(ticket)
    }
}

// A request under <rootPath>/router/<id>/...: the router's id and what comes after (path and query)
export interface IRouterPath {
    id: string
    rest: string                // '/a/b?c=1' — always starts with '/'
}

export const routerPathOf = (url: string | undefined, rootPath: string): IRouterPath | undefined => {
    if (!url) return undefined
    const root = rootPath.endsWith('/') ? rootPath.slice(0, -1) : rootPath
    const prefix = `${root}/${ROUTER_PATH_SEGMENT}/`
    if (!url.startsWith(prefix)) return undefined
    const tail = url.slice(prefix.length)
    const cut = tail.search(/[/?#]/)
    const rawId = cut < 0 ? tail : tail.slice(0, cut)
    if (!rawId) return undefined
    let id: string
    try { id = decodeURIComponent(rawId) } catch { return undefined }
    const after = cut < 0 ? '' : tail.slice(cut)
    return { id, rest: after.startsWith('/') ? after : `/${after}` }
}

// The first path segment of 'rest' and what follows it ('/t1/x?y' → ['t1', '/x?y'])
const firstSegment = (rest: string): [string, string] => {
    const tail = rest.slice(1)
    const cut = tail.search(/[/?#]/)
    const segment = cut < 0 ? tail : tail.slice(0, cut)
    const after = cut < 0 ? '' : tail.slice(cut)
    let decoded = segment
    try { decoded = decodeURIComponent(segment) } catch { /* left as it came */ }
    return [decoded, after.startsWith('/') || after === '' ? (after || '/') : `/${after}`]
}

const LOOPBACK = /^(127\.\d+\.\d+\.\d+|::1|::ffff:127\.\d+\.\d+\.\d+)$/

export interface IRouteAuthentication {
    caller: IRouteCaller
    path: string                // what the router sees: the path below /router/<id>, the ticket removed
}

/*
    Who is calling, or undefined (refuse it). 'remoteAddress' is the socket's own (never X-Forwarded-For:
    loopback means THIS machine). 'keyOf' resolves an Authorization header to a valid key of this core.
*/
export const authenticateRoute = async (router: IRouterData, rest: string, remoteAddress: string | undefined, authorization: string | undefined, tickets: RouteTickets, keyOf: (authorization: string | undefined) => Promise<AccessKey | undefined>): Promise<IRouteAuthentication | undefined> => {
    if (router.needsTicket && router.pathTemplate.includes(CLUSTER_ROUTE_TICKET_PLACEHOLDER)) {
        const [segment, after] = firstSegment(rest)
        if (segment === CLUSTER_ROUTE_LOOPBACK_TICKET) {
            return LOOPBACK.test(remoteAddress ?? '') ? { caller: { via: ERouteCallerVia.LOOPBACK }, path: after } : undefined
        }
        const caller = segment ? tickets.check(segment) : undefined
        if (caller) return { caller, path: after }
    }
    const accessKey = await keyOf(authorization)
    if (accessKey) return { caller: { via: ERouteCallerVia.ACCESS_KEY, accessKey }, path: rest }
    return undefined
}

/*
    The WebSockets a router took with an ACCESS KEY, by key id: deleting the key cuts them at once, as it
    cuts the channel instances started with it (K1).
*/
export class RouteKeySockets {
    private byKey = new Map<string, Set<WebSocket>>()

    remember(keyId: string, webSocket: WebSocket): void {
        let set = this.byKey.get(keyId)
        if (!set) this.byKey.set(keyId, set = new Set())
        set.add(webSocket)
        webSocket.addEventListener('close', () => {
            set!.delete(webSocket)
            if (set!.size === 0 && this.byKey.get(keyId) === set) this.byKey.delete(keyId)
        })
    }

    // How many were cut
    revoke(keyId: string): number {
        const set = this.byKey.get(keyId)
        if (!set) return 0
        this.byKey.delete(keyId)
        // copied first: closing one fires its 'close', which takes it out of the set
        const sockets = [...set]
        for (const webSocket of sockets) {
            try { webSocket.close(4401, 'access key revoked') } catch { /* already gone */ }
        }
        return sockets.length
    }
}
