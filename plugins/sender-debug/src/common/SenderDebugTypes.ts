import { IInstanceMessage, ISenderMessage } from '@kwirthmagnify/kwirth-common'

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
    SENDBATCH = 'sendbatch'
}

/** Nature of the message the back end sends the front end: either the catalogue or a send result. */
export enum ESenderDebugPayload {
    SENDERS = 'senders',
    RESULT = 'result'
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

export interface ISenderDebugMessageResponse extends IInstanceMessage {
    msgtype: 'senderdebugmessageresponse'
    payloadType: ESenderDebugPayload
    /** presente cuando payloadType === SENDERS */
    senders?: ISenderDebugSenderInfo[]
    /** presente cuando payloadType === RESULT */
    result?: ISenderDebugResult
}

export interface ISenderDebugCommandMessage extends IInstanceMessage {
    msgtype: 'senderdebugmessage'
    command: ESenderDebugCommand
    data?: ISenderDebugSendRequest
}

/**
 * The setup's preselection. The message does NOT live here: it is composed in the tab, because a test
 * bench is used by sending, looking, correcting and sending again — and putting it in the setup would
 * force stopping and restarting the instance for every change of text.
 */
export interface ISenderDebugInstanceConfig {
    /** sender preselected when the tab opens; empty = none */
    senderId: string
    /** configuracion preseleccionada; vacio = ninguna */
    configName: string
}
