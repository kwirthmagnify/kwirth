import { EExtensionType } from './ExtensionType'

// Como se autentica Kwirth contra el registro de paquetes de un marketplace. El manifest siempre se
// lee abierto; esto aplica solo a la DESCARGA DEL PAQUETE. Enum (regla: no string-literals para
// valores enumerados que cruzan back↔front).
export enum EMarketplaceAuthType {
    NONE = 'none',
    BASIC = 'basic'
}

// Credenciales de un marketplace. La contraseña NUNCA viaja en este objeto: se guarda aparte en
// ISecrets (cifrado en filesystem, RBAC en k8s) y el back solo informa de si existe via hasPassword.
export interface IMarketplaceAuth {
    type: EMarketplaceAuthType
    username?: string
    hasPassword?: boolean   // solo lectura, lo calcula el back; enviarlo en un PUT no tiene efecto
}

// Como se autentica la LECTURA DEL MANIFEST. Es independiente de la descarga del paquete: el manifest
// puede vivir en un repo git privado (cabecera PRIVATE-TOKEN de GitLab) mientras los paquetes estan en
// otro sitio con otras credenciales, o al reves.
export enum EManifestAuthType {
    NONE = 'none',
    PRIVATE_TOKEN = 'privateToken',   // cabecera PRIVATE-TOKEN (GitLab API)
    BEARER = 'bearer'                 // cabecera Authorization: Bearer
}

// El token NUNCA viaja en este objeto: se guarda en ISecrets y el back solo informa de si existe.
export interface IMarketplaceManifestAuth {
    type: EManifestAuthType
    hasToken?: boolean   // solo lectura, lo calcula el back; enviarlo en un PUT no tiene efecto
}

// Un marketplace registrado por el administrador. La url apunta a UN manifest, que puede contener
// extensiones de varios tipos: cada entrada lleva su extensionType y los managers filtran por el suyo.
// La ubicacion del paquete no se configura aqui, viene en el campo url de cada entrada del manifest.
//
// Dos credenciales independientes, porque son dos servidores distintos:
//   manifestAuth -> leer el manifest (p.ej. la API de un GitLab privado)
//   auth         -> descargar el paquete (p.ej. un endpoint npm de Nexus con basic auth)
export interface IMarketplace {
    id: string
    url: string
    label: string
    enabled: boolean
    auth?: IMarketplaceAuth
    manifestAuth?: IMarketplaceManifestAuth
}

// Una entrada de manifest ya resuelta por el back, con la procedencia estampada. marketplaceId
// undefined = viene del marketplace publico OSS.
export interface IMarketplaceEntry {
    extensionType: EExtensionType
    id: string
    version: string
    name: string
    url: string
    description?: string
    icon?: string
    website?: string
    marketplaceId?: string
    marketplaceLabel?: string
}
