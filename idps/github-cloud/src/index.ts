import { EIdpConnectorKind, IIdpAuthContext, IIdpCallbackContext, IIdpConfigFieldDef, IIdpConnector, IIdpIdentity, githubIdentityFromToken, oauth2BuildAuthorizationUrl, oauth2HandleCallback } from '@kwirthmagnify/kwirth-common-back'

/*
    Conector GitHub.com (SaaS) — OAuth2 (GitHub NO es OIDC). Artefacto fino: el flujo OAuth2 y el
    mapper de identidad de GitHub viven en common-back (oauth2* / github*), que el back expone como
    global; aquí solo aportamos id/label/kind y los endpoints FIJOS de github.com. El admin solo
    aporta credenciales. Para GitHub Enterprise Server usa el conector 'github-onprem'.
    Cero dependencias de runtime propias.
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
