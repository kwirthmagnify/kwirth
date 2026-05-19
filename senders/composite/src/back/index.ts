import { ISender, ISenderAccess, ISenderConfig, ISenderFieldDef, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'

// ─── Flow tree node types ───────────────────────────────────────────────────────

/** Fan-out: sends the message to all targets in parallel */
export interface ICompositeTeeNode {
    type: 'tee'
    targets: ICompositeNode[]
}

/** Conditional routing: evaluates rules in order, first match wins */
export interface ICompositeRegexRule {
    regex: string
    flags?: string                                       // default: 'i'
    field?: 'subject' | 'body' | 'level' | 'to'         // default: 'subject'
    action: 'send' | 'drop'
    target?: ICompositeNode                              // required when action === 'send'
}

export interface ICompositeRegexNode {
    type: 'regex'
    rules: ICompositeRegexRule[]
    defaultAction?: 'send' | 'drop'                     // default: 'drop'
    defaultTarget?: ICompositeNode
}

/** Leaf: delegates to an already-registered sender config */
export interface ICompositeRefNode {
    type: 'ref'
    senderId: string
    configName: string
}

export type ICompositeNode = ICompositeTeeNode | ICompositeRegexNode | ICompositeRefNode

// ─── Sender config ─────────────────────────────────────────────────────────────

export interface ICompositeSenderConfig extends ISenderConfig {
    name: string
    flow: ICompositeNode
}

// ─── Sender ────────────────────────────────────────────────────────────────────

export class CompositeSender implements ISender {
    readonly id = 'composite'
    private configs = new Map<string, ICompositeSenderConfig>()
    private senderAccess: ISenderAccess | undefined

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

    async send(configName: string, message: ISenderMessage): Promise<void> {
        const config = this.configs.get(configName)
        if (!config) throw new Error(`CompositeSender: config '${configName}' not found`)
        if (!this.senderAccess) throw new Error(`CompositeSender: senderAccess not initialized`)

        await this.evalNode(config.flow, message)
    }

    private async evalNode(node: ICompositeNode, message: ISenderMessage): Promise<void> {
        switch (node.type) {
            case 'tee':
                await this.evalTee(node, message)
                break
            case 'regex':
                await this.evalRegex(node, message)
                break
            case 'ref':
                await this.senderAccess!.send(node.senderId, node.configName, message)
                break
        }
    }

    private async evalTee(node: ICompositeTeeNode, message: ISenderMessage): Promise<void> {
        await Promise.all(node.targets.map(target => this.evalNode(target, message)))
    }

    private async evalRegex(node: ICompositeRegexNode, message: ISenderMessage): Promise<void> {
        for (const rule of node.rules) {
            const flags = rule.flags ?? 'i'
            const re = new RegExp(rule.regex, flags)
            const value = this.fieldValue(rule.field ?? 'subject', message)

            if (re.test(value)) {
                if (rule.action === 'send' && rule.target) {
                    await this.evalNode(rule.target, message)
                }
                // action === 'drop' → discard silently
                return
            }
        }

        // no rule matched → apply default
        const defAction = node.defaultAction ?? 'drop'
        if (defAction === 'send' && node.defaultTarget) {
            await this.evalNode(node.defaultTarget, message)
        }
    }

    private fieldValue(field: ICompositeRegexRule['field'], message: ISenderMessage): string {
        switch (field) {
            case 'body':  return message.body ?? ''
            case 'level': return message.level ?? ''
            case 'to':    return Array.isArray(message.to) ? message.to.join(' ') : (message.to ?? '')
            default:      return message.subject ?? ''
        }
    }

    getConfigSchema(): ISenderFieldDef[] {
        return [
            { name: 'name', label: 'Name', required: true },
            { name: 'flow', label: 'Flow (JSON)', type: 'json' },
        ]
    }

    async startSender(senders: ISenderAccess): Promise<void> {
        this.senderAccess = senders
    }

    async stopSender(): Promise<void> {
        this.senderAccess = undefined
    }
}

export default CompositeSender
