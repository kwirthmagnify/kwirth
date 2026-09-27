import { EIdpConnectorKind, IIdpAuthContext, IIdpCallbackContext, IIdpConfigFieldDef, IIdpConnector, IIdpIdentity, oidcBuildAuthorizationUrl, oidcHandleCallback } from '@kwirthmagnify/kwirth-common-back'

/*
    The self-managed (on-prem) GitLab connector — OIDC. A thin artefact over common-back's OIDC helpers
    (the same core as 'gitlab-cloud' and 'google'). Here the issuer is REQUIRED (your GitLab's URL,
    https://gitlab.mycompany.com for instance) and there is NO default: with no issuer configured the
    helper throws. For GitLab.com (SaaS) use the 'gitlab-cloud' connector.
*/
export default class GitlabOnpremConnector implements IIdpConnector {
    id = 'gitlab-onprem'
    label = 'Login with GitLab'
    kind = EIdpConnectorKind.OIDC

    getConfigSchema(): IIdpConfigFieldDef[] {
        return [
            { name: 'issuer', label: 'GitLab URL', type: 'text', required: true },
            { name: 'clientId', label: 'Application ID', type: 'text', required: true },
            { name: 'clientSecret', label: 'Secret', type: 'password', required: true },
            { name: 'scopes', label: 'Scopes', type: 'text' }
        ]
    }

    buildAuthorizationUrl(config: Record<string, unknown>, ctx: IIdpAuthContext): Promise<string> {
        return oidcBuildAuthorizationUrl(config, ctx)
    }

    handleCallback(config: Record<string, unknown>, ctx: IIdpCallbackContext): Promise<IIdpIdentity> {
        return oidcHandleCallback(config, ctx)
    }
}
