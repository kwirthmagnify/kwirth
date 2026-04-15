import { IInstanceMessage } from '@kwirthmagnify/kwirth-common'
import { IFileObject } from '@jfvilas/react-file-manager'
import { IContentExternalObject } from './components/ContentExternal'
import { MagnifyUserPreferences } from './components/MagnifyUserPreferences'
import { IContentWindow } from './MagnifyTabContent'

export interface IMagnifyData {
    clusterInfo: any
    files: IFileObject[]
    paused: boolean
    started: boolean
    clusterEvents: any[]
    currentPath: string

    timers: number[]

    contentWindows : (IContentExternalObject)[]
    windows: IContentWindow[]
    leftMenuAnchorParent: Element | undefined
    pendingWebSocketRequests : Map<string, (value: any) => void>

    metricsCluster: any[]
    metricsPodDetail: any[]

    refreshUsage?: () => void
    // updateNamespaces?: (action:string, namespace:string) => void
    // updateNodes?: (action:string, node:string) => void
    updateCategoryValues?: (categoryName:string, action:string, value:string) => void
    userPreferences: MagnifyUserPreferences
}

export class MagnifyData implements IMagnifyData {
    clusterInfo = undefined
    paused = false
    started = false
    files = []
    clusterEvents = []
    currentPath = '/'
    timers = []
    windows = []
    contentWindows = []
    leftMenuAnchorParent: undefined
    pendingWebSocketRequests = new Map<string, (value: any) => void>()
    metricsCluster = []
    metricsPodDetail = []
    updateNamespaces = undefined
    userPreferences = new MagnifyUserPreferences()
}

export enum EMagnifyCommand {
    NONE = 'none',
    CREATE = 'create',
    APPLY = 'apply',
    DELETE = 'delete',
    CLUSTERINFO = 'clusterinfo',
    LIST = 'list',
    SUBSCRIBE = 'subscribe',
    LISTCRD = 'listcrd',
    WATCH = 'watch',
    EVENTS = 'events',
    K8EVENT = 'k8event',
    USAGE = 'usage',
    CRONJOB = 'CronJob',
    INGRESSCLASS = 'IngressClass',
    POD = 'Pod',
    NODE = 'Node',
    IMAGE = 'Image',
    CONTROLLER = 'Controller',
}

export interface IMagnifyMessage extends IInstanceMessage {
    msgtype: 'magnifymessage'
    id: string
    accessKey: string
    instance: string
    namespace: string
    group: string
    pod: string
    container: string
    command: EMagnifyCommand
    params?: string[]
}

export interface IMagnifyMessageResponse extends IInstanceMessage {
    msgtype: 'magnifymessageresponse'
    id: string
    command: EMagnifyCommand
    namespace: string
    group: string
    pod: string
    container: string
    event?: string
    data?: any
}
