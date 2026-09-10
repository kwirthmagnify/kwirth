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

// opciones de mapeo/validación para conectores OIDC no estándar (Entra, etc.)
export interface IOidcCallbackOptions {
    emailClaims?: string[]      // orden de fallback para el email (default ['email'])
    assumeVerified?: boolean    // tratar el email como verificado si el IdP no emite email_verified
    multiTenant?: boolean       // validar el iss contra el tid del token (Entra organizations/common)
    allowedTenants?: string[]   // (opcional) whitelist de tenants (GUIDs) permitidos en multiTenant
}

// esquema de config estándar de un IdP OIDC (clientSecret es 'password' → se enmascara en la UI)
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

// mapea los claims del id_token a la identidad de Kwirth (fallback de email + verified asumido)
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

// ¿el tenant (tid) está permitido? (allowlist vacía = cualquier tenant)
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
        // openid-client valida el iss de forma LITERAL y en multi-tenant el issuer descubierto lleva el
        // placeholder {tenantid}; hacemos el intercambio crudo (grant, sin validar id_token) y validamos
        // el id_token a mano con jose: firma (JWKS del issuer) + iss contra el tid concreto del token.
        const tokenSet = await client.grant({
            grant_type: 'authorization_code',
            code: ctx.code,
            redirect_uri: ctx.redirectUri,
            code_verifier: ctx.codeVerifier
        })
        if (!tokenSet.id_token) throw new Error('OIDC multi-tenant: token response has no id_token')
        const tid = tokenSet.claims().tid as string | undefined   // sin verificar; solo para conocer el tenant
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

    // single-tenant: pasamos los params crudos del callback (incluyen iss para RFC 9207 y state); el state
    // ya lo valida el core, pero openid-client exige checks.state si el param state viene presente.
    const params = ctx.params ?? { code: ctx.code }
    const checks: Record<string, unknown> = { code_verifier: ctx.codeVerifier }
    if (params.state !== undefined) checks.state = params.state
    const tokenSet = await client.callback(ctx.redirectUri, params, checks)
    return mapOidcIdentity(tokenSet.claims() as Record<string, unknown>, opts)
}
