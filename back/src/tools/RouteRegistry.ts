// The central registry of extensions' HTTP routes (the core's endpoint control). Extensions (channels,
// providers, login extensions) mount routers on the core's Express; the ALIAS namespace is flat, so two
// extensions can claim the same path (two providers with the alias 'events', for instance) and overwrite
// each other in SILENCE (Express is first-match-wins). This registry centralises the decision: it validates
// exact collisions and the core's reserved prefixes, and allows querying what is registered.
//
// It is PURE (no Express, no logging): it ONLY decides and registers; the caller is the one that mounts on
// Express (when it is ok) and logs the rejection. That way it stays unit-testable and decoupled.

export enum ERouteOwnerKind {
    CORE = 'core',
    CHANNEL = 'channel',
    PROVIDER = 'provider',
    LOGIN = 'login',
    OTHER = 'other'
}

export interface IRegisteredRoute {
    path: string
    ownerKind: ERouteOwnerKind
    ownerId: string
}

export type TRegisterResult =
    | { ok: true }
    | { ok: false; reason: 'duplicate'; conflict: IRegisteredRoute }
    | { ok: false; reason: 'reserved' }

export class RouteRegistry {
    private routes = new Map<string, IRegisteredRoute>()
    private reserved: string[] = []

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
}
