import React, { useEffect, useState } from 'react'
import {
    Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
    Divider, FormControl, IconButton, InputLabel, List, ListItem, ListItemButton,
    ListItemText, MenuItem, Select, Stack, TextField, Typography
} from '@mui/material'
import Add from '@mui/icons-material/Add'
import ArrowDownward from '@mui/icons-material/ArrowDownward'
import ArrowUpward from '@mui/icons-material/ArrowUpward'
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
interface IRule {
    regex: string
    flags?: string
    field?: 'subject' | 'body' | 'level' | 'to'
    action: 'send' | 'drop'
}
interface IConfig {
    name: string
    description?: string
    rules: IRule[]
    defaultAction?: 'send' | 'drop'
}

const FIELDS = ['subject', 'body', 'level', 'to']
const empty = (): IRule => ({ regex: '', flags: 'i', field: 'subject', action: 'drop' })

const FLAG_DEFS: { flag: string; desc: string }[] = [
    { flag: 'i', desc: 'case insensitive' },
    { flag: 'm', desc: 'multiline (^/$ per line)' },
    { flag: 's', desc: '. matches newline' },
    { flag: 'g', desc: 'global (all matches)' },
]

function flagsToArr(flags: string): string[] {
    return FLAG_DEFS.map(f => f.flag).filter(f => flags.includes(f))
}
function arrToFlags(arr: string[]): string {
    return FLAG_DEFS.map(f => f.flag).filter(f => arr.includes(f)).join('')
}

