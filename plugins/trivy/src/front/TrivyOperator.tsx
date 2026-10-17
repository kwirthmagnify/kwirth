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
                    <Button variant='outlined' onClick={() => props.onClose('install')}>INSTALL</Button>
                    <Button variant='outlined' onClick={() => props.onClose('remove')}>REMOVE</Button>
                    {/* The scan mode selector (FILESYSTEM / IMAGE) lived here and was removed on
                        2026-10-17: the back end never had a handler for 'configfs' or 'configimg' —
                        they appear exactly once in the repository's history, in the commit that turned
                        Trivy into a plugin, and never on the back side — so both buttons fell into the
                        switch's default and answered '500 Invalid action'. The mode is fixed to
                        filesystem. A button that only ever returns a 500 is worse than no button. */}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button variant='outlined' onClick={() => props.onClose()}>CLOSE</Button>
            </DialogActions>
        </Dialog>
    )
}

export { TrivyOperator }
