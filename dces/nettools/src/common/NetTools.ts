/*
    What DCE `nettools` hands its consumers (plan: plans/completed/nettools/PRD.md).

    This file is the CONTRACT and nothing else: options and results. A consumer imports these types and
    gets the instance at runtime with getDce<INetTools>('nettools'); it never imports the
    implementation, which lives in src/back.

    Everything here runs on Node alone — a socket and a resolver — and spawns NOTHING. Kwirth runs in a
    container: a `ping` binary may not be there, may not have the permission for a raw socket, and
    prints something different on every platform and in every language. So `ping()` here is a TCP
    reachability probe, which is also the more useful question inside a cluster: it is a SERVICE that
    has to answer, not a host.

    The shape of every result follows one rule: network failures are DATA, not exceptions. What fails
    for one attempt travels in `attempts[].error`; what fails for the whole probe travels in `error`,
    and the rest of the object stays coherent (`received: 0`, `lossPercent: 100`). A consumer paints
    the same thing in every case and never has to wrap a call in a try.
*/

/** The DNS record types `resolve()` understands. */
export enum EDnsRecordType {
    A = 'A',
    AAAA = 'AAAA',
    CNAME = 'CNAME',
    MX = 'MX',
    NS = 'NS',
    PTR = 'PTR',
    SOA = 'SOA',
    SRV = 'SRV',
    TXT = 'TXT'
}

export interface IPingOptions {
    /** The TCP port to knock on, 1 to 65535. Default 443. */
    port?: number
    /** Attempts to make, 1 to 10. Out of range or absent, it is normalised, never rejected. Default 4. */
    count?: number
    /** Per attempt, 100 to 30000 ms. Default 2000. */
    timeoutMs?: number
}

/** One attempt and what came back. */
export interface IPingAttempt {
    /** 1-based, in the order they were made. */
    seq: number
    ok: boolean
    /** How long the connect took, name resolution included. Only when ok. */
    timeMs?: number
    /** Why this one failed. Only when not ok. */
    error?: string
}

export interface IPingResult {
    target: string
    port: number
    /** The address the target resolved to, when a connection got far enough to know it. */
    address?: string
    /** Attempts actually made. Zero when the probe never started (an invalid target). */
    sent: number
    received: number
    /** 0 to 100, one decimal. 100 when nothing was sent. */
    lossPercent: number
    /** Over the attempts that answered. Absent when none did. */
    minMs?: number
    avgMs?: number
    maxMs?: number
    /** Always present, also when the probe failed as a whole. */
    attempts: IPingAttempt[]
    /** Why the whole probe failed. Today only one thing: the target was not worth trying. */
    error?: string
}

export interface IDnsOptions {
    /** Default EDnsRecordType.A. */
    type?: EDnsRecordType
    /** Resolvers to ask instead of the system's, as IP addresses. */
    servers?: string[]
    /** 100 to 30000 ms for the single try this makes. Default 2000. */
    timeoutMs?: number
}

export interface IDnsResult {
    name: string
    type: EDnsRecordType
    /**
     * The answer, normalised to text for every type, so one consumer paints them all:
     * `MX` is `"10 mail.example.com"`, `SRV` is `"0 5 5060 sip.example.com"`, `TXT` is the chunks
     * of each record joined, `SOA` is its seven fields in order.
     */
    records: string[]
    /** How long the query took. */
    timeMs: number
    /** Why there are no records. An empty answer is NOT an error: `records` is empty and this is absent. */
    error?: string
}

export interface IReverseOptions {
    servers?: string[]
    timeoutMs?: number
}

export interface IReverseResult {
    address: string
    hostnames: string[]
    timeMs: number
    error?: string
}

/** What the core keeps in `global.__kwirth_dce__['nettools']`. */
export interface INetTools {
    /** The DCE's id, as the core installed it. */
    readonly id: string
    /** Does a TCP port answer, and how fast. Never throws: what went wrong is in the result. */
    ping(target: string, options?: IPingOptions): Promise<IPingResult>
    /** Forward DNS. Never throws. */
    resolve(name: string, options?: IDnsOptions): Promise<IDnsResult>
    /** Reverse DNS (PTR). Never throws. */
    reverse(address: string, options?: IReverseOptions): Promise<IReverseResult>
}
