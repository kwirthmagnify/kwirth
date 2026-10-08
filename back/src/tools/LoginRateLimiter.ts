/*
    A small in-memory limiter for the login endpoints. The semaphore in LoginApi only serialises the
    requests (one at a time), it does not slow an attacker down: a script can still try thousands of
    passwords, just not in parallel. This caps FAILED attempts per key (ip + user) in a window, and blocks
    further tries for a cooldown once the cap is hit. A successful login clears the key, so a legitimate
    user is never locked out by their own correct password.

    It is deliberately in-process: Kwirth's core is a single instance, and a shared store would turn a
    brute-force defence into a write-amplifier against the store. If the process restarts the counters
    reset, which is acceptable — a restart is not a cheap primitive for an attacker to force.
*/
export class LoginRateLimiter {
    private attempts = new Map<string, { count: number, firstTs: number, blockedUntil: number }>()

    constructor(
        private maxAttempts: number = 5,
        private windowMs: number = 15 * 60 * 1000,
        private blockMs: number = 15 * 60 * 1000
    ) {}

    // Milliseconds the key must wait before trying again, or 0 when it may try now.
    public retryAfterMs(key: string): number {
        const now = Date.now()
        const entry = this.attempts.get(key)
        if (!entry) return 0
        if (entry.blockedUntil > now) return entry.blockedUntil - now
        // the window elapsed with no block: forget it, the key starts fresh
        if (now - entry.firstTs > this.windowMs) {
            this.attempts.delete(key)
            return 0
        }
        return 0
    }

    // Records a failed attempt, opening or extending the block when the cap is reached.
    public fail(key: string): void {
        const now = Date.now()
        let entry = this.attempts.get(key)
        if (!entry || now - entry.firstTs > this.windowMs) {
            entry = { count: 0, firstTs: now, blockedUntil: 0 }
            this.attempts.set(key, entry)
        }
        entry.count++
        if (entry.count >= this.maxAttempts) entry.blockedUntil = now + this.blockMs
        this.sweep(now)
    }

    // A successful login clears the key: its past failures no longer count.
    public success(key: string): void {
        this.attempts.delete(key)
    }

    // Opportunistic cleanup so a flood of distinct keys cannot grow the map without bound.
    private sweep(now: number): void {
        if (this.attempts.size < 10000) return
        for (const [key, entry] of this.attempts) {
            if (entry.blockedUntil <= now && now - entry.firstTs > this.windowMs) this.attempts.delete(key)
        }
    }
}
