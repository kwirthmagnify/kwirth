import { ETopologyNodeKind, ETopologyNodeStatus } from '../common/TopologyTypes'
export { ETopologyNodeKind, ETopologyNodeStatus }

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
    storageClass?: string
    capacity?:     string
    accessModes?:  string[]
    edges?:        ITopologyEdge[]
    ownerUids?:    string[]
    containers?:   string[]  // POD: list of container names
    podName?:      string    // CONTAINER: parent pod name
    // 3-D position — computed by layout engine
    x: number
    y: number
    z: number
}

export interface ICanvasState {
    theta:            number
    phi:              number
    radius:           number
    tx:               number
    ty:               number
    tz:               number
    hiddenKinds:      ETopologyNodeKind[]
    hiddenNamespaces: string[]
    selectedUid?:     string
    pathModeUid?:     string
}

export interface ITopologyInfoResult {
    kind:      'endpoints' | 'ingress-rules'
    name:      string
    namespace: string
    data:      any
}

export interface ITopologyData {
    nodes:        Map<string, ITopologyNode>
    loading:      boolean
    error:        string | undefined
    lastUpdated:  number
    canvasState?: ICanvasState
    infoResult?:  ITopologyInfoResult | null
}

export class TopologyData implements ITopologyData {
    nodes       = new Map<string, ITopologyNode>()
    loading     = false
    error       = undefined
    lastUpdated = 0
    infoResult  = null
}
