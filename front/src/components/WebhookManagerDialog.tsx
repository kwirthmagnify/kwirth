import React, { useContext, useEffect, useRef, useState } from 'react'
import {
    Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
    DialogTitle, Divider, FormControl, FormControlLabel, IconButton, InputAdornment, InputLabel, MenuItem,
    Select, Stack, Switch, TextField, Tooltip, Typography, useTheme
} from '@mui/material'
import { Add, CheckCircle, ContentCopy, Delete, Download, FolderOpen, Https, Link, OpenInNew, Refresh, Settings, ViewList, ViewModule, Visibility, VisibilityOff } from '@kwirthmagnify/kwirth-common-front/icons'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { DialogTitleHelp } from '@kwirthmagnify/kwirth-common-front'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization, addPutAuthorization } from '../tools/AuthorizationManagement'
import { versionGreaterThan, EExtensionType } from '@kwirthmagnify/kwirth-common'
import { useKeyboard } from '../tools/useKeyboard'


// ─── Types ──────────────────────────────────────────────────────────────────

interface IWebhookFieldDef {
    name: string
    label: string
    type?: 'text' | 'number' | 'boolean' | 'password' | 'select'
    required?: boolean
    options?: string[]
    labels?: string[]
    common?: boolean
}

interface IRequirement {
    extensionType: EExtensionType
    id: string
    minVersion: string
}

interface IWebhookManifestEntry {
    marketplaceId?: string
    marketplaceLabel?: string
    id: string
    extensionType?: EExtensionType
    name: string
    displayName: string
    version: string
    description: string
    website?: string
    url: string
    requires?: IRequirement[]
    uses?: IRequirement[]
}

interface IInstalledWebhook {
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    configNames: string[]
    hasFront?: boolean
    requiresRestart?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ConfigValues = Record<string, any>

// ─── Component ──────────────────────────────────────────────────────────────

interface IWebhookManagerDialogProps {
    onClose: () => void
    onRestartRequired?: () => void
}

const WebhookManagerDialog: React.FC<IWebhookManagerDialogProps> = (props: IWebhookManagerDialogProps) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType
    const theme = useTheme()
    useKeyboard(props.onClose)

    const [installed, setInstalled] = useState<IInstalledWebhook[]>([])
    const [available, setAvailable] = useState<IWebhookManifestEntry[]>([])
    const [loadingManifest, setLoadingManifest] = useState(false)
    const [filterText, setFilterText] = useState('')
    const [availableFilter, setAvailableFilter] = useState('')
    const [selectedVersions, setSelectedVersions] = useState<Record<string, string>>({})

    const groupedAvailable: Record<string, IWebhookManifestEntry[]> = available.reduce((acc, p) => { if (!acc[p.id]) acc[p.id]=[]; acc[p.id].push(p); return acc }, {} as Record<string, IWebhookManifestEntry[]>)
    Object.values(groupedAvailable).forEach(g => g.sort((a,b) => versionGreaterThan(a.version, b.version) ? -1 : 1))
    const getSelectedWebhook = (id: string): IWebhookManifestEntry => { const g=groupedAvailable[id]; const v=selectedVersions[id]??g[0].version; return g.find(p=>p.version===v)??g[0] }
    const [installingId, setInstallingId] = useState<string | undefined>()
    const [uninstallingId, setUninstallingId] = useState<string | undefined>()
    const [installingCustom, setInstallingCustom] = useState(false)
    const [installingFile, setInstallingFile] = useState(false)
    const [customUrl, setCustomUrl] = useState('')
    const [error, setError] = useState<string | undefined>()

    // Config panel state
    const [expandedId, setExpandedId] = useState<string | undefined>()
    const [schema, setSchema] = useState<IWebhookFieldDef[]>([])
    const [configs, setConfigs] = useState<ConfigValues[]>([])
    const [loadingConfigs, setLoadingConfigs] = useState(false)
    const [deletingName, setDeletingName] = useState<string | undefined>()
    const [showAddForm, setShowAddForm] = useState(false)
    const [editingName, setEditingName] = useState<string | undefined>()
    const [originalEditingName, setOriginalEditingName] = useState<string | undefined>()
    const [formValues, setFormValues] = useState<ConfigValues>({})
    const [saving, setSaving] = useState(false)
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card')

