import type { IProviderSchemaField } from '../ProviderManager'

/*
    Un conector de IdP es LOGICA PURA (no expone rutas): sabe construir la URL de
    autorizacion del IdP y procesar el callback devolviendo la identidad verificada.
    El flujo HTTP pre-login y la emision de AccessKey viven en el core (AuthApi), nunca aqui.
    Los conectores se cargan como extensiones (bundled / instalable / dev), igual que providers.

    El esquema de config (IProviderSchemaField, con type:'password' para secretos) se reutiliza
    del modelo de providers para generar el formulario de configuracion en el front.
*/

enum EIdpConnectorKind {
    OIDC = 'oidc',
    OAUTH2 = 'oauth2'
}

// identidad verificada que el conector extrae del IdP tras el callback
interface IIdpIdentity {
    email: string
    emailVerified: boolean
    name?: string
    sub?: string          // identificador estable del IdP (hardening futuro: binding por sub)
}

// contexto que el core pasa al conector para construir la URL de autorizacion
interface IIdpAuthContext {
    redirectUri: string
    state: string
    codeChallenge: string
}

// contexto que el core pasa al conector para procesar el callback
interface IIdpCallbackContext {
    code: string
    codeVerifier: string
    redirectUri: string
}

interface IIdpConnector {
    connectorId: string        // 'google' | 'generic-oidc' | ...
    label: string
    kind: EIdpConnectorKind
    getConfigSchema(): IProviderSchemaField[]
    buildAuthorizationUrl(config: Record<string, unknown>, ctx: IIdpAuthContext): Promise<string> | string
    handleCallback(config: Record<string, unknown>, ctx: IIdpCallbackContext): Promise<IIdpIdentity>
}

// instancia de IdP configurada (persistida en el Secret kwirth-idps). IUser.idp === IIdpInstanceConfig.id
interface IIdpInstanceConfig {
    id: string                 // instanceId (p.ej. 'google', 'corp-keycloak')
    connectorId: string        // que conector usa esta instancia
    label: string              // texto del boton de login
    enabled: boolean
    config: Record<string, unknown>   // valores segun getConfigSchema del conector (incluye secretos)
}

// constructor para el registry de conectores (registeredIdps), analogo a TProviderConstructor
type TIdpConnectorConstructor = new () => IIdpConnector

export {
    EIdpConnectorKind,
    IIdpIdentity,
    IIdpAuthContext,
    IIdpCallbackContext,
    IIdpConnector,
    IIdpInstanceConfig,
    TIdpConnectorConstructor
}
