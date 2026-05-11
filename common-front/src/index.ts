import { FC } from 'react'
import { EInstanceConfigView, EChannelRefreshAction, ENotifyLevel, IChannelMessageAction, IChannelSettings, IChannelRequirements } from '@kwirthmagnify/kwirth-common'

export { EChannelRefreshAction, ENotifyLevel }
export type { EInstanceConfigView, IChannelMessageAction, IChannelSettings, IChannelRequirements }

export type TChannelConstructor = (new () => IChannel) | undefined

export interface IChannelObject {
    clusterName: string
    view: EInstanceConfigView
    namespace: string
    group: string
    pod: string
    container: string
    instanceId: string
    instanceConfig: any
    config: any
    data: any
    accessString?: string
    isElectron: boolean
    channelId: string
    frontChannels?: Map<string, TChannelConstructor>
    notifications?: any[]
    webSocket?: WebSocket
    clusterUrl?: string
    clusterInfo?: any
    channelSettings?: IChannelSettings
    updateChannelSettings?: (channelSettings: IChannelSettings) => void
    createTab?: (resource: any, start: boolean, settings: any) => void
    readChannelUserPreferences?: (channelId: string) => Promise<any>
    writeChannelUserPreferences?: (channelId: string, data: any) => Promise<boolean>
    setPalette?: (palette: string) => void
    notify?: (channelId: string | undefined, level: ENotifyLevel, message: string) => void
    exit?: () => void
}

export interface ISetupProps {
    onChannelSetupClosed: (channel: IChannel, channelSettings: IChannelSettings, start: boolean, defaultValues: boolean) => void
    channel: IChannel
    setupConfig?: IChannelSettings
    channelObject: IChannelObject
    instanceSettings?: any
}

export interface IContentProps {
    channelObject: IChannelObject
}

export interface IChannel {
    SetupDialog: FC<ISetupProps>
    TabContent: FC<IContentProps>
    readonly channelId: string
    requirements: IChannelRequirements
    getScope(): string
    getChannelIcon(): JSX.Element
    getSetupVisibility(): boolean
    setSetupVisibility(visibility: boolean): void
    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction
    initChannel(channelObject: IChannelObject): Promise<boolean>
    startChannel(channelObject: IChannelObject): boolean
    pauseChannel(channelObject: IChannelObject): boolean
    continueChannel(channelObject: IChannelObject): boolean
    stopChannel(channelObject: IChannelObject): boolean
    socketDisconnected(channelObject: IChannelObject): boolean
    socketReconnect(channelObject: IChannelObject): boolean
}
