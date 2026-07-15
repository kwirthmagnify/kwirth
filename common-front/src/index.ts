import { FC, ReactNode, useEffect } from 'react'
import { EInstanceConfigView, EChannelRefreshAction, ENotifyLevel, IChannelMessageAction, IChannelSettings, IChannelRequirements, EExtensionType, IExtensionScope } from '@kwirthmagnify/kwirth-common'

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

export interface IClusterSummary {
    name: string
    source: boolean
}

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
    userName?: string
    isDesktop: boolean
    isFullscreen?: boolean
    channelId: string
    clusters?: IClusterSummary[]
    selectedClusterName?: string
    selectCluster?: (clusterName: string) => void
    openClusterManager?: () => void
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
    openManager?: (type: EExtensionType) => void
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
    onEnd?: () => void
}

export interface IChannel {
    SetupDialog: FC<ISetupProps>
    TabContent: FC<IContentProps>
    readonly channelId: string
    requirements: IChannelRequirements
    getScope(): string
    // Catálogo de scopes RBAC que declara la extensión (para poblar el editor de seguridad). Opcional.
    getScopeCatalog?(): IExtensionScope[]
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
export { MsgBoxButtons, MsgBoxOk, MsgBoxOkWarning, MsgBoxOkError, MsgBoxOkCancel, MsgBoxYesNo, MsgBoxYesNoCancel, MsgBoxWait, MsgBoxWaitCancel } from './MsgBox'
export { UserPicker } from './UserPicker'
export type { IUserPickerProps } from './UserPicker'
export { HelpButton } from './HelpButton'
export type { IHelpButtonProps } from './HelpButton'
export { DialogTitleHelp } from './DialogTitleHelp'
export type { IDialogTitleHelpProps } from './DialogTitleHelp'

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
    config?: Record<string, any>
}

export interface IHomepageSetupProps {
    config: Record<string, any>
    onSave: (config: Record<string, any>) => void
    onClose: () => void
}

export interface IHomepageExtension {
    homepageId: string
    displayName: string
    Component: FC<IHomepageProps>
    SetupDialog?: FC<IHomepageSetupProps>
    defaultConfig?: Record<string, any>
}
