import { IConfigFieldDef, IInstanceMessage, ISenderConfig, ISenderMessage } from '@kwirthmagnify/kwirth-common'

/**
 * What the front end asks the back end for. A core COMMAND, with this 'command' inside.
 *
 * ⚠️ Every command must travel with its 'accessKey': the core discards them BEFORE they reach the
 * plugin when it is missing, and from here all that can be seen is a timeout with no clue at all.
 */
export enum ESenderDebugCommand {
    /** returns the sender catalogue, with their configurations */
    LIST = 'list',
    /** delivers ONE message through send() */
    SEND = 'send',
    /** delivers N messages through sendBatch() — the batch path, the one log destinations use */
    SENDBATCH = 'sendbatch',
    /** returns the schema of a sender and the values of one of its configurations */
    CONFIG = 'config'
}

/** Nature of the message the back end sends the front end: the catalogue, a send result or a configuration. */
export enum ESenderDebugPayload {
    SENDERS = 'senders',
    RESULT = 'result',
    CONFIG = 'config'
}

/**
 * What kind of sender it is. The extension declares it in 'senderType' (optional on ISender): a
 * 'filter' — regex, ratelimit, timed — does NOT deliver, it chains, so sending it something does not
 * prove what it looks like it proves. That is why it is flagged in the list.
 */
export enum ESenderDebugKind {
    OUTPUT = 'output',
    FILTER = 'filter',
    /** the extension does not declare it: output is assumed, which is what most of them are */
    UNKNOWN = 'unknown'
}

/**
 * The message's level. An EXACT mirror of the values of ISenderMessage.level, which in kwirth-common
 * is a union of literals: it is redeclared as an enum because these values are compared and assigned
 * on both sides, and a loose union of strings gets mistyped sooner or later.
 */
export enum ESenderDebugLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error'
}

/**
 * Why a send in the history will never get its answer. A front-end fact, not the sender's: no result is made up,
 * whether it arrived is unknown.
 */
export enum ESenderDebugAbandoned {
    /** the channel was stopped with the send still in flight */
    STOPPED = 'stopped',
    /**
     * it left, but its answer is not coming: the socket dropped with it in flight, or the back end answered the command
     * with an error signal (this tab's instance is gone) — the typical cause of both, Kwirth restarted
     */
    LOST = 'lost',
    /** it never left: the tab's socket was down when it was sent (Kwirth restarting, the core still reconnecting) */
    NOT_SENT = 'notsent'
}

/** A sender as this channel sees it: what is installed, plus what the core knows about it right now. */
export interface ISenderDebugSenderInfo {
    id: string
    displayName?: string
    version?: string
    /** configurations registered for this sender */
    configNames: string[]
    /**
     * true when the core already has it instantiated. It does NOT prevent sending: getSender() is lazy,
     * so the first send instantiates and starts it — just as any plugin sending it something would.
     */
    instantiated: boolean
    kind: ESenderDebugKind
    /** implements sendBatch(): the batch is genuinely its own, not the one-by-one delivery the core emulates */
    supportsBatch: boolean
}

/** One row of GET /core/senders, with only what this plugin cares about. */
export interface ISenderDebugCatalogueEntry {
    id: string
    displayName?: string
    version?: string
    description?: string
    configNames?: string[]
}

/** What the front end asks to send. The message travels already composed and validated from the front. */
export interface ISenderDebugSendRequest {
    /** local id of the send, to match the reply with its row in the history */
    id: string
    senderId: string
    configName: string
    message: ISenderMessage
    /** SENDBATCH only: how many copies of the message are delivered in the batch */
    count?: number
}

/** What the sender answered. It is the plugin's only reason to exist, so it goes back whole. */
export interface ISenderDebugResult {
    /** the same id the request carried */
    id: string
    ts: number
    senderId: string
    configName: string
    /** the send went through sendBatch() */
    batch: boolean
    /** messages delivered in this send (1 when it is not a batch) */
    count: number
    ok: boolean
    /** what the sender returned. Absent = it returned void, which is normal in a notification sender */
    result?: Record<string, unknown>
    /** the error text: the sender's exception, or why it could not even be attempted */
    error?: string
    /**
     * Batch only: the sender does NOT implement sendBatch(), so delivery went one by one — just as the
     * core would do. It is flagged because it is not the same thing: the sender's batch path was not taken.
     */
    emulated?: boolean
    /** how long it took, in ms */
    elapsed: number
}

/** What the front end asks to see: one configuration of one sender. */
export interface ISenderDebugConfigRequest {
    senderId: string
    configName: string
}

/**
 * The chosen configuration in view: the fields the sender declares (getConfigSchema) and what this configuration
 * holds. The values are the REAL ones, secrets included, as every configuration in Kwirth: the tab masks them
 * behind the eye. Reading the schema instantiates a cold sender, the same as sending to it would.
 */
export interface ISenderDebugConfigView {
    senderId: string
    configName: string
    fields: IConfigFieldDef[]
    values: ISenderConfig
    /** why it could not be read, when it could not (no registry, sender not installed, configuration gone) */
    error?: string
}

export interface ISenderDebugMessageResponse extends IInstanceMessage {
    msgtype: 'senderdebugmessageresponse'
    payloadType: ESenderDebugPayload
    /** present when payloadType === SENDERS */
    senders?: ISenderDebugSenderInfo[]
    /** present when payloadType === RESULT */
    result?: ISenderDebugResult
    /** present when payloadType === CONFIG */
    config?: ISenderDebugConfigView
}

export interface ISenderDebugCommandMessage extends IInstanceMessage {
    msgtype: 'senderdebugmessage'
    command: ESenderDebugCommand
    /** SEND and SENDBATCH carry a send request; CONFIG, the configuration to read */
    data?: ISenderDebugSendRequest | ISenderDebugConfigRequest
}

/**
 * The setup's preselection. The message does NOT live here: it is composed in the tab, because a test
 * bench is used by sending, looking, correcting and sending again — and putting it in the setup would
 * force stopping and restarting the instance for every change of text.
 */
export interface ISenderDebugInstanceConfig {
    /** sender preselected when the tab opens; empty = none */
    senderId: string
    /** the pre-selected configuration; empty = none */
    configName: string
}
