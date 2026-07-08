import { EIdpConnectorKind, IIdpAuthContext, IIdpCallbackContext, IIdpConfigFieldDef, IIdpConnector, IIdpIdentity, oidcBuildAuthorizationUrl, oidcConfigSchema, oidcHandleCallback } from '@kwirthmagnify/kwirth-common-back'

/*
    Conector Google / Gmail (OIDC). Es un artefacto fino: toda la lógica OIDC vive en common-back
    (oidc*), que el back expone como global; aquí solo aportamos id/label/kind y el issuer por defecto.
    Cero dependencias de runtime propias (openid-client lo provee el core vía el global).
*/
const DEFAULT_ISSUER = 'https://accounts.google.com'

export default class GoogleConnector implements IIdpConnector {
    id = 'google'
    label = 'Login with Google'
    kind = EIdpConnectorKind.OIDC

    getConfigSchema(): IIdpConfigFieldDef[] {
        return oidcConfigSchema()
    }

    buildAuthorizationUrl(config: Record<string, unknown>, ctx: IIdpAuthContext): Promise<string> {
        return oidcBuildAuthorizationUrl(config, ctx, DEFAULT_ISSUER)
    }

    handleCallback(config: Record<string, unknown>, ctx: IIdpCallbackContext): Promise<IIdpIdentity> {
        return oidcHandleCallback(config, ctx, DEFAULT_ISSUER)
    }
}
