import type { ISqlDatabaseStats, ISqlServerStats } from '@kwirthmagnify/kwirth-common-sql'

/*
    The SQL tab's arithmetic, apart from the component so it can be tested.

    PostgreSQL's counters are totals since its statistics were last reset — usually days. A total says
    nothing about NOW; what does is how much it grew between two snapshots, divided by the time between them.
    So a rate needs a previous snapshot of the SAME database, and it is unknown otherwise: never a zero.
*/

/** Share of reads served from memory (0-1); undefined when nothing has been read yet. */
export const cacheHit = (d: ISqlDatabaseStats): number | undefined => {
    const total = d.blocksHit + d.blocksRead
    return total > 0 ? d.blocksHit / total : undefined
}

/**
 * Per second, between two readings of a counter `seconds` apart. Undefined without a previous reading, with
 * no time between them, or when the counter went BACKWARDS — the statistics were reset, or the server
 * restarted: there is no rate to give there.
 */
export const ratePerSecond = (now: number, before: number | undefined, seconds: number): number | undefined => {
    if (before === undefined || seconds <= 0 || now < before) return undefined
    return (now - before) / seconds
}

/** The same database in the previous snapshot, if it was there. */
export const previousOf = (name: string, previous: ISqlServerStats | undefined): ISqlDatabaseStats | undefined =>
    previous?.databases.find(d => d.name === name)

/** What every database takes on disk. */
export const totalSize = (stats: ISqlServerStats): number => stats.databases.reduce((n, d) => n + d.sizeBytes, 0)

/**
 * What a database's own tables take (data, indexes and TOAST), added up. Undefined when its tables could
 * not be read — unknown, never a zero. Smaller than the database's size: that one also counts the catalog.
 */
export const tablesSize = (d: ISqlDatabaseStats): number | undefined =>
    d.tables ? d.tables.reduce((n, t) => n + t.totalBytes, 0) : undefined

/** Every client connection the server has, whatever it is doing. */
export const totalConnections = (stats: ISqlServerStats): number => {
    const c = stats.connections
    return c.active + c.idle + c.idleInTransaction + c.other
}

/** How long the server has been up, as people read it (2d 4h, 3h 12m, 45m). */
export const uptimeOf = (startedAt: string, now: number): string => {
    const minutes = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 60000))
    const d = Math.floor(minutes / 1440)
    const h = Math.floor((minutes % 1440) / 60)
    const m = minutes % 60
    if (d > 0) return `${d}d ${h}h`
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
}

/** A rate as people read it: two decimals under one, whole numbers above. */
export const formatRate = (r: number | undefined): string =>
    r === undefined ? '—' : r > 0 && r < 1 ? `${r.toFixed(2)}/s` : `${Math.round(r)}/s`
