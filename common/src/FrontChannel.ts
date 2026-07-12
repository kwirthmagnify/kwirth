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
    setup: boolean              // Show setup dialog (if channel requires user setup)
    settings: boolean
    frontChannels: boolean
    metrics: boolean
    notifier: boolean
    notifications: boolean
    clusterUrl: boolean
    clusterInfo: boolean
    accessString: boolean       // if channel wants to send data to back channel, probably will need the access string
    webSocket: boolean          // if channel requires using the websocket for sending data to backend, this must be true
    userSettings: boolean
    palette: boolean
    exit: boolean               // if channel wants to allow user to exit kwirth
    backChannels: boolean
    openManager?: boolean
    clusterManagement?: boolean
}

export { ENotifyLevel, EChannelRefreshAction }
export type { IChannelMessageAction, IChannelSettings, IChannelRequirements }
