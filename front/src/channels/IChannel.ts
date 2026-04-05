import { EInstanceConfigView } from '@jfvilas/kwirth-common'
import { MetricDefinition } from './metrics/MetricDefinition'
import { ENotifyLevel } from '../tools/Global'
import { IChannelSettings } from '../model/Settings'
import { IResourceSelected } from '../components/ResourceSelector'
import { IClusterInfo } from '../model/Cluster'
import { INotification } from '../components/MenuNotification'

type TChannelConstructor = (new () => IChannel)|undefined

enum EChannelRefreshAction {
    NONE,
    REFRESH,
    STOP
}

interface IChannelMessageAction {
    action: EChannelRefreshAction
    data?:any
}

interface ISetupProps {
    onChannelSetupClosed: (channel:IChannel, channelSettings:IChannelSettings, start:boolean, defaultValues:boolean) => void
    channel: IChannel
    setupConfig?: IChannelSettings
    channelObject: IChannelObject
    instanceSettings?: any
}

interface IContentProps {
    channelObject: IChannelObject
}

interface IChannelObject {
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
    metricsList?: Map<string, MetricDefinition>
    accessString?: string
    isElectron: boolean
    frontChannels?: Map<string, TChannelConstructor>
    notifications?: INotification[]
    webSocket?: WebSocket
    clusterUrl?: string
    clusterInfo?: IClusterInfo
    channelSettings?: IChannelSettings
    channelId: string
    updateChannelSettings?: (channelSettings:IChannelSettings) => void
    createTab?: (resource:IResourceSelected, start:boolean, settings:any) => void
    readChannelUserPreferences?: (channelId:string) => Promise<any>
    writeChannelUserPreferences?: (channelId:string, data:any) => Promise<boolean>
    setPalette?: (palette:string) => void
    notify?:(channelId:string|undefined, level:ENotifyLevel, message:string) => void
    exit?: () => void
}

export interface IChannelRequirements {
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
}

interface IChannel {
    SetupDialog: React.FC<ISetupProps>
    TabContent: React.FC<IContentProps>
    readonly channelId: string
    requirements: IChannelRequirements

    getScope(): string
    getChannelIcon(): JSX.Element
    getSetupVisibility(): boolean
    setSetupVisibility(visibility:boolean): void
    processChannelMessage (channelObject:IChannelObject, wsEvent:MessageEvent): IChannelMessageAction
    initChannel(channelObject:IChannelObject): Promise<boolean>
    startChannel(channelObject:IChannelObject): boolean
    pauseChannel(channelObject:IChannelObject): boolean
    continueChannel(channelObject:IChannelObject): boolean
    stopChannel(channelObject:IChannelObject): boolean
    socketDisconnected(channelObject: IChannelObject): boolean
    socketReconnect(channelObject: IChannelObject): boolean
}

export { EChannelRefreshAction }
export type { IChannel, IChannelObject, ISetupProps, IContentProps, TChannelConstructor, IChannelMessageAction }
