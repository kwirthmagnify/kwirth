import React, { useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material'
import { ISetupProps } from '@kwirthmagnify/kwirth-common-front'
import { Forum } from '@mui/icons-material'
import { MircConfig, MircInstanceConfig } from './MircConfig'
import { IMircInstanceConfig } from './MircTypes'

export const MircIcon = <Forum />

const NICK_KEY = 'kwirth.mirc.nick'

export const MircSetup: React.FC<ISetupProps> = (props: ISetupProps) => {
    const instanceConfig: IMircInstanceConfig = props.setupConfig?.channelInstanceConfig || new MircInstanceConfig()
    const config = props.setupConfig?.channelConfig || new MircConfig()

    const [nick, setNick] = useState<string>(instanceConfig.nick || localStorage.getItem(NICK_KEY) || '')

    const ok = () => {
        const clean = nick.trim()
        instanceConfig.nick = clean
        if (clean) localStorage.setItem(NICK_KEY, clean)
        props.onChannelSetupClosed(props.channel, {
            channelId: props.channel.channelId,
            channelConfig: config,
            channelInstanceConfig: instanceConfig
        }, Boolean(clean), false)
    }

    const cancel = () => {
        props.onChannelSetupClosed(props.channel, {
            channelId: props.channel.channelId,
            channelConfig: undefined,
            channelInstanceConfig: undefined
        }, false, false)
    }

    return (
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '25vw', maxWidth: '40vw' } }}>
            <DialogTitle>Configure mIRC channel</DialogTitle>
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{ m: 1 }}>
                    <Typography variant='caption' color='text.secondary'>
                        Your nick is how other users see you across all clusters you can reach.
                    </Typography>
                    <TextField value={nick} onChange={(e) => setNick(e.target.value)} variant='standard' label='Nick' fullWidth autoFocus />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button variant='outlined' onClick={ok} disabled={!nick.trim()}>OK</Button>
                <Button variant='outlined' onClick={cancel}>CANCEL</Button>
            </DialogActions>
        </Dialog>
    )
}
