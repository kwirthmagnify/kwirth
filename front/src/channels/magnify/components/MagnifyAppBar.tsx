import { AppBar, Box, IconButton, Stack, Toolbar, Tooltip, Typography } from '@mui/material'
import { Area, AreaChart } from 'recharts'
import { FullscreenExit, Search } from '@kwirthmagnify/kwirth-common-front/icons'
import { IChannelObject } from '../../IChannel'
import { IMagnifyData } from '../MagnifyData'

interface IMagnifyAppBarProps {
    channelObject: IChannelObject
}

/**
 * AppBar shown when Magnify runs in fullscreen (the core sets channelObject.isFullscreen).
 * Shows the cluster name and CPU / Memory / Network sparklines — the same consumption info
 * the Homepage renders, fed by magnifyData.metricsCluster.
 *
 * Pattern shared with Montag / Agora / Iter: sticky AppBar, zIndex 1300, brand + cluster name
 * on the left, metrics + cluster URL on the right. Returns null when not fullscreen.
 */
const MagnifyAppBar: React.FC<IMagnifyAppBarProps> = (props: IMagnifyAppBarProps) => {
    const isFullscreen = (props.channelObject as unknown as { isFullscreen?: boolean }).isFullscreen === true
    if (!isFullscreen) return null

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

    return (
        <AppBar position='sticky' color='default' elevation={1} sx={{ zIndex: 1300 }}>
            <Toolbar sx={{ gap: 1.5 }}>
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
        </AppBar>
    )
}

export { MagnifyAppBar }
