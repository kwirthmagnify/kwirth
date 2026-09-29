/*
    The contract of DCE `nettools`, declared here instead of imported.

    A consumer depends on the CONTRACT, not on the package: at runtime it gets the instance the core
    keeps, through getDce<INetTools>('nettools'). The day the DCE is published on npm, this file is
    deleted and the import comes from `@kwirthmagnify/kwirth-dce-nettools/src/common/NetTools`, with the
    package mapped to the registry in build.mjs — never bundled, or there would be two instances.

    Keep it in step with dces/nettools/src/common/NetTools.ts.
*/

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
    port?: number
    count?: number
    timeoutMs?: number
}

export interface IPingAttempt {
    seq: number
    ok: boolean
    timeMs?: number
    error?: string
}

export interface IPingResult {
    target: string
    port: number
    address?: string
    sent: number
    received: number
    lossPercent: number
    minMs?: number
    avgMs?: number
    maxMs?: number
    attempts: IPingAttempt[]
    error?: string
}

export interface IDnsOptions {
    type?: EDnsRecordType
    servers?: string[]
    timeoutMs?: number
}

export interface IDnsResult {
    name: string
    type: EDnsRecordType
    records: string[]
    timeMs: number
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

export interface INetTools {
    readonly id: string
    ping(target: string, options?: IPingOptions): Promise<IPingResult>
    resolve(name: string, options?: IDnsOptions): Promise<IDnsResult>
    reverse(address: string, options?: IReverseOptions): Promise<IReverseResult>
}
