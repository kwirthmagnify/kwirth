import { ISender, ISenderAccess, ISenderConfig, ISenderFieldDef, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'

// ─── Config ────────────────────────────────────────────────────────────────────

export interface ITeeSenderTarget {
    senderId: string
    configName: string
}

export interface ITeeSenderConfig extends ISenderConfig {
    name: string
    targets: ITeeSenderTarget[]  // list of downstream (senderId, configName) pairs to fan out to
}

// ─── Sender ────────────────────────────────────────────────────────────────────

export class TeeSender implements ISender {
    readonly id = 'tee'
    private configs = new Map<string, ITeeSenderConfig>()
    private senderAccess: ISenderAccess | undefined

    addConfig(config: ISenderConfig): void {
        const tc = config as ITeeSenderConfig
        if (!Array.isArray(tc.targets)) tc.targets = []
        this.configs.set(tc.name, tc)
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
        if (!config) throw new Error(`TeeSender: config '${configName}' not found`)
        if (!this.senderAccess) throw new Error(`TeeSender: senderAccess not initialized`)

        await Promise.all(
            config.targets.map(target =>
                this.senderAccess!.send(target.senderId, target.configName, message)
            )
        )
    }

    getConfigSchema(): ISenderFieldDef[] {
        return [
            { name: 'name', label: 'Name', required: true },
            { name: 'targets', label: 'Targets (JSON)', type: 'json' },
        ]
    }

    async startSender(senders: ISenderAccess): Promise<void> {
        this.senderAccess = senders
    }

    async stopSender(): Promise<void> {
        this.senderAccess = undefined
    }
}

export default TeeSender
