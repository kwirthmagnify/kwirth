import type React from 'react'
import type { SvgIconProps } from '@mui/material'

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

/** The BACK end's side of the DCE: what does the network work. */
export interface INetTools {
    readonly id: string
    ping(target: string, options?: IPingOptions): Promise<IPingResult>
    resolve(name: string, options?: IDnsOptions): Promise<IDnsResult>
    reverse(address: string, options?: IReverseOptions): Promise<IReverseResult>
}

/* ── the FRONT end's side ───────────────────────────────────────────────────────────────────────── */

/** One DNS round trip, as the back end measured it. The DCE stamps `at` itself. */
export interface IDnsSample {
    at: number
    name: string
    type: EDnsRecordType
    timeMs: number
    records: number
}

export type TDnsSampleInput = Omit<IDnsSample, 'at'>

export interface ILatencyDialogProps {
    open: boolean
    onClose: () => void
}

/**
 * What the DCE keeps in `window.__kwirth_dce__['nettools']`.
 *
 * `Icon` and `LatencyDialog` come ready built: this plugin draws them without owning an SVG path or a
 * line of chart code, and a change to either reaches every consumer without republishing any of them.
 *
 * The history behind the chart is SHARED: what this plugin records, any other consumer on the page
 * sees, and the other way round. Two bundled copies would each keep their own and the chart would
 * differ per tab with nothing looking broken.
 */
export interface INetToolsFront {
    readonly id: string
    readonly Icon: React.FC<SvgIconProps>
    readonly LatencyDialog: React.FC<ILatencyDialogProps>
    record(sample: TDnsSampleInput): void
    samples(): IDnsSample[]
    clear(): void
    subscribe(listener: () => void): () => void
}
