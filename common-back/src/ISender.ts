import { ISenderMessage, ISenderConfig, ISenderAccess, ISenderStoredConfig } from '@kwirthmagnify/kwirth-common'

export { ISenderMessage, ISenderConfig, ISenderAccess, ISenderStoredConfig }

export type SenderFieldType = 'text' | 'number' | 'boolean' | 'password' | 'select' | 'json'

export interface ISenderFieldDef {
    name: string
    label: string
    type?: SenderFieldType
    required?: boolean
    options?: string[]
    common?: boolean
}

export interface ISenderNodeMeta {
    label: string
    icon?: string
    description?: string
}

export interface ISender {
    readonly id: string
    readonly senderType?: 'filter' | 'output'
    addConfig(config: ISenderConfig): void
    removeConfig(name: string): void
    hasConfig(name: string): boolean
    getConfigNames(): string[]
    getConfigSchema?(): ISenderFieldDef[]
    getNodeMeta?(): ISenderNodeMeta
    send(configName: string, message: ISenderMessage): Promise<void>
    evalFilter?(configName: string, message: ISenderMessage, forward: () => Promise<void>): Promise<void>
    startSender(senders: ISenderAccess): Promise<void>
    stopSender(): Promise<void>
}

export type TSenderConstructor = new () => ISender
