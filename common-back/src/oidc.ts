import { Issuer } from 'openid-client'
import { IIdpAuthContext, IIdpCallbackContext, IIdpConfigFieldDef, IIdpIdentity } from './IIdpConnector'

/*
    Lógica OIDC compartida por todos los conectores OIDC (Google, Keycloak, GitLab, Microsoft, ...).
    Vive en common-back y el back la expone como global (__kwirth_back__.kwirthCommonBack), de modo
    que los conectores la usan por composición SIN bundlear openid-client ni duplicar el flujo.

    Flujo Authorization Code + PKCE con intercambio back-channel (el id_token llega por TLS del
    token endpoint, así que openid-client valida issuer/aud y basta con eso).
*/

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
    return new issuer.Client({
        client_id: config.clientId as string,
        client_secret: config.clientSecret as string,
        redirect_uris: [redirectUri],
        response_types: ['code']
    })
}

export async function oidcBuildAuthorizationUrl(config: Record<string, unknown>, ctx: IIdpAuthContext, defaultIssuer?: string): Promise<string> {
    const client = await makeClient(config, ctx.redirectUri, defaultIssuer)
    const scope = (config.scopes as string) || 'openid email profile'
    return client.authorizationUrl({
        scope,
        state: ctx.state,
        redirect_uri: ctx.redirectUri,
        code_challenge: ctx.codeChallenge,
        code_challenge_method: 'S256'
    })
}

export async function oidcHandleCallback(config: Record<string, unknown>, ctx: IIdpCallbackContext, defaultIssuer?: string): Promise<IIdpIdentity> {
    const client = await makeClient(config, ctx.redirectUri, defaultIssuer)
    // pasamos los params crudos del callback (incluyen iss para RFC 9207 y state); el state ya lo
    // valida el core, pero openid-client exige checks.state si el param state viene presente.
    const params = ctx.params ?? { code: ctx.code }
    const checks: Record<string, unknown> = { code_verifier: ctx.codeVerifier }
    if (params.state !== undefined) checks.state = params.state
    const tokenSet = await client.callback(ctx.redirectUri, params, checks)
    const claims = tokenSet.claims()
    return {
        email: String(claims.email ?? ''),
        emailVerified: claims.email_verified === true,
        name: claims.name ? String(claims.name) : undefined,
        sub: claims.sub
    }
}
