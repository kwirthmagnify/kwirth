/*
    Self-registration through an IdP (plan: plans/completed/signup). Somebody the IdP has verified but who is not a
    Kwirth user may ASK for access, if the admin allowed it on that IdP. The request is not a user: it lives
    apart from them ('kwirth-signups'), so it can never get an AccessKey, until an admin approves it — and
    approving turns it into a user and removes the request.
*/

import { ESsoResult } from './AuthMethod'

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

/*
    The signup handshake between the front end and the back end. The IdP callback redirects to
    `?signup=<code>` when the person may ask for access; the code stands for the identity the IdP verified,
    so the email NEVER comes from the front end — not in the info, not in the submit.
*/

// POST /core/auth/signup/info {code} → what the dialog shows and prefills (it does not spend the code)
interface ISignupInfo {
    id: string                // the verified email
    name: string              // the IdP's name for them, possibly ''
    idp: string               // the IdP instance id
    idpLabel: string          // its label, for "you signed in with ..."
}

// POST /core/auth/signup: the request itself (it spends the code)
interface ISignupSubmit {
    code: string
    name: string
    comment?: string
}

// the body of a refused submit (409): why. Absent when there is no outcome to name.
interface ISignupReply {
    result?: ESsoResult
}

// POST /core/signups/:id/approve: what the new user gets. The id, name and idp come from the request.
interface ISignupApproval {
    resources: string
    enabledChannels?: string[]
    startChannel?: string
    exitFullScreen?: boolean
}

export { ESignupStatus, ISignupRequest, IIdpSignupPolicy, ISignupInfo, ISignupSubmit, ISignupReply, ISignupApproval }
