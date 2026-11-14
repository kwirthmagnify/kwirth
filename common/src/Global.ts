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
    tags?: string[]           // `<extension>:<value>`, set by an admin; read by each extension, never a permission (UserTags.ts)
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
    tags?: string[]   // the user's tags (UserTags.ts); an extension reads only its own (`userTagsOf`)
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
        Where a new signup request is announced (plan: plans/completed/signup, S4): the same flat (senderId,
        configName) pair as the previous log's. The front end already tells administrators on login; this
        reaches the ones who are not logging in. Empty = nobody is told by a sender.
    */
    signupSenderId?: string
    signupSenderConfigName?: string
    /*
        How talkative the core's own log is, per component. Until this existed, the enabled components
        were a constant in the module: 'auth' and 'stor' were off and there was no way of turning them on
        without recompiling, and there was no level filter at all.
    */
    log?: IKwirthLogSettings
    /*
        Where a login may come from. Undefined, switched off or an empty 'allowed' = anybody may try, as
        before. Read by the login on every attempt, so switching it off with 'kubectl edit' takes effect
        without a restart.
    */
    loginIpFilter?: ILoginIpFilter
}

/*
    Where a login may come from (plan: plans/login-ip-filter). Both lists hold IPs or CIDRs, IPv4 or IPv6.

    'enabled' is the switch, off on a fresh installation. The filter acts ONLY when it is on AND 'allowed'
    has something: an empty list lets everybody in even when switched on, so a hand edit of the configmap
    cannot lock the whole world out. Switching it off is also the way out ('kubectl edit').

    'allowed' is checked on every way in that issues an AccessKey (password login and change, IdP start and
    callback, signup).

    'trustedProxies' is what makes the filter impossible to dodge. X-Forwarded-For is believed ONLY when the
    connection comes from one of them, and it is walked right to left skipping trusted hops: the client is
    the first hop that is not trusted. Whatever a client writes on the left of the header is never read.
*/
interface ILoginIpFilter {
    enabled: boolean
    allowed: ILoginIpEntry[]
    trustedProxies: ILoginIpEntry[]
}

/*
    One entry of a login IP list: an IP or CIDR (IPv4 or IPv6) and a note that says what it is. Only
    'address' is ever checked; 'comment' is for whoever reads the list, '' when there is none.
*/
interface ILoginIpEntry {
    address: string
    comment: string
}

// Why a login was refused, as the body of the 403. Typed so the front end never decides by a message.
enum ELoginRefusal {
    IPNOTALLOWED = 'ipnotallowed'
}

interface ILoginRefusal {
    refusal: ELoginRefusal
}

/*
    How the core sees whoever is asking, so the settings dialog can show it: the resolved client address,
    the address of the TCP connection, and whether an X-Forwarded-For arrived and was ignored because the
    connection did not come from a trusted proxy (the hint that a proxy is missing from the list).
*/
interface ICallerAddress {
    ip: string
    remoteAddress: string
    forwardedIgnored: boolean
}

export { ILoginResponse, IUser, IUserInfo, IClusterMetricsConfig, IKwirthSettings, ILoginIpFilter, ILoginIpEntry, ELoginRefusal, ILoginRefusal, ICallerAddress }