import React from 'react'
import { Box, Paper, Stack, Typography, alpha, useTheme } from '@mui/material'
import { Analytics, Bolt, Memory, Schedule, Speed } from '@kwirthmagnify/kwirth-common-front/icons'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { IStatusInventory } from '../common/StatusTypes'
import { IProcessPoint, formatMb, formatUptime } from './StatusPerformance'

/*
    The Performance tab: the Kwirth process as it is now, and what it did while you were watching.

    Figures for the moment on top; below them, one small chart per question (memory, CPU, event loop),
    drawn from the session series. Nothing here is stored: close the channel and the series is gone.
*/

interface IPerformanceTabProps {
    inventory: IStatusInventory
    series: IProcessPoint[]
}

interface IFigureProps {
    label: string
    value: string
    hint?: string
    icon: React.ReactElement
    /** The figure's colour; its chart line uses the same one, so box and line read as one thing. */
    color: string
}

/*
    Taller than their content alone (~78px: two captions, the value and the padding), at the user's
    request: first 30% (102px), then 25% more on top of that (128px). A minimum and not a height, so a
    hint that wraps is never clipped; the content is centred so the extra room splits above and below.
*/
const FIGURE_MIN_HEIGHT = 128

const Figure: React.FC<IFigureProps> = ({ label, value, hint, icon, color }) => (
    <Paper variant='outlined' aria-label={`${label} figure`} sx={{
        px: 1.5, py: 1, minWidth: 0, minHeight: FIGURE_MIN_HEIGHT, display: 'flex', alignItems: 'center',
        borderLeft: `4px solid ${color}`,
        backgroundColor: alpha(color, 0.08)
    }}>
        <Stack direction='row' spacing={1.5} alignItems='center'>
            <Box sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                width: 36, height: 36, borderRadius: '50%', color, backgroundColor: alpha(color, 0.16)
            }}>
                {icon}
            </Box>
            <Box sx={{ minWidth: 0 }}>
                <Typography variant='caption' color='text.secondary' display='block' noWrap>{label}</Typography>
                <Typography variant='subtitle1' sx={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.3, fontWeight: 600 }} noWrap>{value}</Typography>
                {hint && <Typography variant='caption' color='text.secondary' display='block' noWrap title={hint}>{hint}</Typography>}
            </Box>
        </Stack>
    </Paper>
)

interface ISeriesLine {
    key: keyof IProcessPoint
    name: string
    color: string
}

interface IChartProps {
    title: string
    unit: string
    series: IProcessPoint[]
    lines: ISeriesLine[]
}

const time = (t: number): string => new Date(t).toLocaleTimeString()

const SessionChart: React.FC<IChartProps> = ({ title, unit, series, lines }) => {
    const theme = useTheme()
    // A line needs two points of ITS OWN: CPU and the event loop start one snapshot late.
    const drawable = lines.some(l => series.filter(p => p[l.key] !== undefined).length >= 2)
    return (
        <Paper variant='outlined' sx={{ p: 1.5, flex: 1, minWidth: 280 }}>
            <Typography variant='subtitle2' sx={{ mb: 1 }}>{title}</Typography>
            {!drawable
                ? <Typography variant='body2' color='text.secondary' sx={{ py: 5, textAlign: 'center' }}>
                    A line needs two snapshots. Take another one, or turn auto-refresh on.
                </Typography>
                : <Box sx={{ height: 150 }}>
                    <ResponsiveContainer width='100%' height='100%'>
                        <LineChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray='3 3' stroke={theme.palette.divider} />
                            <XAxis dataKey='takenAt' tickFormatter={time} tick={{ fontSize: 10, fill: theme.palette.text.secondary }} minTickGap={40} />
                            <YAxis tick={{ fontSize: 10, fill: theme.palette.text.secondary }} width={44} unit={unit} />
                            <Tooltip labelFormatter={(t: number) => time(t)}
                                formatter={(v: number) => `${v.toFixed(1)} ${unit}`}
                                contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, fontSize: 12 }} />
                            {lines.map(l =>
                                <Line key={l.key} type='monotone' dataKey={l.key} name={l.name} stroke={l.color} dot={false} isAnimationActive={false} connectNulls={false} />)}
                        </LineChart>
                    </ResponsiveContainer>
                </Box>}
        </Paper>
    )
}

