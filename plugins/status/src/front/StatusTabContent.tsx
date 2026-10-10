import React from 'react'
import { Box, Chip, IconButton, MenuItem, Select, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Tooltip, Typography } from '@mui/material'
import { Refresh } from '@kwirthmagnify/kwirth-common-front/icons'
import { IContentProps } from '@kwirthmagnify/kwirth-common-front'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType } from '@kwirthmagnify/kwirth-common'
import { EComponentHealth, EComponentKind, EStatusCommand, EStatusTab, IStatusComponent } from '../common/StatusTypes'
import { IStatusData } from './StatusData'
import { StatusDiagram } from './StatusDiagram'
import { StatusPerformanceTab } from './StatusPerformanceTab'
import { StatusRoutesTab } from './StatusRoutesTab'
import { StatusDceTab } from './StatusDceTab'
import { StatusPluginsTab } from './StatusPluginsTab'
import { StatusSqlTab } from './StatusSqlTab'
import { StatusCoreLogTab, StatusPreviousLogTab } from './StatusLogTab'
import { isAdmin, readCoreLog, readPreviousLog } from './StatusLog'
import { StatusHomeTab } from './StatusHomeTab'
import { HEALTH_LABEL, HEALTH_ORDER, KIND_LABEL } from './StatusLabels'

/*
    Which kinds each list tab shows. The Providers tab (and its graph) is about producing data; the
    Extensions tab is about the rest, which does not produce. A kind nobody places here shows nowhere, so
    the Record forces a decision for every kind.
*/
const TAB_OF_KIND: Record<EComponentKind, EStatusTab | undefined> = {
    [EComponentKind.PROVIDER]: EStatusTab.PROVIDERS,
    [EComponentKind.PLUVIDER]: EStatusTab.PROVIDERS,
    [EComponentKind.SENDER]: EStatusTab.EXTENSIONS,
    [EComponentKind.WEBHOOK]: EStatusTab.EXTENSIONS,
    // Channels are not inventory rows: they only exist as consumers in the graph.
    [EComponentKind.CHANNEL]: undefined
}

/** The tabs that scroll inside themselves (the graph, the log boxes): the tab area must not scroll too. */
const SELF_SCROLLING: ReadonlySet<EStatusTab> = new Set([EStatusTab.GRAPH, EStatusTab.LOG, EStatusTab.PREVIOUS_LOG])

/** Height of the controls in the top bar, in px: the same as Excubitor's, so both plugins look alike. */
const TOP_BAR_HEIGHT = 26

