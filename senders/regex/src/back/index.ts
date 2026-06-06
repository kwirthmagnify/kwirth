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

    async send(_configName: string, _message: ISenderMessage): Promise<void> {
        // regex sender is a filter used inside composite pipelines; standalone send is a no-op
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
