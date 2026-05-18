import { ISenderMessage, ISenderConfig, ISenderAccess } from '@kwirthmagnify/kwirth-common'

export { ISenderMessage, ISenderConfig, ISenderAccess }

export interface ISender {
    readonly id: string
    addConfig(config: ISenderConfig): void
    removeConfig(name: string): void
    hasConfig(name: string): boolean
    getConfigNames(): string[]
    send(configName: string, message: ISenderMessage): Promise<void>
    startSender(senders: ISenderAccess): Promise<void>
    stopSender(): Promise<void>
}

export type TSenderConstructor = new () => ISender
