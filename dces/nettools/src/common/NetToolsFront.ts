import type { FC } from 'react'
import type { SvgIconProps } from '@mui/material'
import { EDnsRecordType } from './NetTools'

/*
    What DCE `nettools` hands its consumers IN THE BROWSER (plan: plans/completed/nettools/PLAN.md, S4).

    The back end's contract lives next door in NetTools.ts and is a different thing: there the DCE DOES
    the network work, here it cannot — a browser resolves no names. What it provides here is what a
    front end cannot share any other way:

      · the icon, so every consumer draws the same one instead of copying an SVG
      · a chart of DNS round trips, with the recharts the core already publishes
      · the SAMPLES behind that chart, which live in ONE place for the whole page

    That last one is the point. Two plugins, two tabs, a configuration dialog — whoever consumes this
    DCE writes into the same history and reads the same history. Two bundled copies would each keep
    their own, and the chart would show a different thing in every tab with nothing looking broken.
*/

/** One DNS round trip, as the back end measured it. */
export interface IDnsSample {
    /** When it was taken, epoch ms. Set by the DCE, not by the consumer: one clock for all of them. */
    at: number
    /** The name asked for — or the address, for a reverse lookup. */
    name: string
    type: EDnsRecordType
    /** The round trip the back end measured, in milliseconds. */
    timeMs: number
    /** How many records came back. Zero is legitimate: the name resolves and has none of that type. */
    records: number
}

/** What a consumer passes when it records a round trip. The DCE stamps the time itself. */
export type TDnsSampleInput = Omit<IDnsSample, 'at'>

export interface ILatencyDialogProps {
    open: boolean
    onClose: () => void
}

/**
 * The shared history, on its own.
 *
 * It is split from the components below because it is the part that carries the guarantee of the type
 * — one object, one history, every consumer on it — and it must not need React or a DOM to be true, or
 * to be tested.
 */
export interface INetToolsFrontCore {
    /** The DCE's id, as the core installed it. */
    readonly id: string
    /** Adds a round trip to the shared history. Every consumer of the DCE sees it. */
    record(sample: TDnsSampleInput): void
    /** The history, oldest first. A copy: a consumer must not be able to edit what others read. */
    samples(): IDnsSample[]
    /** Empties the history for everybody. */
    clear(): void
    /**
     * Calls back on every change, and returns the function that stops it.
     *
     * Without this the chart would only be right the moment it opened: a consumer recording while the
     * dialog is up would not reach it. A shared object that cannot be listened to is a snapshot.
     */
    subscribe(listener: () => void): () => void
}

/** What the core keeps in `window.__kwirth_dce__['nettools']`. */
export interface INetToolsFront extends INetToolsFrontCore {
    /** The net tools icon, so a consumer draws it without copying the path. */
    readonly Icon: FC<SvgIconProps>
    /** The round trips so far, as a chart. Reads the shared history and follows it live. */
    readonly LatencyDialog: FC<ILatencyDialogProps>
}
