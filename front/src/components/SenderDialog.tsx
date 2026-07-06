import React, { useContext, useEffect, useRef, useState } from 'react'
import {
    Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
    DialogTitle, Divider, FormControl, FormControlLabel, IconButton, InputLabel, MenuItem,
    Select, Stack, Switch, TextField, Tooltip, Typography, useTheme
} from '@mui/material'
import { Add, CheckCircle, ContentCopy, Delete, Download, FileDownload, FileUpload, FolderOpen, Link, OpenInNew, Refresh, Send, Settings, ViewList, ViewModule } from '../tools/KwirthIcons'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization, addPutAuthorization } from '../tools/AuthorizationManagement'
import { versionGreaterThan } from '@kwirthmagnify/kwirth-common'
import { useKeyboard } from '../tools/useKeyboard'

const SENDERS_MANIFEST_URL = 'https://raw.githubusercontent.com/kwirthmagnify/kwirth/refs/heads/master/senders/manifest.json'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ISenderFieldDef {
    name: string
    label: string
    type?: 'text' | 'number' | 'boolean' | 'password' | 'select'
    required?: boolean
    options?: string[]
    labels?: string[]
    common?: boolean
}

interface IRequirement {
    type: 'plugin' | 'sender' | 'provider'
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
    const theme = useTheme()
    useKeyboard(props.onClose)

    const [installed, setInstalled] = useState<IInstalledSender[]>([])
    const [available, setAvailable] = useState<ISenderManifestEntry[]>([])
    const [loadingManifest, setLoadingManifest] = useState(false)
    const [filterText, setFilterText] = useState('')
    const [availableFilter, setAvailableFilter] = useState('')
    const [selectedVersions, setSelectedVersions] = useState<Record<string, string>>({})
    const [crossInstalled, setCrossInstalled] = useState<Record<string, { id: string, version: string }[]>>({})

    const groupedAvailable: Record<string, ISenderManifestEntry[]> = available.reduce((acc, p) => { if (!acc[p.id]) acc[p.id]=[]; acc[p.id].push(p); return acc }, {} as Record<string, ISenderManifestEntry[]>)
    Object.values(groupedAvailable).forEach(g => g.sort((a,b) => versionGreaterThan(a.version, b.version) ? -1 : 1))
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
    const [editingName, setEditingName] = useState<string | undefined>()
    const [originalEditingName, setOriginalEditingName] = useState<string | undefined>()
    const [formValues, setFormValues] = useState<ConfigValues>({})
    const [baseFormValues, setBaseFormValues] = useState<ConfigValues>({})
    const [saving, setSaving] = useState(false)
    const [savingBase, setSavingBase] = useState(false)
    const [baseConfigOpen, setBaseConfigOpen] = useState(false)
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card')

    // Dynamic sender front loading
    const [frontLoaded, setFrontLoaded] = useState<Record<string, boolean>>({})

    const [configExportOpen, setConfigExportOpen] = useState(false)
    const [configExportSelected, setConfigExportSelected] = useState<Set<string>>(new Set())
    const [configExportIncludeBase, setConfigExportIncludeBase] = useState(true)

