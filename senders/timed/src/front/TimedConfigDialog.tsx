import React, { useEffect, useState } from 'react'
import {
    Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
    DialogTitle, Divider, FormControl, IconButton, InputLabel,
    MenuItem, Select, Stack, TextField, Tooltip, Typography
} from '@mui/material'
import { ContentCopy } from '@mui/icons-material'
import { Add, Delete } from '@mui/icons-material'

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function authGet(accessString: string): RequestInit {
    return { headers: { Authorization: accessString ? `Bearer ${accessString}` : '', 'X-Kwirth-App': 'true' } }
}

function authDelete(accessString: string): RequestInit {
    return { method: 'DELETE', headers: { Authorization: accessString ? `Bearer ${accessString}` : '', 'X-Kwirth-App': 'true' } }
}

function authPost(accessString: string, body: string): RequestInit {
    return {
        method: 'POST', body,
        headers: { Authorization: accessString ? `Bearer ${accessString}` : '', 'X-Kwirth-App': 'true', 'Content-Type': 'application/json' },
    }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ITimedRule {
    from: string
    to: string
    days?: number[]
    action: 'send' | 'drop'
}

interface ITimedConfig {
    name: string
    description?: string
    timezone?: string
    rules: ITimedRule[]
    defaultAction?: 'send' | 'drop'
}

interface ITimedConfigDialogProps {
    onClose: () => void
    backendUrl: string
    accessString: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIMEZONES = [
    'UTC',
    'Europe/London', 'Europe/Dublin', 'Europe/Lisbon',
    'Europe/Madrid', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome', 'Europe/Amsterdam',
    'Europe/Brussels', 'Europe/Vienna', 'Europe/Zurich', 'Europe/Stockholm', 'Europe/Oslo',
    'Europe/Copenhagen', 'Europe/Helsinki', 'Europe/Warsaw', 'Europe/Prague', 'Europe/Budapest',
    'Europe/Bucharest', 'Europe/Athens', 'Europe/Istanbul', 'Europe/Kiev', 'Europe/Moscow',
    'America/New_York', 'America/Toronto', 'America/Montreal',
    'America/Chicago', 'America/Winnipeg',
    'America/Denver', 'America/Edmonton',
    'America/Los_Angeles', 'America/Vancouver',
    'America/Phoenix', 'America/Anchorage', 'America/Honolulu',
    'America/Mexico_City', 'America/Bogota', 'America/Lima',
    'America/Santiago', 'America/Buenos_Aires', 'America/Sao_Paulo',
    'America/Caracas', 'America/Halifax', 'America/St_Johns',
    'Asia/Jerusalem', 'Asia/Beirut', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Tehran',
    'Asia/Karachi', 'Asia/Kolkata', 'Asia/Colombo', 'Asia/Dhaka',
    'Asia/Bangkok', 'Asia/Jakarta', 'Asia/Singapore', 'Asia/Kuala_Lumpur',
    'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Taipei',
    'Asia/Seoul', 'Asia/Tokyo',
    'Africa/Casablanca', 'Africa/Lagos', 'Africa/Nairobi', 'Africa/Johannesburg', 'Africa/Cairo',
    'Australia/Perth', 'Australia/Adelaide', 'Australia/Darwin',
    'Australia/Brisbane', 'Australia/Sydney', 'Australia/Melbourne',
    'Pacific/Auckland', 'Pacific/Fiji', 'Pacific/Honolulu',
]

function tzOffset(tz: string): string {
    try {
        const part = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' })
            .formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? ''
        return part.replace('GMT', 'UTC')
    } catch { return '' }
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function emptyRule(): ITimedRule {
    return { from: '09:00', to: '18:00', action: 'send' }
}

function emptyConfig(): ITimedConfig {
    return { name: '', rules: [], defaultAction: 'drop' }
}

// ─── Rule editor row ──────────────────────────────────────────────────────────

const RuleRow: React.FC<{
    rule: ITimedRule
    onChange: (rule: ITimedRule) => void
    onDelete: () => void
}> = ({ rule, onChange, onDelete }) => {
    const allDays = [0, 1, 2, 3, 4, 5, 6]
    const selectedDays = rule.days ?? allDays

    return (
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 1, py: 0.75, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Stack direction='row' spacing={1} alignItems='center' sx={{ flex: 1 }}>
                <TextField size='small' label='From' type='time' sx={{ width: 110 }}
                    value={rule.from} onChange={e => onChange({ ...rule, from: e.target.value })}
                    InputLabelProps={{ shrink: true }} />
                <TextField size='small' label='To' type='time' sx={{ width: 110 }}
                    value={rule.to} onChange={e => onChange({ ...rule, to: e.target.value })}
                    InputLabelProps={{ shrink: true }} />
                <FormControl size='small' sx={{ minWidth: 110, flexShrink: 0 }}>
                    <InputLabel>Action</InputLabel>
                    <Select label='Action' value={rule.action}
                        onChange={e => onChange({ ...rule, action: e.target.value as 'send' | 'drop' })}>
                        <MenuItem value='drop'><Chip label='drop' size='small' color='error' sx={{ fontSize: 10, height: 18 }} /></MenuItem>
                        <MenuItem value='send'><Chip label='send' size='small' color='success' sx={{ fontSize: 10, height: 18 }} /></MenuItem>
                    </Select>
                </FormControl>
                <FormControl size='small' sx={{ flex: 1, minWidth: 160 }}>
                    <InputLabel>Days</InputLabel>
                    <Select
                        multiple label='Days'
                        value={selectedDays}
                        onChange={e => {
                            const val = e.target.value as number[]
                            onChange({ ...rule, days: val.length === 0 || val.length === 7 ? undefined : [...val].sort((a, b) => a - b) })
                        }}
                        renderValue={sel => {
                            const days = sel as number[]
                            return days.length === 7 ? 'All days' : days.map(d => DAY_LABELS[d]).join(', ')
                        }}
                    >
                        {DAY_LABELS.map((label, i) => (
                            <MenuItem key={i} value={i} sx={{ py: 0.25 }}>
                                <Checkbox checked={selectedDays.includes(i)} size='small' sx={{ p: 0.25 }} />
                                <Typography variant='body2'>{label}</Typography>
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Stack>
            <IconButton size='small' color='error' onClick={onDelete} sx={{ alignSelf: 'center', flexShrink: 0 }}>
                <Delete fontSize='small' />
            </IconButton>
        </Box>
    )
}

// ─── Config form ──────────────────────────────────────────────────────────────

const ConfigForm: React.FC<{
    config: ITimedConfig
    onChange: (config: ITimedConfig) => void
}> = ({ config, onChange }) => {
    const updateRule = (i: number, rule: ITimedRule) => {
        const rules = [...config.rules]
        rules[i] = rule
        onChange({ ...config, rules })
    }

    const deleteRule = (i: number) => {
        onChange({ ...config, rules: config.rules.filter((_, idx) => idx !== i) })
    }

    const addRule = () => {
        onChange({ ...config, rules: [...config.rules, emptyRule()] })
    }

    return (
        <Stack spacing={2}>
            <Stack direction='row' spacing={1} alignItems='center'>
                <TextField
                    size='small' label='Name *' value={config.name}
                    onChange={e => onChange({ ...config, name: e.target.value })}
                    sx={{ flex: 2 }}
                />
                <FormControl size='small' sx={{ flex: 2 }}>
                    <InputLabel>Timezone</InputLabel>
                    <Select label='Timezone' value={config.timezone ?? ''}
                        onChange={e => onChange({ ...config, timezone: e.target.value || undefined })}>
                        <MenuItem value=''><em>Server local</em></MenuItem>
                        {TIMEZONES.map(tz => {
                            const off = tzOffset(tz)
                            return <MenuItem key={tz} value={tz}>{tz}{off ? ` (${off})` : ''}</MenuItem>
                        })}
                    </Select>
                </FormControl>
                <FormControl size='small' sx={{ minWidth: 110, flexShrink: 0 }}>
                    <InputLabel>Default</InputLabel>
                    <Select label='Default' value={config.defaultAction ?? 'drop'}
                        onChange={e => onChange({ ...config, defaultAction: e.target.value as 'send' | 'drop' })}>
                        <MenuItem value='drop'><Chip label='drop' size='small' color='error' sx={{ fontSize: 10, height: 18 }} /></MenuItem>
                        <MenuItem value='send'><Chip label='send' size='small' color='success' sx={{ fontSize: 10, height: 18 }} /></MenuItem>
                    </Select>
                </FormControl>
            </Stack>

            <TextField size='small' label='Description' value={config.description ?? ''}
                onChange={e => onChange({ ...config, description: e.target.value || undefined })}
                fullWidth multiline maxRows={2} />

            <Divider><Typography variant='caption'>Rules (evaluated in order — first match wins)</Typography></Divider>

            {config.rules.length === 0 && (
                <Typography variant='body2' color='text.secondary'>No rules yet. Add one below.</Typography>
            )}
            {config.rules.map((rule, i) => (
                <RuleRow key={i} rule={rule}
                    onChange={r => updateRule(i, r)}
                    onDelete={() => deleteRule(i)}
                />
            ))}
            <Button size='small' startIcon={<Add />} onClick={addRule} sx={{ alignSelf: 'flex-start' }}>
                Add rule
            </Button>

        </Stack>
    )
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

const TimedConfigDialog: React.FC<ITimedConfigDialogProps> = ({ onClose, backendUrl, accessString }) => {
    const [configs, setConfigs] = useState<ITimedConfig[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [deletingName, setDeletingName] = useState<string | undefined>()
    const [showForm, setShowForm] = useState(false)
    const [formConfig, setFormConfig] = useState<ITimedConfig>(emptyConfig())
    const [originalFormName, setOriginalFormName] = useState<string | undefined>()
    const [error, setError] = useState<string | undefined>()

    useEffect(() => {
        fetch(`${backendUrl}/senders/timed/configs`, authGet(accessString))
            .then(r => r.json()).then(setConfigs).catch(() => {})
            .finally(() => setLoading(false))
    }, [])

    const saveConfig = async () => {
        const trimmed = formConfig.name.trim()
        if (!trimmed) { setError('Name is required'); return }
        setSaving(true)
        setError(undefined)
        try {
            const payload = { ...formConfig, name: trimmed }
            const res = await fetch(`${backendUrl}/senders/timed/configs`, authPost(accessString, JSON.stringify(payload)))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            if (originalFormName && originalFormName !== trimmed) {
                await fetch(`${backendUrl}/senders/timed/configs/${encodeURIComponent(originalFormName)}`, authDelete(accessString))
            }
            setConfigs(prev => {
                const withoutOld = originalFormName && originalFormName !== trimmed
                    ? prev.filter(c => c.name !== originalFormName)
                    : prev
                const idx = withoutOld.findIndex(c => c.name === trimmed)
                return idx >= 0 ? withoutOld.map((c, i) => i === idx ? payload : c) : [...withoutOld, payload]
            })
            setOriginalFormName(trimmed)
            setFormConfig(payload)
        } catch (err) {
            setError(`Save failed: ${err}`)
        } finally {
            setSaving(false)
        }
    }

    const deleteConfig = async (name: string) => {
        setDeletingName(name)
        try {
            const res = await fetch(`${backendUrl}/senders/timed/configs/${encodeURIComponent(name)}`, authDelete(accessString))
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            setConfigs(prev => prev.filter(c => c.name !== name))
        } catch (err) {
            setError(`Delete failed: ${err}`)
        } finally {
            setDeletingName(undefined)
        }
    }

    const startAdd = () => {
        setFormConfig(emptyConfig())
        setOriginalFormName(undefined)
        setError(undefined)
        setShowForm(true)
    }

    const startEdit = (config: ITimedConfig) => {
        setFormConfig({ ...config })
        setOriginalFormName(config.name)
        setError(undefined)
        setShowForm(true)
    }

    const startClone = (config: ITimedConfig) => {
        setFormConfig({ ...config, name: `${config.name} (copy)` })
        setOriginalFormName(undefined)
        setError(undefined)
        setShowForm(true)
    }

    const configSummary = (c: ITimedConfig) => {
        const parts: string[] = []
        if (c.timezone) parts.push(c.timezone)
        if (c.rules.length > 0) parts.push(`${c.rules.length} rule(s)`)
        parts.push(`default: ${c.defaultAction ?? 'drop'}`)
        return parts.join(' · ')
    }

    return (
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '900px', height: '640px' } }}>
            <DialogTitle>Configure: Timed Sender</DialogTitle>
            <DialogContent sx={{ display: 'flex', gap: 2, p: '16px !important', overflow: 'hidden', height: '100%' }}>

                {/* Left — config list */}
                <Box sx={{ width: 190, display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                    <Typography variant='caption' color='text.secondary' fontWeight='bold'>Configs</Typography>
                    <Box sx={{ flex: 1, border: 1, borderColor: 'divider', borderRadius: 1, overflowY: 'auto' }}>
                        {loading
                            ? <Box sx={{ p: 1 }}><CircularProgress size={16} /></Box>
                            : configs.length === 0
                                ? <Typography variant='caption' color='text.disabled' sx={{ p: 1, display: 'block' }}>No configs yet.</Typography>
                                : configs.map(cfg => (
                                    <Box key={cfg.name} sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider', borderLeft: formConfig.name === cfg.name && showForm ? 3 : 0, borderLeftColor: 'primary.main', bgcolor: formConfig.name === cfg.name && showForm ? 'action.selected' : 'transparent' }}>
                                        <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', cursor: 'pointer' }} onClick={() => startEdit(cfg)}>
                                            <Typography variant='body2' fontWeight='bold' noWrap>{cfg.name}</Typography>
                                            <Typography variant='caption' color='text.secondary' noWrap display='block'>{configSummary(cfg)}</Typography>
                                        </Box>
                                        <Tooltip title='Delete'>
                                            <span>
                                                <IconButton size='small' color='error' disabled={deletingName === cfg.name} onClick={() => deleteConfig(cfg.name)}>
                                                    {deletingName === cfg.name ? <CircularProgress size={12} /> : <Delete sx={{ fontSize: 14 }} />}
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    </Box>
                                ))
                        }
                    </Box>
                    <Stack direction='row' spacing={0.5}>
                        <Button size='small' startIcon={<Add />} onClick={startAdd} sx={{ flex: 1 }}>New</Button>
                        <Button size='small' startIcon={<ContentCopy />} onClick={() => { const c = configs.find(x => x.name === formConfig.name && showForm); if (c) startClone(c) }} disabled={!showForm || !originalFormName} sx={{ flex: 1 }}>Clone</Button>
                    </Stack>
                </Box>

                <Divider orientation='vertical' flexItem />

                {/* Right — editor */}
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0, overflow: 'hidden' }}>
                    {showForm
                        ? <>
                            <Typography variant='caption' color='text.secondary' fontWeight='bold'>
                                {originalFormName ? `Editing: ${originalFormName}` : 'New config'}
                            </Typography>
                            <Box sx={{ flex: 1, overflowY: 'auto', pt: 1 }}>
                                <ConfigForm config={formConfig} onChange={setFormConfig} />
                            </Box>
                            <Stack direction='row' justifyContent='flex-end' alignItems='center' spacing={1}>
                                {error && <Typography variant='caption' color='error' sx={{ flex: 1 }}>{error}</Typography>}
                                <Button size='small' onClick={() => { setShowForm(false); setError(undefined) }}>Cancel</Button>
                                <Button size='small' variant='contained' disabled={saving || !formConfig.name.trim()} onClick={saveConfig}>
                                    {saving ? <CircularProgress size={14} /> : originalFormName ? 'Update' : 'Add'}
                                </Button>
                            </Stack>
                        </>
                        : <Box sx={{ m: 'auto', color: 'text.disabled' }}>
                            <Typography variant='body2'>Select a config to edit or click New.</Typography>
                        </Box>
                    }
                </Box>
            </DialogContent>
            <DialogActions sx={{ px: 2 }}>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    )
}

export { TimedConfigDialog }
export default TimedConfigDialog
