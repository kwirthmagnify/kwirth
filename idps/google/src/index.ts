import { EIdpConnectorKind, IIdpAuthContext, IIdpCallbackContext, IIdpConfigFieldDef, IIdpConnector, IIdpIdentity, oidcBuildAuthorizationUrl, oidcConfigSchema, oidcHandleCallback } from '@kwirthmagnify/kwirth-common-back'

/*
    The Google / Gmail connector (OIDC). It is a thin artefact: all the OIDC logic lives in common-back
    (oidc*), which the back end exposes as a global; here we only supply id/label/kind and the default
    issuer. Zero runtime dependencies of its own (the core provides openid-client through the global).
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
