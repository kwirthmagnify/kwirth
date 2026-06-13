import React, { useEffect, useRef, useState } from 'react'
import { Box, Button, Card, CardContent, Stack, Tooltip, Typography } from '@mui/material'
import { AccountTree } from '@mui/icons-material'
import { IClusterEvent, IHomepageProps } from '@kwirthmagnify/kwirth-common-front'

const MATRIX_GREEN = '#00ff41'
const MATRIX_DIM = '#006620'
const MATRIX_GLOW = 'rgba(0,255,65,0.3)'
const EVENTS_LIMIT = 25
const POLL_INTERVAL_MS = 10000

const MatrixRain: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const fontSize = 22
        const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
        let drops: number[] = []
        let animId: number
        let frame = 0
        const SPEED = 12

        const resize = (w: number, h: number) => {
            canvas.width = w
            canvas.height = h
            const cols = Math.floor(w / fontSize)
            drops = Array.from({ length: cols }, () => -Math.floor(Math.random() * (h / fontSize) * 4))
        }

        const draw = () => {
            frame++
            ctx.fillStyle = 'rgba(0,0,0,0.02)'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            ctx.font = `${fontSize}px monospace`
            if (frame % SPEED === 0) {
                for (let i = 0; i < drops.length; i++) {
                    if (drops[i] > 0) {
                        const bright = Math.random() > 0.97
                        ctx.fillStyle = bright ? '#ccffcc' : MATRIX_GREEN
                        ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * fontSize, drops[i] * fontSize)
                    }
                    if (drops[i] * fontSize > canvas.height) {
                        drops[i] = -Math.floor(Math.random() * (canvas.height / fontSize) * 3 + canvas.height / fontSize * 2)
                    }
                    drops[i]++
                }
            }
            animId = requestAnimationFrame(draw)
        }

        const observer = new ResizeObserver((entries) => {
            const { width, height } = entries[0].contentRect
            resize(Math.round(width), Math.round(height))
        })
        observer.observe(canvas)
        animId = requestAnimationFrame(draw)

        return () => {
            cancelAnimationFrame(animId)
            observer.disconnect()
        }
    }, [])

    return (
        <canvas
            ref={canvasRef}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'block' }}
        />
    )
}

const StatusLight: React.FC<{ online: boolean; animationDelay?: string }> = ({ online, animationDelay }) => (
    <Tooltip title={online ? 'Online' : 'Offline'}>
        <Box sx={{
            width: 12, height: 12, borderRadius: '50%',
            bgcolor: online ? MATRIX_GREEN : '#ff3333',
            boxShadow: online ? `0 0 6px 2px ${MATRIX_GREEN}` : '0 0 6px 2px #ff3333',
            transition: 'all 0.3s ease',
            cursor: 'default',
            animation: online ? 'matrix-status-pulse 2.5s ease-in-out infinite' : 'none',
            animationDelay: animationDelay ?? '0s',
        }} />
    </Tooltip>
)

