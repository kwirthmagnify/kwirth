import { ISenderMessage, ISenderConfig, ISenderAccess, ISenderStoredConfig, ISenderResult, TConfigFieldType, IConfigFieldDef, IExtensionNodeMeta } from '@kwirthmagnify/kwirth-common'

export { ISenderMessage, ISenderConfig, ISenderAccess, ISenderStoredConfig, ISenderResult }

/** @deprecated usa TConfigFieldType, comun a todas las extensiones. */
export type SenderFieldType = TConfigFieldType

/** Campo de configuracion de un sender. Es el contrato comun IConfigFieldDef, sin nada propio. */
export type ISenderFieldDef = IConfigFieldDef

/** @deprecated usa IExtensionNodeMeta, comun a todas las extensiones. */
export type ISenderNodeMeta = IExtensionNodeMeta

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
