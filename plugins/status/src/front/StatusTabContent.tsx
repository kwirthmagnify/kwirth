import React from 'react'
import { Box, Chip, IconButton, MenuItem, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material'
import { Refresh, ViewList, Hub } from '@kwirthmagnify/kwirth-common-front/icons'
import { IContentProps } from '@kwirthmagnify/kwirth-common-front'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType } from '@kwirthmagnify/kwirth-common'
import { EComponentHealth, EComponentKind, EStatusCommand, IStatusComponent } from '../common/StatusTypes'
import { IStatusData } from './StatusData'
import { StatusDiagram } from './StatusDiagram'

/*
    How each state is worded, and in what colour.

    The text goes here and not in the back end on purpose: the back end reports FACTS (started, router
    mounted) and the front end decides how to tell them. That way, the day a word has to change there is
    no need to republish the back end or restart the server.
*/
const HEALTH_LABEL: Record<EComponentHealth, { label: string, color: 'success' | 'warning' | 'error' | 'default' }> = {
    [EComponentHealth.ACTIVE]: { label: 'Active', color: 'success' },
    // Idle is NOT an error, it is information: it works, but it is of use to nobody. Hence 'default' and
    // not 'warning' — whoever looks must be able to tell "this needs fixing" from "this is superfluous".
    [EComponentHealth.IDLE]: { label: 'Idle', color: 'default' },
    [EComponentHealth.INSTANTIATED]: { label: 'Running', color: 'success' },
    [EComponentHealth.NOT_INSTANTIATED]: { label: 'Not started', color: 'warning' },
    [EComponentHealth.PENDING_RESTART]: { label: 'Needs restart', color: 'warning' },
    [EComponentHealth.FAILED]: { label: 'Failed', color: 'error' },
    [EComponentHealth.UNKNOWN]: { label: 'Not reported', color: 'default' }
}

const KIND_LABEL: Record<EComponentKind, string> = {
    [EComponentKind.PROVIDER]: 'Provider',
    [EComponentKind.PLUVIDER]: 'Pluvider',
    [EComponentKind.SENDER]: 'Sender',
    [EComponentKind.WEBHOOK]: 'Webhook',
    [EComponentKind.CHANNEL]: 'Channel'
}

interface IEmptyStateProps {
    title: string
    detail: string
}

/*
    The same pattern as situs, iter and asteroids: saying just "not started" leaves the user not knowing
    that what is missing is pressing Start. The detail ALWAYS carries the action.

    ⚠️ The height is MEASURED, not inherited. The container the core gives a tab's content has no defined
    height, so 'height: 100%' resolves to nothing and the message was left stuck at the top instead of
    centred. Where the box starts is measured and it is given the rest of the viewport — the same as the
    table does, and as the other channels do in their empty state.
*/
const EmptyState: React.FC<IEmptyStateProps> = ({ title, detail }) => {
    const ref = React.useRef<HTMLDivElement | null>(null)
    const [top, setTop] = React.useState(0)
    React.useEffect(() => {
        if (ref.current) setTop(ref.current.getBoundingClientRect().top)
    })
    return (
        <Stack ref={ref} alignItems='center' justifyContent='center' spacing={1}
            sx={{ flex: 1, width: '100%', minHeight: `calc(100vh - ${top}px - 8px)`, px: 4, textAlign: 'center' }}>
            <Typography variant='h6' color='text.secondary'>{title}</Typography>
            <Typography variant='body2' color='text.secondary'>{detail}</Typography>
        </Stack>
    )
}

