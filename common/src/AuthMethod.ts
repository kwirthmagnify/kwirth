/*
    The authentication methods the back end publishes (GET /core/auth/method) and the front end uses to
    draw the login screen. 'kwirth' is the built-in user/password login; the IdPs (Google, ...) are
    REDIRECT methods that navigate to their startUrl.
*/
enum EAuthMethodKind {
    PASSWORD = 'password',   // the kwirth method → a user/password form
    REDIRECT = 'redirect'    // an IdP (OIDC/OAuth2) → a button that navigates to startUrl
}

interface IAuthMethod {
    id: string               // the IdP's instanceId, or 'kwirth'
    label: string
    kind: EAuthMethodKind
    startUrl?: string         // REDIRECT only: the path the login button navigates to
}

/*
    The outcome of an IdP callback the back end hands over to the front end as `?ssoerror=<value>`. The
    values ARE the query strings, so they cannot change without breaking a front end older than its back
    end. Success is not here: it travels as `?sso=<code>`.
*/
enum ESsoResult {
    UNAVAILABLE = 'unavailable',    // no IdP manager or no active instance
    STATE = 'state',                // the state is unknown, expired or for another IdP
    CALLBACK = 'callback',          // the connector could not complete the exchange with the IdP
    UNVERIFIED = 'unverified',      // the IdP does not vouch for the email
    NOTFOUND = 'notfound',          // the email is not a Kwirth user (and signup does not apply)
    IDPMISMATCH = 'idpmismatch',    // the user is bound to a different IdP
    ISSUE = 'issue',                // the AccessKey could not be issued
    PENDING = 'pending',            // there is a signup request for this email, still waiting for an admin
    REJECTED = 'rejected',          // the signup request for this email was rejected
    SIGNUPLIMIT = 'signuplimit'     // the IdP has too many pending requests to take another one
}

export { EAuthMethodKind, IAuthMethod, ESsoResult }
