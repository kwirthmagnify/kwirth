import { AccessKey } from "./AccessKey"
import { IKwirthLogSettings } from "./Logging"
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
    /*
        Where the previous container's log is SENT when the core finds one at startup: the same
        (senderId, configName) pair every channel uses, kept as two flat fields because that is how
        alert, censor and echo already carry it and a pair type would be the only one of its kind.

        Empty means nobody is told, which is what happened before this existed: the log sat in memory
        waiting for someone to open the About. A restart at four in the morning is precisely the one
        nobody is going to see.
    */
    previousLogSenderId?: string
    previousLogSenderConfigName?: string
    /*
        How many of the recovered lines travel in that message. Its own number, apart from
        'previousLogLines': up to a thousand are read so the cause does not fall outside the window,
        but a thousand lines in an email is not read by anyone and a Teams webhook rejects the payload
        outright. 200 by default.
    */
    previousLogSenderLines?: number
    /*
        How talkative the core's own log is, per component. Until this existed, the enabled components
        were a constant in the module: 'auth' and 'stor' were off and there was no way of turning them on
        without recompiling, and there was no level filter at all.
    */
    log?: IKwirthLogSettings
}

export { ILoginResponse, IUser, IUserInfo, IClusterMetricsConfig, IKwirthSettings }