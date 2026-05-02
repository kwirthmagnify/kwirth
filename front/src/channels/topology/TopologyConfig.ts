export interface ITopologyConfig {
    showPods:          boolean
    showServices:      boolean
    showIngresses:     boolean
    showDeployments:   boolean
    showStatefulSets:  boolean
    showDaemonSets:    boolean
    showJobs:          boolean
    showCronJobs:      boolean
    showOnlyRunning:   boolean
    edgeAnimated:      boolean
    labelSize:         number
    nodeSpacingFactor: number
    autoRefresh:       boolean
    refreshInterval:   number
}

export class TopologyConfig implements ITopologyConfig {
    showPods          = true
    showServices      = true
    showIngresses     = true
    showDeployments   = true
    showStatefulSets  = true
    showDaemonSets    = true
    showJobs          = false
    showCronJobs      = false
    showOnlyRunning   = false
    edgeAnimated      = true
    labelSize         = 12
    nodeSpacingFactor = 1.0
    autoRefresh       = true
    refreshInterval   = 30
}

export interface ITopologyInstanceConfig {
    namespace: string
}

export class TopologyInstanceConfig implements ITopologyInstanceConfig {
    namespace = '*all'
}
