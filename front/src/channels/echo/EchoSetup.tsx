import React, { useRef, useState } from 'react'
import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, TextField } from '@mui/material'
import { ISetupProps } from '../IChannel'
import { IEchoInstanceConfig, IEchoConfig, EchoInstanceConfig, EchoConfig } from './EchoConfig'
import { Science } from '@mui/icons-material'

const EchoIcon = <Science />

const EchoSetup: React.FC<ISetupProps> = (props:ISetupProps) => {
    let echoInstanceConfig:IEchoInstanceConfig = props.setupConfig?.channelInstanceConfig || new EchoInstanceConfig()
    let echoConfig:IEchoConfig = props.setupConfig?.channelConfig || new EchoConfig()

    const [interval, setInterval] = useState(echoInstanceConfig.interval)
    const [maxLines, setMaxLines] = useState(echoConfig.maxLines)
    const defaultRef = useRef<HTMLInputElement|null>(null)

    const ok = () => {
        echoConfig.maxLines = maxLines
        echoInstanceConfig.interval = interval
        props.onChannelSetupClosed(props.channel,
        {
            channelId: props.channel.channelId,
            channelConfig: echoConfig,
            channelInstanceConfig: echoInstanceConfig
        }, true, defaultRef.current?.checked || false)
    }

    const cancel = () => {
        props.onChannelSetupClosed(props.channel, 
        {
            channelId: props.channel.channelId,
            channelConfig: undefined,
            channelInstanceConfig:undefined
        }, false, false)
    }

    return (<>
        <Dialog open={true} maxWidth={false} sx={{'& .MuiDialog-paper': { width: '25vw', maxWidth: '40vw', height:'40vh', maxHeight:'40vh' } }}>
            <DialogTitle>Configure Echo channel</DialogTitle>
            <DialogContent >
                <Stack direction={'column'} spacing={2} sx={{m:1}}>
                    <TextField value={maxLines} onChange={(e) => setMaxLines(+e.target.value)} type='number' variant='standard' label='Max lines' fullWidth/>
                    <TextField value={interval} onChange={(e) => setInterval(+e.target.value)} type='number' variant='standard' label='Interval' fullWidth/>
                </Stack>
            </DialogContent>
            <DialogActions>
                <FormControlLabel control={<Checkbox slotProps={{ input: { ref: defaultRef } }}/>} label='Set as default' sx={{width:'100%', ml:'8px'}}/>
                <Button onClick={ok}>OK</Button>
                <Button onClick={cancel}>CANCEL</Button>
            </DialogActions>
        </Dialog>
    </>)
}

export { EchoSetup, EchoIcon }
