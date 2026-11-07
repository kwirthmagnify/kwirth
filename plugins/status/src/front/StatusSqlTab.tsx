import React from 'react'
import { Box, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from '@mui/material'
import { ExpandLess, ExpandMore } from '@kwirthmagnify/kwirth-common-front/icons'
import type { IPoolInfo, ISqlDatabaseStats, ISqlServerStats, ISqlTableStats } from '@kwirthmagnify/kwirth-common-sql'
import { ESqlDatabaseColumn, ESqlPoolColumn, ESqlTableColumn, EStatusTable, IStatusSqlInfo } from '../common/StatusTypes'
import { ISortableProps, TSortValue, sortRows } from './StatusSort'
import { SortableCell } from './StatusSortableCell'
import { formatBytes } from './StatusDces'
import { cacheHit, formatRate, previousOf, ratePerSecond, tablesSize, totalConnections, totalSize, uptimeOf } from './StatusSql'

/*
    The SQL tab: the core's relational storage — PostgreSQL via knex. The connection config (from the same
    KWIRTH_SQL_* env the core reads), the server's state, the per-consumer connection pools with their peak,
    and every database with its size, activity and tables. The password is never shown: this is an
    observability view, not a config dialog.
*/

interface ISqlTabProps extends ISortableProps {
    sql: IStatusSqlInfo | undefined
    filter: string
    /** The previous snapshot's statistics and how many seconds ago it was: the rates come from them. */
    previous?: ISqlServerStats
    seconds: number
}

/** What a database is, as the Kind column says it. */
const databaseKind = (d: string): string => d.startsWith('kwirth_') ? 'kwirth consumer' : 'external'

const POOL_VALUE: Record<ESqlPoolColumn, (p: IPoolInfo) => TSortValue> = {
    [ESqlPoolColumn.CONSUMER]: p => p.consumerId,
    [ESqlPoolColumn.DATABASE]: p => p.dbName,
    [ESqlPoolColumn.USED]: p => p.used,
    [ESqlPoolColumn.FREE]: p => p.free,
    [ESqlPoolColumn.MAX]: p => p.max,
    [ESqlPoolColumn.PEAK]: p => p.peak
}

const TABLE_VALUE: Record<ESqlTableColumn, (t: ISqlTableStats) => TSortValue> = {
    [ESqlTableColumn.TABLE]: t => `${t.schema}.${t.name}`,
    [ESqlTableColumn.SIZE]: t => t.totalBytes,
    [ESqlTableColumn.ROWS]: t => t.rows
}

interface IInfoRowProps {
    label: string
    value: string | number
}

/** One row of the server info block: a label and its value, monospaced for config. */
const InfoRow: React.FC<IInfoRowProps> = ({ label, value }) => (
    <Stack direction='row' spacing={1} alignItems='baseline'>
        <Typography variant='caption' color='text.secondary' sx={{ width: 130, flexShrink: 0 }}>{label}</Typography>
        <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>{value}</Typography>
    </Stack>
)

interface INumberCellProps {
    value: string | number | undefined
    label: string
}

/** A number cell; a dash when it is not known. */
const NumberCell: React.FC<INumberCellProps> = ({ value, label }) => (
    <TableCell align='right' aria-label={label} sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {value === undefined ? <Typography variant='body2' component='span' color='text.disabled'>—</Typography> : value}
    </TableCell>
)

export const StatusSqlTab: React.FC<ISqlTabProps> = ({ sql, filter, sorts, onSort, previous, seconds }) => {
    // Which databases are unfolded to show their tables. Local: folding is a glance, not a setting.
    const [abiertas, setAbiertas] = React.useState<Set<string>>(new Set())
    if (!sql) {
        return (
            <Typography variant='body2' color='text.secondary' sx={{ p: 4, textAlign: 'center' }}>
                This Kwirth's core does not expose SQL info yet. Update the core to see it here.
            </Typography>
        )
    }

    const stats = sql.stats
    const statsOf = (name: string): ISqlDatabaseStats | undefined => stats?.databases.find(d => d.name === name)
    const commitsPerSecond = (d: ISqlDatabaseStats | undefined): number | undefined =>
        d ? ratePerSecond(d.commits, previousOf(d.name, previous)?.commits, seconds) : undefined

    // How each database column sorts; a statistic the core does not give is undefined, and goes last.
    const DATABASE_VALUE: Record<ESqlDatabaseColumn, (name: string) => TSortValue> = {
        [ESqlDatabaseColumn.DATABASE]: d => d,
        [ESqlDatabaseColumn.KIND]: d => databaseKind(d),
        [ESqlDatabaseColumn.SIZE]: d => statsOf(d)?.sizeBytes,
        [ESqlDatabaseColumn.TABLES_SIZE]: d => { const s = statsOf(d); return s ? tablesSize(s) : undefined },
        [ESqlDatabaseColumn.CONNECTIONS]: d => statsOf(d)?.connections,
        [ESqlDatabaseColumn.COMMITS]: d => commitsPerSecond(statsOf(d)),
        [ESqlDatabaseColumn.ROLLBACKS]: d => statsOf(d)?.rollbacks,
        [ESqlDatabaseColumn.CACHE_HIT]: d => { const s = statsOf(d); return s ? cacheHit(s) : undefined },
        [ESqlDatabaseColumn.DEADLOCKS]: d => statsOf(d)?.deadlocks,
        [ESqlDatabaseColumn.TEMP]: d => statsOf(d)?.tempBytes
    }

    const poolSort = sorts[EStatusTable.SQL_POOLS]
    const dbSort = sorts[EStatusTable.SQL_DATABASES]
    const tableSort = sorts[EStatusTable.SQL_TABLES]
    const pools = sortRows(sql.pools, poolSort, (p, column) => POOL_VALUE[column as ESqlPoolColumn](p))
    const shown = sortRows(sql.databases.filter(d => d.toLowerCase().includes(filter.toLowerCase())), dbSort,
        (d, column) => DATABASE_VALUE[column as ESqlDatabaseColumn](d))
    const poolHeader = (column: ESqlPoolColumn, label: string, align?: 'right') =>
        <SortableCell label={label} column={column} sort={poolSort} onSort={col => onSort(EStatusTable.SQL_POOLS, col)} align={align} />
    const dbHeader = (column: ESqlDatabaseColumn, label: string, align?: 'right') =>
        <SortableCell label={label} column={column} sort={dbSort} onSort={col => onSort(EStatusTable.SQL_DATABASES, col)} align={align} />
    const tableHeader = (column: ESqlTableColumn, label: string, align?: 'right') =>
        <SortableCell label={label} column={column} sort={tableSort} onSort={col => onSort(EStatusTable.SQL_TABLES, col)} align={align} />
    const plegar = (name: string) => setAbiertas(prev => {
        const next = new Set(prev)
        if (next.has(name)) next.delete(name)
        else next.add(name)
        return next
    })
    const DB_COLUMNS = 10

    return (
        <Stack spacing={2} sx={{ pb: 2 }}>
            <Stack direction='row' spacing={0.75} useFlexGap flexWrap='wrap' alignItems='center'>
                <Typography variant='caption' color='text.secondary'>
                    {sql.databases.length} database{sql.databases.length === 1 ? '' : 's'} · {sql.client} via knex{sql.knexVersion ? ` ${sql.knexVersion}` : ''}{sql.pgVersion ? ` · pg ${sql.pgVersion}` : ''}
                </Typography>
                {sql.reachable
                    ? <Chip size='small' color='success' variant='outlined' label='reachable' />
                    : <Chip size='small' color='error' label='not reachable' />}
                {stats && <Chip size='small' variant='outlined' label={`${formatBytes(totalSize(stats))} on disk`} />}
            </Stack>

            {/*
                The server: its config (no password: this is a status view, not a dialog to edit the
                connection) and, when the core can read them, its state.
            */}
            <Stack spacing={0.5} sx={{ px: 0.5 }}>
                <Typography variant='subtitle2'>Server</Typography>
                <InfoRow label='client' value={sql.client} />
                <InfoRow label='host' value={sql.host} />
                <InfoRow label='port' value={sql.port} />
                <InfoRow label='user' value={sql.user} />
                <InfoRow label='ssl' value={sql.ssl ? 'yes' : 'no'} />
                <InfoRow label='maintenance DB' value={sql.maintenanceDb} />
                {stats && <>
                    <InfoRow label='version' value={`PostgreSQL ${stats.serverVersion}`} />
                    <InfoRow label='up' value={`${uptimeOf(stats.startedAt, Date.now())} (since ${new Date(stats.startedAt).toLocaleString()})`} />
                    {/*
                        Used of max, and what they are doing. "Idle in transaction" is the one worth watching: a
                        transaction left open holds its locks while nobody uses it.
                    */}
                    <InfoRow label='connections' value={`${totalConnections(stats)} of ${stats.maxConnections} — ${stats.connections.active} active · ${stats.connections.idle} idle · ${stats.connections.idleInTransaction} idle in transaction${stats.connections.other ? ` · ${stats.connections.other} other` : ''}`} />
                </>}
                {sql.reachable && !stats &&
                    <Typography variant='caption' color={sql.statsError ? 'warning.main' : 'text.secondary'}>
                        {sql.statsError
                            ? `The server statistics could not be read: ${sql.statsError}`
                            : "This Kwirth's core does not read the server statistics yet: update it to see size, activity and tables."}
                    </Typography>}
            </Stack>

            {/*
                Connection pools: one per consumer that has called ensureDb. `used` is how many connections
                are doing a query right now; `free` is how many are warm and idle; `max` is the ceiling; `peak`
                is the most it has had in use at once since it opened. A peak at max means it has been
                saturated at some point, even if it is quiet now.
            */}
            <Typography variant='subtitle2'>Connection pools</Typography>
            {sql.pools.length === 0
                ? <Typography variant='body2' color='text.secondary' sx={{ px: 0.5 }}>
                    No pool is open. A pool opens the first time an extension calls its store.
                </Typography>
                : <Table size='small' stickyHeader sx={{ tableLayout: 'fixed' }}>
                    <colgroup>
                        <col style={{ width: '30%' }} />
                        <col style={{ width: '30%' }} />
                        <col style={{ width: 90 }} />
                        <col style={{ width: 90 }} />
                        <col style={{ width: 90 }} />
                        <col style={{ width: 90 }} />
                    </colgroup>
                    <TableHead>
                        <TableRow>
                            {poolHeader(ESqlPoolColumn.CONSUMER, 'Consumer')}
                            {poolHeader(ESqlPoolColumn.DATABASE, 'Database')}
                            {poolHeader(ESqlPoolColumn.USED, 'Used', 'right')}
                            {poolHeader(ESqlPoolColumn.FREE, 'Free', 'right')}
                            {poolHeader(ESqlPoolColumn.MAX, 'Max', 'right')}
                            {poolHeader(ESqlPoolColumn.PEAK, 'Peak', 'right')}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {pools.map(p => {
                            const saturated = p.used >= p.max
                            // A core whose common-sql predates the peak sends none: unknown, not zero.
                            const peak = typeof p.peak === 'number' ? p.peak : undefined
                            const peakTip = p.peakAt
                                ? `Reached at ${new Date(p.peakAt).toLocaleString()} — counted since the pool opened, ${new Date(p.openedAt).toLocaleString()}`
                                : 'No connection lent yet'
                            return (
                                <TableRow key={p.consumerId} aria-label={`Pool ${p.consumerId}`}>
                                    <TableCell sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{p.consumerId}</TableCell>
                                    <TableCell sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{p.dbName}</TableCell>
                                    <TableCell align='right' sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                        {saturated
                                            ? <Tooltip title='Every connection is busy'><Chip size='small' color='warning' label={p.used} /></Tooltip>
                                            : p.used}
                                    </TableCell>
                                    <TableCell align='right' sx={{ fontVariantNumeric: 'tabular-nums' }}>{p.free}</TableCell>
                                    <TableCell align='right' sx={{ fontVariantNumeric: 'tabular-nums' }}>{p.max}</TableCell>
                                    <TableCell align='right' aria-label='Peak' sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                        {peak === undefined
                                            ? <Typography variant='body2' component='span' color='text.disabled'>—</Typography>
                                            : <Tooltip title={peakTip}>
                                                {peak >= p.max
                                                    ? <Chip size='small' color='warning' label={peak} />
                                                    : <span>{peak}</span>}
                                            </Tooltip>}
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>}

            <Typography variant='subtitle2'>Databases</Typography>
            {!sql.reachable
                ? <Typography variant='body2' color='error' sx={{ px: 0.5 }}>
                    Could not list databases: {sql.error ?? 'unknown error'}
                </Typography>
                : shown.length === 0
                    ? <Typography variant='body2' color='text.secondary' sx={{ px: 0.5 }}>
                        {sql.databases.length === 0 ? 'No database exists yet.' : 'No database matches the filter.'}
                    </Typography>
                    : <Table size='small' stickyHeader sx={{ tableLayout: 'fixed' }}>
                        <colgroup>
                            {/* The name takes what is left: every number column is fixed, so no header breaks. */}
                            <col />
                            <col style={{ width: 140 }} />
                            <col style={{ width: 100 }} />
                            <col style={{ width: 100 }} />
                            <col style={{ width: 110 }} />
                            <col style={{ width: 110 }} />
                            <col style={{ width: 110 }} />
                            {/* Cache hit: two words plus the sort arrow; at 110 the header broke in two lines. */}
                            <col style={{ width: 130 }} />
                            <col style={{ width: 110 }} />
                            <col style={{ width: 130 }} />
                            <col style={{ width: 44 }} />
                        </colgroup>
                        <TableHead>
                            <TableRow>
                                {dbHeader(ESqlDatabaseColumn.DATABASE, 'Database')}
                                {dbHeader(ESqlDatabaseColumn.KIND, 'Kind')}
                                {dbHeader(ESqlDatabaseColumn.SIZE, 'Size', 'right')}
                                {dbHeader(ESqlDatabaseColumn.TABLES_SIZE, 'Tables', 'right')}
                                {dbHeader(ESqlDatabaseColumn.CONNECTIONS, 'Conns', 'right')}
                                {dbHeader(ESqlDatabaseColumn.COMMITS, 'Commits', 'right')}
                                {dbHeader(ESqlDatabaseColumn.ROLLBACKS, 'Rollbacks', 'right')}
                                {dbHeader(ESqlDatabaseColumn.CACHE_HIT, 'Cache hit', 'right')}
                                {dbHeader(ESqlDatabaseColumn.DEADLOCKS, 'Deadlocks', 'right')}
                                {dbHeader(ESqlDatabaseColumn.TEMP, 'Temp files', 'right')}
                                <TableCell />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {shown.map(name => {
                                const s = statsOf(name)
                                const hit = s ? cacheHit(s) : undefined
                                const abierta = abiertas.has(name)
                                const tables = s?.tables
                                const ownTables = s ? tablesSize(s) : undefined
                                return (
                                    <React.Fragment key={name}>
                                        {/* The whole row unfolds its tables, not only the chevron. */}
                                        <TableRow aria-label={`Database ${name}`} hover={Boolean(s)}
                                            onClick={s ? () => plegar(name) : undefined} sx={{ cursor: s ? 'pointer' : 'default' }}>
                                            <TableCell sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{name}</TableCell>
                                            <TableCell>
                                                <Typography variant='caption' color='text.secondary'>{databaseKind(name)}</Typography>
                                            </TableCell>
                                            <NumberCell label='Size' value={s ? formatBytes(s.sizeBytes) : undefined} />
                                            {/* Only its own tables: Size also counts the system catalog, some MB in any database. */}
                                            <NumberCell label='Tables size' value={ownTables === undefined ? undefined : formatBytes(ownTables)} />
                                            <NumberCell label='Connections' value={s?.connections} />
                                            {/* Per second since your previous snapshot: a total of days says nothing about now. */}
                                            <NumberCell label='Commits' value={s ? formatRate(commitsPerSecond(s)) : undefined} />
                                            <NumberCell label='Rollbacks' value={s?.rollbacks.toLocaleString()} />
                                            <NumberCell label='Cache hit' value={hit === undefined ? undefined : `${(hit * 100).toFixed(1)} %`} />
                                            <TableCell align='right' aria-label='Deadlocks' sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                                {s === undefined
                                                    ? <Typography variant='body2' component='span' color='text.disabled'>—</Typography>
                                                    : s.deadlocks > 0 ? <Chip size='small' color='warning' label={s.deadlocks} /> : 0}
                                            </TableCell>
                                            <NumberCell label='Temp files' value={s ? formatBytes(s.tempBytes) : undefined} />
                                            <TableCell sx={{ px: 0.5 }}>{s && (abierta ? <ExpandLess fontSize='small' /> : <ExpandMore fontSize='small' />)}</TableCell>
                                        </TableRow>
                                        {abierta && s &&
                                            <TableRow aria-label={`Tables of ${name}`}>
                                                <TableCell colSpan={DB_COLUMNS} sx={{ py: 1, px: 4 }}>
                                                    {!tables
                                                        ? <Typography variant='body2' color='text.secondary'>
                                                            Its tables could not be read (Kwirth may have no permission to connect to this database).
                                                        </Typography>
                                                        : tables.length === 0
                                                            ? <Typography variant='body2' color='text.secondary'>It has no tables.</Typography>
                                                            : <Box>
                                                                <Table size='small' sx={{ tableLayout: 'fixed' }}>
                                                                    <colgroup>
                                                                        <col />
                                                                        <col style={{ width: 120 }} />
                                                                        <col style={{ width: 140 }} />
                                                                    </colgroup>
                                                                    <TableHead>
                                                                        <TableRow>
                                                                            {tableHeader(ESqlTableColumn.TABLE, 'Table')}
                                                                            {tableHeader(ESqlTableColumn.SIZE, 'Size', 'right')}
                                                                            {tableHeader(ESqlTableColumn.ROWS, 'Rows (est.)', 'right')}
                                                                        </TableRow>
                                                                    </TableHead>
                                                                    <TableBody>
                                                                        {sortRows(tables, tableSort, (t, column) => TABLE_VALUE[column as ESqlTableColumn](t)).map(t =>
                                                                            <TableRow key={`${t.schema}.${t.name}`} aria-label={`Table ${t.schema}.${t.name}`}>
                                                                                <TableCell sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
                                                                                    <Typography variant='body2' component='span' color='text.secondary' sx={{ fontFamily: 'monospace' }}>{t.schema}.</Typography>{t.name}
                                                                                </TableCell>
                                                                                <TableCell align='right' sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatBytes(t.totalBytes)}</TableCell>
                                                                                <TableCell align='right' sx={{ fontVariantNumeric: 'tabular-nums' }}>{t.rows.toLocaleString()}</TableCell>
                                                                            </TableRow>)}
                                                                    </TableBody>
                                                                </Table>
                                                            </Box>}
                                                </TableCell>
                                            </TableRow>}
                                    </React.Fragment>
                                )
                            })}
                        </TableBody>
                    </Table>}
        </Stack>
    )
}
