// Registro central de rutas HTTP de extensiones (control de endpoints del core). Las extensiones (channels,
// providers, login extensions) montan routers en el Express del core; el namespace de ALIAS es plano, así que
// dos extensiones pueden reclamar el mismo path (p.ej. dos providers con alias 'events') y machacarse en
// SILENCIO (Express es first-match-wins). Este registro centraliza la decisión: valida colisiones exactas y
// prefijos reservados del core, y permite consultar qué hay registrado.
//
// Es PURO (sin Express ni logging): SOLO decide y registra; el caller es quien monta en Express (si ok) y
// loguea el rechazo. Así queda unit-testable y desacoplado.

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

    /** Normaliza un path para comparar/registrar: quita barra(s) final(es); cadena vacía → '/'. */
    private norm(p: string): string {
        const n = p.replace(/\/+$/, '')
        return n === '' ? '/' : n
    }

    /** Reserva un prefijo del core: ninguna extensión podrá montar ahí (ni el exacto ni nada por debajo). */
    reserve(path: string): void {
        const n = this.norm(path)
        if (!this.reserved.includes(n)) this.reserved.push(n)
    }

    private isReserved(path: string): boolean {
        return this.reserved.some(r => path === r || path.startsWith(r + '/'))
    }

    /**
     * Decide si `path` puede registrarse para (ownerKind, ownerId) y, si procede, lo registra. NO monta en
     * Express (eso lo hace el caller cuando el resultado es ok). Determinista: colisión exacta → duplicate;
     * bajo un prefijo reservado (y no es el propio core) → reserved.
     */
    tryRegister(path: string, ownerKind: ERouteOwnerKind, ownerId: string): TRegisterResult {
        const n = this.norm(path)
        const conflict = this.routes.get(n)
        if (conflict) return { ok: false, reason: 'duplicate', conflict }
        if (ownerKind !== ERouteOwnerKind.CORE && this.isReserved(n)) return { ok: false, reason: 'reserved' }
        this.routes.set(n, { path: n, ownerKind, ownerId })
        return { ok: true }
    }

    /** Snapshot de lo registrado (para diagnóstico / log). */
    list(): IRegisteredRoute[] {
        return [...this.routes.values()]
    }
}
