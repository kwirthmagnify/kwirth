import { ISender, ISenderAccess, ISenderConfig, ISenderFieldDef, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'

export interface ITeamsSenderConfig extends ISenderConfig {
    name: string
    webhookUrl: string
    title?: string
}

const LEVEL_COLOR: Record<string, string> = {
    error:   'FF0000',
    warning: 'FFA500',
    info:    '0078D4',
    debug:   '808080',
}

export class TeamsSender implements ISender {
    readonly id = 'teams'
    private configs = new Map<string, ITeamsSenderConfig>()

    addConfig(config: ISenderConfig): void {
        this.configs.set(config.name, config as ITeamsSenderConfig)
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

    getConfigSchema(): ISenderFieldDef[] {
        return [
            { name: 'name',       label: 'Name',          type: 'text',     required: true },
            { name: 'webhookUrl', label: 'Webhook URL',   type: 'text',     required: true },
            { name: 'title',      label: 'Default title', type: 'text',     required: false },
        ]
    }

    async send(configName: string, message: ISenderMessage): Promise<void> {
        const cfg = this.configs.get(configName)
        if (!cfg?.webhookUrl) throw new Error(`TeamsSender: config '${configName}' not found or missing webhookUrl`)

        const title = message.subject ?? cfg.title ?? ''
        const color = LEVEL_COLOR[message.level ?? 'info'] ?? '0078D4'

        const card: Record<string, unknown> = {
            '@type': 'MessageCard',
            '@context': 'https://schema.org/extensions',
            themeColor: color,
            summary: title || message.body.substring(0, 100),
            sections: [
                ...(title ? [{ activityTitle: `**${title}**` }] : []),
                { text: message.body },
            ],
        }

        const resp = await fetch(cfg.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(card),
        })

        if (!resp.ok) throw new Error(`TeamsSender: webhook returned ${resp.status} ${resp.statusText}`)
    }

    async startSender(_senders: ISenderAccess): Promise<void> {}
    async stopSender(): Promise<void> {}
}

export default TeamsSender
