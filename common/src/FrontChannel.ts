enum ENotifyLevel {
    INFO = 'info',
    ERROR = 'error',
    WARNING = 'warning',
    SUCCESS = 'success'
}

enum EChannelRefreshAction {
    NONE,
    REFRESH,
    STOP
}

interface IChannelMessageAction {
    action: EChannelRefreshAction
    data?: any
}

interface IChannelSettings {
    channelId: string
    channelConfig: any
    channelInstanceConfig: any
}

interface IChannelRequirements {
    setup: boolean
    settings: boolean
    frontChannels: boolean
    metrics: boolean
    notifier: boolean
    notifications: boolean
    clusterUrl: boolean
    clusterInfo: boolean
    accessString: boolean
    webSocket: boolean
    userSettings: boolean
    palette: boolean
    exit: boolean
    backChannels: boolean
    openManager?: boolean
}

export { ENotifyLevel, EChannelRefreshAction }
export type { IChannelMessageAction, IChannelSettings, IChannelRequirements }
