import { AccessKey } from "./AccessKey"
import { IMarketplace } from "./Marketplace"
import { IPackageRegistry } from "./PackageRegistry"

interface IUser {
    id: string
    name: string
    password: string
    accessKey: AccessKey
    resources: string
    idp?: string           // the instanceId of the IdP the user is bound to; empty/undefined = a local kwirth user
    startChannel?: string  // the channel to start in fullscreen on logging in
    startView?: string     // the EInstanceConfigView value for startChannel (default: 'cluster')
    startNamespace?: string
    startGroup?: string
    startPod?: string
    startContainer?: string
    exitFullScreen?: boolean  // whether the user may leave fullscreen mode
    enabledChannels?: string[]  // the list of channels the user may launch; undefined = all of them
}

interface ILoginResponse {
    id: string
    name: string
    accessKey: AccessKey
    startChannel?: string
    exitFullScreen?: boolean
    enabledChannels?: string[]
}

// SAFE subset of IUser exposed to plugins and consumers (never password/accessKey/resources).
// Returned by IBackChannelObject.getUsers(). Enough for display and for referencing an owner.
interface IUserInfo {
    id: string
    name: string
    idp?: string
}

interface IClusterMetricsConfig {
    metricsInterval: number
}

// Kwirth's own configuration, persisted by the back end under the key 'kwirth.settings' and served by
// /core/settings. Not to be confused with the user's settings, which go through /store.
// Every field is optional: settings saved before a field existed will not have it, and the back end
// resolves the effective value with its own precedence before returning them.
interface IKwirthSettings {
    metricsInterval?: number
    // Where the manifests are READ from
    marketplaces?: IMarketplace[]
    // Where the packages are DOWNLOADED from, and with which credentials. A separate list because there
    // is no one-to-one relation: one manifest can list tarballs hosted in several different registries.
    packageRegistries?: IPackageRegistry[]
    /*
        How many lines of the PREVIOUS container's log are read at startup (kubernetes, in-cluster).
        1000 by default. It is a setting because 1000 is a reasonable number, not a truth: a core that
        spews a lot at startup needs more so that the cause of the shutdown does not fall outside the
        window. What is stored wins, then the PREVIOUSLOGLINES variable, then the default.
    */
    previousLogLines?: number
}

export { ILoginResponse, IUser, IUserInfo, IClusterMetricsConfig, IKwirthSettings }