// The central registry of extensions' HTTP routes (the core's endpoint control). Extensions (channels,
// providers, login extensions) mount routers on the core's Express; the ALIAS namespace is flat, so two
// extensions can claim the same path (two providers with the alias 'events', for instance) and overwrite
// each other in SILENCE (Express is first-match-wins). This registry centralises the decision: it validates
// exact collisions and the core's reserved prefixes, and allows querying what is registered.
//
// It is PURE (no Express, no logging): it ONLY decides and registers; the caller is the one that mounts on
// Express (when it is ok) and logs the rejection. That way it stays unit-testable and decoupled.
//
// It also RECORDS what is actually mounted ('record' + 'listRoutes'), for the Status channel's Routes tab.
// Recording validates nothing and rejects nothing — every mount is recorded and mounted as always; turning
// collisions into rejections is the pending rest of the validator (see the Status v2 plan's backlog).

export enum ERouteOwnerKind {
    CORE = 'core',
    CHANNEL = 'channel',
    PROVIDER = 'provider',
    LOGIN = 'login',
    WEBHOOK = 'webhook',
    FRONT = 'front',
    OTHER = 'other'
}

export interface IRegisteredRoute {
    path: string
    ownerKind: ERouteOwnerKind
    ownerId: string
}

/** A router (or a single handler) actually mounted at a path, as recorded by 'record'. */
export interface IRecordedMount extends IRegisteredRoute {
    /** The router, to read its routes from. Without one, the mount is listed as a single entry. */
    router?: unknown
    /** For a mount without a router: the methods it answers. Defaults to ALL. */
    methods?: string[]
}

/** One published route: who owns it, its method and its full path — a PATTERN, never a value. */
export interface IPublishedRoute {
    ownerKind: ERouteOwnerKind
    ownerId: string
    method: string
    path: string
}

/** What channels see of the registry (ClusterInfo.routes). */
export interface IRouteAccess {
    listRoutes(): IPublishedRoute[]
}

// The shapes of Express 4's internal stack, as far as they are read here.
interface IExpressRoute {
    /** Express takes a string, an array of them, or a regular expression. ConfigApi uses arrays. */
    path: string | RegExp | (string | RegExp)[]
    methods: Record<string, boolean>
}

/** A route's path as text: one entry per path of an array, and a regular expression as its pattern. */
const pathsOf = (path: IExpressRoute['path']): string[] =>
    (Array.isArray(path) ? path : [path]).map(p => typeof p === 'string' ? p : `/${p.source}/`)

interface IExpressKey {
    name: string
}

interface IExpressLayer {
    route?: IExpressRoute
    regexp?: RegExp
    keys?: IExpressKey[]
    handle?: { stack?: IExpressLayer[] }
}

