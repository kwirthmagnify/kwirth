import React, { useState, useEffect, useRef } from 'react'
import { Box, Button, Card, CardContent, Stack, Tooltip, Typography, useTheme } from '@mui/material'
import { AccountTree } from '@mui/icons-material'
import { IHomepageProps, IClusterEvent } from '@kwirthmagnify/kwirth-common-front'

const AV_GOLD      = '#c9a227'
const AV_GOLD_DIM  = '#5c4810'
const AV_GOLD_GLOW = 'rgba(201,162,39,0.45)'
const AV_FONT      = "'Oswald', 'Barlow Condensed', 'Arial Narrow', sans-serif"

const useAviciiColors = () => {
    const theme = useTheme()
    const dark = theme.palette.mode === 'dark'
    return {
        AV_BG:    dark ? '#050505' : '#faf7f0',
        AV_CARD:  dark ? '#0b0907' : '#f0ebe1',
        AV_TEXT:  dark ? '#f0ede6' : '#1a1510',
        AV_MUTED: dark ? '#4a443c' : '#8a7a68',
    }
}

const POLL_MS      = 10000
const EVENTS_LIMIT = 25

const _LP = `%3Cg transform='translate(0,30) scale(0.1,-0.1)' fill='%23c9a227' stroke='none'%3E%3Cpath d='M132 167 l-132 -132 0 -18 0 -17 17 0 18 0 112 112 113 113 0 -113 0 -112 25 0 25 0 0 150 0 150 -23 0 -22 0 -133 -133z'/%3E%3Cpath d='M360 150 l0 -150 38 0 37 0 113 113 112 112 0 35 0 35 -125 -125 -125 -125 0 128 0 127 -25 0 -25 0 0 -150z'/%3E%3Cpath d='M710 150 l0 -150 25 0 25 0 0 150 0 150 -25 0 -25 0 0 -150z'/%3E%3Cpath d='M1150 150 l0 -150 25 0 25 0 0 150 0 150 -25 0 -25 0 0 -150z'/%3E%3Cpath d='M1250 150 l0 -150 25 0 25 0 0 150 0 150 -25 0 -25 0 0 -150z'/%3E%3C/g%3E%3Cpath d='M106.64,17.40 A12.0,12.0 0 1 1 106.88,12.83' fill='none' stroke='%23c9a227' stroke-width='5' stroke-linecap='butt'/%3E`
const _LG = (x: number, y: number) => `%3Cg transform='translate(${x},${y})' opacity='0.045'%3E${_LP}%3C/g%3E`
const TRIANGLE_BG = `url("data:image/svg+xml,%3Csvg width='320' height='200' viewBox='0 0 320 200' xmlns='http://www.w3.org/2000/svg'%3E${_LG(20,18)}${_LG(185,95)}${_LG(80,158)}${_LG(265,48)}%3C/svg%3E")`

// ── Logo: Avicii two-triangle mark ───────────────────────────────────────────
const AviciiLogo: React.FC<{ size?: number }> = ({ size = 48 }) => {
    const { AV_TEXT } = useAviciiColors()
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 37 18" fill={AV_TEXT}
            width={size} height={Math.round(size * 18 / 37)}>
            <polygon points="17,0 17,18 0,18"/>
            <polygon points="19,0 37,0 19,18"/>
        </svg>
    )
}

