/*
    Self-registration through an IdP (plan: plans/signup). Somebody the IdP has verified but who is not a
    Kwirth user may ASK for access, if the admin allowed it on that IdP. The request is not a user: it lives
    apart from them ('kwirth-signups'), so it can never get an AccessKey, until an admin approves it — and
    approving turns it into a user and removes the request.
*/

enum ESignupStatus {
    PENDING = 'pending',      // waiting for an admin
    REJECTED = 'rejected'     // kept until an admin deletes it, so the same person cannot ask in a loop
}

interface ISignupRequest {
    id: string                // the verified email, as the IdP returned it; it will be the user's id
    idp: string               // the IdP instance it came through; the user is bound to it on approval
    name: string              // what the requester typed (prefilled with the IdP's name)
    comment?: string          // why they want access, for the admin
    requestedAt: number       // epoch ms
    status: ESignupStatus
}

/*
    What an IdP instance allows about signup. It belongs to the core, not to the connector: it is the same
    for every connector, so it is not part of the connector's own config.
*/
interface IIdpSignupPolicy {
    enabled: boolean
    allowedDomains: string[]  // the email domains that may ask ('example.com'); empty = any
}

export { ESignupStatus, ISignupRequest, IIdpSignupPolicy }
