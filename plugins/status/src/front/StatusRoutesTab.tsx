import React from 'react'
import { Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from '@mui/material'
import { IPublishedRoute } from '@kwirthmagnify/kwirth-common'
import { OWNER_LABEL, collisions, countByOwner, filterLines, toLines } from './StatusRoutes'

/*
    The Routes tab: every HTTP route this Kwirth has published, who published it, with which method. The
    list comes from the core's route registry, which records what is mounted — patterns, never values.
*/

interface IRoutesTabProps {
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

export const StatusRoutesTab: React.FC<IRoutesTabProps> = ({ routes, filter }) => {
    if (!routes) {
        return (
            <Typography variant='body2' color='text.secondary' sx={{ p: 4, textAlign: 'center' }}>
                This Kwirth's core does not list its routes yet. Update the core to see them here.
            </Typography>
        )
    }
    const clashes = collisions(routes)
    const lines = toLines(routes)
    const shown = filterLines(lines, filter)
    return (
        <Stack spacing={1} sx={{ pb: 2 }}>
            <Stack direction='row' spacing={0.75} useFlexGap flexWrap='wrap' alignItems='center'>
                {/* Paths (one per line) and routes (one per method): both, since they are different numbers. */}
                <Typography variant='caption' color='text.secondary'>{lines.length} paths · {routes.length} routes:</Typography>
                {countByOwner(routes).map(([kind, n]) => <Chip key={kind} size='small' variant='outlined' label={`${n} ${OWNER_LABEL[kind]}`} />)}
                {/* Said up front: a collision means one of the two is unreachable, and nothing else says it. */}
                {clashes.size > 0 &&
                    <Chip size='small' color='warning' label={`${clashes.size} collision${clashes.size === 1 ? '' : 's'}`} />}
            </Stack>
            <Table size='small' stickyHeader>
                <TableHead>
                    <TableRow>
                        <TableCell>Path</TableCell>
                        <TableCell>Methods</TableCell>
                        <TableCell>Published by</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {shown.map(r =>
                        <TableRow key={`${r.ownerKind}:${r.ownerId} ${r.path}`}>
                            <TableCell>
                                <Stack direction='row' spacing={1} alignItems='center'>
                                    {/* Breaks only at a slash-free overflow, never letter by letter on a normal path. */}
                                    <Typography variant='body2' sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{r.path}</Typography>
                                    {r.colliding &&
                                        <Tooltip title='Another extension publishes this same method and path. Express answers with whichever was mounted first; the other one cannot be reached.'>
                                            <Chip size='small' color='warning' label='collision' />
                                        </Tooltip>}
                                </Stack>
                            </TableCell>
                            {/* '1%' + nowrap = as narrow as its chips. (In sx, width: 1 means 100%, which squashed the path.) */}
                            <TableCell sx={{ width: '1%', whiteSpace: 'nowrap' }}>
                                <Stack direction='row' spacing={0.5}>
                                    {r.methods.map(m =>
                                        <Chip key={m} size='small' label={m} color={METHOD_COLOR[m] ?? 'default'} variant='outlined'
                                            sx={{ fontFamily: 'monospace', minWidth: 52 }} />)}
                                </Stack>
                            </TableCell>
                            <TableCell sx={{ width: '1%', whiteSpace: 'nowrap' }}>
                                <Typography variant='body2' component='span' color='text.secondary'>{OWNER_LABEL[r.ownerKind]} </Typography>
                                <Typography variant='body2' component='span' sx={{ fontWeight: 500 }}>{r.ownerId}</Typography>
                            </TableCell>
                        </TableRow>)}
                </TableBody>
            </Table>
        </Stack>
    )
}
