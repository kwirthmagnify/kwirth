import { EIdpConnectorKind, IIdpAuthContext, IIdpCallbackContext, IIdpConfigFieldDef, IIdpConnector, IIdpIdentity, githubIdentityFromToken, oauth2BuildAuthorizationUrl, oauth2HandleCallback } from '@kwirthmagnify/kwirth-common-back'

/*
    The GitHub.com (SaaS) connector — OAuth2 (GitHub is NOT OIDC). A thin artefact: the OAuth2 flow and
    GitHub's identity mapper live in common-back (oauth2* / github*), which the back end exposes as a
    global; here we only supply id/label/kind and github.com's FIXED endpoints. The admin only supplies
    credentials. For GitHub Enterprise Server use the 'github-onprem' connector.
    Zero runtime dependencies of its own.
*/
const AUTHORIZATION_ENDPOINT = 'https://github.com/login/oauth/authorize'
const TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token'
const API_BASE_URL = 'https://api.github.com'
const DEFAULT_SCOPES = 'read:user user:email'

export default class GithubCloudConnector implements IIdpConnector {
    id = 'github-cloud'
    label = 'Login with GitHub'
    kind = EIdpConnectorKind.OAUTH2

    getConfigSchema(): IIdpConfigFieldDef[] {
        return [
            { name: 'clientId', label: 'Client ID', type: 'text', required: true },
            { name: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
            { name: 'scopes', label: 'Scopes', type: 'text' }
        ]
    }

    buildAuthorizationUrl(config: Record<string, unknown>, ctx: IIdpAuthContext): string {
        return oauth2BuildAuthorizationUrl(config, ctx, {
            authorizationEndpoint: AUTHORIZATION_ENDPOINT,
            tokenEndpoint: TOKEN_ENDPOINT,
            defaultScopes: DEFAULT_SCOPES
        })
    }

    handleCallback(config: Record<string, unknown>, ctx: IIdpCallbackContext): Promise<IIdpIdentity> {
        return oauth2HandleCallback(config, ctx,
            { authorizationEndpoint: AUTHORIZATION_ENDPOINT, tokenEndpoint: TOKEN_ENDPOINT },
            (token) => githubIdentityFromToken(API_BASE_URL, token))
    }
}