const MetricBar: React.FC<{ label: string; value: number }> = ({ label, value }) => {
    const barRef = useRef<HTMLSpanElement>(null)
    const [cols, setCols] = useState(10)
    useEffect(() => {
        if (!barRef.current) return
        const obs = new ResizeObserver(() => {
            if (barRef.current) setCols(Math.max(5, Math.floor(barRef.current.offsetWidth / 6)))
        })
        obs.observe(barRef.current)
        return () => obs.disconnect()
    }, [])
    const filled = Math.round(value * cols / 100)
    const bar = '█'.repeat(filled) + '░'.repeat(cols - filled)
    const color = value > 90 ? '#ff3333' : value > 80 ? '#b36200' : MATRIX_GREEN
    return (
        <Stack direction="row" alignItems="center" spacing={0}>
            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.65rem', color: MATRIX_DIM, width: 28, flexShrink: 0 }}>{label}</Typography>
            <Typography ref={barRef} sx={{ fontFamily: 'monospace', fontSize: '0.65rem', color, letterSpacing: '-0.5px', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap' }}>{bar}</Typography>
            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.65rem', color, flexShrink: 0, pl: 0.5, width: 32, textAlign: 'right' }}>{Math.round(value)}%</Typography>
        </Stack>
    )
}

const MiniInfoCard: React.FC<{ label: string; value: string; stretch?: boolean }> = ({ label, value, stretch }) => (
    <Box sx={{
        border: `1px solid ${MATRIX_DIM}`,
        borderRadius: 1,
        px: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 70,
        ...(stretch ? { height: '100%' } : { py: 0.75 }),
    }}>
        <Typography sx={{ fontFamily: 'monospace', fontSize: '1rem', color: MATRIX_GREEN, lineHeight: 1.2 }}>{value}</Typography>
        <Typography sx={{ fontFamily: 'monospace', fontSize: '0.78rem', color: MATRIX_DIM, lineHeight: 1.2 }}>{label}</Typography>
    </Box>
)

const EventLog: React.FC<{ events: IClusterEvent[] }> = ({ events }) => {
    const boxRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
    }, [events])

    return (
        <Box ref={boxRef} sx={{
            flex: 1,
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '0.55rem',
            lineHeight: 1.9,
            color: MATRIX_DIM,
            bgcolor: 'rgba(0,18,6,0.92)',
            border: `1px solid ${MATRIX_DIM}`,
            borderRadius: 1,
            p: 1,
            '&::-webkit-scrollbar': { width: 4 },
            '&::-webkit-scrollbar-thumb': { bgcolor: MATRIX_DIM, borderRadius: 2 },
        }}>
            {events.length === 0
                ? <Box sx={{ color: MATRIX_GREEN, opacity: 0.4 }}>{'// follow the white rabbit'}</Box>
                : [...events].reverse().map((e, i) => (
                    <Box key={i} sx={{ color: e.type === 'Warning' ? '#ff9800' : MATRIX_GREEN, mb: 0.2 }}>
                        <Box component="span" sx={{ color: MATRIX_DIM, mr: 0.5 }}>
                            {new Date(e.time).toLocaleTimeString()}
                        </Box>
                        <Box component="span" sx={{ mr: 0.5 }}>[{e.reason}]</Box>
                        <Box component="span" sx={{ color: MATRIX_DIM, mr: 0.5 }}>{e.object}</Box>
                        {e.message}
                    </Box>
                ))
            }
        </Box>
    )
}

