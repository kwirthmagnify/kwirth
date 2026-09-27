import { EIdpConnectorKind, IIdpAuthContext, IIdpCallbackContext, IIdpConfigFieldDef, IIdpConnector, IIdpIdentity, oidcBuildAuthorizationUrl, oidcHandleCallback } from '@kwirthmagnify/kwirth-common-back'

/*
    The GitLab.com (SaaS) connector — OIDC. A thin artefact: all the OIDC logic lives in common-back
    (oidc*), which the back end exposes as a global; here we only supply id/label/kind and the FIXED
    issuer (gitlab.com). The admin only supplies credentials (they cannot change the issuer). For a
    self-managed GitLab use the 'gitlab-onprem' connector. Zero runtime dependencies of its own (the core
    gives openid-client).
*/
const ISSUER = 'https://gitlab.com'

export default class GitlabCloudConnector implements IIdpConnector {
    id = 'gitlab-cloud'
    label = 'Login with GitLab'
    kind = EIdpConnectorKind.OIDC

    getConfigSchema(): IIdpConfigFieldDef[] {
        return [
            { name: 'clientId', label: 'Application ID', type: 'text', required: true },
            { name: 'clientSecret', label: 'Secret', type: 'password', required: true },
            { name: 'scopes', label: 'Scopes', type: 'text' }
        ]
    }

    buildAuthorizationUrl(config: Record<string, unknown>, ctx: IIdpAuthContext): Promise<string> {
        return oidcBuildAuthorizationUrl(config, ctx, ISSUER)
    }

    handleCallback(config: Record<string, unknown>, ctx: IIdpCallbackContext): Promise<IIdpIdentity> {
        return oidcHandleCallback(config, ctx, ISSUER)
    }
}
