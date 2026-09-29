import { EDnsRecordType, IDnsResult, IPingResult, IReverseResult } from './NetToolsContract'

/*
    What travels between the channel's two ends.

    The front end asks (`INetToolsRequest`, on a COMMAND) and the back end answers with the DCE's own
    result untouched (`INetToolsReading`, on a DATA message). The result is NOT flattened into strings
    on the way: the point of the DCE is that every consumer gets the same shape, and a plugin that
    turns it into text on the back end would be hiding exactly what is worth looking at.
*/

/** What the front end can ask the back end to do. */
export enum ENetToolsCommand {
    /** Forward DNS on `target`, of the record type asked for. */
    RESOLVE = 'resolve',
    /** Reverse DNS (PTR) on `target`, which has to be an IP address. */
    REVERSE = 'reverse',
    /** Whether a TCP port on `target` answers, and how fast. */
    CHECK = 'check'
}

export interface INetToolsRequest {
    command: ENetToolsCommand
    /** A host name or an IP address. Whatever was typed: validating it is the DCE's job, not the form's. */
    target: string
    /**
     * Only with RESOLVE.
     *
     * ⚠️ Not `type`: a command travels ON an IInstanceMessage, which already has a `type` of its own
     * (EInstanceMessageType). Reusing the name collapses the intersection of the two to `never`.
     */
    recordType?: EDnsRecordType
    /** Only with CHECK. */
    port?: number
    /** Only with CHECK. */
    count?: number
}

/** What the back end read from the DCE, or why it could not read anything at all. */
export interface INetToolsReading {
    command: ENetToolsCommand
    /** The DCE's id, as it reported it. Absent when getDce() threw. */
    dceId?: string
    /** Only one of these three is present, the one matching `command`. */
    dns?: IDnsResult
    reverse?: IReverseResult
    ping?: IPingResult
    /**
     * Why there is no reading at all. This is NOT a host that did not answer — that travels inside the
     * result, which is the whole point of the DCE's contract. This is the DCE missing, or a command
     * that made no sense.
     */
    error?: string
}

export interface INetToolsMessageResponse {
    msgtype: string
    channel: string
    action: string
    flow: string
    type: string
    instance: string
    reading: INetToolsReading
}