// ── Wordmark: dashboard SVG logotype ─────────────────────────────────────────
const AviciiWordmark: React.FC = () => {
    const { AV_TEXT } = useAviciiColors()
    return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 308.0 30"
        height="19" style={{ display: 'block' }}>
        <g fill={AV_TEXT} stroke="none">
            <g transform="translate(37.0,30) scale(0.1,-0.1)"><path d="M132 167 l-132 -132 0 -18 0 -17 17 0 18 0 112 112 113 113 0 -113 0 -112 25 0 25 0 0 150 0 150 -23 0 -22 0 -133 -133z"/></g>
            <g transform="translate(206.0,30) scale(0.1,-0.1)"><path d="M132 167 l-132 -132 0 -18 0 -17 17 0 18 0 112 112 113 113 0 -113 0 -112 25 0 25 0 0 150 0 150 -23 0 -22 0 -133 -133z"/></g>
        </g>
        <path d="M 5.5 27.5 L 5.5 2.5 L 20.5 2.5 A 11 12.5 0 0 1 20.5 27.5 L 5.5 27.5" fill="none" stroke={AV_TEXT} strokeWidth="5" strokeLinecap="butt" strokeLinejoin="miter"/>
        <path d="M 99.5 2.5 L 79.75 2.5 A 6.25 6.25 0 0 0 79.75 15 L 93.25 15 A 6.25 6.25 0 0 1 93.25 27.5 L 73.5 27.5" fill="none" stroke={AV_TEXT} strokeWidth="5" strokeLinecap="butt" strokeLinejoin="miter"/>
        <path d="M 107.5 0 L 107.5 30 M 133.5 0 L 133.5 30 M 107.5 15.0 L 133.5 15.0" fill="none" stroke={AV_TEXT} strokeWidth="5" strokeLinecap="butt" strokeLinejoin="miter"/>
        <path d="M 141.5 0 L 141.5 30 M 141.5 2.5 L 161.5 2.5 A 6 6.25 0 0 1 161.5 15.0 L 141.5 15.0 M 141.5 15.0 L 160.0 15.0 A 7.5 6.25 0 0 1 160.0 27.5 L 141.5 27.5" fill="none" stroke={AV_TEXT} strokeWidth="5" strokeLinecap="butt" strokeLinejoin="miter"/>
        <path d="M 188.0 2.5 A 12.5 12.5 0 0 1 188.0 27.5 A 12.5 12.5 0 0 1 188.0 2.5" fill="none" stroke={AV_TEXT} strokeWidth="5" strokeLinecap="butt" strokeLinejoin="miter"/>
        <path d="M 242.5 30 L 242.5 2.5 L 259.5 2.5 A 9 6.25 0 0 1 259.5 15.0 L 242.5 15.0" fill="none" stroke={AV_TEXT} strokeWidth="5" strokeLinecap="butt" strokeLinejoin="miter"/>
        <path d="M 251.42 16.94 L 254.58 13.06 L 271.00 26.45 L 271.00 30.00 L 267.44 30.00 Z" fill={AV_TEXT} stroke="none"/>
        <path d="M 276.5 27.5 L 276.5 2.5 L 291.5 2.5 A 11 12.5 0 0 1 291.5 27.5 L 276.5 27.5" fill="none" stroke={AV_TEXT} strokeWidth="5" strokeLinecap="butt" strokeLinejoin="miter"/>
    </svg>
    )
}

// ── Gold diamond connectivity indicator ──────────────────────────────────────
const DiamondIndicator: React.FC<{ online: boolean; delay?: string }> = ({ online, delay = '0s' }) => {
    const { AV_MUTED } = useAviciiColors()
    return (
        <Tooltip title={online ? 'Online' : 'Offline'}>
            <Box sx={{
                width: 10, height: 10, flexShrink: 0,
                bgcolor: online ? AV_GOLD : AV_MUTED,
                transform: 'rotate(45deg)',
                boxShadow: online ? `0 0 8px 2px ${AV_GOLD_GLOW}` : 'none',
                transition: 'all 0.3s',
                animation: online ? 'avicii-pulse 2.8s ease-in-out infinite' : 'none',
                animationDelay: delay,
                cursor: 'default',
            }} />
        </Tooltip>
    )
}

