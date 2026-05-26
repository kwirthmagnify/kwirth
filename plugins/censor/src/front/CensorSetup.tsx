import React, { useCallback, useEffect, useState } from 'react'
import { FilterList, PlayArrow, Stop, Delete } from '@mui/icons-material'
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, List, ListItemButton, ListItemText, Tooltip, Typography } from '@mui/material'
import { ISetupProps } from '@kwirthmagnify/kwirth-common-front'
import { CensorConfig, ICensorConfig } from './CensorConfig'

const CensorIcon = <FilterList />

interface IDaemonInstance {
    id: string
    description?: string
    daemonId: string
    analyzing: boolean
}

const CensorSetup: React.FC<ISetupProps> = (props: ISetupProps) => {
    const initial: ICensorConfig = props.setupConfig?.channelConfig ?? new CensorConfig()
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(initial.selectedSessionId ?? null)
    const [instances, setInstances] = useState<IDaemonInstance[]>([])
    const [loading, setLoading] = useState(false)

    const url = props.channelObject.clusterUrl
    const token = props.channelObject.accessString

    const fetchInstances = useCallback(() => {
        if (!url || !token) return
        setLoading(true)
        fetch(`${url}/daemons/instances?daemonId=censor`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then((data: IDaemonInstance[]) => {
                setInstances(data)
                setLoading(false)
                setSelectedSessionId(prev => prev && !data.some(d => d.id === prev) ? null : prev)
            })
            .catch(() => { setLoading(false); setSelectedSessionId(null) })
    }, [url, token])

    useEffect(() => { fetchInstances() }, [fetchInstances])

    const toggleAnalyze = async (inst: IDaemonInstance, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!url || !token) return
        await fetch(`${url}/daemons/instances/${inst.id}/analyze`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ analyzing: !inst.analyzing })
        })
        fetchInstances()
    }

    const deleteSession = async (inst: IDaemonInstance, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!url || !token) return
        await fetch(`${url}/daemons/instances/${inst.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        })
        setSelectedSessionId(prev => prev === inst.id ? null : prev)
        fetchInstances()
    }

    const handleStart = () => {
        const config: ICensorConfig = { maxLines: initial.maxLines ?? 1000, selectedSessionId }
        props.onChannelSetupClosed(props.channel, { channelId: 'censor', channelConfig: config, channelInstanceConfig: {} }, true, false)
    }

    const handleCancel = () => {
        props.onChannelSetupClosed(props.channel, { channelId: 'censor', channelConfig: initial, channelInstanceConfig: {} }, false, false)
    }

    return (
        <Dialog open={true} PaperProps={{ sx: { width: 480, height: 400 } }}>
            <DialogTitle>Censor — session</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 1 }}>
                <Typography variant='body2' color='text.secondary'>
                    Select a session to connect to, or start without one.
                </Typography>
                {loading
                    ? <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}><CircularProgress size={24} /></Box>
                    : <Box sx={{ flex: 1, border: 1, borderColor: 'divider', borderRadius: 1, overflowY: 'auto' }}>
                        <List dense disablePadding>
                            <ListItemButton selected={selectedSessionId === null} onClick={() => setSelectedSessionId(null)}>
                                <ListItemText primary='No session' primaryTypographyProps={{ color: 'text.secondary', fontStyle: 'italic' }} />
                            </ListItemButton>
                            {instances.map(inst => (
                                <ListItemButton key={inst.id} selected={selectedSessionId === inst.id} onClick={() => setSelectedSessionId(inst.id)}>
                                    <ListItemText
                                        primary={inst.description || inst.id}
                                        secondary={inst.id}
                                        secondaryTypographyProps={{ sx: { fontSize: 10, fontFamily: 'monospace' } }} />
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1 }}>
                                        <Tooltip title={inst.analyzing ? 'Stop analyzing' : 'Start analyzing'}>
                                            <IconButton size='small' onClick={e => toggleAnalyze(inst, e)}
                                                color={inst.analyzing ? 'success' : 'default'}>
                                                {inst.analyzing ? <Stop sx={{ fontSize: 16 }} /> : <PlayArrow sx={{ fontSize: 16 }} />}
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title='Delete session'>
                                            <IconButton size='small' color='error' onClick={e => deleteSession(inst, e)}>
                                                <Delete sx={{ fontSize: 16 }} />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                </ListItemButton>
                            ))}
                        </List>
                    </Box>
                }
            </DialogContent>
            <DialogActions>
                <Button onClick={handleCancel} color='inherit'>Cancel</Button>
                <Button onClick={handleStart} variant='contained'>Start</Button>
            </DialogActions>
        </Dialog>
    )
}

export { CensorSetup, CensorIcon }
