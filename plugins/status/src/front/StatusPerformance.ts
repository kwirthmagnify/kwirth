import { IStatusInventory } from '../common/StatusTypes'

/*
    The Performance tab's series: one point per snapshot taken WHILE THE TAB IS OPEN, kept in memory and
    lost when it closes. It is a session view, not a time series — nothing is stored anywhere.

    Kept apart from the component so the arithmetic (and its honesty rules) can be tested.
*/

/** One point of the session series. Undefined fields are unknown for that snapshot, never zero. */
export interface IProcessPoint {
    takenAt: number
    pid: number
    rssMb: number
    heapUsedMb: number
    heapTotalMb: number
    cpuPercent?: number
    loopP99Ms?: number
    loopMeanMs?: number
}

/** How many points are kept: one hour at the fastest auto-refresh (5s) is 720. */
export const SERIES_MAX = 720

const MB = 1024 * 1024

/*
    CPU as a percentage of ONE core between two snapshots: CPU time spent divided by wall time elapsed.
    It can go above 100 when Node uses more than one thread (GC, libuv), and that is the true figure.

    Unknown (undefined) when there is no previous snapshot, when no time passed, or when the counter went
    backwards — which means a different process (Kwirth restarted): there is no rate across a restart.
*/
export const cpuPercent = (previous: IStatusInventory | undefined, current: IStatusInventory): number | undefined => {
    const a = previous?.process
    const b = current.process
    if (!a || !b || a.pid !== b.pid) return undefined
    const elapsedMicros = (current.takenAt - previous!.takenAt) * 1000
    const spentMicros = (b.cpuUserMicros + b.cpuSystemMicros) - (a.cpuUserMicros + a.cpuSystemMicros)
    if (elapsedMicros <= 0 || spentMicros < 0) return undefined
    return (spentMicros / elapsedMicros) * 100
}

/** The point for one snapshot, or undefined when the snapshot carries no process data (older back end). */
export const pointOf = (previous: IStatusInventory | undefined, current: IStatusInventory): IProcessPoint | undefined => {
    const p = current.process
    if (!p) return undefined
    const cpu = cpuPercent(previous, current)
    return {
        takenAt: current.takenAt,
        pid: p.pid,
        rssMb: p.rssBytes / MB,
        heapUsedMb: p.heapUsedBytes / MB,
        heapTotalMb: p.heapTotalBytes / MB,
        ...(cpu === undefined ? {} : { cpuPercent: cpu }),
        ...(p.eventLoop ? { loopP99Ms: p.eventLoop.p99Ms, loopMeanMs: p.eventLoop.meanMs } : {})
    }
}

/*
    Adds a point, keeping at most SERIES_MAX. If the process changed (Kwirth restarted), the series starts
    over: drawing the new process's memory right after the old one's would show a drop that never
    happened to either of them.
*/
export const appendPoint = (series: IProcessPoint[], point: IProcessPoint, max: number = SERIES_MAX): IProcessPoint[] => {
    const same = series.length === 0 || series[series.length - 1].pid === point.pid
    const next = same ? [...series, point] : [point]
    return next.length > max ? next.slice(next.length - max) : next
}

/** '213 MB': bytes for people. Whole megabytes: the decimals would change on every snapshot and say nothing. */
export const formatMb = (bytes: number): string => `${(bytes / MB).toFixed(0)} MB`

/** '1h 02m', '3m 20s', '45s': uptime for people. */
export const formatUptime = (seconds: number): string => {
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (d > 0) return `${d}d ${h}h`
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
    if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
    return `${s}s`
}