const RegexSenderDialog: React.FC<IProps> = ({ onClose, backendUrl, accessString }) => {
    const [configs, setConfigs] = useState<IConfig[]>([])
    const [selectedName, setSelectedName] = useState<string | undefined>()
    const [originalName, setOriginalName] = useState<string | undefined>()
    const [editName, setEditName] = useState('')
    const [editDescription, setEditDescription] = useState('')
    const [rules, setRules] = useState<IRule[]>([])
    const [defaultAction, setDefaultAction] = useState<'send' | 'drop'>('drop')
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState<string | undefined>()
    const [error, setError] = useState<string | undefined>()

    useEffect(() => { loadConfigs() }, [])

    const loadConfigs = async () => {
        try {
            const res = await fetch(`${backendUrl}/senders/regex/configs`, authGet(accessString))
            if (res.ok) { const data = await res.json(); setConfigs(Array.isArray(data) ? data : (data.configs ?? [])) }
        } catch {}
    }

    const selectConfig = (cfg: IConfig) => {
        setSelectedName(cfg.name); setOriginalName(cfg.name); setEditName(cfg.name)
        setEditDescription(cfg.description ?? '')
        setRules(cfg.rules.map(r => ({ ...r })))
        setDefaultAction(cfg.defaultAction ?? 'drop')
        setError(undefined)
    }

    const newConfig = () => {
        setSelectedName(undefined); setOriginalName(undefined); setEditName(''); setEditDescription(''); setRules([])
        setDefaultAction('drop')
        setError(undefined)
    }

    const cloneConfig = () => {
        if (!selectedName) return
        const base = configs.find(c => c.name === selectedName)
        if (!base) return
        setSelectedName(undefined); setOriginalName(undefined)
        setEditName(`${base.name} (copy)`); setEditDescription(base.description ?? '')
        setRules(base.rules.map(r => ({ ...r })))
        setDefaultAction(base.defaultAction ?? 'drop')
        setError(undefined)
    }

    const updateRule = (i: number, patch: Partial<IRule>) => {
        setRules(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
    }

    const moveRule = (i: number, dir: -1 | 1) => {
        const j = i + dir
        if (j < 0 || j >= rules.length) return
        setRules(prev => { const a = [...prev]; [a[i], a[j]] = [a[j], a[i]]; return a })
    }

    const save = async () => {
        const trimmed = editName.trim()
        if (!trimmed) return
        setSaving(true); setError(undefined)
        try {
            const payload: IConfig = { name: trimmed, ...(editDescription.trim() ? { description: editDescription.trim() } : {}), rules, defaultAction }
            const res = await fetch(`${backendUrl}/senders/regex/configs`, authPost(accessString, JSON.stringify(payload)))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            if (originalName && originalName !== trimmed) {
                await fetch(`${backendUrl}/senders/regex/configs/${encodeURIComponent(originalName)}`, authDelete(accessString))
            }
            setSelectedName(trimmed); setOriginalName(trimmed)
            await loadConfigs()
        } catch (err) { setError(`Save failed: ${err}`) }
        finally { setSaving(false) }
    }

    const deleteConfig = async (name: string) => {
        setDeleting(name)
        try {
            const res = await fetch(`${backendUrl}/senders/regex/configs/${encodeURIComponent(name)}`, authDelete(accessString))
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            if (selectedName === name) newConfig()
            await loadConfigs()
        } catch (err) { setError(`Delete failed: ${err}`) }
        finally { setDeleting(undefined) }
    }

    const isEditing = !!selectedName

    return (
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '860px', height: '600px' } }}>
            <DialogTitle>Configure: Regex Sender</DialogTitle>
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
                                            secondary={`${cfg.rules.length} rule${cfg.rules.length !== 1 ? 's' : ''}`}
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
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0, overflow: 'hidden' }}>
                    <Typography variant='caption' color='text.secondary' fontWeight='bold'>
                        {isEditing ? `Editing: ${selectedName}` : 'New config'}
                    </Typography>
                    <Stack direction='row' spacing={1} alignItems='center'>
                        <TextField size='small' label='Name *' value={editName}
                            onChange={e => setEditName(e.target.value)} sx={{ flex: 1 }} />
                        <FormControl size='small' sx={{ minWidth: 110, flexShrink: 0 }}>
                            <InputLabel>Default</InputLabel>
                            <Select label='Default' value={defaultAction} onChange={e => setDefaultAction(e.target.value as 'send' | 'drop')}>
                                <MenuItem value='drop'><Chip label='drop' size='small' color='error' sx={{ fontSize: 10, height: 18 }} /></MenuItem>
                                <MenuItem value='send'><Chip label='send' size='small' color='success' sx={{ fontSize: 10, height: 18 }} /></MenuItem>
                            </Select>
                        </FormControl>
                    </Stack>
                    <TextField size='small' label='Description' value={editDescription}
                        onChange={e => setEditDescription(e.target.value)} fullWidth multiline maxRows={2} />

                    {/* Rules list */}
                    <Divider><Typography variant='caption'>Rules (evaluated in order — first match wins)</Typography></Divider>
                    <Box sx={{ flex: 1, overflowY: 'auto' }}>
                        {rules.length === 0 && (
                            <Typography variant='caption' color='text.disabled' sx={{ p: 1, display: 'block' }}>No rules yet. Add one below.</Typography>
                        )}
                        {rules.map((rule, i) => (
                            <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '28px 1fr 85px 106px 96px 34px', gap: '6px', alignItems: 'center', px: 1, py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
                                {/* col 1: order buttons */}
                                <Stack direction='column' sx={{ flexShrink: 0 }}>
                                    <IconButton size='small' disabled={i === 0} onClick={() => moveRule(i, -1)} sx={{ p: 0.25 }}>
                                        <ArrowUpward sx={{ fontSize: 12 }} />
                                    </IconButton>
                                    <IconButton size='small' disabled={i === rules.length - 1} onClick={() => moveRule(i, 1)} sx={{ p: 0.25 }}>
                                        <ArrowDownward sx={{ fontSize: 12 }} />
                                    </IconButton>
                                </Stack>
                                {/* col 2: pattern */}
                                <TextField size='small' label='Pattern' value={rule.regex}
                                    onChange={e => updateRule(i, { regex: e.target.value })}
                                    inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }} />
                                {/* col 3: flags */}
                                <FormControl size='small'>
                                    <InputLabel>Flags</InputLabel>
                                    <Select
                                        multiple label='Flags'
                                        value={flagsToArr(rule.flags ?? 'i')}
                                        onChange={e => updateRule(i, { flags: arrToFlags(e.target.value as string[]) || undefined })}
                                        renderValue={sel => (sel as string[]).join('') || '—'}
                                    >
                                        {FLAG_DEFS.map(({ flag, desc }) => (
                                            <MenuItem key={flag} value={flag} sx={{ py: 0.5, alignItems: 'flex-start' }}>
                                                <Checkbox checked={flagsToArr(rule.flags ?? 'i').includes(flag)} size='small' sx={{ p: 0.25, mt: 0.25 }} />
                                                <Box>
                                                    <Typography variant='body2' fontWeight='bold' sx={{ lineHeight: 1.3 }}>{flag}</Typography>
                                                    <Typography sx={{ fontSize: 9, lineHeight: 1.2, color: 'text.secondary', display: 'block' }}>{desc}</Typography>
                                                </Box>
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                {/* col 4: field */}
                                <FormControl size='small'>
                                    <InputLabel>Field</InputLabel>
                                    <Select label='Field' value={rule.field ?? 'subject'} onChange={e => updateRule(i, { field: e.target.value as IRule['field'] })}>
                                        {FIELDS.map(f => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                                    </Select>
                                </FormControl>
                                {/* col 5: action */}
                                <FormControl size='small'>
                                    <InputLabel>Action</InputLabel>
                                    <Select label='Action' value={rule.action} onChange={e => updateRule(i, { action: e.target.value as 'send' | 'drop' })}>
                                        <MenuItem value='drop'><Chip label='drop' size='small' color='error' sx={{ fontSize: 10, height: 18 }} /></MenuItem>
                                        <MenuItem value='send'><Chip label='send' size='small' color='success' sx={{ fontSize: 10, height: 18 }} /></MenuItem>
                                    </Select>
                                </FormControl>
                                {/* col 6: delete */}
                                <IconButton size='small' color='error' onClick={() => setRules(prev => prev.filter((_, idx) => idx !== i))}>
                                    <Delete sx={{ fontSize: 14 }} />
                                </IconButton>

                            </Box>
                        ))}
                    </Box>

                    {/* Add rule + Add/Update */}
                    <Divider />
                    <Stack direction='row' spacing={1} alignItems='center'>
                        <Box sx={{ flex: 1 }} />
                        {error && <Typography variant='caption' color='error' sx={{ maxWidth: 160, textAlign: 'right' }}>{error}</Typography>}
                        <Button size='small' startIcon={<Add />} onClick={() => setRules(prev => [...prev, empty()])}>
                            Add rule
                        </Button>
                        <Button size='small' variant='contained' disabled={saving || !editName.trim()} onClick={save}>
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

export default RegexSenderDialog
