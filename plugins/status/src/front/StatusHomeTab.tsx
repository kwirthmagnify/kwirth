import React from 'react'
import { Box, Chip, Paper, Stack, Typography, alpha, useTheme } from '@mui/material'
import { AccountTree, CallSplit, Construction, DataObjectOutlined, Hub, Link, RestartAlt, Science, Speed, Subject } from '@kwirthmagnify/kwirth-common-front/icons'
import { ERouteOwnerKind } from '@kwirthmagnify/kwirth-common'
import { EComponentHealth, EComponentKind, EStatusTab, IStatusInventory } from '../common/StatusTypes'
import { collisions } from './StatusRoutes'
import { IPreviousLogRead, previousSummary } from './StatusLog'
import { IProcessPoint, formatMb, formatUptime } from './StatusPerformance'
import { HEALTH_LABEL, HEALTH_SEQUENCE } from './StatusLabels'
import { IListSummary, summarize } from './StatusHome'
import { readFrontRegistry, summarizeDces } from './StatusDces'
import { summarizePlugins } from './StatusPlugins'

/*
    The Home tab: what the snapshot is, and one box per tab with its figures. Each box is a door: click
    it and that tab opens. Nothing here is computed twice — the boxes read the same snapshot the tabs do.
*/

interface IHomeTabProps {
    inventory: IStatusInventory
    series: IProcessPoint[]
    /** Seconds between automatic snapshots; 0 is manual. Only for saying it. */
    autoRefresh: number
    onOpen: (tab: EStatusTab) => void
    /** Whether the viewer may read the core's log (the 'admin' scope). */
    admin: boolean
    /** The previous container's log, as last read: what the Previous log box reports. */
    previousLog: IPreviousLogRead | undefined
}

interface IHomeBoxProps {
    /** The tab the box opens. Without one the box is not a door: it is shown, but it cannot be pressed. */
    tab?: EStatusTab
    title: string
    icon: React.ReactElement
    /** The box's colour, from the theme so it works in light and dark. */
    color: string
    /** The one figure the box is about. */
    headline: string
    detail: string
    children?: React.ReactNode
    onOpen: (tab: EStatusTab) => void
}

/*
    The same shape as the Performance figures (left border, icon in a circle) so the screen reads as one
    thing. It is a button in all but tag: it can be reached and pressed from the keyboard, and it says
    what it is to a screen reader.
*/
const HomeBox: React.FC<IHomeBoxProps> = ({ tab, title, icon, color, headline, detail, children, onOpen }) => (
    <Paper variant='outlined' aria-label={`${title} summary`}
        {...(tab
            ? {
                role: 'button',
                tabIndex: 0,
                onClick: () => onOpen(tab),
                onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(tab) } }
            }
            : {})}
        sx={{
            px: 1.5, py: 1.25, minWidth: 0, cursor: tab ? 'pointer' : 'default',
            borderLeft: `4px solid ${color}`,
            backgroundColor: alpha(color, 0.08),
            ...(tab ? { '&:hover, &:focus-visible': { backgroundColor: alpha(color, 0.16), outline: 'none' } } : {})
        }}>
        <Stack direction='row' spacing={1.5} alignItems='flex-start'>
            <Box sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                width: 36, height: 36, borderRadius: '50%', color, backgroundColor: alpha(color, 0.16)
            }}>
                {icon}
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant='caption' color='text.secondary' display='block' noWrap>{title}</Typography>
                <Typography variant='subtitle1' sx={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.3, fontWeight: 600 }} noWrap>{headline}</Typography>
                <Typography variant='caption' color='text.secondary' display='block' title={detail}>{detail}</Typography>
                {children && <Stack direction='row' spacing={0.5} useFlexGap flexWrap='wrap' sx={{ mt: 0.75 }}>{children}</Stack>}
            </Box>
        </Stack>
    </Paper>
)

/*
    One chip per state that has somebody in it, in the order the tables sort by: what needs fixing
    first. A state with nobody is not shown — "0 failed" is noise, and the point of the box is to be read
    in one glance.
*/
const healthChips = (list: IListSummary): React.ReactNode =>
    HEALTH_SEQUENCE.filter(h => list.byHealth[h] > 0).map(h => {
        const estado = HEALTH_LABEL[h]
        return <Chip key={h} size='small' label={`${list.byHealth[h]} ${estado.label.toLowerCase()}`} color={estado.color}
            variant={h === EComponentHealth.ACTIVE ? 'outlined' : 'filled'} />
    })

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

