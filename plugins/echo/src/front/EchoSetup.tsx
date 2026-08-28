import React, { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material'
import { ISetupProps } from '@kwirthmagnify/kwirth-common-front'
import { IEchoConfig, EchoConfig } from './EchoConfig'
import { Science } from '@mui/icons-material'
import { IEchoInstanceConfig } from './EchoTypes'

export const EchoIcon = <Science />

interface ISenderEntry {
    senderId: string
    configName: string
}

export const EchoSetup: React.FC<ISetupProps> = (props: ISetupProps) => {
    const echoInstanceConfig: IEchoInstanceConfig = props.setupConfig?.channelInstanceConfig || new EchoConfig()
    const echoConfig: IEchoConfig = props.setupConfig?.channelConfig || new EchoConfig()

    const [interval, setInterval] = useState(echoInstanceConfig.interval)
    const [maxLines, setMaxLines] = useState(echoConfig.maxLines)
    const [senderEntries, setSenderEntries] = useState<ISenderEntry[]>([])
    const [selectedSender, setSelectedSender] = useState<string>(
        echoInstanceConfig.senderId && echoInstanceConfig.senderConfigName
            ? `${echoInstanceConfig.senderId}::${echoInstanceConfig.senderConfigName}`
            : ''
    )
    const defaultRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
        const url = props.channelObject.clusterUrl
        const token = props.channelObject.accessString
        if (!url || !token) return
        fetch(`${url}/senders`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then((data: Array<{ id: string; configNames: string[] }>) => {
                const entries: ISenderEntry[] = []
                for (const s of data) {
                    for (const cn of s.configNames ?? []) {
                        entries.push({ senderId: s.id, configName: cn })
                    }
                }
                setSenderEntries(entries)
            })
            .catch(() => {})
    }, [])

    const ok = () => {
        echoConfig.maxLines = maxLines
        echoInstanceConfig.interval = interval
        if (selectedSender) {
            const [sid, cn] = selectedSender.split('::')
            echoInstanceConfig.senderId = sid
            echoInstanceConfig.senderConfigName = cn
        } else {
            echoInstanceConfig.senderId = undefined
            echoInstanceConfig.senderConfigName = undefined
        }
        props.onChannelSetupClosed(props.channel, {
            channelId: props.channel.channelId,
            channelConfig: echoConfig,
            channelInstanceConfig: echoInstanceConfig
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
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '25vw', maxWidth: '40vw', height: '50vh', maxHeight: '50vh' } }}>
            <DialogTitle>Configure Echo channel</DialogTitle>
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{ m: 1 }}>
                    <TextField value={maxLines} onChange={(e) => setMaxLines(+e.target.value)} type='number' variant='standard' label='Max lines' fullWidth />
                    <TextField value={interval} onChange={(e) => setInterval(+e.target.value)} type='number' variant='standard' label='Interval' fullWidth />
                    <Stack direction='column' spacing={0.5}>
                        <Typography variant='caption' color='text.secondary'>Sender config</Typography>
                        <Select value={selectedSender} onChange={(e) => setSelectedSender(e.target.value)} displayEmpty size='small' variant='standard'>
                            <MenuItem value=''><Typography variant='body2' color='text.secondary'>(none)</Typography></MenuItem>
                            {senderEntries.map(e => (
                                <MenuItem key={`${e.senderId}::${e.configName}`} value={`${e.senderId}::${e.configName}`}>
                                    <Stack direction='row' spacing={1} alignItems='center'>
                                        <Chip label={e.senderId} size='small' variant='outlined' sx={{ fontSize: '0.65rem', height: 18 }} />
                                        <Typography variant='body2'>{e.configName}</Typography>
                                    </Stack>
                                </MenuItem>
                            ))}
                        </Select>
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions>
                <FormControlLabel control={<Checkbox slotProps={{ input: { ref: defaultRef } }} />} label='Set as default' sx={{ width: '100%', ml: '8px' }} />
                <Button variant='outlined' onClick={ok}>OK</Button>
                <Button variant='outlined' onClick={cancel}>CANCEL</Button>
            </DialogActions>
        </Dialog>
    )
}
