import { ESenderDebugAbandoned, ESenderDebugLevel, ISenderDebugConfigView, ISenderDebugResult, ISenderDebugSendRequest, ISenderDebugSenderInfo } from '../common/SenderDebugTypes'

/** Origin stamped on everything that leaves here unless it is changed, so the destination knows where it came from. */
export const ORIGIN_SOURCE = 'sender-debug'

/**
 * One row of the history: what was ASKED to be sent and what the sender answered.
 *
 * The two halves live together because in a test bench they are worth the same: knowing what the
 * destination answered is useless if what was sent to it has to be reconstructed from memory. Besides,
 * the request does not come back from the back end — the front end has it, since it composed it — so
 * this is the only place where both can be.
 */
export interface ISenderDebugHistoryEntry {
    /** absent only if a reply arrived without its request (an earlier session, a restart) */
    request?: ISenderDebugSendRequest
    /** absent while the send is IN FLIGHT: the row is already visible, and is completed on reply */
    result?: ISenderDebugResult
    /**
     * Why this send's reply is never going to arrive: the channel was stopped, or the back end lost the instance.
     * It is a FRONT-end fact, not the sender's: that is why no result is made up — whether it arrived is unknown.
     */
    abandoned?: ESenderDebugAbandoned
}

/**
 * The message being composed, raw (exactly as it is typed). It lives in the channel.s data and not in
 * React state because the tab unmounts when switching tabs, and losing a hand-written body just for
 * going to look at something else is exactly what must not happen in a test bench.
 */
export interface ISenderDebugForm {
    senderId: string
    configName: string
    subject: string
    body: string
    /** recipients separated by commas; what each one means is decided by the sender */
    to: string
    level: ESenderDebugLevel
    /** free-form JSON; empty = no metadata */
    metadata: string
    /** deliver through sendBatch() instead of through send() */
    batch: boolean
    count: number
    /** where the message says it comes from (ISenderMessage.origin), as typed; the timestamp is the send's own */
    origin: ISenderDebugOriginForm
}

/** The origin as typed: all text, and an empty field is not sent. */
export interface ISenderDebugOriginForm {
    /** 'sender-debug' by default; another value lets a sender that routes or labels by source be tested */
    source: string
    cluster: string
    namespace: string
    pod: string
    container: string
    service: string
}

export interface ISenderDebugData {
    /** catalogue the back end sends when the instance starts and on every LIST */
    senders: ISenderDebugSenderInfo[]
    /** sends of the session, most recent first, trimmed to maxHistory */
    history: ISenderDebugHistoryEntry[]
    /** the core accepted the instance.s configuration (the reply to the start) */
    configAccepted: boolean
    started: boolean
    form: ISenderDebugForm
    /** the chosen configuration in view (CONFIG); absent until it arrives, and cleared when the choice changes */
    configView?: ISenderDebugConfigView
}

export class SenderDebugData implements ISenderDebugData {
    senders: ISenderDebugSenderInfo[] = []
    history: ISenderDebugHistoryEntry[] = []
    configAccepted = false
    started = false
    form: ISenderDebugForm = {
        senderId: '',
        configName: '',
        subject: 'Kwirth sender debug',
        body: 'Test message sent from the Sender Debug channel.',
        to: '',
        level: ESenderDebugLevel.INFO,
        metadata: '',
        batch: false,
        count: 3,
        origin: { source: ORIGIN_SOURCE, cluster: '', namespace: '', pod: '', container: '', service: '' }
    }
    configView?: ISenderDebugConfigView = undefined
}