export const StatusHomeTab: React.FC<IHomeTabProps> = ({ inventory, series, autoRefresh, onOpen, admin, previousLog }) => {
    const theme = useTheme()
    const s = summarize(inventory)
    const p = inventory.process
    const last = series[series.length - 1]
    const cpu = last?.takenAt === inventory.takenAt ? last.cpuPercent : undefined
    // Undefined when the core does not expose its routes: unknown, not zero.
    const routes = inventory.routes
    const coreRoutes = routes?.filter(r => r.ownerKind === ERouteOwnerKind.CORE).length ?? 0
    const clashes = routes ? collisions(routes).size : 0
    const previous = previousSummary(admin, previousLog)
    // Undefined when the core does not expose its DCEs: unknown, not zero.
    const dce = inventory.dces ? summarizeDces(inventory.dces, readFrontRegistry()) : undefined
    // Undefined when the core does not expose its plugins: unknown, not zero.
    const plugins = inventory.plugins ? summarizePlugins(inventory.plugins) : undefined
    // Undefined when the core does not expose SQL info: unknown, not "no SQL".
    const sql = inventory.sql

    // One colour per box; none of them red, since these are figures and not alarms.
    const color = {
        providers: theme.palette.primary.main,
        graph: theme.palette.secondary.main,
        performance: theme.palette.warning.main,
        plugins: theme.palette.info.main,
        extensions: theme.palette.success.main,
        routes: theme.palette.primary.light,
        log: theme.palette.info.light,
        previousLog: theme.palette.secondary.light,
        dce: theme.palette.success.light,
        sql: theme.palette.warning.light
    }

    return (
        <Stack spacing={2} sx={{ pb: 2, flex: 1, minHeight: 0 }}>
            <Box>
                <Stack direction='row' alignItems='center' spacing={1}>
                    <Typography variant='subtitle2'>What this Kwirth has inside</Typography>
                    <Chip size='small' variant='outlined' label={`${inventory.components.length} components`} />
                </Stack>
                {/* That the snapshot is of one instant is said, not implied. One snapshot is of ALL the tabs. */}
                <Typography variant='caption' color='text.secondary' display='block' sx={{ mt: 0.5 }}>
                    Snapshot taken at {new Date(inventory.takenAt).toLocaleTimeString()}
                    {autoRefresh ? ` — refreshing every ${autoRefresh}s while this tab is open` : ' — it does not refresh on its own'}.
                    {' '}Delivered counts since each component started; the rate is measured against your previous snapshot.
                </Typography>
            </Box>

            {/*
                Three equal columns across the whole width. On narrow screens it drops to two, then one —
                still equal.
            */}
            {/*
                And down: the grid takes the whole height left, and every row gets the same share ('1fr'),
                so every card has the same height — never less than its content needs.
            */}
            <Box sx={{ display: 'grid', gap: 1.5, flex: 1, minHeight: 0, gridAutoRows: '1fr', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' } }}>
                <HomeBox tab={EStatusTab.PROVIDERS} title='Providers' icon={<Hub />} color={color.providers} onOpen={onOpen}
                    headline={plural(s.providers.total, 'producer')}
                    detail={`${plural(s.providers.byKind[EComponentKind.PROVIDER], 'provider')} · ${plural(s.providers.byKind[EComponentKind.PLUVIDER], 'pluvider')}`}>
                    {healthChips(s.providers)}
                </HomeBox>

                <HomeBox tab={EStatusTab.GRAPH} title='Graph' icon={<AccountTree />} color={color.graph} onOpen={onOpen}
                    headline={plural(s.graph.edges, 'subscription')}
                    detail={`${plural(s.graph.producers, 'producer')} · ${plural(s.graph.consumers, 'consumer')}`}>
                    {/* An incomplete graph is said here too, not only once the graph is open. */}
                    {s.graph.unbrokered > 0 &&
                        <Chip size='small' color='warning' label={`${plural(s.graph.unbrokered, 'consumer')} not in the graph`} />}
                </HomeBox>

                <HomeBox tab={EStatusTab.PERFORMANCE} title='Performance' icon={<Speed />} color={color.performance} onOpen={onOpen}
                    headline={p ? `${formatMb(p.rssBytes)} RSS` : '—'}
                    detail={p
                        ? `CPU ${cpu === undefined ? 'needs two snapshots' : `${cpu.toFixed(1)} %`} · up ${formatUptime(p.uptimeSeconds)}`
                        : 'this back end does not report the process yet'} />

                {/*
                    Plugins and extensions in one card. The card opens the Plugins tab (the primary one); the
                    "extensions" chip opens the Extensions tab directly so both entry points are kept. The two
                    tabs remain separate in the strip — this is only the Home summary.
                */}
                <HomeBox tab={EStatusTab.PLUGINS} title='Plugins & extensions' icon={<Construction />} color={color.plugins} onOpen={onOpen}
                    headline={`${plugins ? plural(plugins.total, 'plugin') : '—'} · ${plural(s.extensions.total, 'extension')}`}
                    detail={`${plugins ? `${plural(plugins.instances, 'instance')} open` : 'no plugins yet'} · ${plural(s.extensions.byKind[EComponentKind.SENDER], 'sender')} · ${plural(s.extensions.byKind[EComponentKind.WEBHOOK], 'webhook')}`}>
                    {plugins && plugins.failed > 0 && <Chip size='small' color='error' label={`${plugins.failed} failed`} />}
                    {healthChips(s.extensions)}
                    <Chip size='small' variant='outlined' clickable
                        onClick={(e) => { e.stopPropagation(); onOpen(EStatusTab.EXTENSIONS) }}
                        label={`${plural(s.extensions.total, 'extension')} →`} />
                </HomeBox>

                <HomeBox tab={EStatusTab.ROUTES} title='Routes' icon={<CallSplit />} color={color.routes} onOpen={onOpen}
                    headline={routes ? plural(routes.length, 'route') : '—'}
                    detail={routes
                        ? `${coreRoutes} from the core · ${routes.length - coreRoutes} from extensions`
                        : 'the core does not list its routes yet'}>
                    {/* A collision is an unreachable route: said here too, not only once the tab is open. */}
                    {clashes > 0 && <Chip size='small' color='warning' label={plural(clashes, 'collision')} />}
                </HomeBox>

                {/* The same icon as the log channel ('Subject'): a log reads as a log wherever it is. */}
                <HomeBox tab={EStatusTab.LOG} title='Log' icon={<Subject />} color={color.log} onOpen={onOpen}
                    headline={admin ? 'Core log' : '—'}
                    detail={admin
                        ? 'the container running now, read live when you open the tab'
                        : 'only administrators can read the log of the core'} />

                <HomeBox tab={EStatusTab.PREVIOUS_LOG} title='Previous log' icon={<RestartAlt />} color={color.previousLog} onOpen={onOpen}
                    headline={previous.headline} detail={previous.detail}>
                    {previous.abnormal && <Chip size='small' color='warning' label='abnormal exit' />}
                </HomeBox>

                <HomeBox tab={EStatusTab.DCE} title='DCE' icon={<Science />} color={color.dce} onOpen={onOpen}
                    headline={dce ? plural(dce.total, 'DCE') : '—'}
                    detail={dce
                        ? `${plural(dce.consumers, 'consumer')} · ${dce.unused} unused`
                        : 'the core does not list its DCEs yet'}>
                    {/* A broken DCE fails every consumer that asks for it: said here too. */}
                    {dce && dce.broken > 0 && <Chip size='small' color='error' label={`${dce.broken} broken`} />}
                </HomeBox>

                <HomeBox tab={EStatusTab.SQL} title='SQL' icon={<DataObjectOutlined />} color={color.sql} onOpen={onOpen}
                    headline={sql ? (sql.reachable ? plural(sql.databases.length, 'database') : 'Not reachable') : '—'}
                    detail={sql
                        ? `${sql.client} · ${sql.host}:${sql.port}${sql.ssl ? ' · ssl' : ''}`
                        : 'the core does not expose SQL info yet'}>
                    {sql && !sql.reachable && <Chip size='small' color='error' label='unreachable' />}
                </HomeBox>
            </Box>
        </Stack>
    )
}