const mb = formatMb

export const StatusPerformanceTab: React.FC<IPerformanceTabProps> = ({ inventory, series }) => {
    const theme = useTheme()
    const p = inventory.process
    if (!p) {
        return (
            <Typography variant='body2' color='text.secondary' sx={{ p: 4, textAlign: 'center' }}>
                This Kwirth's Status back end does not report the process yet. Update the Status plugin.
            </Typography>
        )
    }
    const last = series[series.length - 1]
    const cpu = last?.takenAt === inventory.takenAt ? last.cpuPercent : undefined
    /*
        One colour per figure, from the theme so it works in light and dark, and the same one on its chart
        line. None of them is red: these are measurements, not alarms — colouring a normal figure red
        would read as a fault.
    */
    const color = {
        rss: theme.palette.primary.main,
        heap: theme.palette.secondary.main,
        cpu: theme.palette.warning.main,
        loop: theme.palette.info.main,
        uptime: theme.palette.success.main
    }
    return (
        <Stack spacing={2} sx={{ pb: 2 }}>
            {/*
                Equal columns across the whole width: a grid and not a wrapping row, so every box has the
                same size whatever its text. On narrow screens it drops to fewer, still equal, columns.
            */}
            <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))' } }}>
                <Figure label='Memory (RSS)' value={mb(p.rssBytes)} hint='what the OS has given the process'
                    icon={<Memory />} color={color.rss} />
                <Figure label='JS heap' value={`${mb(p.heapUsedBytes)} / ${mb(p.heapTotalBytes)}`} hint='used / reserved'
                    icon={<Analytics />} color={color.heap} />
                <Figure label='CPU' value={cpu === undefined ? '—' : `${cpu.toFixed(1)} %`}
                    hint={cpu === undefined ? 'needs two snapshots' : 'of one core, since the last snapshot'}
                    icon={<Bolt />} color={color.cpu} />
                <Figure label='Event loop delay (p99)' value={p.eventLoop ? `${p.eventLoop.p99Ms.toFixed(1)} ms` : '—'}
                    hint={p.eventLoop ? `mean ${p.eventLoop.meanMs.toFixed(1)} · max ${p.eventLoop.maxMs.toFixed(1)} ms` : 'measuring since you opened the tab'}
                    icon={<Speed />} color={color.loop} />
                <Figure label='Uptime' value={formatUptime(p.uptimeSeconds)} hint={`pid ${p.pid} · Node ${p.nodeVersion}`}
                    icon={<Schedule />} color={color.uptime} />
            </Box>

            <Stack direction='row' spacing={2} useFlexGap flexWrap='wrap'>
                <SessionChart title='Memory' unit='MB' series={series} lines={[
                    { key: 'rssMb', name: 'RSS', color: color.rss },
                    { key: 'heapUsedMb', name: 'Heap used', color: color.heap }
                ]} />
                <SessionChart title='CPU' unit='%' series={series} lines={[
                    { key: 'cpuPercent', name: 'CPU', color: color.cpu }
                ]} />
                <SessionChart title='Event loop delay' unit='ms' series={series} lines={[
                    { key: 'loopP99Ms', name: 'p99', color: color.loop },
                    // The mean, fainter: same colour as its box, so it still reads as the event loop.
                    { key: 'loopMeanMs', name: 'mean', color: alpha(color.loop, 0.5) }
                ]} />
            </Stack>

            {/* Said, not implied: this is a session view and it is not kept anywhere. */}
            <Typography variant='caption' color='text.secondary'>
                {series.length} snapshot{series.length === 1 ? '' : 's'} since this channel started, kept only in this browser
                and thrown away when you stop it. This is the Kwirth process only — every extension runs inside it, so
                nothing here can be attributed to one of them.
            </Typography>
        </Stack>
    )
}
