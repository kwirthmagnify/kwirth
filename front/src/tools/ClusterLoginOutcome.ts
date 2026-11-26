/*
    What a login against a REMOTE Kwirth came to, from its answer (plan: plans/completed/cluster-login/PRD.md).

    Kept apart from the request and with no imports on purpose: it is the part with rules — which status means
    what, and the message the user reads — and it is tested on its own (front/tests/clusterLogin.test.ts).

    What the remote's POST /login answers (back/src/api/LoginApi.ts):
      200  the key, in the body
      201  right password, but the user must change it first: no key is given (PRD D4: it is said, nothing else)
      401  wrong user or password — and also a user bound to an identity provider, who has no password here
      403  { refusal: 'ipnotallowed' } when the remote's login IP filter leaves this address out
      429  too many attempts, with Retry-After in seconds
*/

export enum EClusterLoginOutcome {
    OK = 'ok',
    INVALID = 'invalid',
    PASSWORD_CHANGE = 'passwordchange',
    IP_NOT_ALLOWED = 'ipnotallowed',
    TOO_MANY = 'toomany',
    UNREACHABLE = 'unreachable',
    FAILED = 'failed'
}

export interface IClusterLoginOutcome {
    outcome: EClusterLoginOutcome
    /** For the user, already worded. Empty on OK. */
    message: string
}

/** The remote's 'ipnotallowed' refusal (ELoginRefusal.IPNOTALLOWED in kwirth-common), read without importing it. */
const IP_REFUSAL = 'ipnotallowed'

/**
 * The outcome of the remote's answer to POST /login. `body` is what came back, already parsed (undefined if it
 * was not JSON); `retryAfter` is the Retry-After header.
 */
export const clusterLoginOutcomeOf = (status: number, body: unknown, retryAfter: string | null): IClusterLoginOutcome => {
    switch (status) {
        case 200:
            return { outcome: EClusterLoginOutcome.OK, message: '' }
        case 201:
            return { outcome: EClusterLoginOutcome.PASSWORD_CHANGE, message: 'This user has to change its password before signing in. Sign in to that Kwirth directly to change it, then come back.' }
        case 401:
            return { outcome: EClusterLoginOutcome.INVALID, message: 'Invalid user or password. Users who sign in to that Kwirth through an identity provider (SSO) cannot sign in from here.' }
        case 403: {
            const refusal = body && typeof body === 'object' ? (body as { refusal?: unknown }).refusal : undefined
            return refusal === IP_REFUSAL
                ? { outcome: EClusterLoginOutcome.IP_NOT_ALLOWED, message: 'That Kwirth does not allow signing in from this address.' }
                : { outcome: EClusterLoginOutcome.FAILED, message: 'That Kwirth refused the sign-in (HTTP 403).' }
        }
        case 429: {
            const seconds = Number(retryAfter)
            const wait = Number.isFinite(seconds) && seconds > 0 ? ` Try again in ${Math.ceil(seconds)} s.` : ' Try again later.'
            return { outcome: EClusterLoginOutcome.TOO_MANY, message: `Too many sign-in attempts.${wait}` }
        }
        default:
            return { outcome: EClusterLoginOutcome.FAILED, message: `Sign-in failed (HTTP ${status}).` }
    }
}

/** The outcome when the request did not even get an answer. */
export const clusterLoginUnreachable = (error: unknown): IClusterLoginOutcome => ({
    outcome: EClusterLoginOutcome.UNREACHABLE,
    message: `That Kwirth could not be reached: ${error instanceof Error ? error.message : String(error)}`
})
