import { EExtensionType } from './ExtensionType'

// Como se autentica la LECTURA DEL MANIFEST. Un marketplace SOLO sirve manifests; de donde se bajan los
// paquetes lo dice la url de cada entrada, y sus credenciales viven aparte, en IPackageRegistry.
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
//
// Aqui SOLO se configura como leer el manifest. Donde vive cada paquete lo dice la url de su entrada, y
// las credenciales para bajarlo salen de IPackageRegistry casando esa url — porque manifest y paquetes
// son sitios distintos: el marketplace publico tiene los manifests en GitHub y los tarballs en npmjs.
export interface IMarketplace {
    id: string
    url: string
    label: string
    enabled: boolean
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
