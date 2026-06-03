import React, { useContext, useEffect, useRef, useState } from 'react'
import {
    Box, Button, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent,
    DialogTitle, Divider, FormControlLabel, IconButton, MenuItem, Select, Stack, Switch,
    TextField, Tooltip, Typography
} from '@mui/material'
import { Add, CheckCircle, Delete, Download, FileDownload, FileUpload, FolderOpen, Link, OpenInNew, Refresh, Send, Settings } from '@mui/icons-material'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization } from '../tools/AuthorizationManagement'

const SENDERS_MANIFEST_URL = 'https://raw.githubusercontent.com/kwirthmagnify/kwirth/refs/heads/master/senders/manifest.json'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ISenderFieldDef {
    name: string
    label: string
    type?: 'text' | 'number' | 'boolean' | 'password' | 'select'
    required?: boolean
    options?: string[]
    labels?: string[]
}

interface IRequirement {
    type: 'plugin' | 'daemon' | 'sender' | 'provider'
    id: string
    minVersion: string
}

interface ISenderManifestEntry {
    id: string
    name: string
    displayName: string
    version: string
    description: string
    website?: string
    url: string
    requires?: IRequirement[]
}

interface IInstalledSender {
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    configNames: string[]
    hasFront?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ConfigValues = Record<string, any>

// ─── Component ──────────────────────────────────────────────────────────────

interface ISenderDialogProps {
    onClose: () => void
}

const SenderDialog: React.FC<ISenderDialogProps> = (props: ISenderDialogProps) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType

    const [installed, setInstalled] = useState<IInstalledSender[]>([])
    const [available, setAvailable] = useState<ISenderManifestEntry[]>([])
    const [loadingManifest, setLoadingManifest] = useState(false)
    const [filterText, setFilterText] = useState('')
    const [selectedVersions, setSelectedVersions] = useState<Record<string, string>>({})
    const [crossInstalled, setCrossInstalled] = useState<Record<string, { id: string, version: string }[]>>({})

