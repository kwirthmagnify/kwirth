/*
    Store en memoria de un solo uso con expiracion (TTL). Usado por AuthApi para:
      - state + PKCE code_verifier del flujo OIDC (TTL ~10 min)
      - codigo de handoff que canjea el front por el ILoginResponse (TTL ~60 s)
    'take' devuelve y BORRA la entrada (anti-replay); si expiro devuelve undefined.
    El reloj es inyectable para poder testear la expiracion de forma determinista.
*/
interface ITtlEntry<T> {
    value: T
    createdAt: number
}

class TtlStore<T> {
    private map = new Map<string, ITtlEntry<T>>()
    private ttlMs: number
    private now: () => number

    constructor(ttlMs: number, now: () => number = () => Date.now()) {
        this.ttlMs = ttlMs
        this.now = now
    }

    put(key: string, value: T): void {
        this.map.set(key, { value, createdAt: this.now() })
    }

    // devuelve y borra (un solo uso); undefined si no existe o expiro
    take(key: string): T | undefined {
        const entry = this.map.get(key)
        if (!entry) return undefined
        this.map.delete(key)
        if (this.now() - entry.createdAt > this.ttlMs) return undefined
        return entry.value
    }

    // barrido de entradas caducadas
    purge(): void {
        const t = this.now()
        for (const [key, entry] of this.map) {
            if (t - entry.createdAt > this.ttlMs) this.map.delete(key)
        }
    }

    get size(): number {
        return this.map.size
    }
}

export { TtlStore }
