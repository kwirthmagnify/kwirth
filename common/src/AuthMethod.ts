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

export { EAuthMethodKind, IAuthMethod }