    // Webhook URL (con token) de la config que se está editando + rotación.
    const [configUrl, setConfigUrl] = useState<string | undefined>()
    const [rotating, setRotating] = useState(false)
    const [urlCopied, setUrlCopied] = useState(false)

    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        loadInstalled()
        fetchManifest()
    }, [])

    const loadInstalled = async () => {
        try {
            const res = await fetch(`${backendUrl}/core/webhooks`, addGetAuthorization(accessString))
            const data: IInstalledWebhook[] = await res.json()
            setInstalled(data)
        } catch (err) {
            setError(`Failed to load webhooks: ${err}`)
        }
    }

    const fetchManifest = async () => {
        setLoadingManifest(true)
        try {
            const res = await fetch(`${backendUrl}/core/marketplace/${EExtensionType.WEBHOOK}`, addGetAuthorization(accessString))
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data: IWebhookManifestEntry[] = await res.json()
            setAvailable(data)
        } catch {
            setAvailable([])
        } finally {
            setLoadingManifest(false)
        }
    }

    const reloadConfigs = async (id: string) => {
        setLoadingConfigs(true)
        try {
            const [configsRes, schemaRes] = await Promise.all([
                fetch(`${backendUrl}/core/webhooks/${id}/configs`, addGetAuthorization(accessString)),
                fetch(`${backendUrl}/core/webhooks/${id}/schema`, addGetAuthorization(accessString)),
            ])
            if (!configsRes.ok) throw new Error(`HTTP ${configsRes.status}`)
            const storedData = await configsRes.json()
            setConfigs(Array.isArray(storedData.configs) ? storedData.configs : [])
            if (schemaRes.ok) setSchema(await schemaRes.json())
        } catch (err) {
            setError(`Failed to load configs: ${err}`)
        } finally {
            setLoadingConfigs(false)
        }
    }

    const expandWebhook = async (id: string) => {
        if (expandedId === id) { setExpandedId(undefined); return }
        setExpandedId(id)
        setShowAddForm(false)
        setFormValues({})
        setConfigUrl(undefined)
        setError(undefined)
        setSchema([])
        await reloadConfigs(id)
    }

    // Carga la URL (con token) de una config guardada.
    const loadConfigUrl = async (id: string, name: string) => {
        setConfigUrl(undefined)
        try {
            const res = await fetch(`${backendUrl}/core/webhooks/${id}/configs/${encodeURIComponent(name)}/url`, addGetAuthorization(accessString))
            if (res.ok) setConfigUrl((await res.json()).url)
        } catch { /* la config puede no existir aún */ }
    }

    const rotateToken = async () => {
        if (!expandedId || !originalEditingName) return
        setRotating(true)
        try {
            const res = await fetch(`${backendUrl}/core/webhooks/${expandedId}/configs/${encodeURIComponent(originalEditingName)}/rotate`, addPostAuthorization(accessString, JSON.stringify({})))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            setConfigUrl((await res.json()).url)
        } catch (err) {
            setError(`Rotate failed: ${err}`)
        } finally {
            setRotating(false)
        }
    }

    const copyUrl = () => {
        if (!configUrl) return
        // URL completa = origen del back + path con token.
        const full = configUrl.startsWith('http') ? configUrl : `${backendUrl}${configUrl}`
        navigator.clipboard.writeText(full).then(() => { setUrlCopied(true); setTimeout(() => setUrlCopied(false), 1500) })
    }

    const installFromCatalog = async (entry: IWebhookManifestEntry) => {
        setError(undefined)
        setInstallingId(entry.id)
        try {
            const res = await fetch(`${backendUrl}/core/webhooks/install`, addPostAuthorization(accessString, JSON.stringify({ url: entry.url })))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            const meta: IInstalledWebhook = await res.json()
            await loadInstalled()
            if (meta.requiresRestart) props.onRestartRequired?.()
        } catch (err) {
            setError(`Failed to install ${entry.displayName}: ${err}`)
        } finally {
            setInstallingId(undefined)
        }
    }

    const installFromUrl = async () => {
        const url = customUrl.trim()
        if (!url) return
        setError(undefined)
        setInstallingCustom(true)
        try {
            const res = await fetch(`${backendUrl}/core/webhooks/install`, addPostAuthorization(accessString, JSON.stringify({ url })))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            const meta: IInstalledWebhook = await res.json()
            setCustomUrl('')
            await loadInstalled()
            if (meta.requiresRestart) props.onRestartRequired?.()
        } catch (err) {
            setError(`Failed to install webhook: ${err}`)
        } finally {
            setInstallingCustom(false)
        }
    }

    const installFromFile = async (file: File) => {
        setError(undefined)
        setInstallingFile(true)
        try {
            const res = await fetch(`${backendUrl}/core/webhooks/upload`, {
                method: 'POST',
                headers: { Authorization: accessString ? `Bearer ${accessString}` : '', 'Content-Type': 'application/octet-stream', 'X-Kwirth-App': 'true' },
                body: file
            })
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            const meta: IInstalledWebhook = await res.json()
            await loadInstalled()
            if (meta.requiresRestart) props.onRestartRequired?.()
        } catch (err) {
            setError(`Failed to install webhook: ${err}`)
        } finally {
            setInstallingFile(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const uninstall = async (webhook: IInstalledWebhook) => {
        setError(undefined)
        setUninstallingId(webhook.id)
        try {
            const res = await fetch(`${backendUrl}/core/webhooks/${webhook.id}`, addDeleteAuthorization(accessString))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            if (expandedId === webhook.id) setExpandedId(undefined)
            await loadInstalled()
        } catch (err) {
            setError(`Failed to uninstall ${webhook.displayName ?? webhook.id}: ${err}`)
        } finally {
            setUninstallingId(undefined)
        }
    }

    const deleteConfig = async (configName: string) => {
        if (!expandedId) return
        setDeletingName(configName)
        try {
            const res = await fetch(`${backendUrl}/core/webhooks/${expandedId}/configs/${encodeURIComponent(configName)}`, addDeleteAuthorization(accessString))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            setConfigs(prev => prev.filter(c => c.name !== configName))
            if (editingName === configName) { setShowAddForm(false); setEditingName(undefined); setConfigUrl(undefined) }
            await loadInstalled()
        } catch (err) {
            setError(`Delete failed: ${err}`)
        } finally {
            setDeletingName(undefined)
        }
    }

    const saveConfig = async () => {
        if (!expandedId) return
        setSaving(true)
        setError(undefined)
        try {
            const payload = buildPayload(formValues)
            const newName = payload.name as string
            const res = await fetch(`${backendUrl}/core/webhooks/${expandedId}/configs`, addPostAuthorization(accessString, JSON.stringify(payload)))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            if (originalEditingName && originalEditingName !== newName) {
                await fetch(`${backendUrl}/core/webhooks/${expandedId}/configs/${encodeURIComponent(originalEditingName)}`, addDeleteAuthorization(accessString))
            }
            setEditingName(newName)
            setOriginalEditingName(newName)
            await reloadConfigs(expandedId)
            await loadInstalled()
            await loadConfigUrl(expandedId, newName)   // tras guardar ya hay token → mostrar URL
        } catch (err) {
            setError(`Save failed: ${err}`)
        } finally {
            setSaving(false)
        }
    }

    const buildPayload = (values: ConfigValues): ConfigValues => {
        const payload: ConfigValues = { name: values['name'] }
        for (const f of schema.filter(f => !f.common && f.name !== 'name')) {
            const v = values[f.name]
            if (v === undefined || v === '') continue
            if (f.type === 'number') payload[f.name] = Number(v)
            else if (f.type === 'boolean') payload[f.name] = Boolean(v)
            else payload[f.name] = v
        }
        if (values['description'] !== undefined && values['description'] !== '') payload['description'] = values['description']
        return payload
    }

    const isFormValid = (): boolean => {
        if (!formValues['name']) return false
        return schema.filter(f => f.required && !f.common && f.name !== 'name').every(f => {
            const v = formValues[f.name]
            return v !== undefined && v !== '' && v !== false
        })
    }

    const isInstalled = (id: string) => installed.some(s => s.id === id && s.installedFrom !== 'dev')
    const isDevInstalled = (id: string) => installed.some(s => s.id === id && s.installedFrom === 'dev')

    const webhookGradient = (name: string) => {
        let hash = 0
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
        const hue = (Math.abs(hash) % 360 + 60) % 360
        const dark = theme.palette.mode === 'dark'
        const stripes = `repeating-linear-gradient(45deg, hsla(${hue}, 70%, 75%, ${dark ? 0.07 : 0.25}) 0px, hsla(${hue}, 70%, 75%, ${dark ? 0.07 : 0.25}) 1px, transparent 1px, transparent 9px)`
        return `${stripes}, linear-gradient(315deg, hsla(${hue}, 70%, 55%, ${dark ? 0.06 : 0.10}) 0%, hsla(${hue}, 50%, 40%, ${dark ? 0.12 : 0.22}) 100%)`
    }

    const resolveSource = (installedFrom?: string) => {
        if (!installedFrom) return null
        if (installedFrom === 'local') return <Chip icon={<FolderOpen />} label='Local file' size='small' variant='outlined' />
        if (installedFrom === 'dev') return <Chip label='dev' size='small' variant='outlined' color='warning' />
        if (installedFrom.startsWith('pack:'))
            return <Tooltip title={`Installed by pack '${installedFrom.slice(5)}'`}><Chip label='via pack' size='small' variant='outlined' color='secondary' /></Tooltip>
        const short = installedFrom.length > 40 ? installedFrom.slice(0, 37) + '…' : installedFrom
        return <Tooltip title={installedFrom}><Chip icon={<Link />} label={short} size='small' variant='outlined' sx={{ maxWidth: '100%' }} /></Tooltip>
    }

    // ─── Config form fields ────────────────────────────────────────────────────

    const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set())
    const toggleSecret = (name: string) => setRevealedSecrets(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })

    const renderField = (f: IWebhookFieldDef, values: ConfigValues, onChange: (name: string, val: unknown) => void) => {
        const value = values[f.name] ?? (f.type === 'boolean' ? false : '')

        if (f.type === 'boolean') return (
            <Box key={f.name} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant='body2'>{f.label}</Typography>
                <Switch size='small' checked={!!value} onChange={e => onChange(f.name, e.target.checked)} />
            </Box>
        )

        if (f.type === 'select' && f.options) return (
            <FormControl key={f.name} size='small' fullWidth>
                <InputLabel>{f.label}{f.required ? ' *' : ''}</InputLabel>
                <Select label={`${f.label}${f.required ? ' *' : ''}`} value={value || ''} displayEmpty
                    onChange={e => onChange(f.name, e.target.value)}>
                    <MenuItem value=''><em>—</em></MenuItem>
                    {f.options.map((o, i) => <MenuItem key={o} value={o}>{f.labels?.[i] ?? o}</MenuItem>)}
                </Select>
            </FormControl>
        )

        const isPassword = f.type === 'password'
        const revealed = revealedSecrets.has(f.name)
        return (
            <TextField key={f.name} size='small' fullWidth
                label={`${f.label}${f.required ? ' *' : ''}`}
                type={f.type === 'number' ? 'number' : (isPassword && !revealed) ? 'password' : 'text'}
                autoComplete={isPassword ? 'new-password' : 'off'}
                value={value}
                onChange={e => onChange(f.name, e.target.value)}
                InputProps={isPassword ? { endAdornment: (
                    <InputAdornment position='end'>
                        <IconButton size='small' edge='end' aria-label={revealed ? 'Hide' : 'Show'} onClick={() => toggleSecret(f.name)}>
                            {revealed ? <VisibilityOff fontSize='small' /> : <Visibility fontSize='small' />}
                        </IconButton>
                    </InputAdornment>
                ) } : undefined} />
        )
    }

    // ─── Webhook card ─────────────────────────────────────────────────────────

    const WebhookCard = ({ webhook }: { webhook: IInstalledWebhook }) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: 1.5, minHeight: 100, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, background: webhookGradient(webhook.name) }}>
            <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                <Box sx={{ color: 'text.secondary', mt: 0.25 }}><Https fontSize='small' /></Box>
                <Box flex={1} minWidth={0}>
                    <Stack direction='row' alignItems='center' spacing={0.5} sx={{ width: '100%' }}>
                        <Typography variant='body2' fontWeight='bold' sx={{ flex: 1 }}>{webhook.displayName || webhook.id}</Typography>
                        <Chip label={`v${webhook.version}`} size='small' sx={{ minWidth: 72 }} />
                    </Stack>
                    <Typography variant='caption' color='text.secondary' display='block' sx={{ mt: 0.5 }}>{webhook.description}</Typography>
                </Box>
                <Tooltip title={webhook.website ? 'Open website' : 'No website available'}>
                    <span>
                        <IconButton size='small' sx={{ mr: -0.5 }} disabled={!webhook.website} onClick={() => window.open(webhook.website!, '_blank', 'noopener')}>
                            <OpenInNew fontSize='small' />
                        </IconButton>
                    </span>
                </Tooltip>
            </Stack>
            <Stack direction='row' justifyContent='space-between' alignItems='center' sx={{ mt: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', mr: 1 }}>{resolveSource(webhook.installedFrom)}</Box>
                <Stack direction='row' spacing={0.5} alignItems='center'>
                    {webhook.configNames.length > 0 && <Chip label={`${webhook.configNames.length} config${webhook.configNames.length > 1 ? 's' : ''}`} size='small' color='primary' variant='outlined' />}
                    <Tooltip title='Configure'>
                        <IconButton size='small' color='primary' onClick={() => expandWebhook(webhook.id)}>
                            <Settings fontSize='small' />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title={webhook.installedFrom === 'dev' ? 'Dev webhooks cannot be uninstalled' : webhook.installedFrom?.startsWith('pack:') ? 'Installed via pack — uninstall the pack instead' : 'Uninstall'}>
                        <span>
                            <IconButton size='small' color='error' disabled={webhook.installedFrom === 'dev' || webhook.installedFrom?.startsWith('pack:') || uninstallingId === webhook.id} onClick={() => uninstall(webhook)}>
                                {uninstallingId === webhook.id ? <CircularProgress size={16} /> : <Delete fontSize='small' />}
                            </IconButton>
                        </span>
                    </Tooltip>
                </Stack>
            </Stack>
        </Box>
    )

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <>
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '72vw', maxWidth: '72vw', height: '80vh' } }}>
            <DialogTitleHelp section='guide/extensions/webhooks/index?id=managing-configuring-webhooks' docsUrl={backendUrl + '/core/docs/core/kwirth'}>Manage webhooks</DialogTitleHelp>
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{ mt: 1 }}>

                    <Stack direction='row' alignItems='center' spacing={1}>
                        <Typography variant='subtitle2'>Installed webhooks</Typography>
                        <TextField size='small' placeholder='Filter…' value={filterText} onChange={e => setFilterText(e.target.value)}
                            sx={{ flex: 1 }} slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: '0.75rem' } } }} />
                        <Tooltip title='Card view'>
                            <IconButton size='small' color={viewMode === 'card' ? 'primary' : 'default'} onClick={() => setViewMode('card')}>
                                <ViewModule fontSize='small' />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title='List view'>
                            <IconButton size='small' color={viewMode === 'list' ? 'primary' : 'default'} onClick={() => setViewMode('list')}>
                                <ViewList fontSize='small' />
                            </IconButton>
                        </Tooltip>
                    </Stack>
                    {installed.length === 0
                        ? <Typography variant='body2' color='text.secondary'>No webhooks installed.</Typography>
                        : viewMode === 'card'
                            ? <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
                                {installed.filter(s => !filterText || s.name.toLowerCase().includes(filterText.toLowerCase()) || (s.displayName ?? '').toLowerCase().includes(filterText.toLowerCase()) || s.description.toLowerCase().includes(filterText.toLowerCase())).map(s => <WebhookCard key={s.id} webhook={s} />)}
                              </Box>
                            : <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                                {installed.filter(s => !filterText || s.name.toLowerCase().includes(filterText.toLowerCase()) || (s.displayName ?? '').toLowerCase().includes(filterText.toLowerCase()) || s.description.toLowerCase().includes(filterText.toLowerCase())).map(s => (
                                    <Box key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
                                        <Box sx={{ color: 'text.secondary', flexShrink: 0, display: 'flex' }}><Https fontSize='small' /></Box>
                                        <Typography variant='body2' fontWeight='bold' sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.displayName || s.id}</Typography>
                                        {s.configNames.length > 0 && <Chip label={`${s.configNames.length} cfg`} size='small' color='primary' variant='outlined' />}
                                        <Tooltip title='Configure'>
                                            <IconButton size='small' color='primary' onClick={() => expandWebhook(s.id)}>
                                                <Settings fontSize='small' />
                                            </IconButton>
                                        </Tooltip>
                                        <Chip label={`v${s.version}`} size='small' sx={{ minWidth: 72 }} />
                                        <Tooltip title={s.installedFrom === 'dev' ? 'Dev webhooks cannot be uninstalled' : 'Uninstall'}>
                                            <span>
                                                <IconButton size='small' color='error' disabled={s.installedFrom === 'dev' || uninstallingId === s.id} onClick={() => uninstall(s)}>
                                                    {uninstallingId === s.id ? <CircularProgress size={16} /> : <Delete fontSize='small' />}
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    </Box>
                                ))}
                              </Box>
                    }

                    <Typography variant='subtitle2' sx={{ pt: 1 }}>Install webhook</Typography>
                    <Stack direction='row' spacing={1} alignItems='center'>
                        <TextField size='small' fullWidth placeholder='https://...' value={customUrl}
                            onChange={e => setCustomUrl(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') installFromUrl() }} />
                        <Tooltip title='Install from URL'>
                            <span>
                                <IconButton size='small' color='primary' disabled={installingCustom || !customUrl.trim()} onClick={installFromUrl}>
                                    {installingCustom ? <CircularProgress size={16} /> : <Download fontSize='small' />}
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Divider orientation='vertical' flexItem />
                        <input ref={fileInputRef} type='file' accept='.tgz,application/gzip' style={{ display: 'none' }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) installFromFile(f) }} />
                        <Tooltip title='Install from local file'>
                            <span>
                                <Button variant='outlined' size='small'
                                    startIcon={installingFile ? <CircularProgress size={14} /> : <FolderOpen fontSize='small' />}
                                    disabled={installingFile} onClick={() => fileInputRef.current?.click()}
                                    sx={{ whiteSpace: 'nowrap' }}>
                                    {installingFile ? 'Installing…' : 'Browse…'}
                                </Button>
                            </span>
                        </Tooltip>
                    </Stack>

                    <Stack direction='row' alignItems='center' spacing={1} sx={{ pt: 1 }}>
                        <Typography variant='subtitle2'>Available webhooks</Typography>
                        <TextField size='small' placeholder='Filter…' value={availableFilter} onChange={e => setAvailableFilter(e.target.value)} sx={{ flex: 1 }} slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: '0.75rem' } } }} />
                        <Tooltip title='Refresh catalog'>
                            <span>
                                <IconButton size='small' sx={{ width: 30, height: 30 }} onClick={fetchManifest} disabled={loadingManifest}>
                                    {loadingManifest ? <CircularProgress size={16} /> : <Refresh fontSize='small' />}
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Stack>

                    {available.length === 0 && !loadingManifest &&
                        <Typography variant='body2' color='text.secondary'>No webhooks in catalog.</Typography>
                    }

                    {Object.keys(groupedAvailable).length > 0 &&
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
                            {Object.keys(groupedAvailable).filter(id => !availableFilter || id.includes(availableFilter.toLowerCase()) || groupedAvailable[id][0].displayName?.toLowerCase().includes(availableFilter.toLowerCase())).map(id => {
                                const group = groupedAvailable[id]; const entry = getSelectedWebhook(id); const versions = group.map(p => p.version)
                                return (
                                <Box key={id} sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: 1.5, minHeight: 100, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, background: webhookGradient(entry.name) }}>
                                    <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                                        <Box sx={{ color: 'text.secondary', mt: 0.25 }}><Https fontSize='small' /></Box>
                                        <Box flex={1} minWidth={0}>
                                            <Stack direction='row' alignItems='center' spacing={0.5} sx={{ width: '100%' }}>
                                                <Typography variant='body2' fontWeight='bold' sx={{ flex: 1 }}>{entry.displayName}</Typography>
                                                {isDevInstalled(id) && <Chip label='dev active' size='small' variant='outlined' color='warning' />}
                                                {isInstalled(id) && <Chip label='installed' color='success' size='small' icon={<CheckCircle />} />}
                                                {versions.length > 1
                                                    ? <Select size='small' value={entry.version} onChange={e => setSelectedVersions(prev => ({ ...prev, [id]: e.target.value }))} sx={{ height: 24, fontSize: '0.75rem', minWidth: 80, '& .MuiSelect-select': { py: 0, px: 1 } }}>
                                                        {versions.map(v => <MenuItem key={v} value={v} sx={{ fontSize: '0.75rem' }}>{v}</MenuItem>)}
                                                      </Select>
                                                    : <Chip label={`v${entry.version}`} size='small' sx={{ minWidth: 72 }} />
                                                }
                                            </Stack>
                                            <Typography variant='caption' color='text.secondary' display='block' sx={{ mt: 0.5 }}>{entry.description}</Typography>
                                        </Box>
                                        <Tooltip title={entry.website ? 'Open website' : 'No website available'}><span><IconButton size='small' sx={{ mr: -0.5 }} disabled={!entry.website} onClick={() => window.open(entry.website!, '_blank', 'noopener')}><OpenInNew fontSize='small' /></IconButton></span></Tooltip>
                                    </Stack>
                                    <Stack direction='row' justifyContent='flex-end' sx={{ mt: 1 }}>
                                        <Tooltip title={isDevInstalled(id) ? 'Dev version active' : isInstalled(id) ? 'Already installed' : 'Install'}>
                                            <span><IconButton size='small' color='primary' disabled={isDevInstalled(id) || isInstalled(id) || installingId === id} onClick={() => installFromCatalog(entry)}>
                                                {installingId === id ? <CircularProgress size={16} /> : <Download fontSize='small' />}
                                            </IconButton></span>
                                        </Tooltip>
                                    </Stack>
                                </Box>
                                )
                            })}
                        </Box>
                    }

                </Stack>
            </DialogContent>
            {error && <Box sx={{ px: 3, pb: 1 }}><Typography variant='caption' color={error.startsWith('Imported') ? 'success.main' : 'error'}>{error}</Typography></Box>}
            <DialogActions sx={{ justifyContent: 'flex-end', px: 2 }}>
                <Button onClick={props.onClose}>Close</Button>
            </DialogActions>
        </Dialog>

        {/* Generic config dialog */}
        {expandedId && (
            <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '860px', height: '600px' } }}>
                <DialogTitle>Configure: {installed.find(s => s.id === expandedId)?.displayName ?? expandedId}</DialogTitle>
                <DialogContent sx={{ display: 'flex', gap: 2, p: '16px !important', overflow: 'hidden', height: '100%' }}>

                    {/* Left — config list */}
                    <Box sx={{ width: 190, display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                        <Typography variant='caption' color='text.secondary' fontWeight='bold'>Configs</Typography>
                        <Box sx={{ flex: 1, border: 1, borderColor: 'divider', borderRadius: 1, overflowY: 'auto' }}>
                            {loadingConfigs
                                ? <Box sx={{ p: 1 }}><CircularProgress size={16} /></Box>
                                : configs.length === 0
                                    ? <Typography variant='caption' color='text.disabled' sx={{ p: 1, display: 'block' }}>No configs yet.</Typography>
                                    : configs.map(cfg => (
                                        <Box key={cfg.name} sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider', borderLeft: editingName === cfg.name ? 3 : 0, borderLeftColor: 'primary.main', bgcolor: editingName === cfg.name ? 'action.selected' : 'transparent' }}>
                                            <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', cursor: 'pointer' }} onClick={() => { setEditingName(cfg.name); setOriginalEditingName(cfg.name); setFormValues({ ...cfg }); setShowAddForm(true); loadConfigUrl(expandedId, cfg.name) }}>
                                                <Typography variant='body2' fontWeight='bold' noWrap>{cfg.name}</Typography>
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
                        <Button size='small' startIcon={<Add />} onClick={() => { setShowAddForm(true); setEditingName(undefined); setOriginalEditingName(undefined); setFormValues({}); setConfigUrl(undefined) }}>New</Button>
                    </Box>

                    <Divider orientation='vertical' flexItem />

                    {/* Right — per-config form */}
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0, overflow: 'hidden' }}>
                        {showAddForm
                            ? <>
                                <Typography variant='caption' color='text.secondary' fontWeight='bold'>
                                    {editingName ? `Editing: ${editingName}` : 'New config'}
                                </Typography>
                                <Box sx={{ flex: 1, overflowY: 'auto', pt: 1 }}>
                                    <Stack direction='column' spacing={1.5}>
                                        {schema.filter(f => f.name === 'name').map(f => renderField(f, formValues, (name, val) => setFormValues(prev => ({ ...prev, [name]: val }))))}
                                        <TextField size='small' label='Description' fullWidth multiline maxRows={2}
                                            value={formValues['description'] ?? ''}
                                            onChange={e => setFormValues(prev => ({ ...prev, description: e.target.value || undefined }))} />
                                        {schema.filter(f => f.name !== 'name' && !f.common).map(f => renderField(f, formValues, (name, val) => setFormValues(prev => ({ ...prev, [name]: val }))))}

                                        {/* URL del webhook (con token) — solo para configs ya guardadas */}
                                        {originalEditingName && configUrl && <>
                                            <Divider />
                                            <Typography variant='caption' color='text.secondary' fontWeight='bold'>Webhook URL</Typography>
                                            <Typography variant='caption' color='text.disabled'>Paste this URL into the provider (e.g. Jira Automation → Send web request). Keep it secret — it authenticates the caller.</Typography>
                                            <TextField size='small' fullWidth value={configUrl.startsWith('http') ? configUrl : `${backendUrl}${configUrl}`}
                                                InputProps={{ readOnly: true, endAdornment: (
                                                    <InputAdornment position='end'>
                                                        <Tooltip title={urlCopied ? 'Copied!' : 'Copy'}>
                                                            <IconButton size='small' edge='end' onClick={copyUrl}>
                                                                {urlCopied ? <CheckCircle fontSize='small' color='success' /> : <ContentCopy fontSize='small' />}
                                                            </IconButton>
                                                        </Tooltip>
                                                    </InputAdornment>
                                                ) }} />
                                            <Stack direction='row' justifyContent='flex-end'>
                                                <Button size='small' startIcon={rotating ? <CircularProgress size={14} /> : <Refresh fontSize='small' />} disabled={rotating} onClick={rotateToken}>
                                                    Regenerate
                                                </Button>
                                            </Stack>
                                        </>}
                                    </Stack>
                                </Box>
                                <Stack direction='row' justifyContent='flex-end' alignItems='center' spacing={1}>
                                    {error && <Typography variant='caption' color='error' sx={{ flex: 1 }}>{error}</Typography>}
                                    <Button size='small' variant='contained' disabled={saving || !isFormValid()} onClick={saveConfig}>
                                        {saving ? <CircularProgress size={14} /> : editingName ? 'Update' : 'Add'}
                                    </Button>
                                    <Button size='small' onClick={() => { setShowAddForm(false); setEditingName(undefined); setFormValues({}); setConfigUrl(undefined) }}>Cancel</Button>
                                </Stack>
                            </>
                            : <Box sx={{ m: 'auto', color: 'text.disabled' }}>
                                <Typography variant='body2'>Select a config to edit or click New.</Typography>
                            </Box>
                        }
                    </Box>
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'flex-end', px: 2 }}>
                    <Button onClick={() => setExpandedId(undefined)}>Close</Button>
                </DialogActions>
            </Dialog>
        )}
        </>
    )
}

export { WebhookManagerDialog }
