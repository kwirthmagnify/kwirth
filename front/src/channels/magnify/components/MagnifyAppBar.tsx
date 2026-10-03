import { AppBar, Box, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Stack, Toolbar, Tooltip, Typography } from '@mui/material'
import { Area, AreaChart } from 'recharts'
import { FullscreenExit, Menu as MenuIcon, Search } from '@kwirthmagnify/kwirth-common-front/icons'
import { useState } from 'react'
import { IChannelObject } from '../../IChannel'
import { IMagnifyData } from '../MagnifyData'
import { clusterColor } from '../../../tools/clusterColor'

/** The summary pushed by App.tsx has 'reachable' at runtime, even though IClusterSummary only declares { name, home }. */
interface IClusterSummaryRuntime { name: string; home: boolean; reachable?: boolean }

interface IMagnifyAppBarProps {
    channelObject: IChannelObject
}

/**
 * AppBar shown when Magnify runs in fullscreen (the core sets channelObject.isFullscreen) AND not in
 * desktop mode (Electron/Tauri). Shows the cluster name and CPU / Memory / Network sparklines — the
 * same consumption info the Homepage renders, fed by magnifyData.metricsCluster.
 *
 * On the left, a hamburger opens a Drawer with the user's cluster list: each cluster shows its colour
 * dot and is disabled when not reachable (the same pattern as the ResourceSelector cluster dropdown).
 *
 * Pattern shared with Montag / Agora / Iter: sticky AppBar, zIndex 1300, brand + cluster name
 * on the left, metrics + cluster URL on the right. Returns null when not fullscreen or on desktop.
 */
const MagnifyAppBar: React.FC<IMagnifyAppBarProps> = (props: IMagnifyAppBarProps) => {
    const isFullscreen = (props.channelObject as unknown as { isFullscreen?: boolean }).isFullscreen === true
    // Desktop (Electron/Tauri) has its own chrome — no AppBar.
    if (!isFullscreen || props.channelObject.isDesktop) return null

    const [drawerOpen, setDrawerOpen] = useState(false)

    const magnifyData = props.channelObject.data as IMagnifyData
    const metrics = magnifyData?.metricsCluster ?? []

    const dataCpu = metrics.map((m: any) => ({ value: m.cpuUsage as number }))
    const dataMemory = metrics.map((m: any) => ({ value: m.memoryUsage as number }))
    const dataNetwork = metrics.map((m: any) => ({ value: (m.txmbps + m.rxmbps) || 0 }))

    const last = metrics.length > 0 ? metrics[metrics.length - 1] : null
    const cpu = last?.cpuUsage ?? 0
    const memory = last?.memoryUsage ?? 0
    const txmbps = last?.txmbps ?? 0
    const rxmbps = last?.rxmbps ?? 0

    const clusters = (props.channelObject.clusters ?? []) as IClusterSummaryRuntime[]

    return (
        <AppBar position='sticky' color='default' elevation={1} sx={{ zIndex: 1300 }}>
            <Toolbar sx={{ gap: 1.5 }}>
                <IconButton size='small' onClick={() => setDrawerOpen(true)}><MenuIcon fontSize='small' /></IconButton>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Search />
                    <Typography variant='h6' sx={{ fontWeight: 700, color: '#f5820a' }}>Kwirth</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography variant='h6' sx={{ fontWeight: 700 }}>Magnify</Typography>
                        {props.channelObject.clusterName && <Typography variant='subtitle1' sx={{ fontWeight: 600, color: 'text.secondary' }}>· {props.channelObject.clusterName}</Typography>}
                    </Box>
                </Box>
                <Box sx={{ flex: 1 }} />
                <Tooltip title={`${(cpu || 0).toFixed(2)}%`}>
                    <Stack direction={'column'} alignItems={'center'} mr={'2px'}>
                        <Typography fontSize={8} mb={-1}>CPU</Typography>
                        <AreaChart width={120} height={20} data={dataCpu} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                            <Area type='monotone' dataKey='value' stroke='#8884d8' strokeWidth={2} dot={false} fill='#bbbbdd' />
                        </AreaChart>
                    </Stack>
                </Tooltip>
                <Tooltip title={`${(memory || 0).toFixed(2)}%`}>
                    <Stack direction={'column'} alignItems={'center'} mr={'2px'}>
                        <Typography fontSize={8} mb={-1}>Mem</Typography>
                        <AreaChart width={120} height={20} data={dataMemory} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                            <Area type='monotone' dataKey='value' stroke='#d88488' strokeWidth={2} dot={false} fill='#ddbbbb' />
                        </AreaChart>
                    </Stack>
                </Tooltip>
                <Tooltip title={`${(txmbps || 0).toFixed(2)}Mbps / ${(rxmbps || 0).toFixed(2)}Mbps`}>
                    <Stack direction={'column'} alignItems={'center'}>
                        <Typography fontSize={8} mb={-1}>Net</Typography>
                        <AreaChart width={120} height={20} data={dataNetwork} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                            <Area type='monotone' dataKey='value' stroke='#88d884' strokeWidth={2} dot={false} fill='#bbddbb' />
                        </AreaChart>
                    </Stack>
                </Tooltip>
                {props.channelObject.clusterUrl && <Typography variant='caption' color='text.secondary' sx={{ ml: 1 }}>{props.channelObject.clusterUrl}</Typography>}
                <Tooltip title='Exit fullscreen'>
                    <IconButton size='small' onClick={() => props.channelObject.exitFullscreen?.()}><FullscreenExit fontSize='small' /></IconButton>
                </Tooltip>
            </Toolbar>
            <Drawer anchor='left' open={drawerOpen} onClose={() => setDrawerOpen(false)}>
                <Box sx={{ width: 250 }}>
                    <Typography variant='subtitle1' sx={{ fontWeight: 700, px: 2, py: 1.5 }}>Clusters</Typography>
                    <Divider />
                    <List dense>
                        {clusters.map(cluster => {
                            const reachable = cluster.home ? true : !!cluster.reachable
                            return (
                                <ListItemButton
                                    key={cluster.name}
                                    disabled={!reachable}
                                    selected={cluster.name === props.channelObject.clusterName}
                                    onClick={() => {
                                        props.channelObject.switchCluster?.(cluster.name)
                                        setDrawerOpen(false)
                                    }}
                                >
                                    <ListItemIcon sx={{ minWidth: 28 }}>
                                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: clusterColor(cluster.name).dot, flexShrink: 0 }} />
                                    </ListItemIcon>
                                    <ListItemText primary={cluster.name} secondary={cluster.home ? 'home' : undefined} />
                                </ListItemButton>
                            )
                        })}
                        {clusters.length === 0 && <ListItemText primary='No clusters' sx={{ px: 2, color: 'text.secondary' }} />}
                    </List>
                </Box>
            </Drawer>
        </AppBar>
    )
}

export { MagnifyAppBar }
