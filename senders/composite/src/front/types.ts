// ─── Composite flow node types ─────────────────────────────────────────────────

export interface ICompositeTeeNode {
    type: 'tee'
    targets: ICompositeNode[]
}

export interface ICompositeRegexRule {
    regex: string
    flags?: string
    field?: 'subject' | 'body' | 'level' | 'to'
    action: 'send' | 'drop'
    target?: ICompositeNode
}

export interface ICompositeRegexNode {
    type: 'regex'
    rules: ICompositeRegexRule[]
    defaultAction?: 'send' | 'drop'
    defaultTarget?: ICompositeNode
}

export interface ICompositeRefNode {
    type: 'ref'
    senderId: string
    configName: string
}

export type ICompositeNode = ICompositeTeeNode | ICompositeRegexNode | ICompositeRefNode

export interface IPipelineConfig {
    name: string
    flow: ICompositeNode
}

export interface IAvailableSender {
    id: string
    displayName?: string
    configNames: string[]
}

// ─── Tree child descriptors ────────────────────────────────────────────────────

export interface ITreeChild {
    kind: 'node'
    node: ICompositeNode
    path: string
    label: string
}

export interface IDropLeaf {
    kind: 'drop'
    label: string
}

export interface IRuleLeaf {
    kind: 'rule'
    rule: ICompositeRegexRule
    path: string
}

export type ITreeEntry = ITreeChild | IDropLeaf | IRuleLeaf
