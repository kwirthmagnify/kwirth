import { EIdpConnectorKind, IIdpAuthContext, IIdpCallbackContext, IIdpConfigFieldDef, IIdpConnector, IIdpIdentity, oidcBuildAuthorizationUrl, oidcHandleCallback } from '@kwirthmagnify/kwirth-common-back'

/*
    Conector GitLab self-managed (on-prem) — OIDC. Artefacto fino sobre los helpers OIDC de common-back
    (mismo core que 'gitlab-cloud' y 'google'). Aquí el issuer es REQUERIDO (la URL de tu GitLab,
    p.ej. https://gitlab.miempresa.com) y NO hay default: sin issuer configurado el helper lanza error.
    Para GitLab.com (SaaS) usa el conector 'gitlab-cloud'.
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
