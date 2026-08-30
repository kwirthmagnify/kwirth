import { ISenderMessage, ISenderConfig, ISenderAccess, ISenderStoredConfig, ISenderResult } from '@kwirthmagnify/kwirth-common'

export { ISenderMessage, ISenderConfig, ISenderAccess, ISenderStoredConfig, ISenderResult }

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
    send(configName: string, message: ISenderMessage): Promise<ISenderResult | void>
    // OPCIONAL (H3b-recon): consulta el estado actual de una entidad externa creada por este sender (p.ej. un
    // ticket → su status). Permite reconciliar estados perdidos. Undefined si no aplica / no se pudo resolver.
    fetchStatus?(configName: string, externalId: string): Promise<string | undefined>
    evalFilter?(configName: string, message: ISenderMessage, forward: () => Promise<void>): Promise<void>
    startSender(senders: ISenderAccess): Promise<void>
    stopSender(): Promise<void>
}

export type TSenderConstructor = new () => ISender
