export enum ETopologyNodeKind {
    INGRESS     = 'Ingress',
    SERVICE     = 'Service',
    DEPLOYMENT  = 'Deployment',
    STATEFULSET = 'StatefulSet',
    DAEMONSET   = 'DaemonSet',
    REPLICASET  = 'ReplicaSet',
    JOB         = 'Job',
    CRONJOB     = 'CronJob',
    POD         = 'Pod',
}

export enum ETopologyNodeStatus {
    RUNNING     = 'Running',
    PENDING     = 'Pending',
    FAILED      = 'Failed',
    SUCCEEDED   = 'Succeeded',
    UNKNOWN     = 'Unknown',
    TERMINATING = 'Terminating',
}

export interface ITopologyEdge {
    targetUid: string
    label?:    string
}

export interface ITopologyNode {
    uid:           string
    name:          string
    namespace:     string
    kind:          ETopologyNodeKind
    status:        ETopologyNodeStatus
    labels:        Record<string, string>
    annotations?:  Record<string, string>
    replicas?:     number
    readyReplicas?: number
    image?:        string
    ports?:        number[]
    host?:         string
    edges?:        ITopologyEdge[]
    // 3-D position — computed by layout engine
    x: number
    y: number
    z: number
}

export interface ITopologyData {
    nodes:       Map<string, ITopologyNode>
    loading:     boolean
    error:       string | undefined
    lastUpdated: number
}

export class TopologyData implements ITopologyData {
    nodes       = new Map<string, ITopologyNode>()
    loading     = false
    error       = undefined
    lastUpdated = 0
}
