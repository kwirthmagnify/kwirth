import React, { useEffect, useState } from 'react'
import {
    Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent,
    DialogTitle, Divider, FormControl, FormControlLabel, IconButton, InputLabel,
    MenuItem, Select, Stack, TextField, Tooltip, Typography
} from '@mui/material'
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
    senderId?: string
    configName?: string
}

interface ITimedConfig {
    name: string
    timezone?: string
    rules: ITimedRule[]
    defaultAction?: 'send' | 'drop'
    defaultSenderId?: string
    defaultConfigName?: string
}

interface IInstalledSender {
    id: string
    displayName?: string
    configNames: string[]
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
    senders: IInstalledSender[]
    onChange: (rule: ITimedRule) => void
    onDelete: () => void
}> = ({ rule, senders, onChange, onDelete }) => {
    const linkedSender = senders.find(s => s.id === rule.senderId)
    const configNames = linkedSender?.configNames ?? []

    const toggleDay = (day: number) => {
        const days = rule.days ?? []
        const next = days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort()
        onChange({ ...rule, days: next.length === 0 ? undefined : next })
    }

    return (
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5, mb: 1 }}>
            <Stack direction='row' spacing={1} alignItems='center' flexWrap='wrap' useFlexGap>
                <TextField
                    size='small' label='From' type='time' sx={{ width: 110 }}
                    value={rule.from}
                    onChange={e => onChange({ ...rule, from: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                />
                <TextField
                    size='small' label='To' type='time' sx={{ width: 110 }}
                    value={rule.to}
                    onChange={e => onChange({ ...rule, to: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                />
                <FormControl size='small' sx={{ minWidth: 90 }}>
                    <InputLabel>Action</InputLabel>
                    <Select label='Action' value={rule.action}
                        onChange={e => {
                            const action = e.target.value as 'send' | 'drop'
                            onChange({ ...rule, action, senderId: action === 'drop' ? undefined : rule.senderId, configName: action === 'drop' ? undefined : rule.configName })
                        }}>
                        <MenuItem value='send'>send</MenuItem>
                        <MenuItem value='drop'>drop</MenuItem>
                    </Select>
                </FormControl>
                {rule.action === 'send' && (<>
                    <FormControl size='small' sx={{ minWidth: 130 }}>
                        <InputLabel>Sender</InputLabel>
                        <Select label='Sender' value={rule.senderId ?? ''}
                            onChange={e => onChange({ ...rule, senderId: e.target.value || undefined, configName: undefined })}>
                            <MenuItem value=''><em>—</em></MenuItem>
                            {senders.map(s => <MenuItem key={s.id} value={s.id}>{s.displayName ?? s.id}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <FormControl size='small' sx={{ minWidth: 130 }} disabled={!rule.senderId || configNames.length === 0}>
                        <InputLabel>Config</InputLabel>
                        <Select label='Config' value={rule.configName ?? ''}
                            onChange={e => onChange({ ...rule, configName: e.target.value || undefined })}>
                            <MenuItem value=''><em>—</em></MenuItem>
                            {configNames.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                        </Select>
                    </FormControl>
                </>)}
                <IconButton size='small' color='error' onClick={onDelete}><Delete fontSize='small' /></IconButton>
            </Stack>
            <Stack direction='row' spacing={0} sx={{ mt: 1 }}>
                {DAY_LABELS.map((label, i) => (
                    <FormControlLabel
                        key={i}
                        control={
                            <Checkbox
                                size='small'
                                checked={!rule.days || rule.days.includes(i)}
                                onChange={() => toggleDay(i)}
                                sx={{ p: 0.25 }}
                            />
                        }
                        label={<Typography variant='caption'>{label}</Typography>}
                        sx={{ mr: 0.5 }}
                    />
                ))}
                {rule.days && rule.days.length > 0 && (
                    <Button size='small' sx={{ fontSize: 10, p: 0.25, minWidth: 0 }}
                        onClick={() => onChange({ ...rule, days: undefined })}>
                        all
                    </Button>
                )}
            </Stack>
        </Box>
    )
}

// ─── Config form ──────────────────────────────────────────────────────────────

const ConfigForm: React.FC<{
    config: ITimedConfig
    senders: IInstalledSender[]
    onChange: (config: ITimedConfig) => void
}> = ({ config, senders, onChange }) => {
    const defSender = senders.find(s => s.id === config.defaultSenderId)
    const defConfigNames = defSender?.configNames ?? []

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
            <Stack direction='row' spacing={1.5} flexWrap='wrap' useFlexGap>
                <TextField
                    size='small' label='Name *' value={config.name}
                    onChange={e => onChange({ ...config, name: e.target.value })}
                    sx={{ flex: 1, minWidth: 180 }}
                />
                <FormControl size='small' sx={{ minWidth: 240 }}>
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
            </Stack>

            <Divider><Typography variant='caption'>Rules (evaluated in order — first match wins)</Typography></Divider>

            {config.rules.length === 0 && (
                <Typography variant='body2' color='text.secondary'>No rules yet. Add one below.</Typography>
            )}
            {config.rules.map((rule, i) => (
                <RuleRow key={i} rule={rule} senders={senders}
                    onChange={r => updateRule(i, r)}
                    onDelete={() => deleteRule(i)}
                />
            ))}
            <Button size='small' startIcon={<Add />} onClick={addRule} sx={{ alignSelf: 'flex-start' }}>
                Add rule
            </Button>

            <Divider><Typography variant='caption'>Default (when no rule matches)</Typography></Divider>

            <Stack direction='row' spacing={1.5} flexWrap='wrap' useFlexGap alignItems='center'>
                <FormControl size='small' sx={{ minWidth: 110 }}>
                    <InputLabel>Default action</InputLabel>
                    <Select label='Default action' value={config.defaultAction ?? 'drop'}
                        onChange={e => {
                            const action = e.target.value as 'send' | 'drop'
                            onChange({ ...config, defaultAction: action, defaultSenderId: action === 'drop' ? undefined : config.defaultSenderId, defaultConfigName: action === 'drop' ? undefined : config.defaultConfigName })
                        }}>
                        <MenuItem value='drop'>drop</MenuItem>
                        <MenuItem value='send'>send</MenuItem>
                    </Select>
                </FormControl>
                {config.defaultAction === 'send' && (<>
                    <FormControl size='small' sx={{ minWidth: 160 }}>
                        <InputLabel>Default sender</InputLabel>
                        <Select label='Default sender' value={config.defaultSenderId ?? ''}
                            onChange={e => onChange({ ...config, defaultSenderId: e.target.value || undefined, defaultConfigName: undefined })}>
                            <MenuItem value=''><em>—</em></MenuItem>
                            {senders.map(s => <MenuItem key={s.id} value={s.id}>{s.displayName ?? s.id}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <FormControl size='small' sx={{ minWidth: 160 }} disabled={!config.defaultSenderId || defConfigNames.length === 0}>
                        <InputLabel>Default config</InputLabel>
                        <Select label='Default config' value={config.defaultConfigName ?? ''}
                            onChange={e => onChange({ ...config, defaultConfigName: e.target.value || undefined })}>
                            <MenuItem value=''><em>—</em></MenuItem>
                            {defConfigNames.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                        </Select>
                    </FormControl>
                </>)}
            </Stack>
        </Stack>
    )
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

const TimedConfigDialog: React.FC<ITimedConfigDialogProps> = ({ onClose, backendUrl, accessString }) => {
    const [configs, setConfigs] = useState<ITimedConfig[]>([])
    const [senders, setSenders] = useState<IInstalledSender[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [deletingName, setDeletingName] = useState<string | undefined>()
    const [showForm, setShowForm] = useState(false)
    const [formConfig, setFormConfig] = useState<ITimedConfig>(emptyConfig())
    const [error, setError] = useState<string | undefined>()

    useEffect(() => {
        Promise.all([
            fetch(`${backendUrl}/senders/timed/configs`, authGet(accessString)).then(r => r.json()).then(setConfigs).catch(() => {}),
            fetch(`${backendUrl}/senders`, authGet(accessString)).then(r => r.json()).then(setSenders).catch(() => {}),
        ]).finally(() => setLoading(false))
    }, [])

    const saveConfig = async () => {
        if (!formConfig.name.trim()) { setError('Name is required'); return }
        setSaving(true)
        setError(undefined)
        try {
            const res = await fetch(`${backendUrl}/senders/timed/configs`, authPost(accessString, JSON.stringify(formConfig)))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            setConfigs(prev => {
                const idx = prev.findIndex(c => c.name === formConfig.name)
                return idx >= 0 ? prev.map((c, i) => i === idx ? formConfig : c) : [...prev, formConfig]
            })
            setShowForm(false)
            setFormConfig(emptyConfig())
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
        setError(undefined)
        setShowForm(true)
    }

    const startEdit = (config: ITimedConfig) => {
        setFormConfig({ ...config })
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
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '760px' } }}>
            <DialogTitle>Configure: Timed Sender</DialogTitle>
            <DialogContent>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
                ) : (
                    <Stack spacing={1.5} sx={{ mt: 1 }}>
                        {configs.length === 0 && !showForm && (
                            <Typography variant='body2' color='text.secondary'>No configs yet.</Typography>
                        )}
                        {configs.map(cfg => (
                            <Box key={cfg.name} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 0.75, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                                <Box>
                                    <Typography variant='body2' fontWeight='bold'>{cfg.name}</Typography>
                                    <Typography variant='caption' color='text.secondary'>{configSummary(cfg)}</Typography>
                                </Box>
                                <Stack direction='row' spacing={0.5}>
                                    <Tooltip title='Edit'>
                                        <IconButton size='small' onClick={() => startEdit(cfg)}>
                                            <Add fontSize='small' sx={{ transform: 'rotate(45deg)' }} />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title='Delete'>
                                        <span>
                                            <IconButton size='small' color='error' disabled={deletingName === cfg.name} onClick={() => deleteConfig(cfg.name)}>
                                                {deletingName === cfg.name ? <CircularProgress size={14} /> : <Delete fontSize='small' />}
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                </Stack>
                            </Box>
                        ))}

                        {!showForm && (
                            <Button size='small' startIcon={<Add />} onClick={startAdd} sx={{ alignSelf: 'flex-start' }}>
                                Add config
                            </Button>
                        )}

                        {showForm && (
                            <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                                <Typography variant='subtitle2' sx={{ mb: 2 }}>
                                    {formConfig.name && configs.some(c => c.name === formConfig.name) ? `Edit: ${formConfig.name}` : 'New config'}
                                </Typography>
                                <ConfigForm config={formConfig} senders={senders} onChange={setFormConfig} />
                                <Stack direction='row' justifyContent='flex-end' spacing={1} sx={{ mt: 2 }}>
                                    <Button size='small' onClick={() => { setShowForm(false); setError(undefined) }}>Cancel</Button>
                                    <Button size='small' variant='contained' disabled={saving || !formConfig.name.trim()} onClick={saveConfig}>
                                        {saving ? <CircularProgress size={14} /> : 'Save'}
                                    </Button>
                                </Stack>
                            </Box>
                        )}

                        {error && <Typography variant='caption' color='error'>{error}</Typography>}
                    </Stack>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 2 }}>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    )
}

export { TimedConfigDialog }
export default TimedConfigDialog
