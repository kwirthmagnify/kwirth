import { ISenderAccess } from './Sender'
import { IDaemonManager } from './Daemon'

//transient
enum ClusterTypeEnum {
    KUBERNETES = 'kubernetes',
    DOCKER = 'docker'
}

enum EClusterType {
    KUBERNETES = 'kubernetes',
    DOCKER = 'docker'
}

interface IEndpointConfig {
    name: string,
    methods: string[]
    requiresAccessKey: boolean
}

interface BackChannelData {
    id: string
    routable: boolean  // instance can receive routed commands
    pauseable: boolean  // instance can be paused
    modifiable: boolean  // instance can be modified
    reconnectable: boolean  // instance supports client reconnect requests
    sources: string[]  // array of sources (kubernetes, docker...)
    metrics: boolean  // this channel requires metrics provider
    endpoints: IEndpointConfig[]  // array of specific endpoints the channel requires (usually this would be empty)
    websocket: boolean  // this channel allows websocket creation (aside from main websocket communication)
    cluster: boolean    // this channel supports cluster-wide invocation (addObject called once with *all)
    resourced: boolean  // this channel supports resource-based invocation (addObject called per selected resource)
}

interface KwirthData {
    version: string
    lastVersion: string
    clusterName: string
    clusterType: EClusterType
    inCluster: boolean
    isDesktop: boolean
    namespace: string
    deployment: string
    metricsInterval: number
    channels: BackChannelData[]
}

interface IBackChannelRequirements {
    storage: boolean
    providers: string[]
}

interface IBackChannelObject {
    writeStorage?(id: string, secret: boolean, data: any): Promise<void>
    readStorage?(id: string, secret: boolean): Promise<any>
    writeStorageCommon?(id: string, secret: boolean, data: any): Promise<void>
    readStorageCommon?(id: string, secret: boolean): Promise<any>
    logInfo?(message: unknown): void
    logTrace?(message: unknown): void
    logWarning?(message: unknown): void
    logError?(message: unknown): void
    senders?: ISenderAccess
    daemonManager?: IDaemonManager
}

export { ClusterTypeEnum, KwirthData, BackChannelData, EClusterType, IBackChannelRequirements, IBackChannelObject }
