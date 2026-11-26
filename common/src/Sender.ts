/*
    WHERE a line comes from. It travels inside the message, and the sender does not make it up: a
    destination can only label what reaches it labelled. Should this be lost along the way, the log ends
    up at the destination with nothing to filter it by — that is, useless.

    All of it optional because not every message comes from a pod: a channel's warning, a business event
    and a line entering through an external collector have different origins, and each one fills in what
    it knows.
*/
export interface ISenderMessageOrigin {
    /** the cluster it came from, when more than one is in play */
    cluster?: string
    namespace?: string
    pod?: string
    container?: string
    /** where it ENTERED Kwirth: the id of the provider or the channel (e.g. 'fluentbit', 'log') */
    source?: string
    /** name of the service or the controller, where known */
    service?: string
    /** the line's original timestamp, if it carried one; in ms since the epoch */
    timestamp?: number
}

/*
    The formats a message can ALSO come in, besides its plain-text `body` — like a multipart/alternative email:
    the same message, several renditions, each destination takes the one it understands. `text/plain` is not
    here on purpose: it IS the body, and listing it twice would give two places to look.
*/
export enum ESenderMime {
    HTML = 'text/html',
    MARKDOWN = 'text/markdown'
}

export interface ISenderBodyAlternative {
    mime: ESenderMime
    content: string
}

export interface ISenderMessage {
    subject?: string
    /** the message as plain text: every sender understands it, and it is the fallback of the alternatives */
    body: string
    /** other renditions of the SAME message (an email sender sends the HTML one); a sender that knows none
     *  of them ignores them and keeps using `body` */
    alternatives?: ISenderBodyAlternative[]
    to?: string | string[]
    level?: 'debug' | 'info' | 'warning' | 'error'
    metadata?: Record<string, unknown>
    /*
        The line's origin. It is added apart from 'metadata' — which is free-form JSON — because this one
        IS contract: the destination needs to know where to look in order to label, and a tacit agreement
        inside metadata breaks as soon as there are two senders.
    */
    origin?: ISenderMessageOrigin
}

export interface ISenderConfig {
    name: string
    [key: string]: unknown
}

export interface ISenderStoredConfig {
    configs: ISenderConfig[]
    [key: string]: unknown
}

// OPTIONAL return of a send: free-form JSON the sender may give back to the caller (a ticketing sender,
// for instance, returns { issueKey, url } after creating the ticket). Pure notification senders keep
// returning void; the caller decides whether to use the result. See plans/completed/webhook-extension/PLAN.md.
export interface ISenderResult {
    [key: string]: unknown
}

export interface ISenderAccess {
    send(senderId: string, configName: string, message: ISenderMessage): Promise<ISenderResult | void>
    /*
        Delivers a BATCH. It exists because 'send' is one message per call with its own await, and that
        serves for a notification and not for a stream of log: one await per line turns forwarding into a
        queue of round trips over the network.

        One await per BATCH keeps the promise's meaning — "these N lines delivered" — which is what lets
        the caller count what was sent and react to whatever fails. When the sender does not implement it,
        the core delivers message by message: nobody has to change in order to go on working.
    */
    sendBatch?(senderId: string, configName: string, messages: ISenderMessage[]): Promise<ISenderResult | void>
    // OPTIONAL: queries the current state of an external entity created by the sender (a ticketing
    // ticket → its status, say). The pull counterpart of the webhook (push): it allows lost states to be
    // RECONCILED (core down, or no subscriber when the callback arrived). Returns undefined when the
    // sender does not support it, the config does not exist, or it could not be resolved. See
    // plans/completed/webhook-extension/PLAN.md (H3b-recon).
    fetchStatus?(senderId: string, configName: string, externalId: string): Promise<string | undefined>
    addConfig(senderId: string, config: ISenderConfig): boolean
    listSenders(): Array<{ id: string; configNames: string[] }>
    getConfig(senderId: string, configName: string): ISenderConfig | undefined
}
