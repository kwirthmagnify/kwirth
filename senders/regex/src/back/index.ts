import { ISender, ISenderAccess, ISenderConfig, ISenderFieldDef, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'

// ─── Config ────────────────────────────────────────────────────────────────────

export interface IRegexSenderRule {
    regex: string                            // regex pattern to test
    flags?: string                           // regex flags, e.g. 'i' for case-insensitive (default: 'i')
    field?: 'subject' | 'body' | 'level' | 'to'  // field to test (default: 'subject')
    action: 'send' | 'drop'                  // what to do on match
    senderId?: string                        // required when action === 'send'
    configName?: string                      // required when action === 'send'
}

export interface IRegexSenderConfig extends ISenderConfig {
    name: string
    rules: IRegexSenderRule[]
    // what to do if no rule matches (default: 'drop')
    defaultAction?: 'send' | 'drop'
    defaultSenderId?: string
    defaultConfigName?: string
}

// ─── Sender ────────────────────────────────────────────────────────────────────

export class RegexSender implements ISender {
    readonly id = 'regex'
    private configs = new Map<string, IRegexSenderConfig>()
    private senderAccess: ISenderAccess | undefined

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

    async send(configName: string, message: ISenderMessage): Promise<void> {
        const config = this.configs.get(configName)
        if (!config) throw new Error(`RegexSender: config '${configName}' not found`)
        if (!this.senderAccess) throw new Error(`RegexSender: senderAccess not initialized`)

        const matched = this.matchRule(config, message)

        if (!matched) {
            const defAction = config.defaultAction ?? 'drop'
            if (defAction === 'send' && config.defaultSenderId && config.defaultConfigName) {
                await this.senderAccess.send(config.defaultSenderId, config.defaultConfigName, message)
            }
            return
        }

        if (matched.action === 'send' && matched.senderId && matched.configName) {
            await this.senderAccess.send(matched.senderId, matched.configName, message)
        }
        // action === 'drop' → silently discard
    }

    private matchRule(config: IRegexSenderConfig, message: ISenderMessage): IRegexSenderRule | undefined {
        for (const rule of config.rules) {
            const flags = rule.flags ?? 'i'
            const re = new RegExp(rule.regex, flags)
            const value = this.fieldValue(rule.field ?? 'subject', message)
            if (re.test(value)) return rule
        }
        return undefined
    }

    private fieldValue(field: IRegexSenderRule['field'], message: ISenderMessage): string {
        switch (field) {
            case 'body':    return message.body ?? ''
            case 'level':   return message.level ?? ''
            case 'to':      return Array.isArray(message.to) ? message.to.join(' ') : (message.to ?? '')
            default:        return message.subject ?? ''
        }
    }

    getConfigSchema(): ISenderFieldDef[] {
        return [
            { name: 'name',               label: 'Name',                    required: true },
            { name: 'rules',              label: 'Rules (JSON)',             type: 'json' },
            { name: 'defaultAction',      label: 'Default action',          type: 'select', options: ['drop', 'send'] },
            { name: 'defaultSenderId',    label: 'Default sender ID' },
            { name: 'defaultConfigName',  label: 'Default config name' },
        ]
    }

    async startSender(senders: ISenderAccess): Promise<void> {
        this.senderAccess = senders
    }

    async stopSender(): Promise<void> {
        this.senderAccess = undefined
    }
}

export default RegexSender
