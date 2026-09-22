import React, { useRef, useState } from 'react'
import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, TextField, Typography } from '@mui/material'
import { ISetupProps } from '@kwirthmagnify/kwirth-common-front'
import { Send } from '@kwirthmagnify/kwirth-common-front/icons'
import { ISenderDebugConfig, SenderDebugConfig, SenderDebugInstanceConfig } from './SenderDebugConfig'
import { ISenderDebugInstanceConfig } from '../common/SenderDebugTypes'

export const SenderDebugIcon = <Send />

/**
 * El setup es deliberadamente corto: aqui solo esta lo que es configuracion del CANAL. El sender, la
 * configuracion y el mensaje se eligen en la pestaña, porque un banco de pruebas se usa enviando,
 * mirando, corrigiendo y volviendo a enviar — y esto no es 'modifiable', asi que tenerlo aqui
 * obligaria a parar y rearrancar la instancia por cada cambio de texto.
 */
export const SenderDebugSetup: React.FC<ISetupProps> = (props: ISetupProps) => {
    const instanceConfig: ISenderDebugInstanceConfig = props.setupConfig?.channelInstanceConfig || new SenderDebugInstanceConfig()
    const config: ISenderDebugConfig = props.setupConfig?.channelConfig || new SenderDebugConfig()

    const [maxHistory, setMaxHistory] = useState(config.maxHistory)
    const defaultRef = useRef<HTMLInputElement | null>(null)

    const invalidHistory = (): boolean => !Number.isFinite(maxHistory) || maxHistory < 1

    const ok = () => {
        config.maxHistory = maxHistory
        props.onChannelSetupClosed(props.channel, {
            channelId: props.channel.channelId,
            channelConfig: config,
            channelInstanceConfig: instanceConfig
        }, true, defaultRef.current?.checked || false)
    }

    const cancel = () => {
        props.onChannelSetupClosed(props.channel, {
            channelId: props.channel.channelId,
            channelConfig: undefined,
            channelInstanceConfig: undefined
        }, false, false)
    }

    return (
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '34vw', maxWidth: '34vw', height: '38vh', maxHeight: '38vh' } }}>
            <DialogTitle>Configure Sender Debug channel</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Stack direction='column' spacing={2} sx={{ m: 1, flex: 1, minHeight: 0 }}>
                    <Typography variant='body2' color='text.secondary'>
                        Pick the sender, its configuration and the message once the channel is started — everything is
                        in the tab itself, so you can send, look at the answer, fix it and send again without
                        restarting.
                    </Typography>
                    <Typography variant='caption' color='warning.main'>
                        Sending from this channel is a REAL send: a mail leaves, a ticket is created, a chat room gets
                        a message. There is no dry run, because a dry run would not prove anything.
                    </Typography>
                    <TextField value={maxHistory} onChange={(e) => setMaxHistory(+e.target.value)} type='number' variant='standard'
                        label='Max history' error={invalidHistory()}
                        helperText={invalidHistory() ? 'At least 1' : 'How many sends are kept in the tab history'} fullWidth />
                </Stack>
            </DialogContent>
            <DialogActions>
                <FormControlLabel control={<Checkbox slotProps={{ input: { ref: defaultRef } }} />} label='Set as default' sx={{ width: '100%', ml: '8px' }} />
                <Button variant='outlined' onClick={ok} disabled={invalidHistory()}>OK</Button>
                <Button variant='outlined' onClick={cancel}>CANCEL</Button>
            </DialogActions>
        </Dialog>
    )
}
