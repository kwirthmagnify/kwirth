import { EExtensionType } from './ExtensionType'

// How READING THE MANIFEST is authenticated. A marketplace serves manifests ONLY; where the packages
// are downloaded from is said by each entry's url, and their credentials live apart, in IPackageRegistry.
export enum EManifestAuthType {
    NONE = 'none',
    PRIVATE_TOKEN = 'privateToken',   // PRIVATE-TOKEN header (GitLab API)
    BEARER = 'bearer',                // Authorization: Bearer header (GitHub Contents API)
    BASIC = 'basic'                   // Authorization: Basic header (Azure DevOps: the PAT as password)
}

// The token is handled just like the password: it travels to the front end and is shown masked with an
// eye. At rest the back end keeps it in ISecrets, not in the configmap.
export interface IMarketplaceManifestAuth {
    type: EManifestAuthType
    token?: string
    // BASIC only: the user part. Azure DevOps ignores the user and looks only at the PAT, so it can be
    // left empty; other hosts using Basic do need it.
    username?: string
}

// A marketplace registered by the administrator. The url points at ONE manifest, which may contain
// extensions of several types: each entry carries its extensionType and the managers filter by theirs.
//
// Only how to READ THE MANIFEST is configured here. Where each package lives is said by its entry's url,
// and the credentials to download it come from IPackageRegistry by matching that url — because manifest
// and packages are different places: the public marketplace has the manifests on GitHub and the tarballs
// on npmjs.
export interface IMarketplace {
    id: string
    url: string
    label: string
    enabled: boolean
    manifestAuth?: IMarketplaceManifestAuth
}

// A manifest entry already resolved by the back end, with its provenance stamped on. An undefined
// marketplaceId means it comes from the public OSS marketplace.
export interface IMarketplaceEntry {
    extensionType: EExtensionType
    // 'docs' only: the TYPE of the documented extension. Documentation is identified by the pair
    // (targetType, id), because the id is that extension's own and can repeat across types: a plugin
    // and a theme may share a name and each bring its own guide.
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
