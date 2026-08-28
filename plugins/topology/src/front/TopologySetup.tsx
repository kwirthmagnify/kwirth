import React, { useRef, useState } from 'react'
import {
    Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
    Divider, FormControlLabel, FormGroup, Slider, Stack, Typography,
} from '@mui/material'
import { AccountTree } from '@mui/icons-material'
import { TopologyConfig, ITopologyConfig } from './TopologyConfig'
import { ISetupProps } from '@kwirthmagnify/kwirth-common-front'

export const TopologyIcon = <AccountTree />

export const TopologySetup: React.FC<ISetupProps> = (props: ISetupProps) => {
    const cfg: ITopologyConfig = props.setupConfig?.channelConfig ?? new TopologyConfig()
    const defaultRef = useRef<HTMLInputElement | null>(null)

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
        props.onChannelSetupClosed(
            props.channel,
            { channelId: props.channel.channelId, channelConfig, channelInstanceConfig: undefined },
            true, defaultRef.current?.checked || false
        )
    }

    const cancel = () => props.onChannelSetupClosed(
        props.channel,
        { channelId: props.channel.channelId, channelConfig: undefined, channelInstanceConfig: undefined },
        false, false
    )

    return (
        <Dialog open={true} PaperProps={{ sx: { width: 680, height: 490 } }}>
            <DialogTitle>Configure topology view</DialogTitle>
            <DialogContent sx={{ overflow: 'hidden', px: 3, pt: 1, display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ display: 'flex', flexDirection: 'row', flex: 1, gap: 2 }}>

                    {/* Left column: Resources */}
                    <Stack spacing={1} sx={{ pt: 1, pb: 2, flex: 1, alignSelf: 'flex-start' }}>
                        <Typography variant='body2' color='text.secondary' sx={{ fontWeight: 500 }}>Resources</Typography>
                        <FormGroup sx={{ flexDirection: 'row', pb: 1 }}>
                            <FormControlLabel control={<Checkbox size='small' checked={showIngresses}    onChange={e => setShowIngresses(e.target.checked)}    />} label='Ingresses'    sx={{ width: '50%' }} />
                            <FormControlLabel control={<Checkbox size='small' checked={showServices}     onChange={e => setShowServices(e.target.checked)}     />} label='Services'     sx={{ width: '50%' }} />
                            <FormControlLabel control={<Checkbox size='small' checked={showDeployments}  onChange={e => setShowDeployments(e.target.checked)}  />} label='Deployments'  sx={{ width: '50%' }} />
                            <FormControlLabel control={<Checkbox size='small' checked={showStatefulSets} onChange={e => setShowStatefulSets(e.target.checked)} />} label='StatefulSets' sx={{ width: '50%' }} />
                            <FormControlLabel control={<Checkbox size='small' checked={showDaemonSets}   onChange={e => setShowDaemonSets(e.target.checked)}   />} label='DaemonSets'   sx={{ width: '50%' }} />
                            <FormControlLabel control={<Checkbox size='small' checked={showJobs}         onChange={e => setShowJobs(e.target.checked)}         />} label='Jobs'         sx={{ width: '50%' }} />
                            <FormControlLabel control={<Checkbox size='small' checked={showCronJobs}     onChange={e => setShowCronJobs(e.target.checked)}     />} label='CronJobs'     sx={{ width: '50%' }} />
                            <FormControlLabel control={<Checkbox size='small' checked={showPods}         onChange={e => setShowPods(e.target.checked)}         />} label='Pods'         sx={{ width: '50%' }} />
                            <FormControlLabel control={<Checkbox size='small' checked={showPvcs}         onChange={e => setShowPvcs(e.target.checked)}         />} label='PVCs'         sx={{ width: '50%' }} />
                        </FormGroup>
                    </Stack>

                    <Divider orientation='vertical' flexItem />

                    {/* Right column: Display options */}
                    <Stack spacing={2} sx={{ pt: 1, flex: 1, alignSelf: 'flex-start' }}>
                        <Typography variant='body2' color='text.secondary' sx={{ fontWeight: 500 }}>Display options</Typography>
                        <FormControlLabel
                            control={<Checkbox size='small' checked={showOnlyRunning} onChange={e => setShowOnlyRunning(e.target.checked)} />}
                            label='Only running'
                        />
                        <FormControlLabel
                            control={<Checkbox size='small' checked={edgeAnimated} onChange={e => setEdgeAnimated(e.target.checked)} />}
                            label='Animate edges'
                        />
                        <Stack spacing={0.5}>
                            <Typography variant='body2'>Label size: {labelSize}px</Typography>
                            <Slider value={labelSize} min={8} max={20} step={1} onChange={(_, v) => setLabelSize(v as number)} />
                        </Stack>
                        <Stack spacing={0.5}>
                            <Typography variant='body2'>Node spacing: {nodeSpacingFactor.toFixed(1)}x</Typography>
                            <Slider value={nodeSpacingFactor} min={0.2} max={3.0} step={0.1} onChange={(_, v) => setNodeSpacingFactor(v as number)} />
                        </Stack>
                        <Stack spacing={0.5}>
                            <Typography variant='body2'>Grid columns: {gridColumns}</Typography>
                            <Slider value={gridColumns} min={2} max={20} step={1} onChange={(_, v) => setGridColumns(v as number)} />
                        </Stack>
                    </Stack>

                </Box>
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'space-between' }}>
                <FormControlLabel
                    control={<Checkbox slotProps={{ input: { ref: defaultRef } }} />}
                    label='Set as default'
                    sx={{ ml: 1 }}
                />
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant='contained' onClick={ok}>OK</Button>
                    <Button variant='outlined' onClick={cancel}>Cancel</Button>
                </Box>
            </DialogActions>
        </Dialog>
    )
}
