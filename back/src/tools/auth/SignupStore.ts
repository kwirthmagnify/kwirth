import { ESignupStatus, IIdpSignupPolicy, ISignupRequest } from '@kwirthmagnify/kwirth-common'
import { ISecrets } from '../ISecrets'

const SIGNUPS_SECRET = 'kwirth-signups'

// D9: how many requests may wait on ONE IdP. With a public IdP and no domain filter anybody in the world
// can ask, and every request is a key in a Secret with a ~1 MiB ceiling.
const SIGNUP_PENDING_CAP = 50

/*
    The signup requests (plan: plans/signup, D1). They live in their OWN Secret and not in 'kwirth-users'
    on purpose: a request is not a user, so nothing that reads users — the password login, the IdP
    callback, getUsers, the pickers — can ever hand it an AccessKey, without each of them having to know
    there is such a thing as a pending user.

    One key per request (writeKey/readAllKeys, like 'kwirth-idps'), and the key is base64url(email): a K8s
    Secret key does not admit '@'. The key is never read back — the request carries its own id.

    🔴 It takes NO lock: the caller holds IdentityService.lock around each read-check-write (the pending cap,
    approving, which also writes 'kwirth-users'). The lock is not re-entrant, so taking it here as well
    would deadlock those callers.
*/
export class SignupStore {

    private static keyOf = (id: string) => Buffer.from(id, 'utf8').toString('base64url')

    // a value that does not look like a request (corrupt, or hand-edited) is skipped rather than trusted
    private static isRequest = (value: unknown): value is ISignupRequest => {
        if (!value || typeof value !== 'object') return false
        const r = value as ISignupRequest
        return typeof r.id === 'string' && r.id !== '' && typeof r.idp === 'string'
            && Object.values(ESignupStatus).includes(r.status)
    }

    static list = async (secrets: ISecrets): Promise<ISignupRequest[]> => {
        let raw: Record<string, unknown>
        try {
            raw = await secrets.readAllKeys(SIGNUPS_SECRET)
        }
        catch (err) {
            return []
        }
        return Object.values(raw ?? {}).filter(SignupStore.isRequest)
    }

    static get = async (secrets: ISecrets, id: string): Promise<ISignupRequest | undefined> => {
        return (await SignupStore.list(secrets)).find(r => r.id === id)
    }

    static save = async (secrets: ISecrets, request: ISignupRequest): Promise<void> => {
        await secrets.writeKey(SIGNUPS_SECRET, SignupStore.keyOf(request.id), request)
    }

    static remove = async (secrets: ISecrets, id: string): Promise<void> => {
        await secrets.writeKey(SIGNUPS_SECRET, SignupStore.keyOf(id), null)
    }

    // how many requests are waiting on one IdP: what the pending cap (D9) is checked against
    static countPending = async (secrets: ISecrets, idp: string): Promise<number> => {
        return (await SignupStore.list(secrets)).filter(r => r.idp === idp && r.status === ESignupStatus.PENDING).length
    }

    static isFull = async (secrets: ISecrets, idp: string): Promise<boolean> => {
        return (await SignupStore.countPending(secrets, idp)) >= SIGNUP_PENDING_CAP
    }

    /*
        Whether an IdP's policy lets this email ask. No policy, or a disabled one, is a no. The domain is
        compared WHOLE and without case: 'example.com' admits 'bob@example.com' and NOT
        'bob@mail.example.com' nor 'bob@notexample.com' — a subdomain is somebody else's, and a suffix
        match is how a filter gets bypassed by registering a lookalike.
    */
    static allows = (policy: IIdpSignupPolicy | undefined, email: string): boolean => {
        if (!policy?.enabled) return false
        const domains = (policy.allowedDomains ?? []).map(d => d.trim().toLowerCase()).filter(d => d !== '')
        if (domains.length === 0) return true
        const at = email.lastIndexOf('@')
        if (at < 0) return false
        return domains.includes(email.slice(at + 1).toLowerCase())
    }
}

export { SIGNUP_PENDING_CAP }