// ── Metric bar using rhombus fill characters ──────────────────────────────────
const MetricBar: React.FC<{ label: string; value: number }> = ({ label, value }) => {
    const { AV_MUTED } = useAviciiColors()
    const barRef = useRef<HTMLSpanElement>(null)
    const [cols, setCols] = useState(20)
    useEffect(() => {
        if (!barRef.current) return
        const obs = new ResizeObserver(() => {
            if (barRef.current) setCols(Math.max(5, Math.floor(barRef.current.offsetWidth / 8) - 1))
        })
        obs.observe(barRef.current)
        return () => obs.disconnect()
    }, [])
    const filled = Math.round(value * cols / 100)
    const bar    = '▰'.repeat(filled) + '▱'.repeat(cols - filled)
    const color  = value > 90 ? '#e84040' : AV_GOLD
    return (
        <Box sx={{ display: 'grid', gridTemplateColumns: '30px 1fr 36px', alignItems: 'center', paddingRight: '8px' }}>
            <Typography sx={{ fontFamily: AV_FONT, fontSize: '0.62rem', fontWeight: 600, color: AV_MUTED, letterSpacing: '1px', textTransform: 'uppercase' }}>{label}</Typography>
            <Typography ref={barRef} sx={{ fontFamily: 'monospace', fontSize: '0.62rem', color, overflow: 'hidden', whiteSpace: 'nowrap' }}>{bar}</Typography>
            <Typography sx={{ fontFamily: AV_FONT, fontSize: '0.62rem', fontWeight: 600, color, pl: 0.5, textAlign: 'right' }}>{Math.round(value)}%</Typography>
        </Box>
    )
}

