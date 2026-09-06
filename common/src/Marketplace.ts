import { EExtensionType } from './ExtensionType'

// Como se autentica Kwirth contra el registro de paquetes de un marketplace. El manifest siempre se
// lee abierto; esto aplica solo a la DESCARGA DEL PAQUETE. Enum (regla: no string-literals para
// valores enumerados que cruzan back↔front).
export enum EMarketplaceAuthType {
    NONE = 'none',
    BASIC = 'basic'
}

// Credenciales de un marketplace. La contraseña se trata como CUALQUIER otro dato: viaja al front,
// se pre-rellena en el campo (enmascarado, con ojo para revelar) y se reenvia tal cual al guardar.
// En reposo el back la guarda en ISecrets (cifrada en filesystem, RBAC en k8s), no en el configmap.
export interface IMarketplaceAuth {
    type: EMarketplaceAuthType
    username?: string
    password?: string
}

// Como se autentica la LECTURA DEL MANIFEST. Es independiente de la descarga del paquete: el manifest
// puede vivir en un repo git privado (cabecera PRIVATE-TOKEN de GitLab) mientras los paquetes estan en
// otro sitio con otras credenciales, o al reves.
export enum EManifestAuthType {
    NONE = 'none',
    PRIVATE_TOKEN = 'privateToken',   // cabecera PRIVATE-TOKEN (GitLab API)
    BEARER = 'bearer',                // cabecera Authorization: Bearer (GitHub Contents API)
    BASIC = 'basic'                   // cabecera Authorization: Basic (Azure DevOps: PAT como contraseña)
}

// El token se trata igual que la contraseña: viaja al front y se muestra enmascarado con ojo.
// En reposo lo guarda el back en ISecrets, no en el configmap.
export interface IMarketplaceManifestAuth {
    type: EManifestAuthType
    token?: string
    // Solo en BASIC: la parte de usuario. Azure DevOps ignora el usuario y solo mira el PAT, asi que
    // puede quedar vacio; otros hosts que usen Basic si lo necesitan.
    username?: string
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
    // Solo en 'docs': el TIPO de la extension documentada. La documentacion se identifica por el par
    // (targetType, id), porque el id es el de esa extension y puede repetirse entre tipos: un plugin
    // y un theme pueden llamarse igual y traer cada uno su guia.
    targetType?: string
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
