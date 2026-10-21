/*
    The Identity Provider (IdP) connector interface for Kwirth.

    A connector is PURE LOGIC (with no routes of its own): it builds the IdP's authorization URL and
    processes the callback, returning the verified identity. The pre-login HTTP flow and the issuing of
    the AccessKey live in Kwirth's core, never in the connector.

    It lives in common-back so that connectors packaged separately (idps/<id>/) can implement it by
    importing '@kwirthmagnify/kwirth-common-back', just like ISender/IProvider.
*/

import { TConfigFieldType, IConfigFieldDef, IIdpSignupPolicy } from '@kwirthmagnify/kwirth-common'
import { IExtension } from './IExtension'

export enum EIdpConnectorKind {
    OIDC = 'oidc',
    OAUTH2 = 'oauth2'
}

/** @deprecated use TConfigFieldType, common to every extension. */
export type IdpFieldType = TConfigFieldType

// config schema field (used to generate the form in the front end, with secrets as 'password').
// It is the common contract IConfigFieldDef, with nothing of its own.
export type IIdpConfigFieldDef = IConfigFieldDef

/** The configuration key an instance pins its redirect_uri under. */
export const IDP_REDIRECT_URI_FIELD = 'redirectUri'

/*
    The field a connector adds to its schema so the redirect_uri can be pinned. It is offered as a
    factory, and not copied into each connector, so that the KEY cannot drift: the label is the
    connector's business ('Redirect URI', 'Authorization callback URL'…), the name is the contract.
*/
export const idpRedirectUriField = (label = 'Redirect URI'): IIdpConfigFieldDef =>
    ({ name: IDP_REDIRECT_URI_FIELD, label, type: 'text' })

/*
    The redirect_uri an instance actually uses: the one it has pinned, or the default the core derived
    from the request (handed over in the context).

    It has to be pinnable because the derived one is a guess that a proxy breaks. Inside the pod the
    connection is plain HTTP, so without 'X-Forwarded-Proto' the scheme comes out as 'http' for a site
    the browser reached over HTTPS, and the provider answers 'invalid redirect uri'. OAuth2 only accepts
    'http' on loopback, so there is no deployment where guessing wrong is harmless.

    A pinned value that is not a usable absolute URL falls back to the derived one instead of travelling:
    sent as it is, the provider rejects it with a message that says nothing about where the typo is.
*/
export const resolveIdpRedirectUri = (config: Record<string, unknown>, derived: string): string => {
    const pinned = config[IDP_REDIRECT_URI_FIELD]
    if (typeof pinned !== 'string' || !pinned.trim()) return derived
    const value = pinned.trim()
    try {
        const url = new URL(value)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return derived
    }
    catch (err) { return derived }
    return value
}

// verified identity the connector extracts from the IdP after the callback
export interface IIdpIdentity {
    email: string
    emailVerified: boolean
    name?: string
    sub?: string
}

// context the core passes to the connector to build the authorization URL
export interface IIdpAuthContext {
    redirectUri: string
    state: string
    codeChallenge: string
}

// context the core passes to the connector to process the callback
export interface IIdpCallbackContext {
    code: string
    codeVerifier: string
    redirectUri: string
    params?: Record<string, string>   // raw callback query params (code, state, iss, ...) for RFC 9207
}

export interface IIdpConnector extends IExtension {
    id: string
    label: string
    kind: EIdpConnectorKind
    getConfigSchema(): IIdpConfigFieldDef[]
    buildAuthorizationUrl(config: Record<string, unknown>, ctx: IIdpAuthContext): Promise<string> | string
    handleCallback(config: Record<string, unknown>, ctx: IIdpCallbackContext): Promise<IIdpIdentity>
}

// a configured IdP instance (persisted in the kwirth-idps Secret). IUser.idp === IIdpInstanceConfig.id
export interface IIdpInstanceConfig {
    id: string
    connectorId: string
    label: string
    enabled: boolean
    config: Record<string, unknown>
    signup?: IIdpSignupPolicy   // the core's, not the connector's; undefined = signup disabled
}

export type TIdpConnectorConstructor = new () => IIdpConnector
