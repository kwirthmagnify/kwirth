//transient
enum ClusterTypeEnum {
    KUBERNETES = 'kubernetes',
    DOCKER = 'docker'
}

enum EClusterType {
    KUBERNETES = 'kubernetes',
    DOCKER = 'docker'
}

// How many back instances of a channel make sense per cluster.
enum EChannelInstances {
    MULTI = 'multi',    // several backs per cluster are valid (default: log, metrics, mirc…)
    SINGLE = 'single'   // exactly one back per cluster; home = in-cluster Kwirth
}

// Whether a channel's back is hosted by this Kwirth or lives elsewhere (resolved by the front-hub).
enum EChannelMode {
    LOCAL = 'local',    // hosted here (current behavior)
    REMOTE = 'remote'   // not hosted here; find it on the in-cluster Kwirth
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
    mode?: EChannelMode  // hosted here (local) or elsewhere (remote); set by the core when announcing channels
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
    instances?: EChannelInstances   // default MULTI; SINGLE = one back per cluster (home = in-cluster)
}

export { ClusterTypeEnum, KwirthData, BackChannelData, EClusterType, EChannelInstances, EChannelMode, IBackChannelRequirements }
