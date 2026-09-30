import React from 'react'
import { Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from '@mui/material'
import { IPluginStatus } from '@kwirthmagnify/kwirth-common'
import { filterPlugins, pluginStateLabel, sortPlugins, summarizePlugins } from './StatusPlugins'

/*
    The Plugins tab: every installed plugin, whether its channel runs in this Kwirth, and what it has open
    right now — "is anybody using this?". The state comes from the core; the figures from the plugin's own
    channel, when it gives them.
*/

interface IPluginsTabProps {
    plugins: IPluginStatus[] | undefined
    filter: string
}

interface ICountCellProps {
    value: number | undefined
    label: string
}

const NOT_REPORTED = "This plugin's channel does not report what it has running. It may be in use."

/** A figure, or a dash with the reason when the plugin does not give it: never a made-up zero. */
const CountCell: React.FC<ICountCellProps> = ({ value, label }) => (
    <TableCell align='right' sx={{ whiteSpace: 'nowrap' }} aria-label={label}>
        {value === undefined
            ? <Tooltip title={NOT_REPORTED}><Typography variant='body2' color='text.disabled'>—</Typography></Tooltip>
            : <Typography variant='body2' sx={{ fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>}
    </TableCell>
)

export const StatusPluginsTab: React.FC<IPluginsTabProps> = ({ plugins, filter }) => {
    if (!plugins) {
        return (
            <Typography variant='body2' color='text.secondary' sx={{ p: 4, textAlign: 'center' }}>
                This Kwirth's core does not list its plugins yet. Update the core to see them here.
            </Typography>
        )
    }
    if (plugins.length === 0) {
        return (
            <Typography variant='body2' color='text.secondary' sx={{ p: 4, textAlign: 'center' }}>
                No plugin is installed in this Kwirth.
            </Typography>
        )
    }
    const s = summarizePlugins(plugins)
    const shown = sortPlugins(filterPlugins(plugins, filter))
    return (
        <Stack spacing={1} sx={{ pb: 2 }}>
            <Stack direction='row' spacing={0.75} useFlexGap flexWrap='wrap' alignItems='center'>
                <Typography variant='caption' color='text.secondary'>{s.total} plugin{s.total === 1 ? '' : 's'}:</Typography>
                <Chip size='small' variant='outlined' label={`${s.instances} instance${s.instances === 1 ? '' : 's'} open`} />
                {s.failed > 0 && <Chip size='small' color='error' label={`${s.failed} failed`} />}
                {/* Said up front: the instance count above leaves these out, and it must not look complete. */}
                {s.unreported > 0 &&
                    <Tooltip title={NOT_REPORTED}><Chip size='small' label={`${s.unreported} not reporting`} /></Tooltip>}
            </Stack>
            {/*
                Fixed layout with a width per column: with the automatic one the browser sizes each column
                from the rows on screen, so every letter typed in the filter changed the rows and moved
                every column. Source takes what is left, and its URLs wrap inside it.
            */}
            <Table size='small' stickyHeader sx={{ tableLayout: 'fixed' }}>
                <colgroup>
                    <col style={{ width: '22%' }} />
                    <col style={{ width: 90 }} />
                    <col style={{ width: 180 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 120 }} />
                    <col />
                </colgroup>
                <TableHead>
                    <TableRow>
                        <TableCell>Plugin</TableCell>
                        <TableCell>Version</TableCell>
                        <TableCell>State</TableCell>
                        <TableCell align='right'>Instances</TableCell>
                        <TableCell align='right'>Connections</TableCell>
                        <TableCell>Source</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {shown.map(p => {
                        const l = pluginStateLabel(p.state)
                        return (
                            <TableRow key={p.id} aria-label={`Plugin ${p.id}`}>
                                <TableCell>
                                    <Typography variant='body2' sx={{ fontWeight: 500 }}>{p.name}</Typography>
                                    {p.name !== p.id &&
                                        <Typography variant='caption' color='text.secondary' sx={{ fontFamily: 'monospace' }}>{p.id}</Typography>}
                                </TableCell>
                                <TableCell sx={{ whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{p.version}</TableCell>
                                <TableCell sx={{ whiteSpace: 'nowrap' }} aria-label='State'>
                                    <Chip size='small' label={l.label} color={l.color} variant={l.color === 'success' ? 'outlined' : 'filled'} />
                                    {p.requiresRestart &&
                                        <Tooltip title='Installing or updating this plugin needs a restart of the core'>
                                            <Chip size='small' variant='outlined' label='restart' sx={{ ml: 0.5 }} />
                                        </Tooltip>}
                                </TableCell>
                                <CountCell value={p.instances?.instances} label='Instances' />
                                <CountCell value={p.instances?.connections} label='Connections' />
                                <TableCell>
                                    <Typography variant='body2' color='text.secondary' sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{p.source ?? '—'}</Typography>
                                </TableCell>
                            </TableRow>
                        )
                    })}
                </TableBody>
            </Table>
        </Stack>
    )
}
