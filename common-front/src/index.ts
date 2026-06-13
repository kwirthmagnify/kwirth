import { FC, ReactNode, useEffect } from 'react'
import { EInstanceConfigView, EChannelRefreshAction, ENotifyLevel, IChannelMessageAction, IChannelSettings, IChannelRequirements } from '@kwirthmagnify/kwirth-common'

type CloseWithId = (id: string) => void
type CloseNoId = () => void

export const useKeyboard = (onEscape?: CloseWithId | CloseNoId, id?: string) => {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            event.stopPropagation()
            if (event.key === 'Escape' && onEscape) {
                if (id)
                    (onEscape as CloseWithId)(id)
                else
                    (onEscape as CloseNoId)()
            }
        }
        const handleKeyUp = (event: KeyboardEvent) => {
            event.stopPropagation()
        }
        window.addEventListener('keydown', handleKeyDown, true)
        window.addEventListener('keyup', handleKeyUp, true)
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true)
            window.removeEventListener('keyup', handleKeyUp, true)
        }
    }, [onEscape, id])
}

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
    isDesktop: boolean
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
    stopChannel?: () => void
    openManager?: (type: 'plugins' | 'providers' | 'senders' | 'daemons') => void
    metricsList?: Map<string, MetricDefinition>
    isExtensionLicensed?: (type: string, id: string) => boolean
}

export class MetricDefinition {
    public metric: string = ''
    public type: string = ''
    public help: string = ''
    public eval: string = ''
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
    prepareExternalChannel?: (view: EInstanceConfigView, selectedResources: any[], container: string) => { data: any; config: any; instanceConfig: any; formConfig: any }
    getExternalHelpContent?: () => ReactNode
    onExternalConfigApply?: (channelObject: IChannelObject, values: any) => boolean
}

export const cleanANSI = (text: string): string => text.replace(/\x1b\[[0-9;]*[mKHVfJrcegH]|\x1b\[\d*n/g, '')
export { MarkdownViewer } from './MarkdownViewer'
export { MiniGauge } from './MiniGauge'
export type { IMiniGaugeProps } from './MiniGauge'

export interface ITabSummary {
    name: string
    description: string
    channel: string
    channelObject: {
        clusterName: string
        view: EInstanceConfigView
        namespace: string
        group: string
        pod: string
        container: string
    }
}

export interface IWorkspaceSummary {
    name: string
    description: string
}

export interface IClusterEvent {
    time: string
    type: string
    reason: string
    namespace?: string
    object: string
    message: string
}

export interface IHomepageProps {
    cluster: any
    clusters: any[]
    frontChannels: Map<string, TChannelConstructor>
    lastTabs: ITabSummary[]
    favTabs: ITabSummary[]
    lastWorkspaces: IWorkspaceSummary[]
    favWorkspaces: IWorkspaceSummary[]
    onRestoreTabParameters: (tab: ITabSummary) => void
    onHomepageSelectTab: (tab: ITabSummary) => void
    onSelectWorkspace: (workspace: IWorkspaceSummary) => void
    onRestoreWorkspace: (workspace: IWorkspaceSummary) => void
    onUpdateTabs: (last: ITabSummary[], fav: ITabSummary[]) => void
    onUpdateWorkspaces: (last: IWorkspaceSummary[], fav: IWorkspaceSummary[]) => void
    dataCpu: { value: number }[]
    dataMemory: { value: number }[]
    dataNetwork: { value: number }[]
    isExtensionLicensed?: (type: string, id: string) => boolean
    getClusterEvents?: (clusterName: string, limit?: number) => Promise<IClusterEvent[]>
    getClusterMetrics?: (clusterName: string) => Promise<{ cpu: number; memory: number; vcpus: number; totalMemoryBytes: number; pods: number; maxPods: number } | null>
}

export interface IHomepageExtension {
    homepageId: string
    displayName: string
    Component: FC<IHomepageProps>
}
