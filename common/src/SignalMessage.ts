import { IInstanceMessage } from './InstanceMessage'

// transient
export enum SignalMessageLevelEnum {
    INFO='info',
    WARNING='warning',
    ERROR='error'
}

// transient
export enum SignalMessageEventEnum {
    ADD='add',
    DELETE='delete',
    OTHER='other'
}

export enum ESignalMessageLevel {
    INFO='info',
    WARNING='warning',
    ERROR='error'
}

export enum ESignalMessageEvent {
    ADD='add',
    DELETE='delete',
    OTHER='other'
}

/*
    🔴 WHY a refusal needs a code and not just a sentence.

    These two conditions are not information for a human: they are protocol. A federated peer has to be
    able to tell "your instance is stale, redo the handshake" from "I do not serve this channel at all",
    because it reacts differently to each — and it was doing so by matching the English text of the
    message, which is as fragile as it sounds. It already bit us (2026-10-14): the core writes
    `and flow request not found for command` to its own log and sends `has not been found for command`
    over the socket, two spellings of one event, and a test built on the wrong one passed the wrong thing.
    Rewording a log line must never change what a peer does.

    The code is the ONLY thing read. No falling back to matching the sentence: a fallback keeps the
    fragile path alive forever and hides the day it is the one doing the work. A peer that does not send
    the code behaves as it did before any of this existed — the link stays up and messages are lost — and
    that is fixed by deploying it, not by guessing from a string.
*/
export enum ESignalMessageReason {
    /** This deployment does not have that channel (uninstalled, or never installed). */
    CHANNEL_UNSUPPORTED='channelUnsupported',
    /** The channel is here, but the instance the sender used no longer exists (it restarted). */
    INSTANCE_UNKNOWN='instanceUnknown'
}

export interface ISignalMessage extends IInstanceMessage {
    timestamp?: Date
    namespace?: string
    pod?: string
    container?: string
    level: ESignalMessageLevel
    data?: any
    text?: string
    event?: ESignalMessageEvent
    /** Protocol code for a refusal, when there is one. See `ESignalMessageReason`. */
    reason?: ESignalMessageReason
}
