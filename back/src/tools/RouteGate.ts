import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { AccessKey, accessKeySerialize, CLUSTER_ROUTE_LOOPBACK_TICKET, CLUSTER_ROUTE_TICKET_PLACEHOLDER, IClusterRouteTicket, IRouterData, ROUTER_PATH_SEGMENT } from '@kwirthmagnify/kwirth-common'
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

    A ticket CARRIES who it stands for and until when, ENCRYPTED and authenticated (AES-256-GCM) with a key
    derived from the core's masterKey — persisted, the same after a restart and on every replica. They used
    to live only in this process's memory: a restart of the core forgot every ticket while the fronts kept
    sending theirs, still valid for them, and every route answered 401/4401 until each front renewed it, up
    to 9 minutes later (2026-11-26). Encrypted, not only signed: an access key's id IS its secret, so it
    cannot travel readable in a URL (urls end up in logs) — a ticket is never the credential itself, and it
    expires in ROUTE_TICKET_TTL_MS.
    Its key is checked on EVERY use ('keyOf', the same check as an Authorization header): a deleted key
    stops its tickets at once, as when they were kept here and deleted with it.
*/

export const ROUTE_TICKET_TTL_MS = 10 * 60_000

const TICKET_IV_BYTES = 12
const TICKET_TAG_BYTES = 16

// The cipher key of the tickets: derived from the masterKey, never the masterKey itself
const ticketKeyOf = (secret: string): Buffer => createHash('sha256').update(`kwirth-route-ticket\0${secret}`).digest()

export class RouteTickets {
    // secret: the core's masterKey, undefined while there is none yet (no running instance); now, ttlMs: the tests'
    constructor(private secret: () => string | undefined, private now: () => number = Date.now, private ttlMs = ROUTE_TICKET_TTL_MS) {}

    // A ticket for this session, or undefined when the core has no masterKey yet
    issue(accessKey: AccessKey, user?: string): IClusterRouteTicket | undefined {
        const secret = this.secret()
        if (!secret) return undefined
        const expiresAt = this.now() + this.ttlMs
        const iv = randomBytes(TICKET_IV_BYTES)
        const cipher = createCipheriv('aes-256-gcm', ticketKeyOf(secret), iv)
        const sealed = Buffer.concat([cipher.update(JSON.stringify({ k: accessKeySerialize(accessKey), u: user, e: expiresAt }), 'utf8'), cipher.final()])
        return { routeTicket: Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString('base64url'), expiresAt }
    }

    /*
        The caller a ticket stands for, or undefined: not one of this core's (another masterKey, tampered,
        made up), expired, or its key no longer valid here ('keyOf' resolves an Authorization header).
    */
    async check(routeTicket: string, keyOf: (authorization: string | undefined) => Promise<AccessKey | undefined>): Promise<IRouteCaller | undefined> {
        const secret = this.secret()
        if (!secret) return undefined
        const raw = Buffer.from(routeTicket, 'base64url')
        if (raw.length <= TICKET_IV_BYTES + TICKET_TAG_BYTES) return undefined
        let content: Record<string, unknown>
        try {
            const decipher = createDecipheriv('aes-256-gcm', ticketKeyOf(secret), raw.subarray(0, TICKET_IV_BYTES))
            decipher.setAuthTag(raw.subarray(TICKET_IV_BYTES, TICKET_IV_BYTES + TICKET_TAG_BYTES))
            const opened = Buffer.concat([decipher.update(raw.subarray(TICKET_IV_BYTES + TICKET_TAG_BYTES)), decipher.final()]).toString('utf8')
            const parsed: unknown = JSON.parse(opened)
            if (!parsed || typeof parsed !== 'object') return undefined
            content = parsed as Record<string, unknown>
        }
        catch {
            return undefined
        }
        if (typeof content.k !== 'string' || typeof content.e !== 'number' || content.e < this.now()) return undefined
        const accessKey = await keyOf(`Bearer ${content.k}`)
        if (!accessKey) return undefined
        return { via: ERouteCallerVia.TICKET, accessKey, ...(typeof content.u === 'string' && content.u ? { user: content.u } : {}) }
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
        const caller = segment ? await tickets.check(segment, keyOf) : undefined
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
