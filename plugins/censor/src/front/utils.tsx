import React from 'react'
import { Dispatch, SetStateAction } from 'react'
import { HelpOutline } from '@mui/icons-material'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'

export enum MsgBoxButtons {
    None = 0,
    Yes = 2,
    No = 8,
}

export const MsgBoxYesNo = (title: string, message: string, onClose: Dispatch<SetStateAction<JSX.Element>>, onResult?: (a: MsgBoxButtons) => void) => (
    <Dialog open onClose={() => { onClose(<></>); if (onResult) onResult(MsgBoxButtons.No) }}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
            <Stack sx={{ mt: 2 }} direction='row' alignItems='center'>
                <HelpOutline fontSize='large' color='primary' />
                <Box sx={{ width: '12px' }} />
                <Typography>{message}</Typography>
            </Stack>
        </DialogContent>
        <DialogActions sx={{ p: '4px 4px' }}>
            <Button onClick={() => { onClose(<></>); if (onResult) onResult(MsgBoxButtons.Yes) }}>yes</Button>
            <Button onClick={() => { onClose(<></>); if (onResult) onResult(MsgBoxButtons.No) }}>no</Button>
        </DialogActions>
    </Dialog>
)
