/*
    What the stub's back end sends its front end. It travels on a DATA message like any other channel's.
*/

/** What the back end read from the DCE, or why it could not. */
export interface IConsumerReading {
    /** The DCE's id, as it reported it. Absent when getDce() threw. */
    dceId?: string
    /** Two consecutive calls to next(), so the shared counter can be seen moving. */
    ticks?: number[]
    /** How many times the DCE's back-end factory has run on this Kwirth. */
    boots?: number
    /** The greeting, to prove the object really is the DCE's and not a local copy. */
    greeting?: string
    /** Why the reading failed. Present INSTEAD of the rest: getDce() throws, it does not return empty. */
    error?: string
}

export interface IConsumerMessageResponse {
    msgtype: string
    channel: string
    action: string
    flow: string
    type: string
    instance: string
    reading: IConsumerReading
}

/** What the front end can ask for. */
export enum EConsumerCommand {
    /** Read the DCE again: two more ticks of the shared counter. */
    READ = 'read'
}
