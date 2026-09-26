import { ISenderMessage, ISenderConfig, ISenderAccess, ISenderStoredConfig, ISenderResult, TConfigFieldType, IConfigFieldDef, IExtensionNodeMeta } from '@kwirthmagnify/kwirth-common'
import { IExtension, IExtensionLogger } from './IExtension'

export { ISenderMessage, ISenderConfig, ISenderAccess, ISenderStoredConfig, ISenderResult }

/** @deprecated use TConfigFieldType, common to every extension. */
export type SenderFieldType = TConfigFieldType

/** A sender's configuration field. It is the common contract IConfigFieldDef, with nothing of its own. */
export type ISenderFieldDef = IConfigFieldDef

/** @deprecated use IExtensionNodeMeta, common to every extension. */
export type ISenderNodeMeta = IExtensionNodeMeta

export interface ISender extends IExtension {
    readonly id: string
    readonly senderType?: 'filter' | 'output'
    addConfig(config: ISenderConfig): void
    removeConfig(name: string): void
    hasConfig(name: string): boolean
    getConfigNames(): string[]
    getConfigSchema?(): ISenderFieldDef[]
    getNodeMeta?(): ISenderNodeMeta
    send(configName: string, message: ISenderMessage): Promise<ISenderResult | void>
    /**
     * The core hands the sender a logger that already knows who it is, as soon as it builds it.
     *
     * OPTIONAL and read defensively, like the rest: a sender that does not implement it keeps writing
     * wherever it was writing, and an older core that never calls it leaves the sender on its own
     * fallback.
     *
     * ⚠️ This is for what the sender says ABOUT ITSELF — a delivery that failed, a configuration it
     * could not read. It is not the place for what it delivers: a sender's job is to put a message
     * somewhere, and that somewhere is decided by its configuration, not by this.
     */
    setLogger?(logger: IExtensionLogger): void
    /*
        OPTIONAL: delivers a BATCH in one go. For a log destination (Datadog, Elastic, Loki) sending line
        by line is unworkable: their APIs take arrays and charge per request. Whoever implements it gets
        the whole batch and decides how to split it; whoever does not keeps receiving messages one at a
        time and never learns this exists.
    */
    sendBatch?(configName: string, messages: ISenderMessage[]): Promise<ISenderResult | void>
    // OPTIONAL (H3b-recon): queries the current state of an external entity created by this sender (a
    // ticket → its status, say). It allows lost states to be reconciled. Undefined when it does not
    // apply or could not be resolved.
    fetchStatus?(configName: string, externalId: string): Promise<string | undefined>
    evalFilter?(configName: string, message: ISenderMessage, forward: () => Promise<void>): Promise<void>
    startSender(senders: ISenderAccess): Promise<void>
    stopSender(): Promise<void>
}

export type TSenderConstructor = new () => ISender