const StatusTabContent: React.FC<IContentProps> = (props) => {
    const data: IStatusData = props.channelObject.data
    /*
        The state that has to survive switching tabs is kept in 'data', which belongs to the channel.
        Since mutating it does not trigger a render on its own, one is forced by hand — it is the same
        pattern the project's other channels use.
    */
    const [, forzarRender] = React.useState(0)
    const repintar = () => forzarRender(n => n + 1)
    const filter = data.filter
    const setFilter = (v: string) => { data.filter = v; repintar() }
    /*
        The height of the scrolling area is computed, not inherited.

        The container the core gives a tab's content has no defined height, so a 'height: 100%' resolves
        to nothing and the table grows until it runs off the screen with no bar. It is the same pattern
        the other channels use: where the box STARTS is measured and it is given the rest of the viewport.
        It is remeasured on every render because the toolbar above changes height.
    */
    /*
        Table or diagram. It starts on the TABLE on purpose: answering "is everything all right?" is what
        one does ten times a day, and the graph is for when you already know something is up and want to
        see who it drags down. Besides, the diagram downloads the layout engine, and whoever does not open
        it does not pay for it.
    */
    const vista = data.view
    const setVista = (v: 'table' | 'graph') => { data.view = v; repintar() }
    const boxRef = React.useRef<HTMLDivElement | null>(null)
    const [boxTop, setBoxTop] = React.useState(0)
    React.useEffect(() => {
        if (boxRef.current) setBoxTop(boxRef.current.getBoundingClientRect().top)
    })

    /*
        Asking for another snapshot. It is the ONLY thing that makes this channel work: there is no
        automatic refresh, because a timer repeating this would be continuous collection by another name.

        ⚠️ The accessKey goes in the command itself: without it, the core discards it before it reaches
        the plugin and the only thing one sees is that nothing happens.
    */
    const refresh = () => {
        props.channelObject.webSocket?.send(JSON.stringify({
            msgtype: 'statusmessage',
            channel: 'status',
            action: EInstanceMessageAction.COMMAND,
            flow: EInstanceMessageFlow.REQUEST,
            type: EInstanceMessageType.DATA,
            accessKey: props.channelObject.accessString!,
            instance: props.channelObject.instanceId,
            command: EStatusCommand.REFRESH
        }))
    }

    /*
        Auto-refresh. The timer is mounted with the component and cleared on unmounting it, so switching
        tabs or closing the channel turns it off WITHOUT anybody having to remember — with the channel
        closed nothing is left running, which is the requirement that rules in this plugin.

        A snapshot is asked of the back end, it is not recomputed in the front end: what matters is the
        state of NOW.
    */
    React.useEffect(() => {
        if (!data.autoRefresh) return
        const id = setInterval(() => refresh(), data.autoRefresh * 1000)
        return () => clearInterval(id)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.autoRefresh, props.channelObject.instanceId])

    const inventory = data.inventory

    /*
        Deliveries per second between the previous snapshot and this one. It can only be given when there
        are two snapshots, when the component reported in both, and when the counter has not gone
        backwards — which happens when the provider restarts and begins at zero: there is no rate to
        compute there, one has to say it is unknown.
    */
    const tasaDe = (id: string, ahora?: number): number | undefined => {
        if (ahora === undefined || !data.previous || !inventory) return undefined
        const antes = data.previous.components.find(c => c.id === id)?.events
        if (antes === undefined || ahora < antes) return undefined
        const segundos = (inventory.takenAt - data.previous.takenAt) / 1000
        if (segundos <= 0) return undefined
        return (ahora - antes) / segundos
    }
    const componentes = (inventory?.components ?? []).filter(c => {
        if (!filter) return true
        const f = filter.toLowerCase()
        return c.id.toLowerCase().includes(f) || KIND_LABEL[c.kind].toLowerCase().includes(f)
    })

    /*
        Which components have DELIVERED SOMETHING between the previous refresh and this one.

        It is a comparison of values, not a rate: if the counter differs from the previous snapshot's,
        that component has moved something and its lines animate. If it is the same, they do not. No
        dividing by time — the rate serves for the little number in the table, but to decide whether
        something is moving the only thing needed is knowing whether the value changed.

        A component that does not report, or that has no previous snapshot to compare itself with yet,
        does not go in: it is unknown, and it is not animated.
    */
    const activos = new Set<string>()
    for (const c of inventory?.components ?? []) {
        if (c.events === undefined || !data.previous) continue
        const antes = data.previous.components.find(p => p.id === c.id)?.events
        if (antes !== undefined && c.events !== antes) activos.add(c.id)
    }

    /*
        What needs attention first, and within each state by type and id.

        The BROKEN first, then the SURPLUS (idle: it works, but it is of use to nobody), then what does
        not report, and at the end what is fine.

        ⚠️ It is a Record and not an array on purpose: with an array, a state somebody adds and forgets to
        put here returns -1 from indexOf and slips in ABOVE the failures — exactly the opposite of what is
        wanted. With a Record, TypeScript forces a decision about where it goes.
    */
    const ORDEN: Record<EComponentHealth, number> = {
        [EComponentHealth.FAILED]: 0,
        [EComponentHealth.PENDING_RESTART]: 1,
        [EComponentHealth.NOT_INSTANTIATED]: 2,
        [EComponentHealth.IDLE]: 3,
        [EComponentHealth.UNKNOWN]: 4,
        [EComponentHealth.INSTANTIATED]: 5,
        [EComponentHealth.ACTIVE]: 6
    }
    componentes.sort((a, b) => {
        const d = ORDEN[a.health] - ORDEN[b.health]
        if (d !== 0) return d
        return a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind.localeCompare(b.kind)
    })

    const fila = (c: IStatusComponent) => {
        const estado = HEALTH_LABEL[c.health]
        return (
            <TableRow key={`${c.kind}-${c.id}`}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{KIND_LABEL[c.kind]}</TableCell>
                <TableCell><Typography variant='body2' sx={{ fontWeight: 500 }}>{c.displayName}</Typography></TableCell>
                <TableCell><Chip size='small' label={estado.label} color={estado.color} variant={c.health === EComponentHealth.ACTIVE ? 'outlined' : 'filled'} /></TableCell>
                {/*
                    Un guion cuando no se sabe, nunca un 0: el cero diria "nadie lo consume" y quien lo
                    lea puede ir a desinstalar algo que en realidad si se usa. Lo mismo vale para las
                    entregas de la columna siguiente.
                */}
                <TableCell align='right'>
                    <Typography variant='body2' sx={{ fontVariantNumeric: 'tabular-nums' }} color={c.subscribers === undefined ? 'text.disabled' : 'text.primary'}>
                        {c.subscribers === undefined ? '—' : c.subscribers}
                    </Typography>
                </TableCell>
                <TableCell align='right'>
                    <Typography variant='body2' sx={{ fontVariantNumeric: 'tabular-nums' }} color={c.events === undefined ? 'text.disabled' : 'text.primary'}>
                        {c.events === undefined ? '—' : c.events.toLocaleString()}
                    </Typography>
                    {(() => {
                        const t = tasaDe(c.id, c.events)
                        if (t === undefined) return null
                        return <Typography variant='caption' color='text.secondary' display='block'>{t < 1 && t > 0 ? t.toFixed(2) : Math.round(t)}/s</Typography>
                    })()}
                </TableCell>
                {/* El porqué es la columna que justifica la pantalla: sin ella esto es otra lista más. */}
                <TableCell><Typography variant='body2' color='text.secondary'>{c.reason ?? ''}</Typography></TableCell>
            </TableRow>
        )
    }

    /*
        The two empty states are different and have to be told apart: not started, what is missing is an
        action by the user; started and with no snapshot, what is missing is for it to arrive — and there
        is nothing to do but wait a second.
    */
    if (!data.started) {
        return <EmptyState title='Kwirth Status not started'
            detail='Start the channel (tab settings ⚙ → Start) to see what this Kwirth has inside.' />
    }
    if (!inventory) {
        return <EmptyState title='Waiting for the first snapshot'
            detail='The channel is running; the inventory should appear in a moment.' />
    }

    return (
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 1 }}>
                <Typography variant='subtitle2'>What this Kwirth has inside</Typography>
                <Chip size='small' variant='outlined' label={`${inventory.components.length} components`} />
                <Box sx={{ flexGrow: 1 }} />
                <TextField size='small' placeholder='Filter…' value={filter} onChange={e => setFilter(e.target.value)} sx={{ width: 220 }} />
                <Tooltip title='Table view'>
                    <IconButton size='small' color={vista === 'table' ? 'primary' : 'default'} aria-label='Table view' onClick={() => setVista('table')}><ViewList fontSize='small' /></IconButton>
                </Tooltip>
                <Tooltip title='Graph view'>
                    <IconButton size='small' color={vista === 'graph' ? 'primary' : 'default'} aria-label='Graph view' onClick={() => setVista('graph')}><Hub fontSize='small' /></IconButton>
                </Tooltip>
                {/*
                    Sin Tooltip a proposito: el Select ya ENSEÑA su valor ('Manual', 'Every 5s'), asi
                    que la ayuda sobraba — y al desplegarse, el tooltip se quedaba flotando ENCIMA del
                    menu y tapaba las opciones. El aria-label cubre al lector de pantalla.
                */}
                <Select size='small' value={data.autoRefresh} aria-label='Auto refresh'
                        onChange={e => { data.autoRefresh = Number(e.target.value); repintar() }}
                        sx={{ minWidth: 104, '& .MuiSelect-select': { py: 0.5, fontSize: '0.8rem' } }}>
                        <MenuItem value={0}>Manual</MenuItem>
                        <MenuItem value={5}>Every 5s</MenuItem>
                        <MenuItem value={15}>Every 15s</MenuItem>
                        <MenuItem value={30}>Every 30s</MenuItem>
                        <MenuItem value={60}>Every minute</MenuItem>
                    </Select>
                <Tooltip title='Take a new snapshot'>
                    <IconButton size='small' onClick={refresh}><Refresh fontSize='small' /></IconButton>
                </Tooltip>
            </Stack>

            {/* Que la foto es de un instante concreto se dice, no se insinúa: esto no se actualiza solo. */}
            <Typography variant='caption' color='text.secondary' sx={{ mb: 1 }}>
                Snapshot taken at {new Date(inventory.takenAt).toLocaleTimeString()}
                {data.autoRefresh ? ` — refreshing every ${data.autoRefresh}s while this tab is open` : ' — it does not refresh on its own'}.
                {' '}Delivered counts since each component started; the rate is measured against your previous snapshot.
            </Typography>

            <Box ref={boxRef} sx={{ display: 'flex', flexDirection: 'column', overflowY: vista === 'table' ? 'auto' : 'hidden', overflowX: 'hidden', width: '100%', flexGrow: 1, height: `calc(100vh - ${boxTop}px - 35px)` }}>
                {vista === 'graph' && <StatusDiagram inventory={inventory} active={activos} autoRefresh={data.autoRefresh} />}
                {vista === 'table' && <Table size='small' stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell>Kind</TableCell>
                            <TableCell>Name</TableCell>
                            <TableCell>State</TableCell>
                            <TableCell align='right'>Consumers</TableCell>
                            <TableCell align='right'>Delivered</TableCell>
                            <TableCell>Why</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>{componentes.map(fila)}</TableBody>
                </Table>}
            </Box>

            {data.signals.length > 0 && (
                <Box sx={{ mt: 1 }}>
                    {data.signals.map((s, i) => <Typography key={i} variant='caption' color='error' display='block'>{s}</Typography>)}
                </Box>
            )}
        </Box>
    )
}

export { StatusTabContent }
