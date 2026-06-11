// ─── Composite flow node types ─────────────────────────────────────────────────

export interface ICompositeFanoutNode {
    type: 'fanout'
    targets: ICompositeNode[]
}

export interface ICompositeFilterNode {
    type: 'filter'
    senderId: string
    configName: string
    next?: ICompositeNode
}

export interface ICompositeRefNode {
    type: 'ref'
    senderId: string
    configName: string
}

export type ICompositeNode = ICompositeFanoutNode | ICompositeFilterNode | ICompositeRefNode

export interface IPipelineConfig {
    name: string
    description?: string
    flow: ICompositeNode
}

export interface IAvailableSender {
    id: string
    displayName?: string
    configNames: string[]
    senderType?: 'filter' | 'output'
}

// ─── Tree child descriptors ────────────────────────────────────────────────────

export interface ITreeChild {
    kind: 'node'
    node: ICompositeNode
    path: string
    label: string
}

export type ITreeEntry = ITreeChild
