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
    modifyable: boolean  // instance can be modified
    reconnectable: boolean  // instance supports client reconnect requests
    sources: string[]  // array of sources (kubernetes, docker...)
    metrics: boolean  // this channel requires metrics provider
    events: boolean  // this channel requires events provider
    providers: string[]  // prividers required by this channel (array of id's)
    endpoints: IEndpointConfig[]  // array of specific endpoints the channel requires (usually this would be empty)
    websocket: boolean  // this channel allows websocket creation (aside from main websocket communication)
    cluster: boolean    // this channel is cluster-wide, it has access to all namespaces/controllers/pods/containers
}

interface KwirthData {
    version: string
    lastVersion: string
    clusterName: string
    clusterType: EClusterType
    inCluster: boolean
    isElectron: boolean
    namespace: string
    deployment: string
    metricsInterval: number
    channels: BackChannelData[]
}

export { ClusterTypeEnum, KwirthData, BackChannelData, EClusterType }
