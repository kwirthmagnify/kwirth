import { EIdpConnectorKind, IIdpAuthContext, IIdpCallbackContext, IIdpConfigFieldDef, IIdpConnector, IIdpIdentity, githubIdentityFromToken, oauth2BuildAuthorizationUrl, oauth2HandleCallback } from '@kwirthmagnify/kwirth-common-back'

/*
    Conector GitHub Enterprise Server (on-prem) — OAuth2. Mismo core que 'github-cloud' (oauth2* /
    github* de common-back) pero con la URL de tu GHE (baseUrl) REQUERIDA: los endpoints OAuth2 se
    derivan de ella y la API es <baseUrl>/api/v3 (configurable vía apiBaseUrl). Para GitHub.com usa
    el conector 'github-cloud'.
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