const Matrix: React.FC<IHomepageProps> = (props) => {
    useEffect(() => {
        const id = 'matrix-keyframes'
        if (!document.getElementById(id)) {
            const style = document.createElement('style')
            style.id = id
            style.textContent = `@keyframes matrix-status-pulse {
                0%, 100% { opacity: 0.25; box-shadow: none; }
                50% { opacity: 0.85; box-shadow: 0 0 7px 2px ${MATRIX_GREEN}; }
            }`
            document.head.appendChild(style)
        }
        return () => { document.getElementById('matrix-keyframes')?.remove() }
    }, [])

    const containerRef = useRef<HTMLDivElement>(null)
    const [containerHeight, setContainerHeight] = React.useState(0)

    useEffect(() => {
        const observer = new ResizeObserver(() => {
            if (!containerRef.current) return
            const { top } = containerRef.current.getBoundingClientRect()
            setContainerHeight(window.innerHeight - top)
        })
        observer.observe(document.body)
        return () => observer.disconnect()
    }, [containerRef.current])

    // per-cluster metrics state
    const [clusterMetrics, setClusterMetrics] = useState<Record<string, { cpu: number; memory: number; vcpus: number; totalMemoryBytes: number; pods: number; maxPods: number }>>({})

    useEffect(() => {
        if (!props.getClusterMetrics) return
        const fetchAll = () => {
            props.clusters.forEach(cluster => {
                props.getClusterMetrics!(cluster.name).then(m => {
                    if (m) setClusterMetrics(prev => ({ ...prev, [cluster.name]: m }))
                })
            })
        }
        fetchAll()
        const timer = setInterval(fetchAll, POLL_INTERVAL_MS)
        return () => clearInterval(timer)
    }, [props.clusters, props.getClusterMetrics])

    // per-cluster event state
    const [clusterEvents, setClusterEvents] = useState<Record<string, IClusterEvent[]>>({})

    useEffect(() => {
        if (!props.getClusterEvents) return
        const fetchAll = () => {
            props.clusters.forEach(cluster => {
                props.getClusterEvents!(cluster.name, EVENTS_LIMIT).then(events => {
                    setClusterEvents(prev => ({ ...prev, [cluster.name]: events }))
                })
            })
        }
        fetchAll()
        const timer = setInterval(fetchAll, POLL_INTERVAL_MS)
        return () => clearInterval(timer)
    }, [props.clusters, props.getClusterEvents])

    const launchMagnify = (clusterName: string) => {
        props.onHomepageSelectTab({
            name: clusterName, description: '', channel: 'magnify',
            channelObject: { clusterName, view: 'cluster', namespace: '', group: '', pod: '', container: '' }
        })
    }

    const launchTopology = (clusterName: string) => {
        props.onHomepageSelectTab({
            name: clusterName, description: '', channel: 'topology',
            channelObject: { clusterName, view: 'cluster', namespace: '', group: '', pod: '', container: '' }
        })
    }

    const hasMagnify = props.frontChannels.has('magnify')
    const hasTopology = props.frontChannels.has('topology')

    const magnifyClass = props.frontChannels.get('magnify')
    const magnifyIcon = magnifyClass ? new magnifyClass().getChannelIcon() : null
    const topologyClass = props.frontChannels.get('topology')
    const topologyIcon = topologyClass ? new topologyClass().getChannelIcon() : <AccountTree />

    const matrixButtonSx = {
        fontFamily: 'monospace',
        '&:not(.Mui-disabled)': { color: MATRIX_GREEN, borderColor: MATRIX_GREEN },
        '&:hover:not(.Mui-disabled)': {
            borderColor: MATRIX_GREEN,
            bgcolor: 'rgba(0,255,65,0.1)',
            boxShadow: `0 0 8px ${MATRIX_GLOW}`,
        },
    }

    return (
        <Box ref={containerRef} sx={{ position: 'relative', width: '100%', height: `${containerHeight}px`, overflow: 'hidden', bgcolor: '#000' }}>
            <MatrixRain />
            <Box sx={{
                position: 'relative',
                zIndex: 1,
                p: 3,
                height: '100%',
                overflowY: 'auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 3,
                alignContent: 'start',
            }}>
                {props.clusters.map((cluster: any, idx: number) => {
                    const clusterChannelIds = new Set<string>((cluster.kwirthData?.channels ?? []).map((ch: any) => ch.id))
                    const clusterHasMagnify = hasMagnify && clusterChannelIds.has('magnify')
                    const clusterHasTopology = hasTopology && clusterChannelIds.has('topology')
                    return (
                    <Card key={cluster.name} variant="outlined" sx={{
                        bgcolor: 'rgba(0,0,0,0.80)',
                        border: `1px solid ${MATRIX_GREEN}`,
                        boxShadow: `0 0 10px ${MATRIX_GLOW}, inset 0 0 10px rgba(0,255,65,0.05)`,
                        color: MATRIX_GREEN,
                        backdropFilter: 'blur(2px)',
                        height: `${Math.floor((containerHeight - 24 * 2 - 24) / 2) - 4}px`,
                        overflow: 'hidden',
                    }}>
                        <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'row', gap: 2, py: 2, '&:last-child': { pb: 2 } }}>

                            {/* Left column */}
                            <Stack direction="column" justifyContent="space-between" sx={{ flex: '0 0 40%', minWidth: 0 }}>
                                {/* Rows 1-3 grouped at top */}
                                <Stack direction="column" spacing={1}>
                                    {/* Row 1: name + semaphore */}
                                    <Stack direction="row" alignItems="center" spacing={1}>
                                        <Typography variant="h6" sx={{
                                            fontFamily: 'monospace',
                                            color: MATRIX_GREEN,
                                            lineHeight: 1.3,
                                            textShadow: `0 0 8px ${MATRIX_GREEN}`,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            m: 0,
                                        }}>
                                            {cluster.name}
                                        </Typography>
                                        <StatusLight online={!!clusterMetrics[cluster.name]} animationDelay={`${(idx * 0.7) % 2.5}s`} />
                                    </Stack>

                                    {/* Row 2: url */}
                                    <Typography variant="body2" sx={{
                                        fontFamily: 'monospace',
                                        color: MATRIX_DIM,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {cluster.url}
                                    </Typography>

                                    {/* Row 3: cpu/memory/pod bars */}
                                    {clusterMetrics[cluster.name] && (
                                        <Stack direction="column" spacing={0.25}>
                                            <MetricBar label="CPU" value={clusterMetrics[cluster.name].cpu} />
                                            <MetricBar label="MEM" value={clusterMetrics[cluster.name].memory} />
                                            <MetricBar label="POD" value={clusterMetrics[cluster.name].maxPods > 0 ? (clusterMetrics[cluster.name].pods / clusterMetrics[cluster.name].maxPods) * 100 : 0} />
                                        </Stack>
                                    )}
                                </Stack>

                                {/* Middle: minicards centered vertically between bars and icons */}
                                {clusterMetrics[cluster.name] && (
                                    <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'center' }}>
                                        <MiniInfoCard label="vCPUs" value={clusterMetrics[cluster.name].vcpus != null ? String(clusterMetrics[cluster.name].vcpus) : '--'} />
                                        <MiniInfoCard label="RAM" value={clusterMetrics[cluster.name].totalMemoryBytes != null ? `${(clusterMetrics[cluster.name].totalMemoryBytes / 1073741824).toFixed(0)}G` : '--'} />
                                        <MiniInfoCard label="Pods" value={clusterMetrics[cluster.name].pods ? String(clusterMetrics[cluster.name].pods) : '--'} />
                                    </Stack>
                                )}

                                {/* Rows 4+5: channel icons + buttons pinned to bottom */}
                                <Stack direction="column" spacing={0.75}>
                                    <Stack direction="row" spacing={0.5} alignItems="center">
                                        {(cluster.kwirthData?.channels ?? []).map((ch: any) => {
                                            const channelClass = props.frontChannels.get(ch.id)
                                            if (!channelClass) return null
                                            const icon = new channelClass().getChannelIcon()
                                            return (
                                                <Tooltip key={ch.id} title={ch.id}>
                                                    {React.cloneElement(icon, { fontSize: 'small', sx: { color: MATRIX_GREEN, opacity: 0.6 } })}
                                                </Tooltip>
                                            )
                                        })}
                                    </Stack>
                                    <Stack direction="row" spacing={1} justifyContent="flex-start">
                                    <Button variant="outlined" size="small" disabled={!clusterHasTopology}
                                        startIcon={topologyIcon} onClick={() => launchTopology(cluster.name)} sx={matrixButtonSx}>
                                        Topology
                                    </Button>
                                    <Button variant="outlined" size="small" disabled={!clusterHasMagnify}
                                        startIcon={magnifyIcon} onClick={() => launchMagnify(cluster.name)} sx={matrixButtonSx}>
                                        Magnify
                                    </Button>
                                </Stack>
                            </Stack>
                            </Stack>

                            {/* Right column: event log */}
                            <EventLog events={clusterEvents[cluster.name] ?? []} />

                        </CardContent>
                    </Card>
                    )
                })}
                {props.clusters.length === 0 && (
                    <Typography sx={{ fontFamily: 'monospace', color: MATRIX_GREEN, p: 2, textShadow: `0 0 8px ${MATRIX_GREEN}` }}>
                        {'// Entering the matrix...'}
                    </Typography>
                )}
            </Box>
        </Box>
    )
}

export { Matrix }
