// A package registry is where tarballs are DOWNLOADED from, and it need not be the place where the
// manifest listing them lives. The public marketplace already works this way: the manifests are on
// GitHub and the packages on npmjs. That is why this is a list of its own, separate from the
// marketplaces list and not a property of it: one manifest can list extensions hosted in different
// registries.
//
// When downloading, the registry is chosen by MATCHING THE URL of the tarball against its `url`,
// treated as a prefix.

export enum EPackageRegistryAuthType {
    NONE = 'none',
    BASIC = 'basic',     // Authorization: Basic — the account's username and password
    BEARER = 'bearer'    // Authorization: Bearer — an opaque user token
}

// The secret — password or token, depending on the type — is handled like any other piece of data: it
// travels to the front end, is pre-filled masked with an eye to reveal it, and is sent back as it is on
// save. At rest the back end keeps it in ISecrets (encrypted on the filesystem, RBAC on k8s), never in
// the configmap.
//
// ⚠️ The npm endpoint of a Nexus with user tokens does NOT accept Basic: verified against the real
// server, the same credential gives 200 as Bearer and 401 as Basic. And the token is OPAQUE — it is not
// a base64 of 'user:password', so one type cannot be converted into the other.
export interface IPackageRegistryAuth {
    type: EPackageRegistryAuthType
    // BASIC only
    username?: string
    password?: string
    // BEARER only
    token?: string
}

export interface IPackageRegistry {
    id: string
    label: string
    // The PREFIX of the URLs this registry serves, not just the host: one Nexus hosts several repos and
    // perhaps only one of them asks for credentials. When several match, the longest prefix wins, so a
    // specific rule can beat a general one.
    url: string
    enabled: boolean
    auth?: IPackageRegistryAuth
}
