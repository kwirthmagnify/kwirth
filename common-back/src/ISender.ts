import { ISenderMessage, ISenderConfig, ISenderAccess } from '@kwirthmagnify/kwirth-common'

export { ISenderMessage, ISenderConfig, ISenderAccess }

export type SenderFieldType = 'text' | 'number' | 'boolean' | 'password' | 'select'

export interface ISenderFieldDef {
    name: string
    label: string
    type?: SenderFieldType
    required?: boolean
    options?: string[]
}

export interface ISender {
    readonly id: string
    addConfig(config: ISenderConfig): void
    removeConfig(name: string): void
    hasConfig(name: string): boolean
    getConfigNames(): string[]
    getConfigSchema?(): ISenderFieldDef[]
    send(configName: string, message: ISenderMessage): Promise<void>
    startSender(senders: ISenderAccess): Promise<void>
    stopSender(): Promise<void>
}

export type TSenderConstructor = new () => ISender