    const [configImportOpen, setConfigImportOpen] = useState(false)
    const [configImportData, setConfigImportData] = useState<{ configs: ConfigValues[]; base: ConfigValues }>({ configs: [], base: {} })
    const [configImportSelected, setConfigImportSelected] = useState<Set<string>>(new Set())
    const [configImportIncludeBase, setConfigImportIncludeBase] = useState(true)

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
        script.crossOrigin = 'anonymous'
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
                const endpoints: Record<string, string> = { plugin: `${backendUrl}/plugins`, provider: `${backendUrl}/providers` }
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
        return !!found && (found.version === req.minVersion || versionGreaterThan(found.version, req.minVersion))
    }
    
    const reloadConfigs = async (id: string) => {
        const sender = installed.find(s => s.id === id)
        if (sender?.hasFront) return
        setLoadingConfigs(true)
        try {
            const [configsRes, schemaRes] = await Promise.all([
                fetch(`${backendUrl}/senders/${id}/configs`, addGetAuthorization(accessString)),
                fetch(`${backendUrl}/senders/${id}/schema`, addGetAuthorization(accessString)),
            ])
            if (!configsRes.ok) throw new Error(`HTTP ${configsRes.status}`)
            const storedData = await configsRes.json()
            const { configs: loadedConfigs, ...commonFields } = storedData
            setConfigs(Array.isArray(loadedConfigs) ? loadedConfigs : [])
            const initBase: ConfigValues = {}
            for (const [k, v] of Object.entries(commonFields)) initBase[k] = v
            setBaseFormValues(initBase)
            if (schemaRes.ok) setSchema(await schemaRes.json())
        } catch (err) {
            setError(`Failed to load configs: ${err}`)
        } finally {
            setLoadingConfigs(false)
        }
    }

    const expandSender = async (id: string) => {
        if (expandedId === id) { setExpandedId(undefined); return }
        setExpandedId(id)
        setShowAddForm(false)
        setFormValues({})
        setError(undefined)
        setSchema([])
        await reloadConfigs(id)
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
            const newName = payload.name as string
            const res = await fetch(`${backendUrl}/senders/${expandedId}/configs`, addPostAuthorization(accessString, JSON.stringify(payload)))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            if (originalEditingName && originalEditingName !== newName) {
                await fetch(`${backendUrl}/senders/${expandedId}/configs/${encodeURIComponent(originalEditingName)}`, addDeleteAuthorization(accessString))
            }
            setEditingName(newName)
            setOriginalEditingName(newName)
            await reloadConfigs(expandedId)
            await loadInstalled()
        } catch (err) {
            setError(`Save failed: ${err}`)
        } finally {
            setSaving(false)
        }
    }

    const buildPayload = (_senderId: string, values: ConfigValues): ConfigValues => {
        const payload: ConfigValues = {}
        for (const f of schema.filter(f => !f.common)) {
            const v = values[f.name]
            if (v === undefined || v === '') continue
            if (f.type === 'number') payload[f.name] = Number(v)
            else if (f.type === 'boolean') payload[f.name] = Boolean(v)
            else payload[f.name] = v
        }
        if (values['description'] !== undefined && values['description'] !== '') payload['description'] = values['description']
        return payload
    }

    const buildBasePayload = (): ConfigValues => {
        const payload: ConfigValues = {}
        for (const f of schema.filter(f => f.common)) {
            const v = baseFormValues[f.name]
            if (v === undefined || v === '') continue
            if (f.type === 'number') payload[f.name] = Number(v)
            else if (f.type === 'boolean') payload[f.name] = Boolean(v)
            else payload[f.name] = v
        }
        return payload
    }

    const isFormValid = (_senderId: string): boolean => {
        return schema.filter(f => f.required && !f.common).every(f => {
            const v = formValues[f.name]
            return v !== undefined && v !== '' && v !== false
        })
    }

    const isBaseFormValid = (): boolean => {
        return schema.filter(f => f.required && f.common).every(f => {
            const v = baseFormValues[f.name]
            return v !== undefined && v !== '' && v !== false
        })
    }

    const saveBase = async () => {
        if (!expandedId) return
        setSavingBase(true)
        setError(undefined)
        try {
            const common = buildBasePayload()
            const storedConfig = { ...common, configs }
            const res = await fetch(`${backendUrl}/senders/${expandedId}/configs`, addPutAuthorization(accessString, JSON.stringify(storedConfig)))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            await reloadConfigs(expandedId)
            await loadInstalled()
        } catch (err) {
            setError(`Save failed: ${err}`)
        } finally {
            setSavingBase(false)
        }
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

    const openImportDialog = async (file: File) => {
        try {
            const raw = JSON.parse(await file.text())
            const allConfigs: ConfigValues[] = Array.isArray(raw) ? raw : (raw.configs ?? [])
            const baseKeys = !Array.isArray(raw) ? Object.keys(raw).filter(k => k !== 'configs' && k !== 'senderId') : []
            const base = Object.fromEntries(baseKeys.map(k => [k, (raw as ConfigValues)[k]]))
            setConfigImportData({ configs: allConfigs, base })
            setConfigImportSelected(new Set(allConfigs.map((c: ConfigValues) => c.name)))
            setConfigImportIncludeBase(baseKeys.length > 0)
            setConfigImportOpen(true)
        } catch (err) {
            setError(`Cannot parse import file: ${err}`)
        } finally {
            if (configImportFileRef.current) configImportFileRef.current.value = ''
        }
    }

    const confirmImport = async () => {
        if (!expandedId) return
        setConfigImportOpen(false)
        try {
            const selectedConfigs = configImportData.configs.filter(c => configImportSelected.has(c.name))
            const hasBase = configImportIncludeBase && Object.keys(configImportData.base).length > 0
            if (hasBase) {
                const currentRes = await fetch(`${backendUrl}/senders/${expandedId}/configs`, addGetAuthorization(accessString))
                if (currentRes.ok) {
                    const current = await currentRes.json()
                    const existingConfigs: ConfigValues[] = Array.isArray(current) ? current : (current.configs ?? [])
                    const mergedConfigs = [
                        ...existingConfigs.filter((e: ConfigValues) => !selectedConfigs.some(i => i.name === e.name)),
                        ...selectedConfigs
                    ]
                    await fetch(`${backendUrl}/senders/${expandedId}/configs`, addPutAuthorization(accessString, JSON.stringify({ ...configImportData.base, configs: mergedConfigs })))
                }
            } else {
                for (const cfg of selectedConfigs) {
                    await fetch(`${backendUrl}/senders/${expandedId}/configs`, addPostAuthorization(accessString, JSON.stringify(cfg)))
                }
            }
            await reloadConfigs(expandedId)
            await loadInstalled()
        } catch (err) { setError(`Import failed: ${err}`) }
    }

    const isInstalled = (id: string) => installed.some(s => s.id === id && s.installedFrom !== 'dev')
    const isDevInstalled = (id: string) => installed.some(s => s.id === id && s.installedFrom === 'dev')

    const senderGradient = (name: string) => {
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
        const short = installedFrom.length > 40 ? installedFrom.slice(0, 37) + '…' : installedFrom
        return <Tooltip title={installedFrom}><Chip icon={<Link />} label={short} size='small' variant='outlined' sx={{ maxWidth: '100%' }} /></Tooltip>
    }

    // ─── Config form fields ────────────────────────────────────────────────────

    const renderField = (f: ISenderFieldDef, values: ConfigValues, onChange: (name: string, val: unknown) => void, isEditing = false) => {
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

        if (f.name.endsWith('SenderId')) return (
            <FormControl key={f.name} size='small' fullWidth>
                <InputLabel>{f.label}{f.required ? ' *' : ''}</InputLabel>
                <Select label={`${f.label}${f.required ? ' *' : ''}`} value={value || ''} displayEmpty
                    onChange={e => {
                        const configField = f.name.replace(/SenderId$/, 'ConfigName')
                        onChange(f.name, e.target.value)
                        onChange(configField, '')
                    }}>
                    <MenuItem value=''><em>—</em></MenuItem>
                    {installed.map(s => <MenuItem key={s.id} value={s.id}>{s.displayName || s.id}</MenuItem>)}
                </Select>
            </FormControl>
        )

        if (f.name.endsWith('ConfigName')) {
            const linkedSenderId = values[f.name.replace(/ConfigName$/, 'SenderId')] as string | undefined
            const configNames = installed.find(s => s.id === linkedSenderId)?.configNames ?? []
            return (
                <FormControl key={f.name} size='small' fullWidth disabled={!linkedSenderId}>
                    <InputLabel>{f.label}{f.required ? ' *' : ''}</InputLabel>
                    <Select label={`${f.label}${f.required ? ' *' : ''}`} value={value || ''} displayEmpty
                        onChange={e => onChange(f.name, e.target.value)}>
                        <MenuItem value=''><em>—</em></MenuItem>
                        {configNames.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                    </Select>
                </FormControl>
            )
        }

        return (
            <TextField key={f.name} size='small' fullWidth
                label={`${f.label}${f.required ? ' *' : ''}`}
                type={f.type === 'number' ? 'number' : f.type === 'password' ? 'password' : 'text'}
                autoComplete={f.type === 'password' ? 'new-password' : 'off'}
                value={value}
                onChange={e => onChange(f.name, e.target.value)} />
        )
    }

    // ─── Sender card ──────────────────────────────────────────────────────────

    const SenderCard = ({ sender }: { sender: IInstalledSender }) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: 1.5, minHeight: 100, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, background: senderGradient(sender.name) }}>
            <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                <Box sx={{ color: 'text.secondary', mt: 0.25 }}><Send fontSize='small' /></Box>
                <Box flex={1} minWidth={0}>
                    <Stack direction='row' alignItems='center' spacing={0.5} sx={{ width: '100%' }}>
                        <Typography variant='body2' fontWeight='bold' sx={{ flex: 1 }}>{sender.displayName || sender.id}</Typography>
                        {sender.configNames.length > 0 && <Chip label={`${sender.configNames.length} config${sender.configNames.length > 1 ? 's' : ''}`} size='small' color='primary' variant='outlined' />}
                        <Chip label={`v${sender.version}`} size='small' sx={{ minWidth: 72 }} />
                    </Stack>
                    <Typography variant='caption' color='text.secondary' display='block' sx={{ mt: 0.5 }}>{sender.description}</Typography>
                </Box>
                {sender.website &&
                    <Tooltip title='Open website'>
                        <IconButton size='small' sx={{ mr: -0.5 }} onClick={() => window.open(sender.website, '_blank', 'noopener')}>
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
    const CustomFront = expandedSender?.hasFront ? window.__kwirth_senders__?.[expandedId!]?.ConfigDialog : undefined

    return (
        <>
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '72vw', maxWidth: '72vw', height: '80vh' } }}>
            <DialogTitle>Manage senders</DialogTitle>
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{ mt: 1 }}>

                    <Stack direction='row' alignItems='center' spacing={1}>
                        <Typography variant='subtitle2'>Installed senders</Typography>
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
                        ? <Typography variant='body2' color='text.secondary'>No senders installed.</Typography>
                        : viewMode === 'card'
                            ? <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
                                {installed.filter(s => !filterText || s.name.toLowerCase().includes(filterText.toLowerCase()) || (s.displayName ?? '').toLowerCase().includes(filterText.toLowerCase()) || s.description.toLowerCase().includes(filterText.toLowerCase())).map(s => <SenderCard key={s.id} sender={s} />)}
                              </Box>
                            : <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                                {installed.filter(s => !filterText || s.name.toLowerCase().includes(filterText.toLowerCase()) || (s.displayName ?? '').toLowerCase().includes(filterText.toLowerCase()) || s.description.toLowerCase().includes(filterText.toLowerCase())).map(s => (
                                    <Box key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
                                        <Box sx={{ color: 'text.secondary', flexShrink: 0, display: 'flex' }}><Send fontSize='small' /></Box>
                                        <Typography variant='body2' fontWeight='bold' sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.displayName || s.id}</Typography>
                                        {s.configNames.length > 0 && <Chip label={`${s.configNames.length} cfg`} size='small' color='primary' variant='outlined' />}
                                        <Tooltip title='Configure'>
                                            <IconButton size='small' color='primary' onClick={() => expandSender(s.id)}>
                                                <Settings fontSize='small' />
                                            </IconButton>
                                        </Tooltip>
                                        <Chip label={`v${s.version}`} size='small' sx={{ minWidth: 72 }} />
                                        <Tooltip title={s.installedFrom === 'dev' ? 'Dev senders cannot be uninstalled' : 'Uninstall'}>
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
                        <Typography variant='body2' color='text.secondary'>No senders in catalog.</Typography>
                    }

                    {Object.keys(groupedAvailable).length > 0 && (() => {
                        const filteredIds = Object.keys(groupedAvailable).filter(id => !availableFilter || id.includes(availableFilter.toLowerCase()) || groupedAvailable[id][0].name?.toLowerCase().includes(availableFilter.toLowerCase()) || groupedAvailable[id][0].displayName?.toLowerCase().includes(availableFilter.toLowerCase()))
                        return viewMode === 'card'
                            ? <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
                                {filteredIds.map(id => {
                                    const group = groupedAvailable[id]; const entry = getSelectedSender(id); const versions = group.map(p => p.version)
                                    return (
                                    <Box key={id} sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: 1.5, minHeight: 100, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, background: senderGradient(entry.name) }}>
                                        <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                                            <Box sx={{ color: 'text.secondary', mt: 0.25 }}><Send fontSize='small' /></Box>
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
                                                {entry.requires && entry.requires.length > 0 && (
                                                    <Stack direction='row' flexWrap='wrap' useFlexGap spacing={0.5} sx={{ mt: 0.5 }}>
                                                        <Typography variant='caption' color='text.disabled'>Requires:</Typography>
                                                        {entry.requires.map((r, i) => <Chip key={i} label={`${r.id} (${r.type[0].toUpperCase()}) ≥${r.minVersion}`} size='small' variant='outlined' sx={{ fontSize: '0.6rem', height: 18 }} />)}
                                                    </Stack>
                                                )}
                                            </Box>
                                            {entry.website && <Tooltip title='Open website'><IconButton size='small' sx={{ mr: -0.5 }} onClick={() => window.open(entry.website, '_blank', 'noopener')}><OpenInNew fontSize='small' /></IconButton></Tooltip>}
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
                                    )
                                })}
                              </Box>
                            : <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                                {filteredIds.map(id => {
                                    const group = groupedAvailable[id]; const entry = getSelectedSender(id); const versions = group.map(p => p.version)
                                    const unmet = (entry.requires ?? []).filter(r => !isRequirementMet(r))
                                    return (
                                        <Box key={id} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
                                            <Box sx={{ color: 'text.secondary', flexShrink: 0, display: 'flex' }}><Send fontSize='small' /></Box>
                                            <Typography variant='body2' fontWeight='bold' sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.displayName}</Typography>
                                            {isDevInstalled(id) && <Chip label='dev active' size='small' variant='outlined' color='warning' />}
                                            {isInstalled(id) && <Chip label='installed' color='success' size='small' icon={<CheckCircle />} />}
                                            {versions.length > 1
                                                ? <Select size='small' value={entry.version} onChange={e => setSelectedVersions(prev => ({ ...prev, [id]: e.target.value }))} sx={{ height: 24, fontSize: '0.75rem', minWidth: 80, '& .MuiSelect-select': { py: 0, px: 1 } }}>
                                                    {versions.map(v => <MenuItem key={v} value={v} sx={{ fontSize: '0.75rem' }}>{v}</MenuItem>)}
                                                  </Select>
                                                : <Chip label={`v${entry.version}`} size='small' sx={{ minWidth: 72 }} />
                                            }
                                            <Tooltip title={isDevInstalled(id) ? 'Dev version active' : isInstalled(id) ? 'Already installed' : unmet.length > 0 ? `Requires: ${unmet.map(r => `${r.type} ${r.id} ≥${r.minVersion}`).join(', ')}` : 'Install'}>
                                                <span><IconButton size='small' color='primary' disabled={isDevInstalled(id) || isInstalled(id) || installingId === id || unmet.length > 0} onClick={() => installFromCatalog(entry)}>
                                                    {installingId === id ? <CircularProgress size={16} /> : <Download fontSize='small' />}
                                                </IconButton></span>
                                            </Tooltip>
                                        </Box>
                                    )
                                })}
                              </Box>
                    })()}

                </Stack>
            </DialogContent>
            {error && <Box sx={{ px: 3, pb: 1 }}><Typography variant='caption' color={error.startsWith('Imported') ? 'success.main' : 'error'}>{error}</Typography></Box>}
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
                ? <CustomFront onClose={() => { setExpandedId(undefined); loadInstalled() }} backendUrl={backendUrl} accessString={accessString} />
                : null
        )}

        {/* Generic config dialog for senders without a custom front */}
        {expandedId && !expandedSender?.hasFront && (
            <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '860px', height: '600px' } }}>
                <DialogTitle>Configure: {installed.find(s => s.id === expandedId)?.displayName ?? expandedId}</DialogTitle>
                <DialogContent sx={{ display: 'flex', gap: 2, p: '16px !important', overflow: 'hidden', height: '100%' }}>

                    {/* Left — config list */}
                    <Box sx={{ width: 190, display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                        <Stack direction='row' alignItems='center' justifyContent='space-between'>
                            <Typography variant='caption' color='text.secondary' fontWeight='bold'>Configs</Typography>
                            {schema.some(f => f.common) && (
                                <Tooltip title='Edit base configuration'>
                                    <IconButton size='small' onClick={() => setBaseConfigOpen(true)}><Settings sx={{ fontSize: 16 }} /></IconButton>
                                </Tooltip>
                            )}
                        </Stack>
                        <Box sx={{ flex: 1, border: 1, borderColor: 'divider', borderRadius: 1, overflowY: 'auto' }}>
                            {loadingConfigs
                                ? <Box sx={{ p: 1 }}><CircularProgress size={16} /></Box>
                                : configs.length === 0
                                    ? <Typography variant='caption' color='text.disabled' sx={{ p: 1, display: 'block' }}>No configs yet.</Typography>
                                    : configs.map(cfg => (
                                        <Box key={cfg.name} sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider', borderLeft: editingName === cfg.name ? 3 : 0, borderLeftColor: 'primary.main', bgcolor: editingName === cfg.name ? 'action.selected' : 'transparent' }}>
                                            <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', cursor: 'pointer' }} onClick={() => { setEditingName(cfg.name); setOriginalEditingName(cfg.name); setFormValues({ ...cfg }); setShowAddForm(true) }}>
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
                        <Stack direction='row' spacing={0.5}>
                            <Button size='small' startIcon={<Add />} onClick={() => { setShowAddForm(true); setEditingName(undefined); setOriginalEditingName(undefined); setFormValues({}) }} sx={{ flex: 1 }}>New</Button>
                            <Button size='small' startIcon={<ContentCopy />} disabled={!editingName} onClick={() => { setOriginalEditingName(undefined); setEditingName(undefined); setFormValues(prev => ({ ...prev, name: `${prev.name ?? ''} (copy)` })); setShowAddForm(true) }} sx={{ flex: 1 }}>Clone</Button>
                        </Stack>
                    </Box>

                    <Divider orientation='vertical' flexItem />

                    {/* Right — per-config form */}
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0, overflow: 'hidden' }}>

                        {/* Per-config form */}
                        {showAddForm
                            ? <>
                                <Typography variant='caption' color='text.secondary' fontWeight='bold'>
                                    {editingName ? `Editing: ${editingName}` : 'New config'}
                                </Typography>
                                <Box sx={{ flex: 1, overflowY: 'auto', pt: 1 }}>
                                    <Stack direction='column' spacing={1.5}>
                                        {schema.filter(f => f.name === 'name').map(f => renderField(f, formValues, (name, val) => setFormValues(prev => ({ ...prev, [name]: val })), !!editingName))}
                                        <TextField size='small' label='Description' fullWidth multiline maxRows={2}
                                            value={formValues['description'] ?? ''}
                                            onChange={e => setFormValues(prev => ({ ...prev, description: e.target.value || undefined }))} />
                                        {schema.filter(f => f.name !== 'name' && !f.common).map(f => renderField(f, formValues, (name, val) => setFormValues(prev => ({ ...prev, [name]: val })), !!editingName))}
                                    </Stack>
                                </Box>
                                <Stack direction='row' justifyContent='flex-end' alignItems='center' spacing={1}>
                                    {error && <Typography variant='caption' color='error' sx={{ flex: 1 }}>{error}</Typography>}
                                    <Button size='small' onClick={() => { setShowAddForm(false); setEditingName(undefined); setFormValues({}) }}>Cancel</Button>
                                    <Button size='small' variant='contained' disabled={saving || !isFormValid(expandedId)} onClick={saveConfig}>
                                        {saving ? <CircularProgress size={14} /> : editingName ? 'Update' : 'Add'}
                                    </Button>
                                </Stack>
                            </>
                            : <Box sx={{ m: 'auto', color: 'text.disabled' }}>
                                <Typography variant='body2'>Select a config to edit or click New.</Typography>
                            </Box>
                        }
                    </Box>
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'space-between', px: 2 }}>
                    <Stack direction='row' spacing={1}>
                        <input ref={configImportFileRef} type='file' accept='.json' style={{ display: 'none' }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) openImportDialog(f) }} />
                        <Tooltip title='Export configs to JSON'>
                            <span>
                                <Button size='small' startIcon={<FileDownload />} disabled={configs.length === 0}
                                    onClick={() => { setConfigExportSelected(new Set(configs.map(c => c.name))); setConfigExportOpen(true) }}>
                                    Export
                                </Button>
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

        {/* Export config selection dialog */}
        {configExportOpen && expandedId && (
            <Dialog open maxWidth='xs' fullWidth>
                <DialogTitle>Export configs — {installed.find(s => s.id === expandedId)?.displayName ?? expandedId}</DialogTitle>
                <DialogContent>
                    <Stack spacing={0.5} sx={{ pt: 0.5 }}>
                        <FormControlLabel
                            control={<Checkbox size='small'
                                checked={configExportSelected.size === configs.length && configs.length > 0}
                                indeterminate={configExportSelected.size > 0 && configExportSelected.size < configs.length}
                                onChange={e => setConfigExportSelected(e.target.checked ? new Set(configs.map(c => c.name)) : new Set())} />}
                            label={<Typography variant='body2' fontWeight='bold'>Select all</Typography>}
                        />
                        <Divider />
                        {configs.map(cfg => (
                            <FormControlLabel key={cfg.name}
                                control={<Checkbox size='small' checked={configExportSelected.has(cfg.name)}
                                    onChange={e => setConfigExportSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(cfg.name) : n.delete(cfg.name); return n })} />}
                                label={<Box><Typography variant='body2'>{cfg.name}</Typography>{cfg.description && <Typography variant='caption' color='text.secondary'>{cfg.description}</Typography>}</Box>}
                            />
                        ))}
                        {Object.keys(baseFormValues).length > 0 && <>
                            <Divider />
                            <FormControlLabel
                                control={<Checkbox size='small' checked={configExportIncludeBase}
                                    onChange={e => setConfigExportIncludeBase(e.target.checked)} />}
                                label={<Typography variant='body2' color='text.secondary'>Include base configuration</Typography>}
                            />
                        </>}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfigExportOpen(false)}>Cancel</Button>
                    <Button variant='contained' disabled={configExportSelected.size === 0}
                        onClick={() => {
                            const selected = configs.filter(c => configExportSelected.has(c.name))
                            const base = configExportIncludeBase && Object.keys(baseFormValues).length > 0 ? baseFormValues : {}
                            triggerDownload({ senderId: expandedId, ...base, configs: selected }, `kwirth-sender-${expandedId}-configs.json`)
                            setConfigExportOpen(false)
                        }}>
                        Export ({configExportSelected.size})
                    </Button>
                </DialogActions>
            </Dialog>
        )}

        {/* Import config selection dialog */}
        {configImportOpen && expandedId && (
            <Dialog open maxWidth='xs' fullWidth>
                <DialogTitle>Import configs — {installed.find(s => s.id === expandedId)?.displayName ?? expandedId}</DialogTitle>
                <DialogContent>
                    <Stack spacing={0.5} sx={{ pt: 0.5 }}>
                        {configImportData.configs.length === 0
                            ? <Typography variant='body2' color='text.secondary'>No configs found in file.</Typography>
                            : <>
                                <FormControlLabel
                                    control={<Checkbox size='small'
                                        checked={configImportSelected.size === configImportData.configs.length && configImportData.configs.length > 0}
                                        indeterminate={configImportSelected.size > 0 && configImportSelected.size < configImportData.configs.length}
                                        onChange={e => setConfigImportSelected(e.target.checked ? new Set(configImportData.configs.map(c => c.name)) : new Set())} />}
                                    label={<Typography variant='body2' fontWeight='bold'>Select all</Typography>}
                                />
                                <Divider />
                                {configImportData.configs.map(cfg => (
                                    <FormControlLabel key={cfg.name}
                                        control={<Checkbox size='small' checked={configImportSelected.has(cfg.name)}
                                            onChange={e => setConfigImportSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(cfg.name) : n.delete(cfg.name); return n })} />}
                                        label={<Box><Typography variant='body2'>{cfg.name}</Typography>{cfg.description && <Typography variant='caption' color='text.secondary'>{cfg.description}</Typography>}</Box>}
                                    />
                                ))}
                            </>
                        }
                        <Divider />
                        <FormControlLabel
                            control={<Checkbox size='small'
                                checked={configImportIncludeBase && Object.keys(configImportData.base).length > 0}
                                disabled={Object.keys(configImportData.base).length === 0}
                                onChange={e => setConfigImportIncludeBase(e.target.checked)} />}
                            label={
                                <Box>
                                    <Typography variant='body2' color={Object.keys(configImportData.base).length === 0 ? 'text.disabled' : 'text.secondary'}>
                                        Include base configuration
                                    </Typography>
                                    {Object.keys(configImportData.base).length === 0 &&
                                        <Typography variant='caption' color='text.disabled'>Not present in file</Typography>
                                    }
                                </Box>
                            }
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfigImportOpen(false)}>Cancel</Button>
                    <Button variant='contained' disabled={configImportSelected.size === 0 && !configImportIncludeBase} onClick={confirmImport}>
                        Import ({configImportSelected.size})
                    </Button>
                </DialogActions>
            </Dialog>
        )}

        {/* Base config sub-dialog */}
        {baseConfigOpen && expandedId && (
            <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '480px' } }} onClose={() => setBaseConfigOpen(false)}>
                <DialogTitle>Base configuration — {installed.find(s => s.id === expandedId)?.displayName ?? expandedId}</DialogTitle>
                <DialogContent>
                    <Stack direction='column' spacing={1.5} sx={{ pt: 1 }}>
                        {schema.filter(f => f.common).map(f => renderField(f, baseFormValues, (name, val) => setBaseFormValues(prev => ({ ...prev, [name]: val }))))}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setBaseConfigOpen(false)}>Cancel</Button>
                    <Button variant='contained' disabled={savingBase || !isBaseFormValid()} onClick={async () => { await saveBase(); setBaseConfigOpen(false) }}>
                        {savingBase ? <CircularProgress size={14} /> : 'Save'}
                    </Button>
                </DialogActions>
            </Dialog>
        )}
        </>
    )
}

export { SenderDialog }
