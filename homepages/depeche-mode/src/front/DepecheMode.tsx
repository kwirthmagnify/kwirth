import React, { useState, useEffect, useRef } from 'react'
import dashboardSvg from './dashboard.svg'
import { Box, Button, Card, CardContent, Stack, Tooltip, Typography, useTheme } from '@mui/material'
import { IHomepageProps, IClusterEvent } from '@kwirthmagnify/kwirth-common-front'

const DM_FONT = "'Barlow Condensed', 'Oswald', 'Impact', 'Franklin Gothic Medium', 'Arial Narrow', sans-serif"

const DM_SONGS = ['Photographic','Shame','Somebody','Stripped','Strangelove','Nothing','Pimpf','Halo','Condemnation','Home','Useless','Freestate','Lovetheme','Freelove','Precious','Wrong','Jezebel','Heaven','Broken','Scum']
const DM_SONGS_SHUFFLED = [...DM_SONGS].sort(() => Math.random() - 0.5)

const POLL_MS      = 10000
const EVENTS_LIMIT = 25
const HISTORY_MAX  = 20
const CHART_ROWS   = 6

type DMColors = { bg: string; card: string; blood: string; bone: string; muted: string; taupe: string; dim: string }

const getDMColors = (mode: 'light' | 'dark'): DMColors =>
    mode === 'dark'
        ? { bg: '#0A0808', card: '#130C0C', blood: '#C4303A', bone: '#EDE0D0', muted: '#4A3030', taupe: '#9C8B7C', dim: '#2A1616' }
        : { bg: '#F0E8DC', card: '#FBF5ED', blood: '#8B1520', bone: '#1A0808', muted: '#A08070', taupe: '#7A6855', dim: '#D0B8A8' }

const BG_PATTERN_DARK  = `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg opacity='0.04' stroke='%23c4303a' stroke-width='0.8'%3E%3Cline x1='0' y1='0' x2='40' y2='40'/%3E%3Cline x1='40' y1='0' x2='0' y2='40'/%3E%3C/g%3E%3C/svg%3E")`
const BG_PATTERN_LIGHT = `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg opacity='0.07' stroke='%238b1520' stroke-width='0.8'%3E%3Cline x1='0' y1='0' x2='40' y2='40'/%3E%3Cline x1='40' y1='0' x2='0' y2='40'/%3E%3C/g%3E%3C/svg%3E")`

function buildAsciiChart(history: number[]): string {
    const data = (history.length < HISTORY_MAX
        ? Array(HISTORY_MAX - history.length).fill(null).concat(history)
        : history.slice(-HISTORY_MAX)) as (number | null)[]

    const grid: string[][] = Array.from({ length: CHART_ROWS }, () => Array(HISTORY_MAX).fill(' '))
    data.forEach((v, col) => {
        if (v == null) return
        const row = Math.max(0, Math.min(CHART_ROWS - 1, Math.round((1 - v / 100) * (CHART_ROWS - 1))))
        grid[row][col] = '+'
    })

    const lines = grid.map(row => '|' + row.join(''))
    lines.push('+' + '-'.repeat(HISTORY_MAX))
    return lines.join('\n')
}

// ── ASCII chart for a single metric ──────────────────────────────────────────
const AsciiChart: React.FC<{ label: string; history: number[]; c: DMColors }> = ({ label, history, c }) => {
    const current = history.length > 0 ? history[history.length - 1] : 0
    const color   = current > 90 ? '#FF4444' : c.blood
    return (
        <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ mb: 0.25 }}>
                <Typography sx={{ fontFamily: DM_FONT, fontSize: '0.6rem', fontWeight: 700, color: c.muted, letterSpacing: 2, textTransform: 'uppercase' }}>
                    {label} <Box component="span" sx={{ color, letterSpacing: 0 }}>({Math.round(current)}%)</Box>
                </Typography>
            </Box>
            <Box component="pre" sx={{ m: 0, fontFamily: 'monospace', fontSize: '0.65rem', lineHeight: 1.25, color, whiteSpace: 'pre', overflow: 'hidden' }}>
                {buildAsciiChart(history)}
            </Box>
        </Box>
    )
}

// ── Blood diamond connectivity indicator ──────────────────────────────────────
const BloodDiamond: React.FC<{ online: boolean; delay?: string; c: DMColors }> = ({ online, delay = '0s', c }) => (
    <Tooltip title={online ? 'Online' : 'Offline'}>
        <Box sx={{
            width: 8, height: 8, flexShrink: 0,
            bgcolor: online ? c.blood : c.muted,
            transform: 'rotate(45deg)',
            boxShadow: online ? `0 0 8px 2px rgba(196,48,58,0.5)` : 'none',
            transition: 'all 0.3s',
            animation: 'none',
            cursor: 'default',
        }} />
    </Tooltip>
)

