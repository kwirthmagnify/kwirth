import React, { useState, useContext } from 'react'
import { Button, Dialog, DialogActions, DialogContent, Stack, TextField, Typography } from '@mui/material'
import { DialogTitleHelp } from '@kwirthmagnify/kwirth-common-front'
import { SessionContext, SessionContextType } from '../../model/SessionContext'

interface ISettingsClusterProps {
    onClose:(interval?:number) => void
    clusterName?: string
    clusterMetricsInterval?:number
}

const SettingsCluster: React.FC<ISettingsClusterProps> = (props:ISettingsClusterProps) => {
    const [clusterMetricsInterval, setClusterMetricsInterval] = useState(props.clusterMetricsInterval)
    const { backendUrl } = useContext(SessionContext) as SessionContextType

    return (<>
        <Dialog open={true} fullWidth maxWidth='xs' disableRestoreFocus={true}>
            <DialogTitleHelp section='guide/admin/02-initial-config?id=cluster-settings' docsUrl={backendUrl + '/core/docs/core/kwirth'}>Cluster settings</DialogTitleHelp>
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
