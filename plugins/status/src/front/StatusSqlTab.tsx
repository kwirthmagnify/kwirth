import React from 'react'
import { Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from '@mui/material'
import { IStatusSqlInfo } from '../common/StatusTypes'

/*
    The SQL tab: the core's relational storage — PostgreSQL via knex. The connection config (from the same
    KWIRTH_SQL_* env the core reads), the driver/ORM versions, whether the server is reachable, the list of
    databases and the per-consumer connection pool stats. The password is never shown: this is an
    observability view, not a config dialog.
*/

interface ISqlTabProps {
    sql: IStatusSqlInfo | undefined
    filter: string
}

/** One row of the server info block: a label and its value, monospaced for config. */
const InfoRow: React.FC<{ label: string, value: string | number }> = ({ label, value }) => (
    <Stack direction='row' spacing={1} alignItems='baseline'>
        <Typography variant='caption' color='text.secondary' sx={{ width: 130, flexShrink: 0 }}>{label}</Typography>
        <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>{value}</Typography>
    </Stack>
)

export const StatusSqlTab: React.FC<ISqlTabProps> = ({ sql, filter }) => {
    if (!sql) {
        return (
            <Typography variant='body2' color='text.secondary' sx={{ p: 4, textAlign: 'center' }}>
                This Kwirth's core does not expose SQL info yet. Update the core to see it here.
            </Typography>
        )
    }

    const shown = sql.databases.filter(d => d.toLowerCase().includes(filter.toLowerCase()))

    return (
        <Stack spacing={2} sx={{ pb: 2 }}>
            <Stack direction='row' spacing={0.75} useFlexGap flexWrap='wrap' alignItems='center'>
                <Typography variant='caption' color='text.secondary'>
                    {sql.databases.length} database{sql.databases.length === 1 ? '' : 's'} · {sql.client} via knex{sql.knexVersion ? ` ${sql.knexVersion}` : ''}{sql.pgVersion ? ` · pg ${sql.pgVersion}` : ''}
                </Typography>
                {sql.reachable
                    ? <Chip size='small' color='success' variant='outlined' label='reachable' />
                    : <Chip size='small' color='error' label='not reachable' />}
            </Stack>

            {/*
                The server config. No password: this is a status view, not a dialog to edit the connection.
            */}
            <Stack spacing={0.5} sx={{ px: 0.5 }}>
                <Typography variant='subtitle2'>Server</Typography>
                <InfoRow label='client' value={sql.client} />
                <InfoRow label='host' value={sql.host} />
                <InfoRow label='port' value={sql.port} />
                <InfoRow label='user' value={sql.user} />
                <InfoRow label='ssl' value={sql.ssl ? 'yes' : 'no'} />
                <InfoRow label='maintenance DB' value={sql.maintenanceDb} />
            </Stack>

            {/*
                Connection pools: one per consumer that has called ensureDb. `used` is how many connections
                are doing a query right now; `free` is how many are warm and idle; `max` is the ceiling. A
                pool at max with used == max is saturated — every connection is busy.
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
                        <col style={{ width: 70 }} />
                        <col style={{ width: 70 }} />
                        <col style={{ width: 70 }} />
                    </colgroup>
                    <TableHead>
                        <TableRow>
                            <TableCell>Consumer</TableCell>
                            <TableCell>Database</TableCell>
                            <TableCell align='right'>Used</TableCell>
                            <TableCell align='right'>Free</TableCell>
                            <TableCell align='right'>Max</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {sql.pools.map(p => {
                            const saturated = p.used >= p.max
                            return (
                                <TableRow key={p.consumerId} aria-label={`Pool ${p.consumerId}`}>
                                    <TableCell sx={{ fontFamily: 'monospace' }}>{p.consumerId}</TableCell>
                                    <TableCell sx={{ fontFamily: 'monospace' }}>{p.dbName}</TableCell>
                                    <TableCell align='right' sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                        {saturated
                                            ? <Tooltip title='Every connection is busy'><Chip size='small' color='warning' label={p.used} /></Tooltip>
                                            : p.used}
                                    </TableCell>
                                    <TableCell align='right' sx={{ fontVariantNumeric: 'tabular-nums' }}>{p.free}</TableCell>
                                    <TableCell align='right' sx={{ fontVariantNumeric: 'tabular-nums' }}>{p.max}</TableCell>
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
                            <col style={{ width: '40%' }} />
                            <col />
                        </colgroup>
                        <TableHead>
                            <TableRow>
                                <TableCell>Database</TableCell>
                                <TableCell>Kind</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {shown.map(d => (
                                <TableRow key={d} aria-label={`Database ${d}`}>
                                    <TableCell sx={{ fontFamily: 'monospace' }}>{d}</TableCell>
                                    <TableCell>
                                        <Typography variant='caption' color='text.secondary'>
                                            {d.startsWith('kwirth_') ? 'kwirth consumer' : 'external'}
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>}
        </Stack>
    )
}