/** The tabs where the filter applies: the ones that are lists. */
const FILTERABLE: ReadonlySet<EStatusTab> = new Set([EStatusTab.PROVIDERS, EStatusTab.PLUGINS, EStatusTab.EXTENSIONS, EStatusTab.ROUTES, EStatusTab.DCE, EStatusTab.SQL, EStatusTab.LOG, EStatusTab.PREVIOUS_LOG])

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
        The open tab. It starts on HOME: one box per tab, so "is everything all right?" is answered
        without opening any of them. The graph stays behind its tab on purpose: the diagram downloads the
        layout engine, and whoever does not open it does not pay for it.
    */
    const vista = data.view
    const setVista = (v: EStatusTab) => { data.view = v; repintar() }
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
        The core's log, read with every snapshot so the Log tabs follow the same refresh as the rest.

        The PREVIOUS container's log is read always: the core has held it in memory since it started, the
        call is cheap, and the Home says from it whether Kwirth has restarted. The CURRENT one is a live
        read of up to a thousand lines, so it is only asked for while its tab is open.

        Only for administrators: the back end does not serve it to anybody else, and asking would only
        produce a 403 to show.

        TWO effects and not one: they depend on different things. With one effect keyed on the open tab too,
        every tab change asked for the previous log again — a request per click, for a log that only
        changes with a snapshot.
    */
    const admin = isAdmin(props.channelObject.accessString)
    // The previous container's log: once per snapshot, whatever tab is open.
    React.useEffect(() => {
        const url = props.channelObject.clusterUrl
        const access = props.channelObject.accessString
        if (!admin || !inventory || !url || !access) return
        let current = true
        readPreviousLog(url, access).then(r => { if (current) { data.previousLog = r; repintar() } })
        return () => { current = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inventory?.takenAt, admin])
    // The current log: once per snapshot and on opening its tab, and only while that tab is open.
    React.useEffect(() => {
        const url = props.channelObject.clusterUrl
        const access = props.channelObject.accessString
        if (!admin || !inventory || !url || !access) return
        // When the inventory carries coreLogLines (non-Kubernetes environments), the Log tab already has
        // them from processChannelMessage — no REST call needed. Only fetch from the REST endpoint when
        // the core has Kubernetes (the inventory does NOT include coreLogLines).
        if (vista !== EStatusTab.LOG || inventory.coreLogLines) return
        let current = true
        readCoreLog(url, access).then(l => { if (current) { data.coreLog = l; repintar() } })
        return () => { current = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inventory?.takenAt, vista, admin])

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

    // What needs attention first (HEALTH_ORDER), and within each state by type and id.
    componentes.sort((a, b) => {
        const d = HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health]
        if (d !== 0) return d
        return a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind.localeCompare(b.kind)
    })
    const filasDe = (tab: EStatusTab): IStatusComponent[] => componentes.filter(c => TAB_OF_KIND[c.kind] === tab)

    // 'producer': consumers and deliveries only mean something for what produces data (Providers tab).
    const fila = (c: IStatusComponent, producer: boolean) => {
        const estado = HEALTH_LABEL[c.health]
        return (
            <TableRow key={`${c.kind}-${c.id}`}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{KIND_LABEL[c.kind]}</TableCell>
                <TableCell><Typography variant='body2' sx={{ fontWeight: 500 }}>{c.displayName}</Typography></TableCell>
                <TableCell><Chip size='small' label={estado.label} color={estado.color} variant={c.health === EComponentHealth.ACTIVE ? 'outlined' : 'filled'} /></TableCell>
                {/*
                    A dash when it is unknown, never a 0: a zero would say "nobody consumes it", and whoever
                    reads it may go and uninstall something that is in fact used. The same goes for the
                    deliveries in the next column.
                */}
                {producer && <TableCell align='right'>
                    <Typography variant='body2' sx={{ fontVariantNumeric: 'tabular-nums' }} color={c.subscribers === undefined ? 'text.disabled' : 'text.primary'}>
                        {c.subscribers === undefined ? '—' : c.subscribers}
                    </Typography>
                </TableCell>}
                {producer && <TableCell align='right'>
                    <Typography variant='body2' sx={{ fontVariantNumeric: 'tabular-nums' }} color={c.events === undefined ? 'text.disabled' : 'text.primary'}>
                        {c.events === undefined ? '—' : c.events.toLocaleString()}
                    </Typography>
                    {(() => {
                        const t = tasaDe(c.id, c.events)
                        if (t === undefined) return null
                        return <Typography variant='caption' color='text.secondary' display='block'>{t < 1 && t > 0 ? t.toFixed(2) : Math.round(t)}/s</Typography>
                    })()}
                </TableCell>}
                {/* The why is the column that justifies the screen: without it this is one more list. */}
                <TableCell><Typography variant='body2' color='text.secondary'>{c.reason ?? ''}</Typography></TableCell>
            </TableRow>
        )
    }

    const tabla = (filas: IStatusComponent[], producer: boolean) => (
        <Table size='small' stickyHeader>
            <TableHead>
                <TableRow>
                    <TableCell>Kind</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>State</TableCell>
                    {producer && <TableCell align='right'>Consumers</TableCell>}
                    {producer && <TableCell align='right'>Delivered</TableCell>}
                    <TableCell>Why</TableCell>
                </TableRow>
            </TableHead>
            <TableBody>{filas.map(c => fila(c, producer))}</TableBody>
        </Table>
    )

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
            {/*
                One row: the tabs on the left, the controls on the right. The controls are COMMON to every
                tab — a snapshot is of all of Kwirth, and asking for one from Performance must not mean
                going back to Home. What the snapshot is (its time, whether it refreshes) is said on Home.
            */}
            <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 1, borderBottom: 1, borderColor: 'divider' }}>
                {/*
                    Scrollable: with ten tabs, a window narrower than they are clipped the last one under the
                    filter. minWidth 0 lets the flex row shrink it so the arrows appear instead.
                */}
                <Tabs value={vista} onChange={(_e, v: EStatusTab) => setVista(v)} variant='scrollable' scrollButtons='auto'
                    sx={{ minHeight: 36, flexGrow: 1, minWidth: 0 }}>
                    <Tab value={EStatusTab.HOME} label='Home' sx={{ minHeight: 36, py: 0 }} />
                    <Tab value={EStatusTab.PROVIDERS} label='Providers' sx={{ minHeight: 36, py: 0 }} />
                    <Tab value={EStatusTab.GRAPH} label='Graph' sx={{ minHeight: 36, py: 0 }} />
                    <Tab value={EStatusTab.PERFORMANCE} label='Performance' sx={{ minHeight: 36, py: 0 }} />
                    <Tab value={EStatusTab.PLUGINS} label='Plugins' sx={{ minHeight: 36, py: 0 }} />
                    <Tab value={EStatusTab.EXTENSIONS} label='Extensions' sx={{ minHeight: 36, py: 0 }} />
                    <Tab value={EStatusTab.ROUTES} label='Routes' sx={{ minHeight: 36, py: 0 }} />
                    <Tab value={EStatusTab.DCE} label='DCE' sx={{ minHeight: 36, py: 0 }} />
                    <Tab value={EStatusTab.LOG} label='Log' sx={{ minHeight: 36, py: 0 }} />
                    <Tab value={EStatusTab.PREVIOUS_LOG} label='Previous log' sx={{ minHeight: 36, py: 0 }} />
                    <Tab value={EStatusTab.SQL} label='SQL' sx={{ minHeight: 36, py: 0 }} />
                </Tabs>
                {/*
                    Always there, disabled where it does not apply: a box that comes and goes moves everything
                    next to it. Fixed height and font — Excubitor's top-bar pattern — so it matches the Select
                    exactly, whatever padding each control brings of its own.
                */}
                <TextField size='small' placeholder='Filter…' value={filter} onChange={e => setFilter(e.target.value)}
                    disabled={!FILTERABLE.has(vista)}
                    sx={{ width: 200, '& .MuiInputBase-root': { height: TOP_BAR_HEIGHT, fontSize: 12 } }} />
                {/*
                    No Tooltip on purpose: the Select already SHOWS its value ('Manual', 'Every 5s'), so the
                    hint was redundant — and when it opened, the tooltip floated OVER the menu and hid the
                    options. The aria-label covers screen readers.
                */}
                <Select size='small' value={data.autoRefresh} aria-label='Auto refresh'
                        onChange={e => { data.autoRefresh = Number(e.target.value); repintar() }}
                        sx={{ minWidth: 104, height: TOP_BAR_HEIGHT, fontSize: 12, '& .MuiSelect-select': { py: 0.5 } }}>
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

            {/*
                scrollbarGutter 'stable' on the list tabs: the room of the vertical scrollbar is kept whether
                it shows or not. Without it, a filter that left few rows removed the bar, the table grew by its
                width and the columns moved as you typed. Only there: on Home it left the cards off-centre
                (the room on the right only), and Home's rows never come and go.
            */}
            <Box ref={boxRef} aria-label='Tab content' sx={{ display: 'flex', flexDirection: 'column', overflowY: SELF_SCROLLING.has(vista) ? 'hidden' : 'auto', overflowX: 'hidden', scrollbarGutter: FILTERABLE.has(vista) && !SELF_SCROLLING.has(vista) ? 'stable' : 'auto', width: '100%', flexGrow: 1, height: `calc(100vh - ${boxTop}px - 35px)` }}>
                {vista === EStatusTab.HOME && <StatusHomeTab inventory={inventory} series={data.series} autoRefresh={data.autoRefresh} onOpen={setVista} admin={admin} previousLog={data.previousLog} />}
                {vista === EStatusTab.GRAPH && <StatusDiagram inventory={inventory} active={activos} autoRefresh={data.autoRefresh} />}
                {vista === EStatusTab.PROVIDERS && tabla(filasDe(EStatusTab.PROVIDERS), true)}
                {vista === EStatusTab.EXTENSIONS && tabla(filasDe(EStatusTab.EXTENSIONS), false)}
                {vista === EStatusTab.ROUTES && <StatusRoutesTab routes={inventory.routes} filter={filter} />}
                {vista === EStatusTab.DCE && <StatusDceTab dces={inventory.dces} filter={filter} />}
                {vista === EStatusTab.LOG && <StatusCoreLogTab admin={admin} log={data.coreLog} filter={filter} />}
                {vista === EStatusTab.PREVIOUS_LOG && <StatusPreviousLogTab admin={admin} read={data.previousLog} filter={filter} />}
                {vista === EStatusTab.PERFORMANCE && <StatusPerformanceTab inventory={inventory} series={data.series} />}
                {vista === EStatusTab.PLUGINS && <StatusPluginsTab plugins={inventory.plugins} filter={filter} />}
                {vista === EStatusTab.SQL && <StatusSqlTab sql={inventory.sql} filter={filter} />}
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
