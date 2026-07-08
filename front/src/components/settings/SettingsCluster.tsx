import React, { useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material'

interface ISettingsClusterProps {
    onClose:(interval?:number) => void
    clusterName?: string
    clusterMetricsInterval?:number
}

const SettingsCluster: React.FC<ISettingsClusterProps> = (props:ISettingsClusterProps) => {
    const [clusterMetricsInterval, setClusterMetricsInterval] = useState(props.clusterMetricsInterval)

    return (<>
        <Dialog open={true} fullWidth maxWidth='xs' disableRestoreFocus={true}>
            <DialogTitle>Cluster settings</DialogTitle>
            <DialogContent>
                <Stack spacing={2} direction='column' sx={{ mt: 1 }}>
                    <Typography variant='body2'>Enter Kwirth cluster configuration for cluster <b>{props.clusterName}</b></Typography>
                    <TextField value={clusterMetricsInterval} onChange={(e) => setClusterMetricsInterval(+e.target.value)} variant='standard' label='Cluster metrics read interval (seconds)' SelectProps={{ native: true }} type='number' />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button variant='outlined' onClick={() => props.onClose(clusterMetricsInterval)}>OK</Button>
                <Button variant='outlined' onClick={() => props.onClose(undefined)}>Cancel</Button>
            </DialogActions>
        </Dialog>
    </>)
}

export { SettingsCluster }
