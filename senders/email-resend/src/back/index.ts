import { ISender, ISenderAccess, ISenderConfig, ISenderFieldDef, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'
import { Resend } from 'resend'

export interface IEmailSenderConfig extends ISenderConfig {
    name: string
    apiKey: string
    from?: string       // sender address, defaults to 'kwirth@resend.dev'
    to: string | string[]
    subject?: string    // default subject if ISenderMessage.subject is not set
}

export class EmailSender implements ISender {
    readonly id = 'email-resend'
    readonly senderType = 'output' as const
    private configs = new Map<string, IEmailSenderConfig>()
    getNodeMeta() { return { label: 'Email (Resend)', icon: 'Email' } }
    private clients = new Map<string, Resend>()

    addConfig(config: ISenderConfig): void {
        const ec = config as IEmailSenderConfig
        this.configs.set(ec.name, ec)
        this.clients.set(ec.name, new Resend(ec.apiKey))
    }

    removeConfig(name: string): void {
        this.configs.delete(name)
        this.clients.delete(name)
    }

    hasConfig(name: string): boolean {
        return this.configs.has(name)
    }

    getConfigNames(): string[] {
        return Array.from(this.configs.keys())
    }

    async send(configName: string, message: ISenderMessage): Promise<void> {
        const config = this.configs.get(configName)
        const client = this.clients.get(configName)
        if (!config || !client) throw new Error(`EmailSender: config '${configName}' not found`)

        const from = config.from ?? 'kwirth@resend.dev'
        const to = message.to ?? config.to
        const subject = message.subject ?? config.subject ?? '(no subject)'

        const level = message.level ?? 'info'
        const levelTag = `[${level.toUpperCase()}] `
        const html = `<pre style="font-family:monospace">${levelTag}${message.body}</pre>`

        const { error } = await client.emails.send({ from, to, subject, html })
        if (error) throw new Error(`EmailSender: Resend error — ${error.message}`)
    }

    getConfigSchema(): ISenderFieldDef[] {
        return [
            { name: 'name', label: 'Name', required: true },
            { name: 'apiKey', label: 'API key', required: true, type: 'password', common: true },
            { name: 'from', label: 'From address', common: true },
            { name: 'to', label: 'To address', required: true, common: true },
            { name: 'subject', label: 'Default subject' },
        ]
    }

    async startSender(_senders: ISenderAccess): Promise<void> {}
    async stopSender(): Promise<void> {}
}

export default EmailSender