// ── Mini stat card with gold top-border ───────────────────────────────────────
const MiniCard: React.FC<{ label: string; value: string }> = ({ label, value }) => {
    const { AV_TEXT, AV_MUTED } = useAviciiColors()
    return (
        <Box sx={{
            border: `1px solid ${AV_GOLD_DIM}`, borderTop: `2px solid ${AV_GOLD}`,
            px: 1.5, py: 0.75, minWidth: 70,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
            <Typography sx={{ fontFamily: AV_FONT, fontSize: '1rem', fontWeight: 700, color: AV_TEXT, lineHeight: 1.2 }}>{value}</Typography>
            <Typography sx={{ fontFamily: AV_FONT, fontSize: '0.58rem', fontWeight: 600, color: AV_MUTED, letterSpacing: '1.5px', textTransform: 'uppercase', lineHeight: 1.3 }}>{label}</Typography>
        </Box>
    )
}

// ── Main component ─────────────────────────────────────────────────────────────
export const Avicii: React.FC<IHomepageProps> = (props) => {
    const { AV_BG, AV_CARD, AV_TEXT, AV_MUTED } = useAviciiColors()

    useEffect(() => {
        const fontId = 'avicii-oswald-font'
        if (!document.getElementById(fontId)) {
            const link = document.createElement('link')
            link.id = fontId; link.rel = 'stylesheet'
            link.href = 'https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&display=swap'
            document.head.appendChild(link)
        }
        const kfId = 'avicii-keyframes'
        if (!document.getElementById(kfId)) {
            const style = document.createElement('style')
            style.id = kfId
            style.textContent = `@keyframes avicii-pulse {
                0%, 100% { opacity: 0.25; box-shadow: none; }
                50% { opacity: 1; box-shadow: 0 0 10px 3px rgba(201,162,39,0.5); }
            }`
            document.head.appendChild(style)
        }
        return () => { document.getElementById('avicii-keyframes')?.remove() }
    }, [])

    const containerRef = useRef<HTMLDivElement>(null)
    const [containerHeight, setContainerHeight] = useState(0)
    useEffect(() => {
        const obs = new ResizeObserver(() => {
            if (!containerRef.current) return
            const { top } = containerRef.current.getBoundingClientRect()
            setContainerHeight(window.innerHeight - top)
        })
        obs.observe(document.body)
        return () => obs.disconnect()
    }, [containerRef.current])

    const [clusterMetrics, setClusterMetrics] = useState<Record<string, { cpu: number; memory: number; vcpus: number; totalMemoryBytes: number; pods: number; maxPods: number }>>({})
    useEffect(() => {
        if (!props.getClusterMetrics) return
        const fetchAll = () => props.clusters.forEach(c =>
            props.getClusterMetrics!(c.name).then(m => { if (m) setClusterMetrics(p => ({ ...p, [c.name]: m })) })
        )
        fetchAll()
        const t = setInterval(fetchAll, POLL_MS)
        return () => clearInterval(t)
    }, [props.clusters, props.getClusterMetrics])

    const [clusterEvents, setClusterEvents] = useState<Record<string, IClusterEvent[]>>({})
    useEffect(() => {
        if (!props.getClusterEvents) return
        const fetchAll = () => props.clusters.forEach(c =>
            props.getClusterEvents!(c.name, EVENTS_LIMIT).then(evts => setClusterEvents(p => ({ ...p, [c.name]: evts })))
        )
        fetchAll()
        const t = setInterval(fetchAll, POLL_MS)
        return () => clearInterval(t)
    }, [props.clusters, props.getClusterEvents])

    const launchMagnify  = (name: string) => props.onHomepageSelectTab({ name, description: '', channel: 'magnify',  channelObject: { clusterName: name, view: 'cluster' as any, namespace: '', group: '', pod: '', container: '' } })
    const launchTopology = (name: string) => props.onHomepageSelectTab({ name, description: '', channel: 'topology', channelObject: { clusterName: name, view: 'cluster' as any, namespace: '', group: '', pod: '', container: '' } })

    const hasMagnify    = props.frontChannels.has('magnify')
    const hasTopology   = props.frontChannels.has('topology')
    const magnifyClass  = props.frontChannels.get('magnify')
    const magnifyIcon   = magnifyClass ? new magnifyClass().getChannelIcon() : null
    const topologyClass = props.frontChannels.get('topology')
    const topologyIcon  = topologyClass ? new topologyClass().getChannelIcon() : <AccountTree />

    const showMetricBars    = props.config?.showMetricBars    ?? true
    const showResourceCards = props.config?.showResourceCards ?? true
    const showChannelIcons  = props.config?.showChannelIcons  ?? true

    const avBtnSx = {
        borderRadius: 0,
        fontFamily: AV_FONT, fontWeight: 700,
        fontSize: '0.65rem', letterSpacing: '2px',
        textTransform: 'uppercase' as const,
        borderColor: AV_GOLD_DIM, color: AV_MUTED,
        '&:not(.Mui-disabled)': { borderColor: AV_GOLD_DIM, color: AV_TEXT },
        '&:not(.Mui-disabled):hover': {
            borderColor: AV_GOLD, color: AV_GOLD,
            bgcolor: 'rgba(201,162,39,0.06)',
            boxShadow: `0 0 10px ${AV_GOLD_GLOW}`,
        },
    }

    return (
        <Box ref={containerRef} sx={{
            position: 'relative', width: '100%', height: `${containerHeight}px`,
            overflow: 'hidden', bgcolor: AV_BG,
            backgroundImage: TRIANGLE_BG, backgroundSize: '320px 200px',
        }}>
            <Box sx={{ position: 'absolute', inset: 0, overflowY: 'auto' }}>

                {/* ── Header ── */}
                <Stack direction="row" alignItems="center" justifyContent="flex-start" spacing={2.5}
                    sx={{ pt: 2, pb: 1.5, pl: 3, borderBottom: `1px solid ${AV_GOLD_DIM}`, bgcolor: AV_BG }}>
                    <AviciiLogo size={40} />
                    <AviciiWordmark />
                </Stack>

                {/* ── Cluster grid: 3 columns ── */}
                <Box sx={{ p: 3, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
                    {props.clusters.map((cluster, idx) => {
                        const metrics = clusterMetrics[cluster.name]
                        const clusterChannelIds = new Set((cluster.kwirthData?.channels ?? []).map((ch: any) => ch.id))
                        const clusterHasMagnify  = hasMagnify  && clusterChannelIds.has('magnify')
                        const clusterHasTopology = hasTopology && clusterChannelIds.has('topology')

                        return (
                            <Card key={cluster.name} sx={{
                                bgcolor: AV_CARD, borderRadius: 0,
                                border: `1px solid ${AV_GOLD_DIM}`,
                                borderTop: `2px solid ${AV_GOLD}`,
                                backgroundImage: 'none',
                                position: 'relative',
                                '&::after': {
                                    content: '""', position: 'absolute', top: 0, right: 0,
                                    width: 0, height: 0, borderStyle: 'solid',
                                    borderWidth: '0 22px 22px 0',
                                    borderColor: `transparent ${AV_GOLD} transparent transparent`,
                                },
                            }}>
                                <CardContent sx={{ p: '12px !important' }}>
                                    <Stack direction="column" spacing={1.25}>

                                        {/* Name + URL */}
                                        <Stack direction="column" spacing={0.5}>
                                            <Stack direction="row" alignItems="center" spacing={1}>
                                                <Typography sx={{
                                                    fontFamily: AV_FONT, fontWeight: 700, fontSize: '0.9rem',
                                                    letterSpacing: '3px', textTransform: 'uppercase', color: AV_TEXT,
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                                                }}>{cluster.name}</Typography>
                                                <DiamondIndicator online={!!metrics} delay={`${(idx * 0.7) % 2.5}s`} />
                                            </Stack>
                                            <Typography sx={{
                                                fontFamily: AV_FONT, fontSize: '0.7rem', color: AV_MUTED,
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            }}>{cluster.url}</Typography>
                                        </Stack>

                                        {/* Metric bars */}
                                        {metrics && showMetricBars && (
                                            <Stack direction="column" spacing={0.25}>
                                                <MetricBar label="CPU" value={metrics.cpu} />
                                                <MetricBar label="MEM" value={metrics.memory} />
                                                <MetricBar label="POD" value={metrics.maxPods > 0 ? (metrics.pods / metrics.maxPods) * 100 : 0} />
                                            </Stack>
                                        )}

                                        {/* Resource counters */}
                                        {metrics && showResourceCards && (
                                            <Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }}>
                                                <MiniCard label="vCPUs"  value={metrics.vcpus != null ? String(metrics.vcpus) : '--'} />
                                                <MiniCard label="RAM"    value={metrics.totalMemoryBytes != null ? `${(metrics.totalMemoryBytes / 1073741824).toFixed(0)}G` : '--'} />
                                                <MiniCard label="Pods"   value={metrics.pods ? String(metrics.pods) : '--'} />
                                                <MiniCard label="Nodes"  value={cluster.clusterInfo?.nodes?.length != null ? String(cluster.clusterInfo.nodes.length) : '--'} />
                                            </Stack>
                                        )}

                                        {/* Channel icons + buttons */}
                                        <Stack direction="row" alignItems="center" justifyContent="space-between">
                                            {showChannelIcons
                                                ? <Stack direction="row" spacing={0.5} alignItems="center">
                                                    {(cluster.kwirthData?.channels ?? []).map((ch: any) => {
                                                        const cls = props.frontChannels.get(ch.id)
                                                        if (!cls) return null
                                                        const icon = new cls().getChannelIcon()
                                                        return (
                                                            <Tooltip key={ch.id} title={ch.id}>
                                                                {React.cloneElement(icon, { fontSize: 'small', sx: { color: AV_GOLD, opacity: 0.55 } })}
                                                            </Tooltip>
                                                        )
                                                    })}
                                                  </Stack>
                                                : <Box />
                                            }
                                            <Button variant="outlined" size="small" disabled={!clusterHasMagnify}
                                                startIcon={magnifyIcon} onClick={() => launchMagnify(cluster.name)} sx={avBtnSx}>
                                                EXPLORE
                                            </Button>
                                        </Stack>

                                    </Stack>
                                </CardContent>
                            </Card>
                        )
                    })}

                    {props.clusters.length === 0 && (
                        <Typography sx={{ fontFamily: AV_FONT, fontSize: '1rem', fontWeight: 600, color: AV_GOLD, letterSpacing: '4px', textTransform: 'uppercase', p: 2, opacity: 0.6 }}>
                            ▲ No clusters connected
                        </Typography>
                    )}
                </Box>
            </Box>
        </Box>
    )
}
