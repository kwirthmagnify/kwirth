import React from 'react'
import { Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from '@mui/material'
import { EDceColumn, EStatusTable, IStatusDce, IStatusDcePart } from '../common/StatusTypes'
import { dceBytes, filterDces, formatBytes, frontPartOf, partLabel, readFrontRegistry, sortDces, summarizeDces } from './StatusDces'
import { ISortableProps, TSortValue, sortRows } from './StatusSort'
import { SortableCell } from './StatusSortableCell'

/*
    The DCE tab: every installed DCE, whether each of its halves loaded, where it came from and who
    requires it. The back half comes in the snapshot; the front half is read from this page, since it is
    this browser that loaded it.
*/

interface IDceTabProps extends ISortableProps {
    dces: IStatusDce[] | undefined
    filter: string
}

interface IPartCellProps {
    has: boolean
    part: IStatusDcePart | undefined
    side: string
}

interface ISizeCellProps {
    dce: IStatusDce
}

/*
    Back and front apart, as the two states are: they weigh on different things — the back.js in the
    server's memory, the front.js in every browser that loads Kwirth. A side the DCE does not have, or the
    core did not report, is a dash and never a zero.
*/
const SizeCell: React.FC<ISizeCellProps> = ({ dce }) => {
    const side = (bytes: number | undefined) => bytes === undefined ? '—' : formatBytes(bytes)
    return (
        <TableCell aria-label='Size'>
            <Tooltip title='back.js · front.js'>
                <Typography variant='body2' component='span' sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {side(dce.backBytes)} · {side(dce.frontBytes)}
                </Typography>
            </Tooltip>
        </TableCell>
    )
}

/** One half's state. The error is written out, not only in a tooltip: it is the reason to open the tab. */
const PartCell: React.FC<IPartCellProps> = ({ has, part, side }) => {
    const l = partLabel(has, part)
    return (
        <TableCell sx={{ whiteSpace: 'nowrap' }} aria-label={`${side} state`}>
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

export const StatusDceTab: React.FC<IDceTabProps> = ({ dces, filter, sorts, onSort }) => {
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
    /*
        How each column sorts. Inside the component because the Front state is read from this page's
        registry. A half the DCE does not have (a dash) is undefined, so it goes last.
    */
    const valueOf: Record<EDceColumn, (d: IStatusDce) => TSortValue> = {
        [EDceColumn.DCE]: d => d.name,
        [EDceColumn.VERSION]: d => d.version,
        [EDceColumn.BACK]: d => d.hasBack ? partLabel(true, d.back).label : undefined,
        [EDceColumn.FRONT]: d => d.hasFront ? partLabel(true, frontPartOf(d, registry)).label : undefined,
        [EDceColumn.SIZE]: d => dceBytes(d),
        [EDceColumn.SOURCE]: d => d.source,
        [EDceColumn.CONSUMERS]: d => d.consumers.length
    }
    const sort = sorts[EStatusTable.DCE]
    const shown = sortRows(sortDces(filterDces(dces, filter), registry), sort, (d, column) => valueOf[column as EDceColumn](d))
    const cabecera = (column: EDceColumn, label: string) =>
        <SortableCell label={label} column={column} sort={sort} onSort={col => onSort(EStatusTable.DCE, col)} />
    return (
        <Stack spacing={1} sx={{ pb: 2 }}>
            <Stack direction='row' spacing={0.75} useFlexGap flexWrap='wrap' alignItems='center'>
                <Typography variant='caption' color='text.secondary'>{s.total} DCE{s.total === 1 ? '' : 's'}:</Typography>
                <Chip size='small' variant='outlined' label={`${s.consumers} consumer${s.consumers === 1 ? '' : 's'}`} />
                {s.broken > 0 && <Chip size='small' color='error' label={`${s.broken} broken`} />}
                {/* Not a fault: installed and of use to nobody, which is worth knowing before uninstalling. */}
                {s.unused > 0 && <Chip size='small' label={`${s.unused} unused`} />}
                {s.bytes !== undefined &&
                    <Tooltip title='All the back.js the core loaded and all the front.js it serves'>
                        <Chip size='small' variant='outlined' label={`${formatBytes(s.bytes)} of code`} />
                    </Tooltip>}
            </Stack>
            {/* Fixed widths, like every table of this plugin: the filter must not move the columns. */}
            <Table size='small' stickyHeader sx={{ tableLayout: 'fixed' }}>
                <colgroup>
                    <col style={{ width: '18%' }} />
                    <col style={{ width: 90 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 170 }} />
                    <col />
                    <col style={{ width: '22%' }} />
                </colgroup>
                <TableHead>
                    <TableRow>
                        {cabecera(EDceColumn.DCE, 'DCE')}
                        {cabecera(EDceColumn.VERSION, 'Version')}
                        {cabecera(EDceColumn.BACK, 'Back')}
                        {cabecera(EDceColumn.FRONT, 'Front')}
                        {cabecera(EDceColumn.SIZE, 'Size')}
                        {cabecera(EDceColumn.SOURCE, 'Source')}
                        {cabecera(EDceColumn.CONSUMERS, 'Consumed by')}
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
                            <TableCell sx={{ whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{d.version}</TableCell>
                            <PartCell has={d.hasBack} part={d.back} side='Back' />
                            <PartCell has={d.hasFront} part={frontPartOf(d, registry)} side='Front' />
                            <SizeCell dce={d} />
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
