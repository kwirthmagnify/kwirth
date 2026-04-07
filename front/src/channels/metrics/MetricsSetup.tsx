import React, { useRef, useState } from 'react'
import { Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, InputLabel, List, ListItem, ListItemButton, ListItemText, MenuItem, Select, Stack, TextField, Tooltip, Typography} from '@mui/material'
import { EMetricsConfigMode, EInstanceConfigView } from '@kwirthmagnify/kwirth-common'
import { ISetupProps } from '../IChannel'
import { BarChart } from '@mui/icons-material'
import { MetricsInstanceConfig, MetricsConfig } from './MetricsConfig'

const MetricsIcon = <BarChart/>

const MetricsSetup: React.FC<ISetupProps> = (props:ISetupProps) => {
    let metricsInstanceConfig:MetricsInstanceConfig = props.setupConfig?.channelInstanceConfig || new MetricsInstanceConfig()
    let metricsConfig:MetricsConfig = props.setupConfig?.channelConfig || new MetricsConfig()
    let allMetricsList = props.channelObject.metricsList
    
    let multiAssets=false
    if (props.channelObject) {
        switch (props.channelObject.view) {
            case EInstanceConfigView.NAMESPACE:
                multiAssets = props.channelObject.namespace.split(',').length > 1
                break
            case EInstanceConfigView.GROUP:
                multiAssets = props.channelObject.group.split(',').length > 1
                break
            case EInstanceConfigView.POD:
                multiAssets = props.channelObject.pod.split(',').length > 1
                break
            case EInstanceConfigView.CONTAINER:
                multiAssets = props.channelObject.container.split(',').length > 1
                break
        }
    }

    let merge = multiAssets? (metricsConfig.merge) : false
    let aggregate = multiAssets? (!merge && (metricsInstanceConfig.aggregate)) : false
    let stack = multiAssets? (merge && (metricsConfig.stack)) : false

    const [metricsNames, setMetricsNames] = React.useState<string[]>(metricsInstanceConfig.metrics)
    const [metricsMode, setMetricsMode] = useState(metricsInstanceConfig.mode)
    const [metricsInterval, setMetricsInterval] = useState(metricsInstanceConfig.interval)
    const [metricsDepth, setMetricsDepth] = useState(metricsConfig.depth)
    const [metricsWidth, setMetricsWidth] = useState(metricsConfig.width)
    const [assetAggregate, setAssetAggregate] = React.useState(aggregate)
    const [assetMerge, setAssetMerge] = React.useState(merge)
    const [assetStack, setAssetStack] = React.useState(stack)
    const [chart, setChart] = useState(metricsConfig.chart)
    const [metricsFilter, setMetricsFilter] = useState('')
    const setDefaultRef = useRef<HTMLInputElement|null>(null)

    const ok = () =>{
        metricsInstanceConfig.mode = metricsMode
        metricsInstanceConfig.interval = metricsInterval
        metricsInstanceConfig.aggregate = assetAggregate
        metricsInstanceConfig.metrics = metricsNames
        metricsConfig.depth = metricsDepth
        metricsConfig.width = metricsWidth
        metricsConfig.lineHeight = 300
        metricsConfig.configurable = true
        metricsConfig.compact = false
        metricsConfig.legend = true
        metricsConfig.merge = assetMerge
        metricsConfig.stack = assetStack
        metricsConfig.chart = chart
        props.onChannelSetupClosed(props.channel,
        {
            channelId: props.channel.channelId,
            channelConfig: metricsConfig,
            channelInstanceConfig: metricsInstanceConfig
        }, true, setDefaultRef.current?.checked || false)
    }

    const cancel = () => {
        props.onChannelSetupClosed(props.channel, 
        {
            channelId: props.channel.channelId,
            channelConfig: undefined,
            channelInstanceConfig:undefined
        }, false, false)
    }

    const metricAddOrRemove = (value:string) => {
        const currentIndex = metricsNames.indexOf(value)
        const newChecked = [...metricsNames]
        if (currentIndex < 0) 
            newChecked.push(value)
        else
            newChecked.splice(currentIndex, 1)
        setMetricsNames(newChecked);
    }

    const metricsDelete = (value:string) => {
        const currentIndex = metricsNames.indexOf(value)
        const newChecked = [...metricsNames]
        if (currentIndex >= 0) newChecked.splice(currentIndex, 1)
        setMetricsNames(newChecked);
    }

    return (<>
        <Dialog open={true} maxWidth={false} sx={{'& .MuiDialog-paper': { width: '50vw', maxWidth: '60vw', height:'60vh', maxHeight:'40vw' } }}>
            <DialogTitle>Configure metrics for {props.channelObject?.view}</DialogTitle>
            <DialogContent >
                <Stack spacing={2} direction={'column'} sx={{ mt:'16px' }}>
                    <Stack direction={'row'} spacing={1} >
                        <FormControl sx={{width:'25%'}}>
                            <InputLabel>Mode</InputLabel>
                            <Select value={metricsMode} onChange={(e) => setMetricsMode(e.target.value as EMetricsConfigMode)} variant='standard' disabled>
                                <MenuItem value={EMetricsConfigMode.SNAPSHOT}>Snapshot</MenuItem>
                                <MenuItem value={EMetricsConfigMode.STREAM}>Stream</MenuItem>
                            </Select>
                        </FormControl>
                        <FormControl variant="standard" sx={{width:'25%'}}>
                            <InputLabel>Depth</InputLabel>
                            <Select value={metricsDepth} onChange={(e) => setMetricsDepth(+e.target.value)} variant='standard'>
                                <MenuItem value={10}>10</MenuItem>
                                <MenuItem value={20}>20</MenuItem>
                                <MenuItem value={50}>50</MenuItem>
                                <MenuItem value={100}>100</MenuItem>
                            </Select>
                        </FormControl>
                        <FormControl variant="standard" sx={{width:'25%'}}>
                            <InputLabel>Width</InputLabel>
                            <Select value={metricsWidth} onChange={(e)=> setMetricsWidth(+e.target.value)} variant='standard'>
                                <MenuItem value={1}>1</MenuItem>
                                <MenuItem value={2}>2</MenuItem>
                                <MenuItem value={3}>3</MenuItem>
                                <MenuItem value={4}>4</MenuItem>
                                <MenuItem value={5}>5</MenuItem>
                                <MenuItem value={6}>6</MenuItem>
                            </Select>
                        </FormControl>
                        <TextField value={metricsInterval} onChange={(e) => setMetricsInterval(+e.target.value)} sx={{width:'25%'}} variant='standard' label='Interval' type='number'></TextField>
                    </Stack>

                    <TextField value={metricsFilter} onChange={(event) => setMetricsFilter(event.target.value)} sx={{width:'100%'}} variant='standard' label='Filter' autoFocus></TextField>

                    <Stack direction={'row'} spacing={1} sx={{width:'100%', height:'22vh'}}>
                        <Stack direction={'column'} sx={{width:'70%'}}>
                            <List sx={{ width: '100%', overflowY: 'auto' }}>
                                { allMetricsList && Array.from(allMetricsList.keys()).map((value, index) => {
                                    if (value.includes(metricsFilter) && (value.startsWith('container_') || value.startsWith('kwirth_'))) {
                                        return (
                                            <ListItem key={index} disablePadding>
                                                <ListItemButton onClick={() => metricAddOrRemove(value)} dense>
                                                    <Tooltip title={<><Typography fontSize={12}><b>{allMetricsList && allMetricsList.get(value)?.type}</b></Typography><Typography fontSize={12}>{allMetricsList && allMetricsList.get(value)?.help}</Typography></>} placement="bottom-start" enterDelay={750}>
                                                        <ListItemText primary={value} sx={{color:metricsNames.includes(value)?'text.primary':'text.secondary'}} />
                                                    </Tooltip>
                                                </ListItemButton>
                                            </ListItem>
                                        )
                                    }
                                    else {
                                        return <React.Fragment key={index} />
                                    }
                                })}
                            </List>
                        </Stack>

                        <Stack direction={'column'} sx={{width:'30%'}} spacing={1}>
                            <FormControlLabel control={<Checkbox checked={assetAggregate} onChange={(e) => setAssetAggregate(e.target.checked)}/>} disabled={!multiAssets || assetMerge} label='Aggregate' />
                            <FormControlLabel control={<Checkbox checked={assetMerge} onChange={(e) => setAssetMerge(e.target.checked)}/>} disabled={!multiAssets || assetAggregate} label='Merge' />
                            <FormControlLabel control={<Checkbox checked={assetStack} onChange={(e) => setAssetStack(e.target.checked)}/>} disabled={!assetMerge || (assetMerge && !('area bar'.includes(chart)))} label='Stack' />
                            <FormControl variant="standard">
                                <InputLabel sx={{ml:1}}>Chart</InputLabel>
                                <Select value={chart} onChange={(e) => setChart(e.target.value)} sx={{ml:1}} variant='standard'>
                                    <MenuItem value={'value'}>Value</MenuItem>
                                    <MenuItem value={'line'}>Line</MenuItem>
                                    <MenuItem value={'area'}>Area</MenuItem>
                                    <MenuItem value={'bar'}>Bar</MenuItem>
                                    <MenuItem value={'pie'}>Pie</MenuItem>
                                    <MenuItem value={'treemap'}>Treemap</MenuItem>
                                </Select>
                            </FormControl>

                        </Stack>
                    </Stack>

                    <Stack direction="row" spacing={1} sx={{width:'100%', flexWrap: 'wrap', maxWidth:'100%', height:'25%', overflowY:'auto'}} >
                        { metricsNames.map((value,index) => <Chip key={index} label={value} onDelete={() => metricsDelete(value)} size="small"/> ) }
                    </Stack>

                </Stack>

            </DialogContent>
            <DialogActions>
                <FormControlLabel control={<Checkbox slotProps={{ input: { ref: setDefaultRef } }}/>} label='Set as default' sx={{width:'100%', ml:'8px'}}/>
                <Button onClick={ok} disabled={metricsNames.length===0}>OK</Button>
                <Button onClick={cancel}>CANCEL</Button>
            </DialogActions>
        </Dialog>
    </>)
}

export { MetricsSetup, MetricsIcon }