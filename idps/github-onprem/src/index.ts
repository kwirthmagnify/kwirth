import { EIdpConnectorKind, IIdpAuthContext, IIdpCallbackContext, IIdpConfigFieldDef, IIdpConnector, IIdpIdentity, githubIdentityFromToken, oauth2BuildAuthorizationUrl, oauth2HandleCallback } from '@kwirthmagnify/kwirth-common-back'

/*
    The GitHub Enterprise Server (on-prem) connector — OAuth2. The same core as 'github-cloud' (oauth2* /
    github* from common-back) but with your GHE's URL (baseUrl) REQUIRED: the OAuth2 endpoints are derived
    from it and the API is <baseUrl>/api/v3 (configurable through apiBaseUrl). For GitHub.com use the
    'github-cloud' connector.
*/
const DEFAULT_SCOPES = 'read:user user:email'

const trimSlashes = (s: string): string => s.replace(/\/+$/, '')

export default class GithubOnpremConnector implements IIdpConnector {
    id = 'github-onprem'
    label = 'Login with GitHub'
    kind = EIdpConnectorKind.OAUTH2

    getConfigSchema(): IIdpConfigFieldDef[] {
        return [
            { name: 'baseUrl', label: 'GitHub Enterprise URL', type: 'text', required: true },
            { name: 'apiBaseUrl', label: 'API URL (default <baseUrl>/api/v3)', type: 'text' },
            { name: 'clientId', label: 'Client ID', type: 'text', required: true },
            { name: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
            { name: 'scopes', label: 'Scopes', type: 'text' }
        ]
    }

    private endpoints(config: Record<string, unknown>): { authorizationEndpoint: string, tokenEndpoint: string, apiBaseUrl: string } {
        const baseUrl = trimSlashes(String(config.baseUrl ?? ''))
        if (!baseUrl) throw new Error('GitHub Enterprise URL not configured')
        return {
            authorizationEndpoint: `${baseUrl}/login/oauth/authorize`,
            tokenEndpoint: `${baseUrl}/login/oauth/access_token`,
            apiBaseUrl: trimSlashes(String(config.apiBaseUrl || `${baseUrl}/api/v3`))
        }
    }

    buildAuthorizationUrl(config: Record<string, unknown>, ctx: IIdpAuthContext): string {
        const ep = this.endpoints(config)
        return oauth2BuildAuthorizationUrl(config, ctx, {
            authorizationEndpoint: ep.authorizationEndpoint,
            tokenEndpoint: ep.tokenEndpoint,
            defaultScopes: DEFAULT_SCOPES
        })
    }

    handleCallback(config: Record<string, unknown>, ctx: IIdpCallbackContext): Promise<IIdpIdentity> {
        const ep = this.endpoints(config)
        return oauth2HandleCallback(config, ctx,
            { authorizationEndpoint: ep.authorizationEndpoint, tokenEndpoint: ep.tokenEndpoint },
            (token) => githubIdentityFromToken(ep.apiBaseUrl, token))
    }
}
