import React, { useState } from 'react'
import {
    Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
    Divider, FormControlLabel, FormGroup, Slider, Stack, Typography,
} from '@mui/material'
import { AccountTree } from '@mui/icons-material'
import { ISetupProps } from '../IChannel'
import { TopologyConfig, ITopologyConfig, ITopologyInstanceConfig } from './TopologyConfig'

export const TopologyIcon = <AccountTree />

export const TopologySetup: React.FC<ISetupProps> = (props: ISetupProps) => {
    const cfg:  ITopologyConfig         = props.setupConfig?.channelConfig         ?? new TopologyConfig()

    const [showPods,          setShowPods]          = useState(cfg.showPods)
    const [showServices,      setShowServices]      = useState(cfg.showServices)
    const [showIngresses,     setShowIngresses]     = useState(cfg.showIngresses)
    const [showDeployments,   setShowDeployments]   = useState(cfg.showDeployments)
    const [showStatefulSets,  setShowStatefulSets]  = useState(cfg.showStatefulSets)
    const [showDaemonSets,    setShowDaemonSets]    = useState(cfg.showDaemonSets)
    const [showJobs,          setShowJobs]          = useState(cfg.showJobs)
    const [showCronJobs,      setShowCronJobs]      = useState(cfg.showCronJobs)
    const [showPvcs,          setShowPvcs]          = useState(cfg.showPvcs)
    const [showOnlyRunning,   setShowOnlyRunning]   = useState(cfg.showOnlyRunning)
    const [edgeAnimated,      setEdgeAnimated]      = useState(cfg.edgeAnimated)
    const [labelSize,         setLabelSize]         = useState(cfg.labelSize)
    const [nodeSpacingFactor, setNodeSpacingFactor] = useState(cfg.nodeSpacingFactor)
    const [gridColumns,       setGridColumns]       = useState(cfg.gridColumns)

    const ok = () => {
        const channelConfig: ITopologyConfig = {
            showPods, showServices, showIngresses,
            showDeployments, showStatefulSets, showDaemonSets,
            showJobs, showCronJobs, showPvcs, showOnlyRunning,
            edgeAnimated, labelSize, nodeSpacingFactor, gridColumns,
        }
        const channelInstanceConfig: ITopologyInstanceConfig = { namespaces: ['*all'] }
        props.onChannelSetupClosed(
            props.channel,
            { channelId: props.channel.channelId, channelConfig, channelInstanceConfig },
            true, false
        )
    }

    const cancel = () => props.onChannelSetupClosed(
        props.channel,
        { channelId: props.channel.channelId, channelConfig: undefined, channelInstanceConfig: undefined },
        false, false
    )

    return (
        <Dialog open={true} maxWidth='sm' fullWidth>
            <DialogTitle>Configure topology view</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>

                    <Typography variant='body2' color='text.secondary'>Visible resource types</Typography>
                    <FormGroup>
                        <Stack direction='row' flexWrap='wrap'>
                            <FormControlLabel control={<Checkbox checked={showIngresses}    onChange={e => setShowIngresses(e.target.checked)}    />} label='Ingresses'    sx={{ width: '50%' }} />
                            <FormControlLabel control={<Checkbox checked={showServices}     onChange={e => setShowServices(e.target.checked)}     />} label='Services'     sx={{ width: '50%' }} />
                            <FormControlLabel control={<Checkbox checked={showDeployments}  onChange={e => setShowDeployments(e.target.checked)}  />} label='Deployments'  sx={{ width: '50%' }} />
                            <FormControlLabel control={<Checkbox checked={showStatefulSets} onChange={e => setShowStatefulSets(e.target.checked)} />} label='StatefulSets' sx={{ width: '50%' }} />
                            <FormControlLabel control={<Checkbox checked={showDaemonSets}   onChange={e => setShowDaemonSets(e.target.checked)}   />} label='DaemonSets'   sx={{ width: '50%' }} />
                            <FormControlLabel control={<Checkbox checked={showJobs}         onChange={e => setShowJobs(e.target.checked)}         />} label='Jobs'         sx={{ width: '50%' }} />
                            <FormControlLabel control={<Checkbox checked={showCronJobs}     onChange={e => setShowCronJobs(e.target.checked)}     />} label='CronJobs'     sx={{ width: '50%' }} />
                            <FormControlLabel control={<Checkbox checked={showPods}         onChange={e => setShowPods(e.target.checked)}         />} label='Pods'         sx={{ width: '50%' }} />
                            <FormControlLabel control={<Checkbox checked={showPvcs}         onChange={e => setShowPvcs(e.target.checked)}         />} label='PVCs'         sx={{ width: '50%' }} />
                        </Stack>
                    </FormGroup>
                    <FormControlLabel
                        control={<Checkbox checked={showOnlyRunning} onChange={e => setShowOnlyRunning(e.target.checked)} />}
                        label='Show only running resources'
                    />

                    <Divider />
                    <Typography variant='body2' color='text.secondary'>Visual options</Typography>
                    <FormControlLabel
                        control={<Checkbox checked={edgeAnimated} onChange={e => setEdgeAnimated(e.target.checked)} />}
                        label='Animate connection edges'
                    />
                    <Stack direction='row' alignItems='center' gap={2}>
                        <Typography variant='body2' sx={{ minWidth: 120 }}>Label size: {labelSize}px</Typography>
                        <Slider value={labelSize} min={8} max={20} step={1} onChange={(_, v) => setLabelSize(v as number)} sx={{ flex: 1 }} />
                    </Stack>
                    <Stack direction='row' alignItems='center' gap={2}>
                        <Typography variant='body2' sx={{ minWidth: 120 }}>Node spacing: {nodeSpacingFactor.toFixed(1)}x</Typography>
                        <Slider value={nodeSpacingFactor} min={0.5} max={3.0} step={0.1} onChange={(_, v) => setNodeSpacingFactor(v as number)} sx={{ flex: 1 }} />
                    </Stack>
                    <Stack direction='row' alignItems='center' gap={2}>
                        <Typography variant='body2' sx={{ minWidth: 120 }}>Grid columns: {gridColumns}</Typography>
                        <Slider value={gridColumns} min={2} max={20} step={1} onChange={(_, v) => setGridColumns(v as number)} sx={{ flex: 1 }} />
                    </Stack>

                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={ok}>OK</Button>
                <Button onClick={cancel}>CANCEL</Button>
            </DialogActions>
        </Dialog>
    )
}