// ── Main component ─────────────────────────────────────────────────────────────
export const DepecheMode: React.FC<IHomepageProps> = (props) => {
    const theme = useTheme()
    const c = getDMColors(theme.palette.mode)
    const bgPattern = theme.palette.mode === 'dark' ? BG_PATTERN_DARK : BG_PATTERN_LIGHT

    useEffect(() => {
        const fontId = 'dm-barlow-font'
        if (!document.getElementById(fontId)) {
            const link = document.createElement('link')
            link.id = fontId; link.rel = 'stylesheet'
            link.href = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;900&display=swap'
            document.head.appendChild(link)
        }
        const kfId = 'dm-keyframes'
        if (!document.getElementById(kfId)) {
            const style = document.createElement('style')
            style.id = kfId
            style.textContent = `@keyframes dm-pulse {
                0%, 100% { opacity: 0.2; box-shadow: none; }
                50% { opacity: 1; box-shadow: 0 0 10px 3px rgba(196,48,58,0.55); }
            }`
            document.head.appendChild(style)
        }
        return () => { document.getElementById('dm-keyframes')?.remove() }
    }, [])

    const containerRef = useRef<HTMLDivElement>(null)
    const [containerHeight, setContainerHeight] = useState(0)
    useEffect(() => {
        const obs = new ResizeObserver(() => {
            requestAnimationFrame(() => {
                if (!containerRef.current) return
                const { top } = containerRef.current.getBoundingClientRect()
                setContainerHeight(window.innerHeight - top)
            })
        })
        obs.observe(document.body)
        return () => obs.disconnect()
    }, [])

    const [clusterMetrics, setClusterMetrics] = useState<Record<string, { cpu: number; memory: number; vcpus: number; totalMemoryBytes: number; pods: number; maxPods: number }>>({})
    const [metricsHistory, setMetricsHistory] = useState<Record<string, { cpu: number[]; mem: number[] }>>({})
    useEffect(() => {
        if (!props.getClusterMetrics) return
        const fetchAll = () => props.clusters.forEach(cl =>
            props.getClusterMetrics!(cl.name).then(m => {
                if (m) {
                    setClusterMetrics(p => ({ ...p, [cl.name]: m }))
                    setMetricsHistory(p => {
                        const prev = p[cl.name] ?? { cpu: [], mem: [] }
                        return {
                            ...p,
                            [cl.name]: {
                                cpu: [...prev.cpu, m.cpu].slice(-HISTORY_MAX),
                                mem: [...prev.mem, m.memory].slice(-HISTORY_MAX),
                            }
                        }
                    })
                }
            })
        )
        fetchAll()
        const t = setInterval(fetchAll, POLL_MS)
        return () => clearInterval(t)
    }, [props.clusters, props.getClusterMetrics])

    const [clusterEvents, setClusterEvents] = useState<Record<string, IClusterEvent[]>>({})
    useEffect(() => {
        if (!props.getClusterEvents) return
        const fetchAll = () => props.clusters.forEach(cl =>
            props.getClusterEvents!(cl.name, EVENTS_LIMIT).then(evts => setClusterEvents(p => ({ ...p, [cl.name]: evts })))
        )
        fetchAll()
        const t = setInterval(fetchAll, POLL_MS)
        return () => clearInterval(t)
    }, [props.clusters, props.getClusterEvents])

    const launchMagnify = (name: string) => props.onHomepageSelectTab({
        name, description: '', channel: 'magnify',
        channelObject: { clusterName: name, view: 'cluster' as any, namespace: '', group: '', pod: '', container: '' }
    })

    const hasMagnify   = props.frontChannels.has('magnify')
    const magnifyClass = props.frontChannels.get('magnify')
    const magnifyIcon  = magnifyClass ? new magnifyClass().getChannelIcon() : null

    const cardHeight = containerHeight > 0 ? Math.floor((containerHeight - 64 - 24 * 2 - 24) / 3) - 4 : 200

    const dmBtnSx = {
        borderRadius: 0,
        fontFamily: DM_FONT,
        fontWeight: 900,
        fontSize: '0.7rem',
        letterSpacing: 3,
        textTransform: 'uppercase' as const,
        borderWidth: 2,
        borderColor: c.muted,
        color: c.muted,
        '&:not(.Mui-disabled)': { borderColor: c.blood, color: c.bone },
        '&:not(.Mui-disabled):hover': {
            borderWidth: 2,
            borderColor: c.blood,
            color: c.blood,
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(196,48,58,0.08)' : 'rgba(139,21,32,0.08)',
            boxShadow: theme.palette.mode === 'dark' ? `0 0 12px rgba(196,48,58,0.35)` : `0 0 12px rgba(139,21,32,0.25)`,
        },
    }

    return (
        <Box ref={containerRef} sx={{
            position: 'relative', width: '100%', height: `${containerHeight}px`,
            overflow: 'hidden', bgcolor: c.bg,
            backgroundImage: bgPattern, backgroundSize: '40px 40px',
        }}>
            <Box sx={{ position: 'absolute', inset: 0, overflowY: 'auto' }}>

                {/* ── Header ── */}
                <Stack direction="row" alignItems="center"
                    sx={{ px: 3, py: 1.5, borderBottom: `3px solid ${c.blood}`, bgcolor: c.bg }}>
                    <img src={dashboardSvg} alt="DASHBOARD" style={{ height: 25, display: 'block' }} />
                </Stack>

                {/* ── Cluster grid ── */}
                <Box sx={{ p: 3, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
                    {props.clusters.map((cluster, idx) => {
                        const metrics = clusterMetrics[cluster.name]
                        const clusterChannelIds = new Set((cluster.kwirthData?.channels ?? []).map((ch: any) => ch.id))
                        const clusterHasMagnify = hasMagnify && clusterChannelIds.has('magnify')

                        return (
                            <Card key={cluster.name} sx={{
                                bgcolor: c.card, borderRadius: 0,
                                border: `1px solid ${c.dim}`,
                                borderLeft: `4px solid ${c.blood}`,
                                height: cardHeight, overflow: 'hidden',
                                backgroundImage: 'none',
                            }}>
                                <CardContent sx={{ height: '100%', p: '14px !important' }}>
                                    <Stack direction="column" justifyContent="space-between" sx={{ height: '100%' }}>

                                        {/* Name + indicator */}
                                        <Stack direction="column" spacing={0.5}>
                                            <Stack direction="row" alignItems="center" spacing={1}>
                                                <Typography sx={{
                                                    fontFamily: DM_FONT, fontWeight: 900, fontSize: '1.1rem',
                                                    letterSpacing: 4, textTransform: 'uppercase', color: c.bone,
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                                                }}>{cluster.name}</Typography>
                                            </Stack>
                                            <Typography sx={{
                                                fontFamily: DM_FONT, fontSize: '0.72rem', color: c.taupe,
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                letterSpacing: 0.5,
                                            }}>{cluster.url}</Typography>
                                        </Stack>

                                        {/* Metric charts + STRANGELOVE on same row */}
                                        <Stack direction="row" spacing={1} alignItems="flex-end">
                                            {metrics ? (
                                                <Stack direction="row" spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
                                                    <AsciiChart label="CPU" history={metricsHistory[cluster.name]?.cpu ?? [metrics.cpu]} c={c} />
                                                    <AsciiChart label="MEM" history={metricsHistory[cluster.name]?.mem ?? [metrics.memory]} c={c} />
                                                </Stack>
                                            ) : (
                                                <Typography sx={{
                                                    flex: 1, fontFamily: DM_FONT, fontSize: '0.65rem', color: c.muted,
                                                    letterSpacing: 3, textTransform: 'uppercase',
                                                }}>— no data —</Typography>
                                            )}
                                            <Button variant="outlined" size="small"
                                                disabled={!clusterHasMagnify}
                                                startIcon={magnifyIcon}
                                                onClick={() => launchMagnify(cluster.name)}
                                                sx={{ ...dmBtnSx, flexShrink: 0 }}>
                                                {DM_SONGS_SHUFFLED[idx % DM_SONGS_SHUFFLED.length].toUpperCase()}
                                            </Button>
                                        </Stack>

                                    </Stack>
                                </CardContent>
                            </Card>
                        )
                    })}

                    {props.clusters.length === 0 && (
                        <Typography sx={{
                            fontFamily: DM_FONT, fontSize: '1rem', fontWeight: 700,
                            color: c.blood, letterSpacing: 6, textTransform: 'uppercase',
                            p: 2, opacity: 0.5,
                        }}>
                            — No clusters connected —
                        </Typography>
                    )}
                </Box>
            </Box>
        </Box>
    )
}
