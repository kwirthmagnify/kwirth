import { IIdpAuthContext, IIdpCallbackContext, IIdpConfigFieldDef, IIdpIdentity } from './IIdpConnector'

/*
    Lógica OAuth2 (Authorization Code) compartida por conectores que NO son OIDC (GitHub, ...).
    Vive en common-back y el back la expone como global (__kwirth_back__.kwirthCommonBack), de modo
    que los conectores la usan por composición sin duplicar el flujo.

    A diferencia de OIDC no hay id_token ni discovery: se intercambia el 'code' por un access_token
    y el conector aporta el fetch de userinfo (fetchIdentity). Protección CSRF por 'state' (el core lo
    valida single-use); PKCE es opcional porque algunos IdP OAuth2 no lo soportan.
*/

export interface IOAuth2Endpoints {
    authorizationEndpoint: string
    tokenEndpoint: string
    defaultScopes?: string
    usePkce?: boolean
}

interface IOAuth2TokenResponse {
    access_token?: string
    error?: string
    error_description?: string
}

// base schema of an OAuth2 IdP (the connector adds its URLs where applicable; clientSecret 'password' → masked)
export function oauth2ConfigSchema(): IIdpConfigFieldDef[] {
    return [
        { name: 'clientId', label: 'Client ID', type: 'text', required: true },
        { name: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
        { name: 'scopes', label: 'Scopes', type: 'text' }
    ]
}

export function oauth2BuildAuthorizationUrl(config: Record<string, unknown>, ctx: IIdpAuthContext, ep: IOAuth2Endpoints): string {
    const scope = (config.scopes as string) || ep.defaultScopes || ''
    const url = new URL(ep.authorizationEndpoint)
    url.searchParams.set('client_id', String(config.clientId ?? ''))
    url.searchParams.set('redirect_uri', ctx.redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('state', ctx.state)
    if (scope) url.searchParams.set('scope', scope)
    if (ep.usePkce) {
        url.searchParams.set('code_challenge', ctx.codeChallenge)
        url.searchParams.set('code_challenge_method', 'S256')
    }
    return url.toString()
}

// exchanges the 'code' for an access_token (back-channel) and delegates userinfo to fetchIdentity(accessToken).
export async function oauth2HandleCallback(
    config: Record<string, unknown>,
    ctx: IIdpCallbackContext,
    ep: IOAuth2Endpoints,
    fetchIdentity: (accessToken: string) => Promise<IIdpIdentity>
): Promise<IIdpIdentity> {
    const body = new URLSearchParams()
    body.set('grant_type', 'authorization_code')
    body.set('code', ctx.code)
    body.set('client_id', String(config.clientId ?? ''))
    body.set('client_secret', String(config.clientSecret ?? ''))
    body.set('redirect_uri', ctx.redirectUri)
    if (ep.usePkce) body.set('code_verifier', ctx.codeVerifier)

    // Accept: application/json → some IdPs (GitHub) return form-urlencoded without this header
    const res = await fetch(ep.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body
    })
    if (!res.ok) throw new Error(`OAuth2 token endpoint returned ${res.status}`)
    const token = await res.json() as IOAuth2TokenResponse
    if (token.error || !token.access_token) {
        throw new Error(`OAuth2 token exchange failed: ${token.error_description || token.error || 'no access_token'}`)
    }
    return fetchIdentity(token.access_token)
}
