import { EIdpConnectorKind, IIdpAuthContext, IIdpCallbackContext, IIdpConfigFieldDef, IIdpConnector, IIdpIdentity, idpRedirectUriField, oidcBuildAuthorizationUrl, oidcHandleCallback } from '@kwirthmagnify/kwirth-common-back'

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
            { name: 'scopes', label: 'Scopes', type: 'text' },
            /*
                GitLab calls it 'Redirect URI' in the application's own form, so that is what it is
                called here: what goes in both places has to be the same string, and two names for one
                value is how they end up differing.

                Left empty, the core's derived value is used — which is a guess that a reverse proxy
                breaks: inside the pod the connection is plain HTTP, so without 'X-Forwarded-Proto' it
                comes out as 'http://…' for a GitLab that was reached over HTTPS, and GitLab answers
                'invalid redirect uri'.
            */
            idpRedirectUriField()
        ]
    }

    buildAuthorizationUrl(config: Record<string, unknown>, ctx: IIdpAuthContext): Promise<string> {
        return oidcBuildAuthorizationUrl(config, ctx)
    }

    handleCallback(config: Record<string, unknown>, ctx: IIdpCallbackContext): Promise<IIdpIdentity> {
        return oidcHandleCallback(config, ctx)
    }
}
