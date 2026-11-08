import React from 'react'
import { Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from '@mui/material'
import { IPublishedRoute } from '@kwirthmagnify/kwirth-common'
import { ERouteColumn, EStatusTable } from '../common/StatusTypes'
import { IRouteLine, OWNER_LABEL, collisions, countByOwner, filterLines, toLines } from './StatusRoutes'
import { ISortableProps, TSortValue, sortRows } from './StatusSort'
import { SortableCell } from './StatusSortableCell'

/*
    The Routes tab: every HTTP route this Kwirth has published, who published it, with which method. The
    list comes from the core's route registry, which records what is mounted — patterns, never values.
*/

interface IRoutesTabProps extends ISortableProps {
    routes: IPublishedRoute[] | undefined
    filter: string
}

type TChipColor = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'error'

// Each method in its own colour, so a list of hundreds can be scanned by verb. None red: not a fault.
const METHOD_COLOR: Record<string, TChipColor> = {
    GET: 'success',
    POST: 'primary',
    PUT: 'warning',
    PATCH: 'secondary',
    DELETE: 'info',
    ALL: 'default'
}

// How each column sorts: methods by how many and then which, the owner by its label and id.
const VALUE_OF: Record<ERouteColumn, (l: IRouteLine) => TSortValue> = {
    [ERouteColumn.PATH]: l => l.path,
    [ERouteColumn.METHODS]: l => l.methods.join(' '),
    [ERouteColumn.OWNER]: l => `${OWNER_LABEL[l.ownerKind]} ${l.ownerId}`
}

export const StatusRoutesTab: React.FC<IRoutesTabProps> = ({ routes, filter, sorts, onSort }) => {
    if (!routes) {
        return (
            <Typography
                variant='body2'
                sx={{
                    color: 'text.secondary',
                    p: 4,
                    textAlign: 'center'
                }}>This Kwirth's core does not list its routes yet. Update the core to see them here.
                            </Typography>
        );
    }
    const clashes = collisions(routes)
    const lines = toLines(routes)
    const sort = sorts[EStatusTable.ROUTES]
    const shown = sortRows(filterLines(lines, filter), sort, (l, column) => VALUE_OF[column as ERouteColumn](l))
    const cabecera = (column: ERouteColumn, label: string) =>
        <SortableCell label={label} column={column} sort={sort} onSort={col => onSort(EStatusTable.ROUTES, col)} />
    return (
        <Stack spacing={1} sx={{ pb: 2 }}>
            <Stack
                direction='row'
                spacing={0.75}
                useFlexGap
                sx={{
                    flexWrap: 'wrap',
                    alignItems: 'center'
                }}>
                {/* Paths (one per line) and routes (one per method): both, since they are different numbers. */}
                <Typography variant='caption' sx={{
                    color: 'text.secondary'
                }}>{lines.length} paths · {routes.length} routes:</Typography>
                {countByOwner(routes).map(([kind, n]) => <Chip key={kind} size='small' variant='outlined' label={`${n} ${OWNER_LABEL[kind]}`} />)}
                {/* Said up front: a collision means one of the two is unreachable, and nothing else says it. */}
                {clashes.size > 0 &&
                    <Chip size='small' color='warning' label={`${clashes.size} collision${clashes.size === 1 ? '' : 's'}`} />}
            </Stack>
            {/*
                Fixed layout, 50 / 25 / 25: the path gets half, methods and owner a quarter each. With the
                automatic layout the widths followed the rows on screen, and moved with every letter typed in
                the filter. What does not fit wraps inside its own column.
            */}
            <Table size='small' stickyHeader sx={{ tableLayout: 'fixed' }}>
                <colgroup>
                    <col style={{ width: '50%' }} />
                    <col style={{ width: '25%' }} />
                    <col style={{ width: '25%' }} />
                </colgroup>
                <TableHead>
                    <TableRow>
                        {cabecera(ERouteColumn.PATH, 'Path')}
                        {cabecera(ERouteColumn.METHODS, 'Methods')}
                        {cabecera(ERouteColumn.OWNER, 'Published by')}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {shown.map(r =>
                        <TableRow key={`${r.ownerKind}:${r.ownerId} ${r.path}`}>
                            <TableCell>
                                <Stack direction='row' spacing={1} sx={{
                                    alignItems: 'center'
                                }}>
                                    {/* Breaks only at a slash-free overflow, never letter by letter on a normal path. */}
                                    <Typography variant='body2' sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{r.path}</Typography>
                                    {r.colliding &&
                                        <Tooltip title='Another extension publishes this same method and path. Express answers with whichever was mounted first; the other one cannot be reached.'>
                                            <Chip size='small' color='warning' label='collision' />
                                        </Tooltip>}
                                </Stack>
                            </TableCell>
                            {/* Many methods wrap to a second row inside the quarter, instead of widening it. */}
                            <TableCell>
                                <Stack direction='row' spacing={0.5} useFlexGap sx={{
                                    flexWrap: 'wrap'
                                }}>
                                    {r.methods.map(m =>
                                        <Chip key={m} size='small' label={m} color={METHOD_COLOR[m] ?? 'default'} variant='outlined'
                                            sx={{ fontFamily: 'monospace', minWidth: 52 }} />)}
                                </Stack>
                            </TableCell>
                            <TableCell sx={{ overflowWrap: 'anywhere' }}>
                                <Typography variant='body2' component='span' sx={{
                                    color: 'text.secondary'
                                }}>{OWNER_LABEL[r.ownerKind]} </Typography>
                                <Typography variant='body2' component='span' sx={{ fontWeight: 500 }}>{r.ownerId}</Typography>
                            </TableCell>
                        </TableRow>)}
                </TableBody>
            </Table>
        </Stack>
    );
}
