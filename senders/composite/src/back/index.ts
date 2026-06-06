import { ISender, ISenderAccess, ISenderConfig, ISenderFieldDef, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'

interface ISenderAccessFull extends ISenderAccess {
    getConfig(senderId: string, configName: string): ISenderConfig | undefined
}

// ─── Flow tree node types ───────────────────────────────────────────────────────

/** Fan-out: sends the message to all targets in parallel */
export interface ICompositeTeeNode {
    type: 'tee'
    targets: ICompositeNode[]
}

/** Regex filter: evaluates a named regex config; if action=send → forward to next */
export interface ICompositeRegexNode {
    type: 'regex'
    configName: string
    next?: ICompositeNode
}

/** Timed filter: evaluates a named timed config; if action=send → forward to next */
export interface ICompositeTimedNode {
    type: 'timed'
    configName: string
    next?: ICompositeNode
}

/** Leaf: delegates to an already-registered sender config */
export interface ICompositeRefNode {
    type: 'ref'
    senderId: string
    configName: string
}

export type ICompositeNode = ICompositeTeeNode | ICompositeRegexNode | ICompositeTimedNode | ICompositeRefNode

// ─── Sender config ─────────────────────────────────────────────────────────────

export interface ICompositeSenderConfig extends ISenderConfig {
    name: string
    flow: ICompositeNode
}

// ─── Inline rule shapes (read from stored configs) ─────────────────────────────

interface IStoredRegexRule {
    regex: string
    flags?: string
    field?: 'subject' | 'body' | 'level' | 'to'
    action: 'send' | 'drop'
}

interface IStoredRegexConfig {
    rules: IStoredRegexRule[]
    defaultAction?: 'send' | 'drop'
}

interface IStoredTimedRule {
    from: string
    to: string
    days?: number[]
    action: 'send' | 'drop'
}

interface IStoredTimedConfig {
    rules: IStoredTimedRule[]
    defaultAction?: 'send' | 'drop'
    timezone?: string
}

// ─── Sender ────────────────────────────────────────────────────────────────────

export class CompositeSender implements ISender {
    readonly id = 'composite'
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
            case 'timed':
                await this.evalTimed(node, message)
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
        const raw = this.senderAccess!.getConfig('regex', node.configName) as IStoredRegexConfig | undefined
        if (!raw) return

        for (const rule of raw.rules ?? []) {
            const re = new RegExp(rule.regex, rule.flags ?? 'i')
            const value = this.fieldValue(rule.field ?? 'subject', message)
            if (re.test(value)) {
                if (rule.action === 'send' && node.next) await this.evalNode(node.next, message)
                return
            }
        }

        const defAction = raw.defaultAction ?? 'drop'
        if (defAction === 'send' && node.next) await this.evalNode(node.next, message)
    }

    private async evalTimed(node: ICompositeTimedNode, message: ISenderMessage): Promise<void> {
        const raw = this.senderAccess!.getConfig('timed', node.configName) as IStoredTimedConfig | undefined
        if (!raw) return

        const { minutes, day } = this.currentContext(raw.timezone)

        for (const rule of raw.rules ?? []) {
            if (!this.matchesWindow(rule, minutes, day)) continue
            if (rule.action === 'send' && node.next) await this.evalNode(node.next, message)
            return
        }

        const defAction = raw.defaultAction ?? 'drop'
        if (defAction === 'send' && node.next) await this.evalNode(node.next, message)
    }

    private fieldValue(field: IStoredRegexRule['field'], message: ISenderMessage): string {
        switch (field) {
            case 'body':  return message.body ?? ''
            case 'level': return message.level ?? ''
            case 'to':    return Array.isArray(message.to) ? message.to.join(' ') : (message.to ?? '')
            default:      return message.subject ?? ''
        }
    }

    private currentContext(timezone?: string): { minutes: number; day: number } {
        const now = timezone
            ? new Date(new Date().toLocaleString('en-US', { timeZone: timezone }))
            : new Date()
        return { minutes: now.getHours() * 60 + now.getMinutes(), day: now.getDay() }
    }

    private matchesWindow(rule: IStoredTimedRule, minutes: number, day: number): boolean {
        if (rule.days && rule.days.length > 0 && !rule.days.includes(day)) return false
        const from = this.parseMinutes(rule.from)
        const to   = this.parseMinutes(rule.to)
        return from <= to
            ? minutes >= from && minutes < to
            : minutes >= from || minutes < to
    }

    private parseMinutes(hhmm: string): number {
        const [h, m] = hhmm.split(':').map(Number)
        return (h ?? 0) * 60 + (m ?? 0)
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
