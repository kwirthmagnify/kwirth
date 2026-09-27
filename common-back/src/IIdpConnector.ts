/*
    The Identity Provider (IdP) connector interface for Kwirth.

    A connector is PURE LOGIC (with no routes of its own): it builds the IdP's authorization URL and
    processes the callback, returning the verified identity. The pre-login HTTP flow and the issuing of
    the AccessKey live in Kwirth's core, never in the connector.

    It lives in common-back so that connectors packaged separately (idps/<id>/) can implement it by
    importing '@kwirthmagnify/kwirth-common-back', just like ISender/IProvider.
*/

import { TConfigFieldType, IConfigFieldDef } from '@kwirthmagnify/kwirth-common'
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
}

export type TIdpConnectorConstructor = new () => IIdpConnector
