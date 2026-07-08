import React, { useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material'
import { Settings } from '../../model/Settings'

interface ISettingsUserProps {
    onClose:(ok:boolean) => void
    settings:Settings | null
}

const SettingsUser: React.FC<ISettingsUserProps> = (props:ISettingsUserProps) => {
    const [keepAliveInterval, setKeepAliveInterval] = useState<number>(props.settings? props.settings.keepAliveInterval : 60)

    const ok = () =>{
        if (props.settings) {
            props.settings.keepAliveInterval = keepAliveInterval
            props.onClose(true)
        }
    }

    return (<>
        <Dialog open={true} fullWidth maxWidth='xs' disableRestoreFocus={true}>
            <DialogTitle>Settings</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ display: 'flex', flexDirection: 'column', mt: 2 }}>
                    <Typography variant='body2'>
                        Default settings to use when you work with Kwirth.
                    </Typography>
                    <TextField value={keepAliveInterval} onChange={(e) => setKeepAliveInterval(+e.target.value)} variant='standard' label='Keep-alive interval (seconds)' slotProps={{ select: { native: true } }} type='number' />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button variant='outlined' onClick={ok}>OK</Button>
                <Button variant='outlined' onClick={() => props.onClose(false)}>Cancel</Button>
            </DialogActions>
        </Dialog>
    </>)
}

export { SettingsUser }
