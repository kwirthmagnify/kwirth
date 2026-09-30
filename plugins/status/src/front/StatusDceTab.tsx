import React from 'react'
import { Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from '@mui/material'
import { IStatusDce, IStatusDcePart } from '../common/StatusTypes'
import { filterDces, frontPartOf, partLabel, readFrontRegistry, sortDces, summarizeDces } from './StatusDces'

/*
    The DCE tab: every installed DCE, whether each of its halves loaded, where it came from and who
    requires it. The back half comes in the snapshot; the front half is read from this page, since it is
    this browser that loaded it.
*/

interface IDceTabProps {
    dces: IStatusDce[] | undefined
    filter: string
}

interface IPartCellProps {
    has: boolean
    part: IStatusDcePart | undefined
    side: string
}

/** One half's state. The error is written out, not only in a tooltip: it is the reason to open the tab. */
const PartCell: React.FC<IPartCellProps> = ({ has, part, side }) => {
    const l = partLabel(has, part)
    return (
        <TableCell sx={{ width: '1%', whiteSpace: 'nowrap' }} aria-label={`${side} state`}>
            {has
                ? <Tooltip title={part ? '' : `This ${side.toLowerCase()} end has not been loaded`}>
                    <Chip size='small' label={l.label} color={l.color} variant={l.color === 'success' ? 'outlined' : 'filled'} />
                </Tooltip>
                : <Typography variant='body2' color='text.disabled'>{l.label}</Typography>}
            {part?.error &&
                <Typography variant='caption' color='error' display='block' sx={{ whiteSpace: 'normal', maxWidth: 280 }}>{part.error}</Typography>}
        </TableCell>
    )
}

export const StatusDceTab: React.FC<IDceTabProps> = ({ dces, filter }) => {
    if (!dces) {
        return (
            <Typography variant='body2' color='text.secondary' sx={{ p: 4, textAlign: 'center' }}>
                This Kwirth's core does not list its DCEs yet. Update the core to see them here.
            </Typography>
        )
    }
    if (dces.length === 0) {
        return (
            <Typography variant='body2' color='text.secondary' sx={{ p: 4, textAlign: 'center' }}>
                No DCE is installed in this Kwirth.
            </Typography>
        )
    }
    const registry = readFrontRegistry()
    const s = summarizeDces(dces, registry)
    const shown = sortDces(filterDces(dces, filter), registry)
    return (
        <Stack spacing={1} sx={{ pb: 2 }}>
            <Stack direction='row' spacing={0.75} useFlexGap flexWrap='wrap' alignItems='center'>
                <Typography variant='caption' color='text.secondary'>{s.total} DCE{s.total === 1 ? '' : 's'}:</Typography>
                <Chip size='small' variant='outlined' label={`${s.consumers} consumer${s.consumers === 1 ? '' : 's'}`} />
                {s.broken > 0 && <Chip size='small' color='error' label={`${s.broken} broken`} />}
                {/* Not a fault: installed and of use to nobody, which is worth knowing before uninstalling. */}
                {s.unused > 0 && <Chip size='small' label={`${s.unused} unused`} />}
            </Stack>
            <Table size='small' stickyHeader>
                <TableHead>
                    <TableRow>
                        <TableCell>DCE</TableCell>
                        <TableCell>Version</TableCell>
                        <TableCell>Back</TableCell>
                        <TableCell>Front</TableCell>
                        <TableCell>Source</TableCell>
                        <TableCell>Consumed by</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {shown.map(d =>
                        <TableRow key={d.id} aria-label={`DCE ${d.id}`}>
                            <TableCell>
                                <Typography variant='body2' sx={{ fontWeight: 500 }}>{d.name}</Typography>
                                {d.name !== d.id &&
                                    <Typography variant='caption' color='text.secondary' sx={{ fontFamily: 'monospace' }}>{d.id}</Typography>}
                            </TableCell>
                            <TableCell sx={{ width: '1%', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{d.version}</TableCell>
                            <PartCell has={d.hasBack} part={d.back} side='Back' />
                            <PartCell has={d.hasFront} part={frontPartOf(d, registry)} side='Front' />
                            <TableCell>
                                <Typography variant='body2' color='text.secondary' sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{d.source ?? '—'}</Typography>
                            </TableCell>
                            <TableCell>
                                {d.consumers.length === 0
                                    ? <Typography variant='body2' color='text.disabled'>nobody</Typography>
                                    : <Stack direction='row' spacing={0.5} useFlexGap flexWrap='wrap'>
                                        {d.consumers.map(c => <Chip key={`${c.type}:${c.id}`} size='small' variant='outlined' label={`${c.type} ${c.id}`} />)}
                                    </Stack>}
                            </TableCell>
                        </TableRow>)}
                </TableBody>
            </Table>
        </Stack>
    )
}
