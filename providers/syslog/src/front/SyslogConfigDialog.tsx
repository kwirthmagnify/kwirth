import React, { useEffect, useState } from 'react'
import {
    Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
    DialogTitle, Divider, FormControl, IconButton, InputLabel, MenuItem,
    Select, Stack, TextField, Tooltip, Typography,
} from '@mui/material'
import { Add, Delete } from '@mui/icons-material'
import type { ISyslogConfig, ISyslogRelayTarget, TSyslogProtocol, TTcpFraming } from '../types/ISyslogMessage'

interface ISyslogConfigDialogProps {
    onClose: () => void
    backendUrl: string
    accessString: string
}

const authHeaders = (accessString: string) => ({
    Authorization: accessString ? `Bearer ${accessString}` : '',
    'Content-Type': 'application/json',
    'X-Kwirth-App': 'true',
})

const SyslogConfigDialog: React.FC<ISyslogConfigDialogProps> = ({ onClose, backendUrl, accessString }) => {
    const [config, setConfig] = useState<ISyslogConfig>({ port: 514, protocol: 'both', tcpFraming: 'non-transparent', relayTargets: [] })
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | undefined>()
    const [newRelay, setNewRelay] = useState<ISyslogRelayTarget>({ host: '', port: 514, protocol: 'udp' })
    const [addingRelay, setAddingRelay] = useState(false)

    useEffect(() => {
        const headers = { Authorization: accessString ? `Bearer ${accessString}` : '', 'X-Kwirth-App': 'true' }
        fetch(`${backendUrl}/syslog/config`, { headers })
            .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
            .then(data => setConfig(data))
            .catch(err => setError(`Failed to load config: ${err}`))
            .finally(() => setLoading(false))
    }, [])

    const save = async () => {
        setSaving(true)
        setError(undefined)
        try {
            const res = await fetch(`${backendUrl}/syslog/config`, {
                method: 'POST',
                headers: authHeaders(accessString),
                body: JSON.stringify(config),
            })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            onClose()
        } catch (err) {
            setError(`Failed to save: ${err}`)
        } finally {
            setSaving(false)
        }
    }

    const addRelay = () => {
        if (!newRelay.host.trim()) return
        setConfig(prev => ({ ...prev, relayTargets: [...prev.relayTargets, { ...newRelay }] }))
        setNewRelay({ host: '', port: 514, protocol: 'udp' })
        setAddingRelay(false)
    }

    const removeRelay = (idx: number) =>
        setConfig(prev => ({ ...prev, relayTargets: prev.relayTargets.filter((_, i) => i !== idx) }))

    const showTcpFraming = config.protocol === 'tcp' || config.protocol === 'both'

    return (
        <Dialog open maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '560px', height: '560px' } }}>
            <DialogTitle>Syslog Provider — Configuration</DialogTitle>
            <DialogContent sx={{ pt: '16px !important' }}>
                {loading
                    ? <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
                    : <Stack spacing={2.5}>

                        {/* Port + Protocol + TCP Framing */}
                        <Stack direction='row' spacing={2} alignItems='center' flexWrap='wrap' useFlexGap>
                            <TextField size='small' label='Port' type='number' value={config.port}
                                onChange={e => setConfig(prev => ({ ...prev, port: parseInt(e.target.value, 10) || 514 }))}
                                sx={{ width: 100 }} slotProps={{ htmlInput: { min: 1, max: 65535 } }} />

                            <FormControl size='small' sx={{ minWidth: 150 }}>
                                <InputLabel>Protocol</InputLabel>
                                <Select label='Protocol' value={config.protocol}
                                    onChange={e => setConfig(prev => ({ ...prev, protocol: e.target.value as TSyslogProtocol }))}>
                                    <MenuItem value='udp'>UDP only (RFC 5426)</MenuItem>
                                    <MenuItem value='tcp'>TCP only (RFC 6587)</MenuItem>
                                    <MenuItem value='both'>UDP + TCP</MenuItem>
                                </Select>
                            </FormControl>

                            {showTcpFraming && (
                                <FormControl size='small' sx={{ minWidth: 200 }}>
                                    <InputLabel>TCP Framing</InputLabel>
                                    <Select label='TCP Framing' value={config.tcpFraming}
                                        onChange={e => setConfig(prev => ({ ...prev, tcpFraming: e.target.value as TTcpFraming }))}>
                                        <MenuItem value='non-transparent'>Non-transparent (LF)</MenuItem>
                                        <MenuItem value='octet-counting'>Octet-counting</MenuItem>
                                    </Select>
                                </FormControl>
                            )}
                        </Stack>

                        <Divider />

                        {/* Relay targets */}
                        <Box>
                            <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 1 }}>
                                <Typography variant='subtitle2'>Relay targets</Typography>
                                <Tooltip title='Add relay target'>
                                    <IconButton size='small' onClick={() => setAddingRelay(true)} disabled={addingRelay}>
                                        <Add fontSize='small' />
                                    </IconButton>
                                </Tooltip>
                            </Stack>

                            {config.relayTargets.length === 0 && !addingRelay &&
                                <Typography variant='body2' color='text.secondary'>No relay targets configured.</Typography>
                            }

                            <Stack spacing={0.5}>
                                {config.relayTargets.map((t, i) => (
                                    <Stack key={i} direction='row' alignItems='center' spacing={1}
                                        sx={{ px: 1, py: 0.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                                        <Chip label={t.protocol.toUpperCase()} size='small'
                                            color={t.protocol === 'udp' ? 'info' : 'secondary'} sx={{ width: 48, flexShrink: 0 }} />
                                        <Typography variant='body2' sx={{ flex: 1 }}>{t.host}:{t.port}</Typography>
                                        <Tooltip title='Remove'>
                                            <IconButton size='small' color='error' onClick={() => removeRelay(i)}>
                                                <Delete fontSize='small' />
                                            </IconButton>
                                        </Tooltip>
                                    </Stack>
                                ))}

                                {addingRelay && (
                                    <Stack direction='row' alignItems='center' spacing={1}
                                        sx={{ px: 1, py: 1, border: 1, borderColor: 'primary.main', borderRadius: 1 }}>
                                        <FormControl size='small' sx={{ width: 80, flexShrink: 0 }}>
                                            <Select value={newRelay.protocol}
                                                onChange={e => setNewRelay(prev => ({ ...prev, protocol: e.target.value as 'udp' | 'tcp' }))}>
                                                <MenuItem value='udp'>UDP</MenuItem>
                                                <MenuItem value='tcp'>TCP</MenuItem>
                                            </Select>
                                        </FormControl>
                                        <TextField size='small' placeholder='Host / IP' value={newRelay.host}
                                            onChange={e => setNewRelay(prev => ({ ...prev, host: e.target.value }))}
                                            sx={{ flex: 1 }} />
                                        <TextField size='small' label='Port' type='number' value={newRelay.port}
                                            onChange={e => setNewRelay(prev => ({ ...prev, port: parseInt(e.target.value, 10) || 514 }))}
                                            sx={{ width: 80 }} slotProps={{ htmlInput: { min: 1, max: 65535 } }} />
                                        <Button size='small' variant='contained' onClick={addRelay}
                                            disabled={!newRelay.host.trim()}>Add</Button>
                                        <Button size='small' onClick={() => setAddingRelay(false)}>Cancel</Button>
                                    </Stack>
                                )}
                            </Stack>
                        </Box>
                    </Stack>
                }
            </DialogContent>
            <DialogActions>
                {error && <Typography variant='caption' color='error' sx={{ mr: 'auto', ml: 1 }}>{error}</Typography>}
                <Button variant='contained' disabled={saving || loading} onClick={save}>
                    {saving ? <CircularProgress size={14} /> : 'Save'}
                </Button>
                <Button onClick={onClose}>Cancel</Button>
            </DialogActions>
        </Dialog>
    )
}

export default SyslogConfigDialog
