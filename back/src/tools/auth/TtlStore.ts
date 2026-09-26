/*
    A single-use in-memory store with expiry (TTL). Used by AuthApi for:
      - the OIDC flow's state + PKCE code_verifier (TTL ~10 min)
      - the handoff code the front end exchanges for the ILoginResponse (TTL ~60 s)
    'take' returns and DELETES the entry (anti-replay); when it has expired it returns undefined.
    The clock is injectable so that expiry can be tested deterministically.
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

    // returns and deletes (single use); undefined when it does not exist or has expired
    take(key: string): T | undefined {
        const entry = this.map.get(key)
        if (!entry) return undefined
        this.map.delete(key)
        if (this.now() - entry.createdAt > this.ttlMs) return undefined
        return entry.value
    }

    // a sweep of expired entries
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
