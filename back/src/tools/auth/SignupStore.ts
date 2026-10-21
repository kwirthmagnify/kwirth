import { ESignupStatus, ISignupRequest } from '@kwirthmagnify/kwirth-common'
import { ISecrets } from '../ISecrets'

const SIGNUPS_SECRET = 'kwirth-signups'

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
}
