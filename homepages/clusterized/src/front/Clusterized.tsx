import React, { useEffect, useState } from 'react'
import { Box, Button, Card, CardContent, LinearProgress, Stack, Tooltip, Typography } from '@mui/material'
import { OpenInBrowser } from '@mui/icons-material'
import { IHomepageProps } from '@kwirthmagnify/kwirth-common-front'

type ClusterMetrics = { cpu: number; memory: number; vcpus: number; totalMemoryBytes: number; pods: number; maxPods: number }

const StatusLight: React.FC<{ color: string; active?: boolean; label: string }> = ({ color, active, label }) => (
    <Tooltip title={label}>
        <Box sx={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            bgcolor: color,
            opacity: active ? 1 : 0.2,
            boxShadow: active ? `0 0 6px 2px ${color}` : 'none',
            transition: 'all 0.3s ease',
            cursor: 'default'
        }} />
    </Tooltip>
)

const MetricBar: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
    <Box sx={{ minWidth: 72 }}>
        <Stack direction='row' justifyContent='space-between' alignItems='center'>
            <Typography variant='caption' color='text.secondary' sx={{ fontSize: '0.65rem' }}>{label}</Typography>
            <Typography variant='caption' fontWeight='bold' sx={{ fontSize: '0.65rem' }}>{Math.round(value)}%</Typography>
        </Stack>
        <LinearProgress variant='determinate' value={Math.min(Math.max(value, 0), 100)}
            sx={{ height: 4, borderRadius: 2, bgcolor: 'action.hover', '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 2 } }} />
    </Box>
)

const MetricPlaceholder: React.FC<{ label: string }> = ({ label }) => (
    <Box sx={{ minWidth: 72 }}>
        <Stack direction='row' justifyContent='space-between' alignItems='center'>
            <Typography variant='caption' color='text.disabled' sx={{ fontSize: '0.65rem' }}>{label}</Typography>
            <Typography variant='caption' sx={{ fontSize: '0.65rem' }}>&nbsp;</Typography>
        </Stack>
        <Box sx={{ height: 4, borderRadius: 2, bgcolor: 'action.hover' }} />
    </Box>
)

const Clusterized: React.FC<IHomepageProps> = (props) => {
    const [metrics, setMetrics] = useState<Record<string, ClusterMetrics>>({})

    const showCpu = props.config?.showCpu ?? true
    const showMem = props.config?.showMem ?? true
    const showPods = props.config?.showPods ?? true
    const needsMetrics = showCpu || showMem || showPods

    useEffect(() => {
        if (!needsMetrics || !props.getClusterMetrics) return
        const fetchAll = () => {
            props.clusters.forEach(cluster => {
                props.getClusterMetrics!(cluster.name).then(m => {
                    if (m) setMetrics(prev => ({ ...prev, [cluster.name]: m }))
                })
            })
        }
        fetchAll()
        const timer = setInterval(fetchAll, 30000)
        return () => clearInterval(timer)
    }, [props.clusters, props.config, needsMetrics])

    const launchMagnify = (clusterName: string) => {
        props.onHomepageSelectTab({
            name: clusterName,
            description: '',
            channel: 'magnify',
            channelObject: {
                clusterName,
                view: 'cluster' as any,
                namespace: '',
                group: '',
                pod: '',
                container: ''
            }
        })
    }

    return (
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', height: '100%' }}>
            {props.clusters.map(cluster => {
                const m = metrics[cluster.name]
                return (
                    <Card key={cluster.name} variant='outlined'>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Stack direction='row' alignItems='center' spacing={2}>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant='h6' sx={{ lineHeight: 1.3 }}>{cluster.name}</Typography>
                                    <Typography variant='caption' color='text.secondary' sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                                        {cluster.url}
                                    </Typography>
                                </Box>
                                {needsMetrics && (
                                    <Stack direction='row' spacing={1.5} alignItems='center'>
                                        {showCpu && (m ? <MetricBar label='CPU' value={m.cpu} color='#2196f3' /> : <MetricPlaceholder label='CPU' />)}
                                        {showMem && (m ? <MetricBar label='MEM' value={m.memory} color='#9c27b0' /> : <MetricPlaceholder label='MEM' />)}
                                        {showPods && (m && m.maxPods > 0 ? <MetricBar label='Pods' value={(m.pods / m.maxPods) * 100} color='#ff9800' /> : <MetricPlaceholder label='Pods' />)}
                                    </Stack>
                                )}
                                <Stack direction='row' spacing={0.75} alignItems='center'>
                                    <StatusLight color='#4caf50' label='Healthy' />
                                    <StatusLight color='#ff9800' label='Warning' />
                                    <StatusLight color='#f44336' label='Critical' />
                                </Stack>
                                <Button
                                    variant='outlined'
                                    size='small'
                                    startIcon={<OpenInBrowser />}
                                    onClick={() => launchMagnify(cluster.name)}
                                >
                                    Magnify
                                </Button>
                            </Stack>
                        </CardContent>
                    </Card>
                )
            })}
            {props.clusters.length === 0 && (
                <Typography variant='body2' color='text.secondary' sx={{ p: 2 }}>
                    No clusters defined. Add a cluster to get started.
                </Typography>
            )}
        </Box>
    )
}

export { Clusterized }
