export interface ITopologyConfig {
    showPods:          boolean
    showServices:      boolean
    showIngresses:     boolean
    showDeployments:   boolean
    showStatefulSets:  boolean
    showDaemonSets:    boolean
    showJobs:          boolean
    showCronJobs:      boolean
    showPvcs:          boolean
    showOnlyRunning:   boolean
    edgeAnimated:      boolean
    labelSize:         number
    nodeSpacingFactor: number
    gridColumns:       number
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
    showPvcs          = true
    showOnlyRunning   = false
    edgeAnimated      = true
    labelSize         = 12
    nodeSpacingFactor = 1.0
    gridColumns       = 8
}

export interface ITopologyInstanceConfig {
    namespaces: string[]
}

export class TopologyInstanceConfig implements ITopologyInstanceConfig {
    namespaces = ['*all']
}
