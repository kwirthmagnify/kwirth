/*
    Interfaz de conector de Identity Provider (IdP) para Kwirth.

    Un conector es LOGICA PURA (sin rutas propias): construye la URL de autorizacion del IdP
    y procesa el callback devolviendo la identidad verificada. El flujo HTTP pre-login y la
    emision de AccessKey viven en el core de Kwirth, nunca en el conector.

    Vive en common-back para que los conectores empaquetados por separado (idps/<id>/) puedan
    implementarlo importando '@kwirthmagnify/kwirth-common-back', igual que ISender/IProvider.
*/

export enum EIdpConnectorKind {
    OIDC = 'oidc',
    OAUTH2 = 'oauth2'
}

export type IdpFieldType = 'text' | 'number' | 'boolean' | 'password'

// campo del schema de configuracion (para generar el formulario en el front, con secretos 'password')
export interface IIdpConfigFieldDef {
    name: string
    label: string
    type?: IdpFieldType
    required?: boolean
    options?: string[]
}

// identidad verificada que el conector extrae del IdP tras el callback
export interface IIdpIdentity {
    email: string
    emailVerified: boolean
    name?: string
    sub?: string
}

// contexto que el core pasa al conector para construir la URL de autorizacion
export interface IIdpAuthContext {
    redirectUri: string
    state: string
    codeChallenge: string
}

// contexto que el core pasa al conector para procesar el callback
export interface IIdpCallbackContext {
    code: string
    codeVerifier: string
    redirectUri: string
    params?: Record<string, string>   // query params crudos del callback (code, state, iss, ...) para RFC 9207
}

export interface IIdpConnector {
    id: string
    label: string
    kind: EIdpConnectorKind
    getConfigSchema(): IIdpConfigFieldDef[]
    buildAuthorizationUrl(config: Record<string, unknown>, ctx: IIdpAuthContext): Promise<string> | string
    handleCallback(config: Record<string, unknown>, ctx: IIdpCallbackContext): Promise<IIdpIdentity>
}

// instancia de IdP configurada (persistida en el Secret kwirth-idps). IUser.idp === IIdpInstanceConfig.id
export interface IIdpInstanceConfig {
    id: string
    connectorId: string
    label: string
    enabled: boolean
    config: Record<string, unknown>
}

export type TIdpConnectorConstructor = new () => IIdpConnector
