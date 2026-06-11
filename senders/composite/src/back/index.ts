import { ISender, ISenderAccess, ISenderConfig, ISenderFieldDef, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'

interface ISenderAccessFull extends ISenderAccess {
    getConfig(senderId: string, configName: string): ISenderConfig | undefined
    getSender(senderId: string): ISender | undefined
}

// ─── Flow tree node types ───────────────────────────────────────────────────────

/** Fan-out: sends the message to all targets in parallel */
export interface ICompositeFanoutNode {
    type: 'fanout'
    targets: ICompositeNode[]
}

/** Filter: delegates evaluation to a named filter sender; if it calls forward → continue to next */
export interface ICompositeFilterNode {
    type: 'filter'
    senderId: string
    configName: string
    next?: ICompositeNode
}

/** Leaf: delegates to an already-registered sender config */
export interface ICompositeRefNode {
    type: 'ref'
    senderId: string
    configName: string
}

export type ICompositeNode = ICompositeFanoutNode | ICompositeFilterNode | ICompositeRefNode

// ─── Sender config ─────────────────────────────────────────────────────────────

export interface ICompositeSenderConfig extends ISenderConfig {
    name: string
    flow: ICompositeNode
}

// ─── Sender ────────────────────────────────────────────────────────────────────

export class CompositeSender implements ISender {
    readonly id = 'composite'
    readonly senderType = 'output' as const
    private configs = new Map<string, ICompositeSenderConfig>()
    private senderAccess: ISenderAccessFull | undefined

    addConfig(config: ISenderConfig): void {
        this.configs.set(config.name, config as ICompositeSenderConfig)
    }

    removeConfig(name: string): void {
        this.configs.delete(name)
    }

    hasConfig(name: string): boolean {
        return this.configs.has(name)
    }

    getConfigNames(): string[] {
        return Array.from(this.configs.keys())
    }

    getNodeMeta() {
        return { label: 'Composite', icon: 'AccountTree' }
    }

    async send(configName: string, message: ISenderMessage): Promise<void> {
        const config = this.configs.get(configName)
        if (!config) throw new Error(`CompositeSender: config '${configName}' not found`)
        if (!this.senderAccess) throw new Error(`CompositeSender: senderAccess not initialized`)
        await this.evalNode(config.flow, message)
    }

    private async evalNode(node: ICompositeNode, message: ISenderMessage): Promise<void> {
        switch (node.type) {
            case 'fanout':
                await Promise.all(node.targets.map(t => this.evalNode(t, message)))
                break
            case 'filter': {
                const sender = this.senderAccess!.getSender(node.senderId)
                if (!sender?.evalFilter) return
                const forward = node.next ? () => this.evalNode(node.next!, message) : () => Promise.resolve()
                await sender.evalFilter(node.configName, message, forward)
                break
            }
            case 'ref':
                await this.senderAccess!.send(node.senderId, node.configName, message)
                break
        }
    }

    getConfigSchema(): ISenderFieldDef[] {
        return [
            { name: 'name', label: 'Name', required: true },
            { name: 'flow', label: 'Flow (JSON)', type: 'json' },
        ]
    }

    async startSender(senders: ISenderAccess): Promise<void> {
        this.senderAccess = senders as ISenderAccessFull
    }

    async stopSender(): Promise<void> {
        this.senderAccess = undefined
    }
}

export default CompositeSender
