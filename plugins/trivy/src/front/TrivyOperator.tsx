import React, { useEffect, useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'
import { IChannelObject } from '@kwirthmagnify/kwirth-common-front'
import { ITrivyData } from './TrivyData'

const addGetAuthorization = (accessString: string) => ({ headers: { 'Authorization': 'Bearer ' + accessString } })

interface ISettingsTrivyProps {
    onClose: (action?: string) => void
    clusterUrl: string
    accessString: string
    channelObject: IChannelObject
}

const TrivyOperator: React.FC<ISettingsTrivyProps> = (props: ISettingsTrivyProps) => {
    let trivyData: ITrivyData = props.channelObject.data
    const [status, setStatus] = useState('?')

    const getStatus = async () => {
        const result = await fetch(`${props.channelObject.clusterUrl}/${trivyData.ri}/channel/trivy/operator?action=status`, addGetAuthorization(props.accessString))
        setStatus(await result.text())
    }

    useEffect(() => { getStatus() }, [])

    return (
        <Dialog open={true}>
            <DialogTitle>Trivy operator</DialogTitle>
            <DialogContent>
                <Stack spacing={2} direction='column' sx={{ width: '40vh' }}>
                    <Typography>Status: {status}</Typography>
                    <Button onClick={() => props.onClose('install')}>INSTALL</Button>
                    <Button onClick={() => props.onClose('remove')}>REMOVE</Button>
                    <Typography>Select scan mode: </Typography>
                    <Button onClick={() => props.onClose('configfs')}>FILESYSTEM</Button>
                    <Button onClick={() => props.onClose('configimg')}>IMAGE</Button>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => props.onClose()}>CANCEL</Button>
            </DialogActions>
        </Dialog>
    )
}

export { TrivyOperator }
