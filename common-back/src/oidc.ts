import { Issuer } from 'openid-client'
import * as jose from 'jose'
import { IIdpAuthContext, IIdpCallbackContext, IIdpConfigFieldDef, IIdpIdentity } from './IIdpConnector'

/*
    Lógica OIDC compartida por todos los conectores OIDC (Google, Keycloak, GitLab, Microsoft/Entra, ...).
    Vive en common-back y el back la expone como global (__kwirth_back__.kwirthCommonBack), de modo
    que los conectores la usan por composición SIN bundlear openid-client/jose ni duplicar el flujo.

    Flujo Authorization Code + PKCE con intercambio back-channel (el id_token llega por TLS del
    token endpoint). En single-tenant openid-client valida issuer/aud. En multi-tenant (Entra
    organizations/common) el issuer descubierto lleva el placeholder {tenantid} y la validación
    literal de openid-client falla; ahí hacemos el intercambio crudo (grant) y validamos el id_token
    a mano con jose (firma vía JWKS + iss contra el tid del token).
*/

// mapping/validation options for non-standard OIDC connectors (Entra and the like)
export interface IOidcCallbackOptions {
    emailClaims?: string[]      // fallback order for the email (default ['email'])
    assumeVerified?: boolean    // treat the email as verified when the IdP does not emit email_verified
    multiTenant?: boolean       // validate iss against the token's tid (Entra organizations/common)
    allowedTenants?: string[]   // (optional) allowlist of tenants (GUIDs) permitted under multiTenant
}

// standard config schema of an OIDC IdP (clientSecret is 'password' → masked in the UI)
export function oidcConfigSchema(): IIdpConfigFieldDef[] {
    return [
        { name: 'clientId', label: 'Client ID', type: 'text', required: true },
        { name: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
        { name: 'scopes', label: 'Scopes', type: 'text' },
        { name: 'issuer', label: 'Issuer URL', type: 'text' }
    ]
}

async function makeClient(config: Record<string, unknown>, redirectUri: string, defaultIssuer?: string) {
    const issuerUrl = (config.issuer as string) || defaultIssuer
    if (!issuerUrl) throw new Error('OIDC issuer not configured')
    const issuer = await Issuer.discover(issuerUrl)
    const client = new issuer.Client({
        client_id: config.clientId as string,
        client_secret: config.clientSecret as string,
        redirect_uris: [redirectUri],
        response_types: ['code']
    })
    return { issuer, client }
}

// maps the id_token claims to Kwirth's identity (email fallback + assumed verified)
export function mapOidcIdentity(claims: Record<string, unknown>, opts?: IOidcCallbackOptions): IIdpIdentity {
    const emailClaims = opts?.emailClaims ?? ['email']
    let email = ''
    for (const claim of emailClaims) {
        const value = claims[claim]
        if (typeof value === 'string' && value !== '') {
            email = value
            break
        }
    }
    return {
        email,
        emailVerified: claims.email_verified === true || opts?.assumeVerified === true,
        name: typeof claims.name === 'string' ? claims.name : undefined,
        sub: claims.sub !== undefined ? String(claims.sub) : undefined
    }
}

// is the tenant (tid) allowed? (an empty allowlist means any tenant)
export function tenantAllowed(tid: string | undefined, allowed?: string[]): boolean {
    if (!allowed || allowed.length === 0) return true
    if (!tid) return false
    const lower = tid.toLowerCase()
    return allowed.some(t => t.toLowerCase() === lower)
}

export async function oidcBuildAuthorizationUrl(config: Record<string, unknown>, ctx: IIdpAuthContext, defaultIssuer?: string): Promise<string> {
    const { client } = await makeClient(config, ctx.redirectUri, defaultIssuer)
    const scope = (config.scopes as string) || 'openid email profile'
    return client.authorizationUrl({
        scope,
        state: ctx.state,
        redirect_uri: ctx.redirectUri,
        code_challenge: ctx.codeChallenge,
        code_challenge_method: 'S256'
    })
}

export async function oidcHandleCallback(config: Record<string, unknown>, ctx: IIdpCallbackContext, defaultIssuer?: string, opts?: IOidcCallbackOptions): Promise<IIdpIdentity> {
    const { issuer, client } = await makeClient(config, ctx.redirectUri, defaultIssuer)

    if (opts?.multiTenant) {
        // openid-client validates iss LITERALLY, and in multi-tenant the discovered issuer carries the
        // {tenantid} placeholder; so we do the raw exchange (grant, without validating the id_token) and
        // validate the id_token by hand with jose: signature (the issuer's JWKS) + iss against the
        // token's concrete tid.
        const tokenSet = await client.grant({
            grant_type: 'authorization_code',
            code: ctx.code,
            redirect_uri: ctx.redirectUri,
            code_verifier: ctx.codeVerifier
        })
        if (!tokenSet.id_token) throw new Error('OIDC multi-tenant: token response has no id_token')
        const tid = tokenSet.claims().tid as string | undefined   // unverified; only to learn the tenant
        if (!tid) throw new Error('OIDC multi-tenant: id_token has no tid claim')
        if (!tenantAllowed(tid, opts.allowedTenants)) throw new Error(`OIDC multi-tenant: tenant '${tid}' not allowed`)
        const jwksUri = issuer.metadata.jwks_uri
        if (!jwksUri) throw new Error('OIDC multi-tenant: issuer metadata has no jwks_uri')
        const jwks = jose.createRemoteJWKSet(new URL(jwksUri))
        const { payload } = await jose.jwtVerify(tokenSet.id_token, jwks, {
            issuer: `https://login.microsoftonline.com/${tid}/v2.0`,
            audience: config.clientId as string,
            clockTolerance: 5
        })
        return mapOidcIdentity(payload as Record<string, unknown>, opts)
    }

    // single-tenant: we pass the callback's raw params (they include iss for RFC 9207, and state); the
    // core already validates state, but openid-client demands checks.state when the param is present.
    const params = ctx.params ?? { code: ctx.code }
    const checks: Record<string, unknown> = { code_verifier: ctx.codeVerifier }
    if (params.state !== undefined) checks.state = params.state
    const tokenSet = await client.callback(ctx.redirectUri, params, checks)
    return mapOidcIdentity(tokenSet.claims() as Record<string, unknown>, opts)
}
