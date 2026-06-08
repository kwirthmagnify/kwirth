import React, { useEffect, useState } from 'react'
import {
    Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
    Divider, FormControl, IconButton, InputLabel, List, ListItem, ListItemButton,
    ListItemText, MenuItem, Select, Stack, TextField, Tooltip, Typography
} from '@mui/material'
import { Add, ContentCopy, Delete } from '@mui/icons-material'

function authGet(token: string): RequestInit {
    return { headers: { Authorization: token ? `Bearer ${token}` : '', 'X-Kwirth-App': 'true' } }
}
function authPost(token: string, body: string): RequestInit {
    return { method: 'POST', body, headers: { Authorization: token ? `Bearer ${token}` : '', 'X-Kwirth-App': 'true', 'Content-Type': 'application/json' } }
}
function authDelete(token: string): RequestInit {
    return { method: 'DELETE', headers: { Authorization: token ? `Bearer ${token}` : '', 'X-Kwirth-App': 'true' } }
}

interface IProps { onClose: () => void; backendUrl: string; accessString: string }
interface IConfig { name: string; description?: string; targets: { senderId: string; configName: string }[] }
interface ISender { id: string; displayName?: string; configNames: string[] }

const TeeSenderDialog: React.FC<IProps> = ({ onClose, backendUrl, accessString }) => {
    const [configs, setConfigs] = useState<IConfig[]>([])
    const [senders, setSenders] = useState<ISender[]>([])
    const [selectedName, setSelectedName] = useState<string | undefined>()
    const [originalName, setOriginalName] = useState<string | undefined>()
    const [editName, setEditName] = useState('')
    const [editDescription, setEditDescription] = useState('')
    const [targets, setTargets] = useState<{ senderId: string; configName: string }[]>([])
    const [newSenderId, setNewSenderId] = useState('')
    const [newConfigName, setNewConfigName] = useState('')
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState<string | undefined>()
    const [error, setError] = useState<string | undefined>()

    useEffect(() => { loadConfigs(); loadSenders() }, [])

    const loadConfigs = async () => {
        try {
            const res = await fetch(`${backendUrl}/senders/tee/configs`, authGet(accessString))
            if (res.ok) { const data = await res.json(); setConfigs(Array.isArray(data) ? data : (data.configs ?? [])) }
        } catch {}
    }

    const loadSenders = async () => {
        try {
            const res = await fetch(`${backendUrl}/senders`, authGet(accessString))
            if (res.ok) setSenders((await res.json() as ISender[]).filter(s => s.id !== 'tee'))
        } catch {}
    }

    const selectConfig = (cfg: IConfig) => {
        setSelectedName(cfg.name); setOriginalName(cfg.name)
        setEditName(cfg.name); setEditDescription(cfg.description ?? '')
        setTargets([...cfg.targets])
        setNewSenderId(''); setNewConfigName(''); setError(undefined)
    }

    const newConfig = () => {
        setSelectedName(undefined); setOriginalName(undefined)
        setEditName(''); setEditDescription(''); setTargets([])
        setNewSenderId(''); setNewConfigName(''); setError(undefined)
    }

    const cloneConfig = () => {
        if (!selectedName) return
        const base = configs.find(c => c.name === selectedName)
        if (!base) return
        setSelectedName(undefined); setOriginalName(undefined)
        setEditName(`${base.name} (copy)`); setEditDescription(base.description ?? '')
        setTargets([...base.targets])
        setNewSenderId(''); setNewConfigName(''); setError(undefined)
    }

    const addTarget = () => {
        if (!newSenderId || !newConfigName) return
        if (targets.some(t => t.senderId === newSenderId && t.configName === newConfigName)) return
        setTargets(prev => [...prev, { senderId: newSenderId, configName: newConfigName }])
        setNewSenderId(''); setNewConfigName('')
    }

    const save = async () => {
        const trimmed = editName.trim()
        if (!trimmed) return
        setSaving(true); setError(undefined)
        try {
            const res = await fetch(`${backendUrl}/senders/tee/configs`, authPost(accessString, JSON.stringify({ name: trimmed, ...(editDescription.trim() ? { description: editDescription.trim() } : {}), targets })))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            if (originalName && originalName !== trimmed) {
                await fetch(`${backendUrl}/senders/tee/configs/${encodeURIComponent(originalName)}`, authDelete(accessString))
            }
            setSelectedName(trimmed); setOriginalName(trimmed)
            await loadConfigs()
        } catch (err) { setError(`Save failed: ${err}`) }
        finally { setSaving(false) }
    }

    const deleteConfig = async (name: string) => {
        setDeleting(name)
        try {
            const res = await fetch(`${backendUrl}/senders/tee/configs/${encodeURIComponent(name)}`, authDelete(accessString))
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            if (selectedName === name) newConfig()
            await loadConfigs()
        } catch (err) { setError(`Delete failed: ${err}`) }
        finally { setDeleting(undefined) }
    }

    const newSenderConfigs = senders.find(s => s.id === newSenderId)?.configNames ?? []

    return (
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '700px', height: '520px' } }}>
            <DialogTitle>Configure: Tee Sender</DialogTitle>
            <DialogContent sx={{ display: 'flex', gap: 2, p: 2, pt: 2, overflow: 'hidden', height: '100%' }}>

                {/* Left — config list */}
                <Box sx={{ width: 190, display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                    <Typography variant='caption' color='text.secondary' fontWeight='bold'>Configs</Typography>
                    <Box sx={{ flex: 1, border: 1, borderColor: 'divider', borderRadius: 1, overflowY: 'auto' }}>
                        <List dense disablePadding>
                            {configs.map(cfg => (
                                <ListItem key={cfg.name} disablePadding secondaryAction={
                                    <IconButton size='small' color='error' disabled={deleting === cfg.name} onClick={() => deleteConfig(cfg.name)}>
                                        {deleting === cfg.name ? <CircularProgress size={12} /> : <Delete sx={{ fontSize: 14 }} />}
                                    </IconButton>
                                }>
                                    <ListItemButton selected={selectedName === cfg.name} onClick={() => selectConfig(cfg)} dense sx={{ pr: 4 }}>
                                        <ListItemText
                                            primary={cfg.name}
                                            secondary={`${cfg.targets.length} target${cfg.targets.length !== 1 ? 's' : ''}`}
                                            primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                                            secondaryTypographyProps={{ variant: 'caption' }} />
                                    </ListItemButton>
                                </ListItem>
                            ))}
                        </List>
                    </Box>
                    <Stack direction='row' spacing={0.5}>
                        <Button size='small' startIcon={<Add />} onClick={newConfig} sx={{ flex: 1 }}>New</Button>
                        <Button size='small' startIcon={<ContentCopy />} onClick={cloneConfig} disabled={!selectedName} sx={{ flex: 1 }}>Clone</Button>
                    </Stack>
                </Box>

                <Divider orientation='vertical' flexItem />

                {/* Right — editor */}
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0, pt: 1 }}>
                    <Typography variant='caption' color='text.secondary' fontWeight='bold'>
                        {selectedName ? `Editing: ${selectedName}` : 'New config'}
                    </Typography>
                    <TextField size='small' label='Name *' value={editName}
                        onChange={e => setEditName(e.target.value)} fullWidth />
                    <TextField size='small' label='Description' value={editDescription}
                        onChange={e => setEditDescription(e.target.value)} fullWidth multiline maxRows={2} />

                    <Typography variant='caption' color='text.secondary' fontWeight='bold'>Targets</Typography>

                    <Box sx={{ flex: 1, border: 1, borderColor: 'divider', borderRadius: 1, overflowY: 'auto' }}>
                        {targets.length === 0
                            ? <Typography variant='caption' color='text.disabled' sx={{ p: 1, display: 'block' }}>No targets yet.</Typography>
                            : targets.map((t, i) => (
                                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
                                    <Typography variant='body2' sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.senderId}</Typography>
                                    <Typography variant='body2' color='text.secondary' sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.configName}</Typography>
                                    <IconButton size='small' color='error' onClick={() => setTargets(prev => prev.filter((_, idx) => idx !== i))}>
                                        <Delete sx={{ fontSize: 14 }} />
                                    </IconButton>
                                </Box>
                            ))
                        }
                    </Box>

                    <Stack direction='row' spacing={1} alignItems='center'>
                        <FormControl size='small' sx={{ flex: 1 }}>
                            <InputLabel>Sender</InputLabel>
                            <Select label='Sender' value={newSenderId} onChange={e => { setNewSenderId(e.target.value); setNewConfigName('') }}>
                                {senders.map(s => <MenuItem key={s.id} value={s.id}>{s.displayName || s.id}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <FormControl size='small' sx={{ flex: 1 }} disabled={!newSenderId}>
                            <InputLabel>Config</InputLabel>
                            <Select label='Config' value={newConfigName} onChange={e => setNewConfigName(e.target.value)}>
                                {newSenderConfigs.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <Tooltip title='Add target'>
                            <span>
                                <IconButton size='small' color='primary' disabled={!newSenderId || !newConfigName} onClick={addTarget}>
                                    <Add />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Stack>

                    <Stack direction='row' justifyContent='flex-end' alignItems='center' spacing={1}>
                        {error && <Typography variant='caption' color='error' sx={{ flex: 1 }}>{error}</Typography>}
                        <Button size='small' variant='contained' disabled={saving || !editName.trim()} onClick={save}>
                            {saving ? <CircularProgress size={14} /> : selectedName ? 'Update' : 'Add'}
                        </Button>
                    </Stack>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button size='small' onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    )
}

export default TeeSenderDialog
