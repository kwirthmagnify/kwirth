import { EIdpConnectorKind, IIdpAuthContext, IIdpCallbackContext, IIdpConfigFieldDef, IIdpConnector, IIdpIdentity, oidcBuildAuthorizationUrl, oidcHandleCallback } from '@kwirthmagnify/kwirth-common-back'

/*
    Conector GitLab.com (SaaS) — OIDC. Artefacto fino: toda la lógica OIDC vive en common-back (oidc*),
    que el back expone como global; aquí solo aportamos id/label/kind y el issuer FIJO (gitlab.com).
    El admin solo aporta credenciales (no puede cambiar el issuer). Para GitLab self-managed usa
    el conector 'gitlab-onprem'. Cero dependencias de runtime propias (openid-client lo da el core).
*/
const ISSUER = 'https://gitlab.com'

export default class GitlabCloudConnector implements IIdpConnector {
    connectorId = 'gitlab-cloud'
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
