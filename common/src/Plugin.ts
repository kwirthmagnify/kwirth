/*
    What the core says about its installed plugins (plan: plans/kwirth-status/PLAN-v2.md, S3).

    It lives here and not in the core because three parties read it: the core, which builds it; the
    channel that shows it (Status), in its back end; and that channel's front end, which receives it. With
    a copy on each side, a value changed in one would be found out at runtime — here it is one type.
*/

/** What a channel has running right now, as the channel itself counts it (IChannel.getInstances). */
export interface IChannelInstances {
    /** Instances started: one per open tab of this channel, across every user. */
    instances: number
    /** Live websocket connections carrying those instances (one browser can carry several). */
    connections: number
}

/** How an installed plugin is doing in THIS Kwirth, from what the core already knows about it. */
export enum EPluginState {
    /** Its channel is instantiated here and serving tabs. */
    RUNNING = 'running',
    /** A 'single' channel: the in-cluster Kwirth hosts it, this one only announces it. */
    REMOTE = 'remote',
    /** Its channel class is registered, but it has not been instantiated (not among the required channels). */
    NOT_STARTED = 'not-started',
    /** Installed, but its back.js registered no channel class: it cannot run. */
    FAILED = 'failed'
}

/** One installed plugin and what its channel has running. */
export interface IPluginStatus {
    id: string
    /** The display name when it has one, otherwise the package name. */
    name: string
    version: string
    /** Where it was installed from: a marketplace URL, 'dev', 'bundled', 'local'… */
    source?: string
    /** Its package declares that installing or updating it needs a core restart. */
    requiresRestart: boolean
    state: EPluginState
    /**
     * What its channel reports it has running. ABSENT when it is not RUNNING, when the channel does not
     * implement getInstances(), or when calling it threw: "not reported", never zero.
     */
    instances?: IChannelInstances
}

/** What the core lends of its plugins, read-only (ClusterInfo.plugins; the Status channel's Plugins tab). */
export interface IPluginAccess {
    listPlugins(): Promise<IPluginStatus[]>
}
