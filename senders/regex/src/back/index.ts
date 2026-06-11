import { ISender, ISenderAccess, ISenderConfig, ISenderFieldDef, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'

// ─── Config ────────────────────────────────────────────────────────────────────

export interface IRegexSenderRule {
    regex: string
    flags?: string
    field?: 'subject' | 'body' | 'level' | 'to'
    action: 'send' | 'drop'
}

export interface IRegexSenderConfig extends ISenderConfig {
    name: string
    rules: IRegexSenderRule[]
    defaultAction?: 'send' | 'drop'
}

// ─── Sender ────────────────────────────────────────────────────────────────────

export class RegexSender implements ISender {
    readonly id = 'regex'
    readonly senderType = 'filter' as const
    private configs = new Map<string, IRegexSenderConfig>()

    addConfig(config: ISenderConfig): void {
        const rc = config as IRegexSenderConfig
        if (!Array.isArray(rc.rules)) rc.rules = []
        this.configs.set(rc.name, rc)
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
        return { label: 'Regex filter', icon: 'FilterAlt', description: 'Routes or drops messages based on regex rules evaluated against a message field.' }
    }

    async send(_configName: string, _message: ISenderMessage): Promise<void> {}

    async evalFilter(configName: string, message: ISenderMessage, forward: () => Promise<void>): Promise<void> {
        const config = this.configs.get(configName)
        if (!config) return
        for (const rule of config.rules ?? []) {
            const re = new RegExp(rule.regex, rule.flags ?? 'i')
            if (re.test(this.fieldValue(rule.field ?? 'subject', message))) {
                if (rule.action === 'send') await forward()
                return
            }
        }
        if ((config.defaultAction ?? 'drop') === 'send') await forward()
    }

    private fieldValue(field: IRegexSenderRule['field'], message: ISenderMessage): string {
        switch (field) {
            case 'body':  return message.body ?? ''
            case 'level': return message.level ?? ''
            case 'to':    return Array.isArray(message.to) ? message.to.join(' ') : (message.to ?? '')
            default:      return message.subject ?? ''
        }
    }

    getConfigSchema(): ISenderFieldDef[] {
        return [
            { name: 'name',          label: 'Name',           required: true },
            { name: 'rules',         label: 'Rules (JSON)',    type: 'json' },
            { name: 'defaultAction', label: 'Default action', type: 'select', options: ['drop', 'send'] },
        ]
    }

    async startSender(_senders: ISenderAccess): Promise<void> {}

    async stopSender(): Promise<void> {}
}

export default RegexSender