const joinPath = (base: string, path: string): string => {
    const joined = `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
    return joined.length > 1 ? joined.replace(/\/+$/, '') : joined
}

/*
    The path of a router mounted INSIDE another, from the regular expression Express 4 compiled for it —
    Express does not keep it as text. Covers what 'router.use(path, sub)' produces: '^\/a\/?(?=\/|$)', with
    each ':param' as '(?:\/([^/]+?))' (Express 4.19) or '(?:([^\/]+?))' (older). Anything else is shown as
    '/*' rather than guessed.
*/
export const nestedPath = (layer: IExpressLayer): string => {
    const source = layer.regexp?.source
    if (!source || source === '^\\/?(?=\\/|$)') return ''
    let i = 0
    const keys = layer.keys ?? []
    const param = () => `:${keys[i++]?.name ?? 'param'}`
    const path = source
        .replace(/^\^/, '')
        .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
        .replace(/\(\?:\\\/\(\[\^\/\]\+\?\)\)/g, () => `/${param()}`)
        .replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, param)
        .replace(/\\\//g, '/')
    return /[()[\]?*+^$\\]/.test(path) ? '/*' : path
}

/** The routes inside a router, recursing into the routers mounted inside it. */
export const routesOf = (stack: IExpressLayer[], base: string): { method: string, path: string }[] => {
    const out: { method: string, path: string }[] = []
    for (const layer of stack) {
        if (layer.route) {
            /*
                '.all()' next to specific methods is middleware (the core's APIs put their auth check there):
                that route answers only its specific methods, so ALL is not listed. ALL only when it is all
                the route has — the webhook receiver.
            */
            const declared = Object.keys(layer.route.methods)
            const specific = declared.filter(m => m !== '_all')
            const methods = (specific.length > 0 ? specific : declared).map(m => m === '_all' ? 'ALL' : m.toUpperCase())
            for (const path of pathsOf(layer.route.path)) {
                for (const method of methods) out.push({ method, path: joinPath(base, path) })
            }
        }
        else if (layer.handle?.stack) {
            out.push(...routesOf(layer.handle.stack, joinPath(base, nestedPath(layer))))
        }
    }
    return out
}

export type TRegisterResult =
    | { ok: true }
    | { ok: false; reason: 'duplicate'; conflict: IRegisteredRoute }
    | { ok: false; reason: 'reserved' }

export class RouteRegistry implements IRouteAccess {
    private routes = new Map<string, IRegisteredRoute>()
    private reserved: string[] = []
    private recorded: IRecordedMount[] = []

    /** Normalises a path for comparing/registering: it strips trailing slash(es); an empty string → '/'. */
    private norm(p: string): string {
        const n = p.replace(/\/+$/, '')
        return n === '' ? '/' : n
    }

    /** Reserves a core prefix: no extension will be able to mount there (neither the exact one nor anything below it). */
    reserve(path: string): void {
        const n = this.norm(path)
        if (!this.reserved.includes(n)) this.reserved.push(n)
    }

    private isReserved(path: string): boolean {
        return this.reserved.some(r => path === r || path.startsWith(r + '/'))
    }

    /**
     * Decides whether `path` can be registered for (ownerKind, ownerId) and, when appropriate, registers it.
     * It does NOT mount on Express (the caller does that when the result is ok). Deterministic: an exact
     * collision → duplicate; under a reserved prefix (and not being the core itself) → reserved.
     */
    tryRegister(path: string, ownerKind: ERouteOwnerKind, ownerId: string): TRegisterResult {
        const n = this.norm(path)
        const conflict = this.routes.get(n)
        if (conflict) return { ok: false, reason: 'duplicate', conflict }
        if (ownerKind !== ERouteOwnerKind.CORE && this.isReserved(n)) return { ok: false, reason: 'reserved' }
        this.routes.set(n, { path: n, ownerKind, ownerId })
        return { ok: true }
    }

    /** A snapshot of what is registered (for diagnostics / the log). */
    list(): IRegisteredRoute[] {
        return [...this.routes.values()]
    }

    /*
        Records something that IS mounted. It validates nothing: the caller mounts on Express as always.
        Two DIFFERENT owners at the same path are both kept — that is a collision, and exactly what the
        Routes tab has to be able to show. The SAME owner at the same path replaces its previous entry: a
        plugin reinstalled in dev mounts again, and listing it twice would be false.
    */
    record(mount: IRecordedMount): void {
        const path = this.norm(mount.path)
        this.recorded = this.recorded.filter(m => !(m.path === path && m.ownerKind === mount.ownerKind && m.ownerId === mount.ownerId))
        this.recorded.push({ ...mount, path })
    }

    /** Forgets everything an owner mounted: for an extension that is uninstalled. */
    forget(ownerKind: ERouteOwnerKind, ownerId: string): void {
        this.recorded = this.recorded.filter(m => !(m.ownerKind === ownerKind && m.ownerId === ownerId))
    }

    /*
        Every published route, with its method. Read when asked, not copied at mount time: a router that
        gains routes after being mounted is seen with them.
    */
    listRoutes(): IPublishedRoute[] {
        const out: IPublishedRoute[] = []
        for (const m of this.recorded) {
            const stack = (m.router as { stack?: IExpressLayer[] } | undefined)?.stack
            /*
                One mount that cannot be read must not take the whole list down — that is what happened
                with a route declared as an array. It is listed by its base path, like a mount without routes.
            */
            let routes: { method: string, path: string }[] = []
            try {
                routes = stack ? routesOf(stack, m.path) : []
            }
            catch {
                routes = []
            }
            // A mount with no routes of its own (a static folder, a single handler) is still a published path.
            const listed = routes.length > 0 ? routes : (m.methods ?? ['ALL']).map(method => ({ method, path: m.path }))
            for (const r of listed) out.push({ ownerKind: m.ownerKind, ownerId: m.ownerId, method: r.method, path: r.path })
        }
        return out
    }
}

/** The one registry of this process: what is mounted is recorded here, and channels read it. */
export const routeRegistry = new RouteRegistry()
