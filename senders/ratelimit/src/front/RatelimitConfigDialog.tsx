import React, { useEffect, useState } from 'react'
import {
    Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
    Divider, FormControl, IconButton, InputLabel, List, ListItem, ListItemButton,
    ListItemText, MenuItem, Select, Stack, TextField, Typography
} from '@mui/material'
import Add from '@mui/icons-material/Add'
import ContentCopy from '@mui/icons-material/ContentCopy'
import Delete from '@mui/icons-material/Delete'

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

type TUnit = 'sec' | 'min' | 'hour' | 'day'

interface IConfig {
    name: string
    description?: string
    limit: number
    interval: number
    unit: TUnit
}

const empty = (): IConfig => ({ name: '', limit: 10, interval: 1, unit: 'min' })

const UNIT_LABELS: Record<TUnit, string> = { sec: 'Seconds', min: 'Minutes', hour: 'Hours', day: 'Days' }

const RatelimitConfigDialog: React.FC<IProps> = ({ onClose, backendUrl, accessString }) => {
    const [configs, setConfigs] = useState<IConfig[]>([])
    const [selectedName, setSelectedName] = useState<string | undefined>()
    const [originalName, setOriginalName] = useState<string | undefined>()
    const [edit, setEdit] = useState<IConfig>(empty())
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState<string | undefined>()
    const [error, setError] = useState<string | undefined>()

    useEffect(() => { loadConfigs() }, [])

    const loadConfigs = async () => {
        try {
            const res = await fetch(`${backendUrl}/senders/ratelimit/configs`, authGet(accessString))
            if (res.ok) { const data = await res.json(); setConfigs(Array.isArray(data) ? data : (data.configs ?? [])) }
        } catch {}
    }

    const selectConfig = (cfg: IConfig) => {
        setSelectedName(cfg.name); setOriginalName(cfg.name)
        setEdit({ ...cfg })
        setError(undefined)
    }

    const newConfig = () => {
        setSelectedName(undefined); setOriginalName(undefined)
        setEdit(empty())
        setError(undefined)
    }

    const cloneConfig = () => {
        if (!selectedName) return
        const base = configs.find(c => c.name === selectedName)
        if (!base) return
        setSelectedName(undefined); setOriginalName(undefined)
        setEdit({ ...base, name: `${base.name} (copy)` })
        setError(undefined)
    }

    const save = async () => {
        const trimmed = edit.name.trim()
        if (!trimmed) return
        setSaving(true); setError(undefined)
        try {
            const payload: IConfig = { ...edit, name: trimmed }
            const res = await fetch(`${backendUrl}/senders/ratelimit/configs`, authPost(accessString, JSON.stringify(payload)))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            if (originalName && originalName !== trimmed) {
                await fetch(`${backendUrl}/senders/ratelimit/configs/${encodeURIComponent(originalName)}`, authDelete(accessString))
            }
            setSelectedName(trimmed); setOriginalName(trimmed)
            await loadConfigs()
        } catch (err) { setError(`Save failed: ${err}`) }
        finally { setSaving(false) }
    }

    const deleteConfig = async (name: string) => {
        setDeleting(name)
        try {
            const res = await fetch(`${backendUrl}/senders/ratelimit/configs/${encodeURIComponent(name)}`, authDelete(accessString))
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            if (selectedName === name) newConfig()
            await loadConfigs()
        } catch (err) { setError(`Delete failed: ${err}`) }
        finally { setDeleting(undefined) }
    }

    const isEditing = !!selectedName

    return (
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '620px', height: '480px' } }}>
            <DialogTitle>Configure: Rate Limit Sender</DialogTitle>
            <DialogContent sx={{ display: 'flex', gap: 2, p: '16px !important', overflow: 'hidden', height: '100%' }}>

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
                                            secondary={`${cfg.limit} / ${cfg.interval} ${cfg.unit}`}
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
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <Typography variant='caption' color='text.secondary' fontWeight='bold'>
                        {isEditing ? `Editing: ${selectedName}` : 'New config'}
                    </Typography>

                    <TextField size='small' label='Name *' value={edit.name}
                        onChange={e => setEdit(p => ({ ...p, name: e.target.value }))} fullWidth />

                    <TextField size='small' label='Description' value={edit.description ?? ''}
                        onChange={e => setEdit(p => ({ ...p, description: e.target.value }))} fullWidth />

                    <Divider><Typography variant='caption'>Rate limit</Typography></Divider>

                    <Stack direction='row' spacing={1}>
                        <TextField size='small' label='Max messages' type='number' value={edit.limit}
                            onChange={e => setEdit(p => ({ ...p, limit: Math.max(1, +e.target.value) }))}
                            sx={{ flex: 1 }} inputProps={{ min: 1 }} />
                        <TextField size='small' label='Per' type='number' value={edit.interval}
                            onChange={e => setEdit(p => ({ ...p, interval: Math.max(1, +e.target.value) }))}
                            sx={{ flex: 1 }} inputProps={{ min: 1 }} />
                        <FormControl size='small' sx={{ flex: 1 }}>
                            <InputLabel>Unit</InputLabel>
                            <Select label='Unit' value={edit.unit} onChange={e => setEdit(p => ({ ...p, unit: e.target.value as TUnit }))}>
                                {(Object.keys(UNIT_LABELS) as TUnit[]).map(u => (
                                    <MenuItem key={u} value={u}>{UNIT_LABELS[u]}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Stack>

                    <Typography variant='caption' color='text.secondary'>
                        Max {edit.limit} message{edit.limit !== 1 ? 's' : ''} per {edit.interval > 1 ? edit.interval + ' ' : ''}{UNIT_LABELS[edit.unit].toLowerCase().replace(/s$/, edit.interval > 1 ? 's' : '')}. Messages exceeding the limit are queued and delivered in the next window.
                    </Typography>

                    <Box sx={{ flex: 1 }} />

                    <Stack direction='row' spacing={1} alignItems='center' justifyContent='flex-end'>
                        {error && <Typography variant='caption' color='error'>{error}</Typography>}
                        <Button size='small' variant='contained' disabled={saving || !edit.name.trim()} onClick={save}>
                            {saving ? <CircularProgress size={14} /> : isEditing ? 'Update' : 'Add'}
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

export default RatelimitConfigDialog
