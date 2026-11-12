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

    /*
        prompt=select_account: without it Google signs in silently with whatever account the browser already has
        open, and there is no way to log in to Kwirth with a different Google account (a second user, an admin
        account next to a personal one…). With it Google always shows its account chooser.
    */
    async buildAuthorizationUrl(config: Record<string, unknown>, ctx: IIdpAuthContext): Promise<string> {
        const url = new URL(await oidcBuildAuthorizationUrl(config, ctx, DEFAULT_ISSUER))
        url.searchParams.set('prompt', 'select_account')
        return url.toString()
    }

    handleCallback(config: Record<string, unknown>, ctx: IIdpCallbackContext): Promise<IIdpIdentity> {
        return oidcHandleCallback(config, ctx, DEFAULT_ISSUER)
    }
}