    const compareVersions = (a: string, b: string) => { const pa = a.split('.').map(Number); const pb = b.split('.').map(Number); for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pb[i]??0)-(pa[i]??0); if (d!==0) return d } return 0 }
    const groupedAvailable: Record<string, ISenderManifestEntry[]> = available.reduce((acc, p) => { if (!acc[p.id]) acc[p.id]=[]; acc[p.id].push(p); return acc }, {} as Record<string, ISenderManifestEntry[]>)
    Object.values(groupedAvailable).forEach(g => g.sort((a,b) => compareVersions(a.version, b.version)))
    const getSelectedSender = (id: string): ISenderManifestEntry => { const g=groupedAvailable[id]; const v=selectedVersions[id]??g[0].version; return g.find(p=>p.version===v)??g[0] }
    const [installingId, setInstallingId] = useState<string | undefined>()
    const [uninstallingId, setUninstallingId] = useState<string | undefined>()
    const [installingCustom, setInstallingCustom] = useState(false)
    const [installingFile, setInstallingFile] = useState(false)
    const [customUrl, setCustomUrl] = useState('')
    const [error, setError] = useState<string | undefined>()

    // Config panel state
    const [expandedId, setExpandedId] = useState<string | undefined>()
    const [schema, setSchema] = useState<ISenderFieldDef[]>([])
    const [configs, setConfigs] = useState<ConfigValues[]>([])
    const [loadingConfigs, setLoadingConfigs] = useState(false)
    const [deletingName, setDeletingName] = useState<string | undefined>()
    const [showAddForm, setShowAddForm] = useState(false)
    const [formValues, setFormValues] = useState<ConfigValues>({})
    const [saving, setSaving] = useState(false)

    // Dynamic sender front loading
    const [frontLoaded, setFrontLoaded] = useState<Record<string, boolean>>({})

    const fileInputRef = useRef<HTMLInputElement>(null)
    const senderFileInputRef = useRef<HTMLInputElement>(null)
    const configImportFileRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        loadInstalled()
        fetchManifest()
    }, [])

    // Load dynamic sender front when a sender with hasFront is expanded
    useEffect(() => {
        if (!expandedId) return
        const sender = installed.find(s => s.id === expandedId)
        if (!sender?.hasFront) return
        if (window.__kwirth_senders__?.[expandedId]) {
            setFrontLoaded(prev => ({ ...prev, [expandedId]: true }))
            return
        }
        const script = document.createElement('script')
        script.src = `${backendUrl}/senders/${expandedId}/front`
        script.onload = () => setFrontLoaded(prev => ({ ...prev, [expandedId]: true }))
        script.onerror = () => setError(`Failed to load UI for sender "${expandedId}"`)
        document.head.appendChild(script)
    }, [expandedId, installed])

    const loadInstalled = async () => {
        try {
            const res = await fetch(`${backendUrl}/senders`, addGetAuthorization(accessString))
            const data: IInstalledSender[] = await res.json()
            setInstalled(data)
        } catch (err) {
            setError(`Failed to load senders: ${err}`)
        }
    }

    const fetchManifest = async () => {
        setLoadingManifest(true)
        try {
            const res = await fetch(SENDERS_MANIFEST_URL)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data: ISenderManifestEntry[] = await res.json()
            setAvailable(data)
            const neededTypes = new Set(data.flatMap(e => e.requires ?? []).map(r => r.type).filter(t => t !== 'sender'))
            if (neededTypes.size > 0) {
                const endpoints: Record<string, string> = { plugin: `${backendUrl}/plugins`, daemon: `${backendUrl}/daemons`, provider: `${backendUrl}/providers` }
                const results: Record<string, { id: string, version: string }[]> = {}
                await Promise.all([...neededTypes].map(async t => {
                    try { const r = await fetch(endpoints[t], addGetAuthorization(accessString)); if (r.ok) results[t] = await r.json() } catch {}
                }))
                setCrossInstalled(results)
            }
        } catch {
            setAvailable([])
        } finally {
            setLoadingManifest(false)
        }
    }

    const isRequirementMet = (req: IRequirement): boolean => {
        const list = req.type === 'sender' ? installed : (crossInstalled[req.type] ?? [])
        const found = list.find(x => x.id === req.id)
        return !!found && compareVersions(found.version, req.minVersion) <= 0
    }
    const allRequirementsMet = (requires?: IRequirement[]) => !requires?.length || requires.every(isRequirementMet)

    const expandSender = async (id: string) => {
        if (expandedId === id) { setExpandedId(undefined); return }
        setExpandedId(id)
        setShowAddForm(false)
        setFormValues({})

        // Senders with a custom front handle their own config UI
        const sender = installed.find(s => s.id === id)
        if (sender?.hasFront) return

        setSchema([])
        setLoadingConfigs(true)
        try {
            const [configsRes, schemaRes] = await Promise.all([
                fetch(`${backendUrl}/senders/${id}/configs`, addGetAuthorization(accessString)),
                fetch(`${backendUrl}/senders/${id}/schema`, addGetAuthorization(accessString)),
            ])
            if (!configsRes.ok) throw new Error(`HTTP ${configsRes.status}`)
            setConfigs(await configsRes.json())
            if (schemaRes.ok) setSchema(await schemaRes.json())
        } catch (err) {
            setError(`Failed to load configs: ${err}`)
        } finally {
            setLoadingConfigs(false)
        }
    }

    const installFromCatalog = async (entry: ISenderManifestEntry) => {
        setError(undefined)
        setInstallingId(entry.id)
        try {
            const res = await fetch(`${backendUrl}/senders/install`, addPostAuthorization(accessString, JSON.stringify({ url: entry.url })))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            await loadInstalled()
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
            const res = await fetch(`${backendUrl}/senders/install`, addPostAuthorization(accessString, JSON.stringify({ url })))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            setCustomUrl('')
            await loadInstalled()
        } catch (err) {
            setError(`Failed to install sender: ${err}`)
        } finally {
            setInstallingCustom(false)
        }
    }

    const installFromFile = async (file: File) => {
        setError(undefined)
        setInstallingFile(true)
        try {
            const res = await fetch(`${backendUrl}/senders/upload`, {
                method: 'POST',
                headers: { Authorization: accessString ? `Bearer ${accessString}` : '', 'Content-Type': 'application/octet-stream', 'X-Kwirth-App': 'true' },
                body: file
            })
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            await loadInstalled()
        } catch (err) {
            setError(`Failed to install sender: ${err}`)
        } finally {
            setInstallingFile(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const uninstall = async (sender: IInstalledSender) => {
        setError(undefined)
        setUninstallingId(sender.id)
        try {
            const res = await fetch(`${backendUrl}/senders/${sender.id}`, addDeleteAuthorization(accessString))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            if (expandedId === sender.id) setExpandedId(undefined)
            await loadInstalled()
        } catch (err) {
            setError(`Failed to uninstall ${sender.displayName ?? sender.id}: ${err}`)
        } finally {
            setUninstallingId(undefined)
        }
    }

    const deleteConfig = async (configName: string) => {
        if (!expandedId) return
        setDeletingName(configName)
        try {
            const res = await fetch(`${backendUrl}/senders/${expandedId}/configs/${encodeURIComponent(configName)}`, addDeleteAuthorization(accessString))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            setConfigs(prev => prev.filter(c => c.name !== configName))
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
            const payload = buildPayload(expandedId, formValues)
            const res = await fetch(`${backendUrl}/senders/${expandedId}/configs`, addPostAuthorization(accessString, JSON.stringify(payload)))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            setShowAddForm(false)
            setFormValues({})
            await expandSender(expandedId)
            await loadInstalled()
        } catch (err) {
            setError(`Save failed: ${err}`)
        } finally {
            setSaving(false)
        }
    }

    const buildPayload = (_senderId: string, values: ConfigValues): ConfigValues => {
        const payload: ConfigValues = {}
        for (const f of schema) {
            const v = values[f.name]
            if (v === undefined || v === '') continue
            if (f.type === 'number') payload[f.name] = Number(v)
            else if (f.type === 'boolean') payload[f.name] = Boolean(v)
            else payload[f.name] = v
        }
        return payload
    }

    const isFormValid = (_senderId: string): boolean => {
        return schema.filter(f => f.required).every(f => {
            const v = formValues[f.name]
            return v !== undefined && v !== '' && v !== false
        })
    }

    const triggerDownload = (data: unknown, filename: string) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = filename; a.click()
        URL.revokeObjectURL(url)
    }

    const exportAll = async () => {
        try {
            const res = await fetch(`${backendUrl}/senders/export`, addGetAuthorization(accessString))
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            triggerDownload(await res.json(), 'kwirth-sender-configs.json')
        } catch (err) { setError(`Export failed: ${err}`) }
    }

    const importAll = async (file: File) => {
        try {
            const res = await fetch(`${backendUrl}/senders/import`, addPostAuthorization(accessString, await file.text()))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            const { count } = await res.json()
            await loadInstalled()
            if (expandedId) await expandSender(expandedId)
            setError(`Imported ${count} config(s)`)
        } catch (err) { setError(`Import failed: ${err}`) }
        finally { if (senderFileInputRef.current) senderFileInputRef.current.value = '' }
    }

    const exportSender = async (id: string) => {
        try {
            const res = await fetch(`${backendUrl}/senders/${id}/export`, addGetAuthorization(accessString))
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            triggerDownload(await res.json(), `kwirth-sender-${id}.json`)
        } catch (err) { setError(`Export failed: ${err}`) }
    }

    const importSender = async (id: string, file: File) => {
        try {
            const res = await fetch(`${backendUrl}/senders/${id}/import`, addPostAuthorization(accessString, await file.text()))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            const { count } = await res.json()
            await loadInstalled()
            await expandSender(id)
            setError(`Imported ${count} config(s) into ${id}`)
        } catch (err) { setError(`Import failed: ${err}`) }
        finally { if (senderFileInputRef.current) senderFileInputRef.current.value = '' }
    }

    const isInstalled = (id: string) => installed.some(s => s.id === id && s.installedFrom !== 'dev')
    const isDevInstalled = (id: string) => installed.some(s => s.id === id && s.installedFrom === 'dev')

    const senderGradient = (name: string) => {
        let hash = 0
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
        const hue = (Math.abs(hash) % 360 + 60) % 360
        const stripes = `repeating-linear-gradient(45deg, hsla(${hue}, 70%, 75%, 0.25) 0px, hsla(${hue}, 70%, 75%, 0.25) 1px, transparent 1px, transparent 9px)`
        return `${stripes}, linear-gradient(315deg, hsla(${hue}, 70%, 55%, 0.10) 0%, hsla(${hue}, 50%, 40%, 0.22) 100%)`
    }

    const resolveSource = (installedFrom?: string) => {
        if (!installedFrom) return null
        if (installedFrom === 'local') return <Chip icon={<FolderOpen />} label='Local file' size='small' variant='outlined' />
        if (installedFrom === 'dev') return <Chip icon={<Send />} label='dev' size='small' variant='outlined' color='warning' />
        const short = installedFrom.length > 40 ? installedFrom.slice(0, 37) + '…' : installedFrom
        return <Tooltip title={installedFrom}><Chip icon={<Link />} label={short} size='small' variant='outlined' sx={{ maxWidth: '100%' }} /></Tooltip>
    }

    // ─── Config form fields ────────────────────────────────────────────────────

    const renderField = (f: ISenderFieldDef) => {
        const value = formValues[f.name] ?? (f.type === 'boolean' ? false : '')

        if (f.type === 'boolean') return (
            <FormControlLabel key={f.name}
                control={<Switch size='small' checked={!!value} onChange={e => setFormValues(prev => ({ ...prev, [f.name]: e.target.checked }))} />}
                label={<Typography variant='body2'>{f.label}</Typography>} />
        )

        if (f.type === 'select' && f.options) return (
            <Box key={f.name} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant='body2' sx={{ minWidth: 90 }}>{f.label}{f.required ? ' *' : ''}</Typography>
                <Select size='small' value={value || ''} displayEmpty
                    onChange={e => setFormValues(prev => ({ ...prev, [f.name]: e.target.value }))}
                    sx={{ minWidth: 130 }}>
                    <MenuItem value=''><em>—</em></MenuItem>
                    {f.options.map((o, i) => <MenuItem key={o} value={o}>{f.labels?.[i] ?? o}</MenuItem>)}
                </Select>
            </Box>
        )

        if (f.name.endsWith('SenderId')) return (
            <Box key={f.name} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant='body2' sx={{ minWidth: 90 }}>{f.label}{f.required ? ' *' : ''}</Typography>
                <Select size='small' value={value || ''} displayEmpty
                    onChange={e => {
                        const senderIdField = f.name
                        const configField = senderIdField.replace(/SenderId$/, 'ConfigName')
                        setFormValues(prev => ({ ...prev, [senderIdField]: e.target.value, [configField]: '' }))
                    }}
                    sx={{ minWidth: 160 }}>
                    <MenuItem value=''><em>—</em></MenuItem>
                    {installed.map(s => <MenuItem key={s.id} value={s.id}>{s.displayName || s.id}</MenuItem>)}
                </Select>
            </Box>
        )

        if (f.name.endsWith('ConfigName')) {
            const linkedSenderId = formValues[f.name.replace(/ConfigName$/, 'SenderId')] as string | undefined
            const configNames = installed.find(s => s.id === linkedSenderId)?.configNames ?? []
            return (
                <Box key={f.name} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant='body2' sx={{ minWidth: 90 }}>{f.label}{f.required ? ' *' : ''}</Typography>
                    <Select size='small' value={value || ''} displayEmpty disabled={!linkedSenderId}
                        onChange={e => setFormValues(prev => ({ ...prev, [f.name]: e.target.value }))}
                        sx={{ minWidth: 160 }}>
                        <MenuItem value=''><em>—</em></MenuItem>
                        {configNames.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                    </Select>
                </Box>
            )
        }

        return (
            <TextField key={f.name} size='small'
                label={`${f.label}${f.required ? ' *' : ''}`}
                type={f.type === 'number' ? 'number' : f.type === 'password' ? 'password' : 'text'}
                value={value}
                onChange={e => setFormValues(prev => ({ ...prev, [f.name]: e.target.value }))}
                sx={{ flex: 1, minWidth: 150 }} />
        )
    }

    // ─── Sender card ──────────────────────────────────────────────────────────

    const SenderCard = ({ sender }: { sender: IInstalledSender }) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: 1.5, minHeight: 100, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, background: senderGradient(sender.name) }}>
            <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                <Box sx={{ color: 'text.secondary', mt: 0.25 }}><Send fontSize='small' /></Box>
                <Box flex={1} minWidth={0}>
                    <Stack direction='row' alignItems='center' spacing={0.5} flexWrap='wrap' useFlexGap>
                        <Typography variant='body2' fontWeight='bold'>{sender.displayName || sender.id}</Typography>
                        <Chip label={`v${sender.version}`} size='small' />
                        {sender.configNames.length > 0 && <Chip label={`${sender.configNames.length} config${sender.configNames.length > 1 ? 's' : ''}`} size='small' color='primary' variant='outlined' />}
                    </Stack>
                    <Typography variant='caption' color='text.secondary' display='block' sx={{ mt: 0.5 }}>{sender.description}</Typography>
                </Box>
                {sender.website &&
                    <Tooltip title='Open website'>
                        <IconButton size='small' sx={{ mt: -0.5, mr: -0.5 }} onClick={() => window.open(sender.website, '_blank', 'noopener')}>
                            <OpenInNew fontSize='small' />
                        </IconButton>
                    </Tooltip>
                }
            </Stack>
            <Stack direction='row' justifyContent='space-between' alignItems='center' sx={{ mt: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', mr: 1 }}>{resolveSource(sender.installedFrom)}</Box>
                <Stack direction='row' spacing={0.5}>
                    <Tooltip title='Configure'>
                        <IconButton size='small' color='primary' onClick={() => expandSender(sender.id)}>
                            <Settings fontSize='small' />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title={sender.installedFrom === 'dev' ? 'Dev senders cannot be uninstalled' : 'Uninstall'}>
                        <span>
                            <IconButton size='small' color='error' disabled={sender.installedFrom === 'dev' || uninstallingId === sender.id} onClick={() => uninstall(sender)}>
                                {uninstallingId === sender.id ? <CircularProgress size={16} /> : <Delete fontSize='small' />}
                            </IconButton>
                        </span>
                    </Tooltip>
                </Stack>
            </Stack>
        </Box>
    )

    // ─── Render ───────────────────────────────────────────────────────────────

    const expandedSender = installed.find(s => s.id === expandedId)
    const CustomFront = expandedSender?.hasFront ? window.__kwirth_senders__?.[expandedId!] : undefined

    return (
        <>
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '72vw', maxWidth: '72vw' } }}>
            <DialogTitle>Manage senders</DialogTitle>
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{ mt: 1 }}>

                    <Typography variant='subtitle2'>Installed senders</Typography>
                    {installed.length === 0
                        ? <Typography variant='body2' color='text.secondary'>No senders installed.</Typography>
                        : <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
                            {installed.map(s => <SenderCard key={s.id} sender={s} />)}
                          </Box>
                    }

                    <Typography variant='subtitle2' sx={{ pt: 1 }}>Install sender</Typography>
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
                        <Typography variant='subtitle2'>Available senders</Typography>
                        <TextField size='small' placeholder='Filter…' value={filterText} onChange={e => setFilterText(e.target.value)} sx={{ flex: 1 }} slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: '0.75rem' } } }} />
                        <Tooltip title='Refresh catalog'>
                            <span>
                                <IconButton size='small' onClick={fetchManifest} disabled={loadingManifest}>
                                    {loadingManifest ? <CircularProgress size={16} /> : <Refresh fontSize='small' />}
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Stack>

                    {available.length === 0 && !loadingManifest &&
                        <Typography variant='body2' color='text.secondary'>No senders in catalog.</Typography>
                    }

                    {Object.keys(groupedAvailable).length > 0 &&
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
                            {Object.keys(groupedAvailable).filter(id => !filterText || id.includes(filterText.toLowerCase()) || groupedAvailable[id][0].name?.toLowerCase().includes(filterText.toLowerCase()) || groupedAvailable[id][0].displayName?.toLowerCase().includes(filterText.toLowerCase())).map(id => {
                                const group = groupedAvailable[id]
                                const entry = getSelectedSender(id)
                                const versions = group.map(p => p.version)
                                return (
                                <Box key={id} sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: 1.5, minHeight: 100, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, background: senderGradient(entry.name) }}>
                                    <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                                        <Box sx={{ color: 'text.secondary', mt: 0.25 }}><Send fontSize='small' /></Box>
                                        <Box flex={1} minWidth={0}>
                                            <Stack direction='row' alignItems='center' spacing={0.5} flexWrap='wrap' useFlexGap>
                                                <Typography variant='body2' fontWeight='bold'>{entry.displayName}</Typography>
                                                {versions.length > 1
                                                    ? <Select size='small' value={entry.version} onChange={e => setSelectedVersions(prev => ({ ...prev, [id]: e.target.value }))} sx={{ height: 24, fontSize: '0.75rem', '& .MuiSelect-select': { py: 0, px: 1 } }}>
                                                        {versions.map(v => <MenuItem key={v} value={v} sx={{ fontSize: '0.75rem' }}>{v}</MenuItem>)}
                                                      </Select>
                                                    : <Chip label={`v${entry.version}`} size='small' />
                                                }
                                                {isDevInstalled(id) && <Chip label='dev active' size='small' variant='outlined' color='warning' />}
                                                {isInstalled(id) && <Chip label='installed' color='success' size='small' icon={<CheckCircle />} />}
                                            </Stack>
                                            <Typography variant='caption' color='text.secondary' display='block' sx={{ mt: 0.5 }}>{entry.description}</Typography>
                                            {entry.requires && entry.requires.length > 0 && (
                                                <Stack direction='row' flexWrap='wrap' useFlexGap spacing={0.5} sx={{ mt: 0.5 }}>
                                                    <Typography variant='caption' color='text.disabled'>Requires:</Typography>
                                                    {entry.requires.map((r, i) => <Chip key={i} label={`${r.id} (${r.type[0].toUpperCase()}) ≥${r.minVersion}`} size='small' variant='outlined' sx={{ fontSize: '0.6rem', height: 18 }} />)}
                                                </Stack>
                                            )}
                                        </Box>
                                        {entry.website && <Tooltip title='Open website'><IconButton size='small' sx={{ mt: -0.5, mr: -0.5 }} onClick={() => window.open(entry.website, '_blank', 'noopener')}><OpenInNew fontSize='small' /></IconButton></Tooltip>}
                                    </Stack>
                                    <Stack direction='row' justifyContent='flex-end' sx={{ mt: 1 }}>
                                        {(() => { const unmet = (entry.requires ?? []).filter(r => !isRequirementMet(r)); return (
                                            <Tooltip title={isDevInstalled(id) ? 'Dev version active' : isInstalled(id) ? 'Already installed' : unmet.length > 0 ? `Requires: ${unmet.map(r => `${r.type} ${r.id} ≥${r.minVersion}`).join(', ')}` : 'Install'}>
                                                <span><IconButton size='small' color='primary' disabled={isDevInstalled(id) || isInstalled(id) || installingId === id || unmet.length > 0} onClick={() => installFromCatalog(entry)}>
                                                    {installingId === id ? <CircularProgress size={16} /> : <Download fontSize='small' />}
                                                </IconButton></span>
                                            </Tooltip>
                                        )})()}
                                    </Stack>
                                </Box>
                                )})}
                        </Box>
                    }

                    {error && <Typography variant='caption' color={error.startsWith('Imported') ? 'success.main' : 'error'}>{error}</Typography>}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'space-between', px: 2 }}>
                <Stack direction='row' spacing={1}>
                    <input ref={senderFileInputRef} type='file' accept='.json' style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) importAll(f) }} />
                    <Tooltip title='Export ALL sender configs to JSON'>
                        <Button size='small' startIcon={<FileDownload />} onClick={exportAll}>Export all</Button>
                    </Tooltip>
                    <Tooltip title='Import sender configs from JSON (all senders)'>
                        <Button size='small' startIcon={<FileUpload />} onClick={() => senderFileInputRef.current?.click()}>Import all</Button>
                    </Tooltip>
                </Stack>
                <Button onClick={props.onClose}>Close</Button>
            </DialogActions>
        </Dialog>

        {/* Custom sender front (composite, timed, etc.) */}
        {expandedId && expandedSender?.hasFront && (
            frontLoaded[expandedId] && CustomFront
                ? <CustomFront onClose={() => setExpandedId(undefined)} backendUrl={backendUrl} accessString={accessString} />
                : null
        )}

        {/* Generic config dialog for senders without a custom front */}
        {expandedId && !expandedSender?.hasFront && (
            <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '560px' } }}>
                <DialogTitle>Configure: {installed.find(s => s.id === expandedId)?.displayName ?? expandedId}</DialogTitle>
                <DialogContent>
                    <Stack spacing={1.5} sx={{ mt: 1 }}>
                        {loadingConfigs
                            ? <CircularProgress size={20} />
                            : <>
                                {configs.length === 0
                                    ? <Typography variant='body2' color='text.secondary'>No configs yet.</Typography>
                                    : configs.map(cfg => {
                                        const preview = schema
                                            .filter(f => f.type !== 'password' && f.type !== 'boolean' && cfg[f.name] !== undefined && cfg[f.name] !== '')
                                            .slice(0, 4).map(f => `${f.label}: ${cfg[f.name]}`).join(' · ')
                                        return (
                                            <Box key={cfg.name} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 0.75, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                                                <Box>
                                                    <Typography variant='body2' fontWeight='bold'>{cfg.name}</Typography>
                                                    <Typography variant='caption' color='text.secondary'>{preview}</Typography>
                                                </Box>
                                                <Tooltip title='Delete config'>
                                                    <span>
                                                        <IconButton size='small' color='error' disabled={deletingName === cfg.name} onClick={() => deleteConfig(cfg.name)}>
                                                            {deletingName === cfg.name ? <CircularProgress size={14} /> : <Delete fontSize='small' />}
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            </Box>
                                        )
                                    })
                                }

                                <Divider />

                                <Button size='small' startIcon={<Add />} onClick={() => { setShowAddForm(v => !v); setFormValues({}) }}>
                                    Add config
                                </Button>

                                <Collapse in={showAddForm}>
                                    <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
                                            {schema.map(f => renderField(f))}
                                        </Box>
                                        <Stack direction='row' justifyContent='flex-end' spacing={1} sx={{ mt: 2 }}>
                                            <Button size='small' onClick={() => setShowAddForm(false)}>Cancel</Button>
                                            <Button size='small' variant='contained' disabled={saving || !isFormValid(expandedId)} onClick={saveConfig}>
                                                {saving ? <CircularProgress size={14} /> : 'Save'}
                                            </Button>
                                        </Stack>
                                    </Box>
                                </Collapse>

                                {error && <Typography variant='caption' color='error'>{error}</Typography>}
                            </>
                        }
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'space-between', px: 2 }}>
                    <Stack direction='row' spacing={1}>
                        <input ref={configImportFileRef} type='file' accept='.json' style={{ display: 'none' }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) importSender(expandedId, f) }} />
                        <Tooltip title='Export configs to JSON'>
                            <span>
                                <Button size='small' startIcon={<FileDownload />} disabled={configs.length === 0} onClick={() => exportSender(expandedId)}>Export</Button>
                            </span>
                        </Tooltip>
                        <Tooltip title='Import configs from JSON'>
                            <Button size='small' startIcon={<FileUpload />} onClick={() => configImportFileRef.current?.click()}>Import</Button>
                        </Tooltip>
                    </Stack>
                    <Button onClick={() => setExpandedId(undefined)}>Close</Button>
                </DialogActions>
            </Dialog>
        )}
        </>
    )
}

export { SenderDialog }
