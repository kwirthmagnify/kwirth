import { ISender, ISenderAccess, ISenderConfig, ISenderFieldDef, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'
import nodemailer, { Transporter } from 'nodemailer'

export interface ISmtpSenderConfig extends ISenderConfig {
    name: string
    host: string
    port: number
    // 'tls'      → secure: true  (SMTPS, typically port 465)
    // 'starttls' → secure: false + requireTLS: true (STARTTLS, typically port 587)
    // 'plain'    → secure: false + ignoreTLS: true  (no encryption, typically port 25)
    encryption: 'tls' | 'starttls' | 'plain'
    // omit user/pass for unauthenticated relays
    user?: string
    pass?: string
    from: string
    to: string | string[]
    subject?: string
}

export class SmtpSender implements ISender {
    readonly id = 'email-smtp'
    private configs = new Map<string, ISmtpSenderConfig>()
    private transporters = new Map<string, Transporter>()

    addConfig(config: ISenderConfig): void {
        const sc = config as ISmtpSenderConfig
        this.configs.set(sc.name, sc)
        this.transporters.set(sc.name, this.createTransporter(sc))
    }

    removeConfig(name: string): void {
        this.transporters.get(name)?.close()
        this.configs.delete(name)
        this.transporters.delete(name)
    }

    hasConfig(name: string): boolean {
        return this.configs.has(name)
    }

    getConfigNames(): string[] {
        return Array.from(this.configs.keys())
    }

    async send(configName: string, message: ISenderMessage): Promise<void> {
        const config = this.configs.get(configName)
        const transporter = this.transporters.get(configName)
        if (!config || !transporter) throw new Error(`SmtpSender: config '${configName}' not found`)

        const to = message.to ?? config.to
        const subject = message.subject ?? config.subject ?? '(no subject)'
        const level = message.level ?? 'info'
        const html = `<pre style="font-family:monospace">[${level.toUpperCase()}] ${message.body}</pre>`

        await transporter.sendMail({ from: config.from, to, subject, html })
    }

    getConfigSchema(): ISenderFieldDef[] {
        return [
            { name: 'name', label: 'Name', required: true },
            { name: 'host', label: 'Host', required: true },
            { name: 'port', label: 'Port', type: 'number', required: true },
            { name: 'encryption', label: 'Encryption', type: 'select', options: ['tls', 'starttls', 'plain'], required: true },
            { name: 'user', label: 'User' },
            { name: 'pass', label: 'Password', type: 'password' },
            { name: 'from', label: 'From address', required: true },
            { name: 'to', label: 'To address', required: true },
            { name: 'subject', label: 'Default subject' },
        ]
    }

    async startSender(_senders: ISenderAccess): Promise<void> {}

    async stopSender(): Promise<void> {
        for (const transporter of this.transporters.values()) transporter.close()
    }

    private createTransporter(sc: ISmtpSenderConfig): Transporter {
        const auth = sc.user && sc.pass ? { user: sc.user, pass: sc.pass } : undefined

        switch (sc.encryption) {
            case 'tls':
                return nodemailer.createTransport({ host: sc.host, port: sc.port, secure: true, auth })
            case 'starttls':
                return nodemailer.createTransport({ host: sc.host, port: sc.port, secure: false, requireTLS: true, auth })
            case 'plain':
                return nodemailer.createTransport({ host: sc.host, port: sc.port, secure: false, ignoreTLS: true, auth })
        }
    }
}

export default SmtpSender
