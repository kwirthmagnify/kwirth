import React, { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Select, Stack, Typography } from '@mui/material'
import { ISetupProps, DialogTitleHelp as _DialogTitleHelp, pluginDocsUrl as _pluginDocsUrl } from '@kwirthmagnify/kwirth-common-front'

import { PacmanGhost } from './icons'
import { IPacmanConfig, PacmanConfig, PacmanInstanceConfig } from './PacmanConfig'
import { IPacmanInstanceConfig } from '../common/PacmanTypes'

/*
    Guarda de runtime: el global del core puede servir una version de common-front anterior a
    estos exports. Sin esto, DialogTitleHelp llegaria como undefined y React reventaria.
*/
const DialogTitleHelp: typeof _DialogTitleHelp = typeof _DialogTitleHelp === 'function'
    ? _DialogTitleHelp
    : (props) => <DialogTitle sx={props.sx} id={props.id}>{props.children}</DialogTitle>
const pluginDocsUrl: typeof _pluginDocsUrl = typeof _pluginDocsUrl === 'function'
    ? _pluginDocsUrl
    : () => ''

interface ISenderEntry {
    senderId: string
    configName: string
}

const entryKey = (senderId: string, configName: string): string => `${senderId} ${configName}`

export const PacmanIcon = <PacmanGhost />

export const PacmanSetup: React.FC<ISetupProps> = (props: ISetupProps) => {
    const pacmanInstanceConfig: IPacmanInstanceConfig = props.setupConfig?.channelInstanceConfig || new PacmanInstanceConfig()
    const pacmanConfig: IPacmanConfig = props.setupConfig?.channelConfig || new PacmanConfig()

    const [pauseOnBlur, setPauseOnBlur] = useState(pacmanConfig.pauseOnBlur)
    const [senderEntries, setSenderEntries] = useState<ISenderEntry[]>([])
    const [sender, setSender] = useState<string>(
        pacmanInstanceConfig.senderId && pacmanInstanceConfig.senderConfigName
            ? entryKey(pacmanInstanceConfig.senderId, pacmanInstanceConfig.senderConfigName)
            : '')
    const defaultRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
        const url = props.channelObject?.clusterUrl
        const token = props.channelObject?.accessString
        if (!url || !token) return
        fetch(`${url.replace(/\/+$/, '')}/core/senders`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then((data: { id: string, configNames?: string[] }[]) => {
                const entries: ISenderEntry[] = []
                for (const s of data) for (const configName of s.configNames ?? []) entries.push({ senderId: s.id, configName })
                setSenderEntries(entries)
            })
            .catch(() => { /* sin senders disponibles */ })
    }, [props.channelObject])

    const ok = () => {
        pacmanConfig.pauseOnBlur = pauseOnBlur
        const [senderId, senderConfigName] = sender ? sender.split(' ') : []
        pacmanInstanceConfig.senderId = senderId
        pacmanInstanceConfig.senderConfigName = senderConfigName
        props.onChannelSetupClosed(props.channel, {
            channelId: props.channel.channelId,
            channelConfig: pacmanConfig,
            channelInstanceConfig: pacmanInstanceConfig
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
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '28vw', maxWidth: '40vw' } }}>
            <DialogTitleHelp docsUrl={pluginDocsUrl(props.channelObject?.clusterUrl, 'pacman')} section='user/03-setup'>
                Configure Pac-Man channel
            </DialogTitleHelp>
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{ m: 1 }}>
                    <Stack direction='column' spacing={0.5}>
                        <Typography variant='caption' color='text.secondary'>Notify a sender when the record is beaten</Typography>
                        <Select value={sender} onChange={(e) => setSender(e.target.value)} size='small' variant='standard' displayEmpty>
                            <MenuItem value=''><em>Do not notify</em></MenuItem>
                            {senderEntries.map((entry) => (
                                <MenuItem key={entryKey(entry.senderId, entry.configName)} value={entryKey(entry.senderId, entry.configName)}>
                                    {entry.senderId} / {entry.configName}
                                </MenuItem>
                            ))}
                        </Select>
                    </Stack>
                    <FormControlLabel
                        control={<Checkbox checked={pauseOnBlur} onChange={(e) => setPauseOnBlur(e.target.checked)} />}
                        label='Pause when the tab loses focus'
                    />
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
