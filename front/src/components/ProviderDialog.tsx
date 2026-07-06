import React, { useContext, useEffect, useRef, useState } from 'react'
import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, IconButton, MenuItem, Select, Stack, Switch, TextField, Tooltip, Typography, useTheme } from '@mui/material'
import { CheckCircle, Delete, Download, Factory, FolderOpen, Link, OpenInNew, Refresh, Settings, ViewList, ViewModule } from '../tools/KwirthIcons'

import { SessionContext, SessionContextType } from '../model/SessionContext'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization } from '../tools/AuthorizationManagement'
import { versionGreaterThan } from '@kwirthmagnify/kwirth-common'
import { useKeyboard } from '../tools/useKeyboard'

declare global { interface Window { __kwirth_providers__: Record<string, any> } }
const PROVIDERS_MANIFEST_URL = 'https://raw.githubusercontent.com/kwirthmagnify/kwirth/refs/heads/master/providers/manifest.json'

interface IRequirement {
    type: 'plugin' | 'sender' | 'provider'
    id: string
    minVersion: string
}

interface IProviderManifestEntry {
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    url: string
    requires?: IRequirement[]
}

interface IInstalledProvider {
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    hasFront?: boolean
    hasSchema?: boolean
}

interface IProviderSchemaField {
    name: string
    label: string
    type: 'string' | 'number' | 'boolean' | 'password'
    required?: boolean
    default?: string | number | boolean
}

interface IProviderDialogProps {
    onClose: () => void
}

const ProviderDialog: React.FC<IProviderDialogProps> = (props: IProviderDialogProps) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType
    const theme = useTheme()
    useKeyboard(props.onClose)

    const [available, setAvailable] = useState<IProviderManifestEntry[]>([])
    const [installed, setInstalled] = useState<IInstalledProvider[]>([])
    const [loadingManifest, setLoadingManifest] = useState(false)
    const [installingId, setInstallingId] = useState<string | undefined>()
    const [uninstallingId, setUninstallingId] = useState<string | undefined>()
    const [error, setError] = useState<string | undefined>()
    const [filterText, setFilterText] = useState('')
    const [installedFilter, setInstalledFilter] = useState('')
    const [selectedVersions, setSelectedVersions] = useState<Record<string, string>>({})
    const [crossInstalled, setCrossInstalled] = useState<Record<string, { id: string, version: string }[]>>({})
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card')
    const [expandedId, setExpandedId] = useState<string | undefined>()
    const [frontLoaded, setFrontLoaded] = useState<Record<string, boolean>>({})
    const [configSchema, setConfigSchema] = useState<IProviderSchemaField[] | undefined>()
    const [configValues, setConfigValues] = useState<Record<string, unknown>>({})
    const [savingConfig, setSavingConfig] = useState(false)

    const groupedAvailable: Record<string, IProviderManifestEntry[]> = available.reduce((acc, p) => { if (!acc[p.id]) acc[p.id]=[]; acc[p.id].push(p); return acc }, {} as Record<string, IProviderManifestEntry[]>)
    Object.values(groupedAvailable).forEach(g => g.sort((a,b) => versionGreaterThan(a.version, b.version) ? -1 : 1))
    const getSelectedProvider = (id: string): IProviderManifestEntry => { const g=groupedAvailable[id]; const v=selectedVersions[id]??g[0].version; return g.find(p=>p.version===v)??g[0] }
    const [customUrl, setCustomUrl] = useState('')
    const [installingCustom, setInstallingCustom] = useState(false)
    const [installingFile, setInstallingFile] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        loadInstalled()
        fetchManifest()
    }, [])

    useEffect(() => {
        if (!expandedId) return
        const provider = installed.find(p => p.id === expandedId)
        if (!provider?.hasFront) {
            loadSchemaAndConfig(expandedId)
            return
        }
        // Remove any existing script tag and clear the registry entry so the latest front.js is always loaded
        const existing = document.getElementById(`kwirth-provider-front-${expandedId}`)
        if (existing) existing.remove()
        if (window.__kwirth_providers__) delete window.__kwirth_providers__[expandedId]
        setFrontLoaded(prev => ({ ...prev, [expandedId]: false }))

        const script = document.createElement('script')
        script.id = `kwirth-provider-front-${expandedId}`
        script.src = `${backendUrl}/providers/${expandedId}/front?t=${Date.now()}`
        script.crossOrigin = 'anonymous'
        script.onload = () => setFrontLoaded(prev => ({ ...prev, [expandedId]: true }))
        script.onerror = () => setError(`Failed to load UI for provider "${expandedId}"`)
        document.head.appendChild(script)
    }, [expandedId, installed])

    const loadSchemaAndConfig = async (id: string) => {
        setConfigSchema(undefined)
        setConfigValues({})
        try {
            const [schemaRes, configRes] = await Promise.all([
                fetch(`${backendUrl}/providers/${id}/schema`, addGetAuthorization(accessString)),
                fetch(`${backendUrl}/providers/${id}/config`, addGetAuthorization(accessString))
            ])
            if (schemaRes.ok) setConfigSchema(await schemaRes.json())
            if (configRes.ok) setConfigValues(await configRes.json())
        } catch {}
    }

    const saveProviderConfig = async () => {
        if (!expandedId) return
        setSavingConfig(true)
        try {
            const res = await fetch(`${backendUrl}/providers/${expandedId}/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: accessString ? `Bearer ${accessString}` : '', 'X-Kwirth-App': 'true' },
                body: JSON.stringify(configValues)
            })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            setExpandedId(undefined)
        } catch (err) {
            setError(`Failed to save config: ${err}`)
        } finally {
            setSavingConfig(false)
        }
    }

    const renderConfigField = (field: IProviderSchemaField) => {
        const val = configValues[field.name]
        if (field.type === 'boolean') return (
            <FormControlLabel key={field.name}
                control={<Switch checked={!!val} onChange={e => setConfigValues(prev => ({ ...prev, [field.name]: e.target.checked }))} />}
                label={field.label} />
        )
        return (
            <TextField key={field.name} size='small' fullWidth label={field.label}
                type={field.type === 'number' ? 'number' : field.type === 'password' ? 'password' : 'text'}
                value={val ?? field.default ?? ''}
                onChange={e => setConfigValues(prev => ({ ...prev, [field.name]: field.type === 'number' ? Number(e.target.value) : e.target.value }))}
                required={field.required} />
        )
    }

    const loadInstalled = async () => {
        try {
            const res = await fetch(`${backendUrl}/providers`, addGetAuthorization(accessString))
            const data: IInstalledProvider[] = await res.json()
            setInstalled(data)
        } catch (err) {
            setError(`Failed to load installed providers: ${err}`)
        }
    }

    const fetchManifest = async () => {
        setError(undefined)
        setLoadingManifest(true)
        try {
            const res = await fetch(PROVIDERS_MANIFEST_URL)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data: IProviderManifestEntry[] = await res.json()
            setAvailable(data)
            const neededTypes = new Set(data.flatMap(e => e.requires ?? []).map(r => r.type).filter(t => t !== 'provider'))
            if (neededTypes.size > 0) {
                const endpoints: Record<string, string> = { plugin: `${backendUrl}/plugins`, sender: `${backendUrl}/senders` }
                const results: Record<string, { id: string, version: string }[]> = {}
                await Promise.all([...neededTypes].map(async t => {
                    try { const r = await fetch(endpoints[t], addGetAuthorization(accessString)); if (r.ok) results[t] = await r.json() } catch {}
                }))
                setCrossInstalled(results)
            }
        } catch (err) {
            setError(`Failed to fetch provider catalog: ${err}`)
        } finally {
            setLoadingManifest(false)
        }
    }

    const isRequirementMet = (req: IRequirement): boolean => {
        const list = req.type === 'provider' ? installed : (crossInstalled[req.type] ?? [])
        const found = list.find(x => x.id === req.id)
        return !!found && (found.version === req.minVersion || versionGreaterThan(found.version, req.minVersion))
    }

    const installFromCatalog = async (provider: IProviderManifestEntry) => {
        setError(undefined)
        setInstallingId(provider.id)
        try {
            const res = await fetch(`${backendUrl}/providers/install`, addPostAuthorization(accessString, JSON.stringify({ url: provider.url })))
            if (!res.ok) { const body = await res.json(); throw new Error(body.error ?? `HTTP ${res.status}`) }
            await loadInstalled()
        } catch (err) {
            setError(`Failed to install ${provider.name}: ${err}`)
        } finally {
            setInstallingId(undefined)
        }
    }

    const isInstalled = (id: string) => installed.some(p => p.id === id && p.installedFrom !== 'dev')
    const isDevInstalled = (id: string) => installed.some(p => p.id === id && p.installedFrom === 'dev')

    const uninstall = async (provider: IInstalledProvider) => {
        setError(undefined)
        setUninstallingId(provider.id)
        try {
            const res = await fetch(`${backendUrl}/providers/${provider.id}`, addDeleteAuthorization(accessString))
            if (!res.ok) { const body = await res.json(); throw new Error(body.error ?? `HTTP ${res.status}`) }
            await loadInstalled()
        } catch (err) {
            setError(`Failed to uninstall ${provider.name}: ${err}`)
        } finally {
            setUninstallingId(undefined)
        }
    }

    const installFromUrl = async () => {
        const url = customUrl.trim()
        if (!url) return
        setError(undefined)
        setInstallingCustom(true)
        try {
            const res = await fetch(`${backendUrl}/providers/install`, addPostAuthorization(accessString, JSON.stringify({ url })))
            if (!res.ok) { const body = await res.json(); throw new Error(body.error ?? `HTTP ${res.status}`) }
            setCustomUrl('')
            await loadInstalled()
        } catch (err) {
            setError(`Failed to install provider: ${err}`)
        } finally {
            setInstallingCustom(false)
        }
    }

    const installFromFile = async (file: File) => {
        setError(undefined)
        setInstallingFile(true)
        try {
            const res = await fetch(`${backendUrl}/providers/upload`, {
                method: 'POST',
                headers: { Authorization: accessString ? `Bearer ${accessString}` : '', 'Content-Type': 'application/octet-stream', 'X-Kwirth-App': 'true' },
                body: file
            })
            if (!res.ok) { const body = await res.json(); throw new Error(body.error ?? `HTTP ${res.status}`) }
            await loadInstalled()
        } catch (err) {
            setError(`Failed to install provider: ${err}`)
        } finally {
            setInstallingFile(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const resolveSource = (installedFrom?: string): React.ReactElement | null => {
        if (!installedFrom) return null
        if (installedFrom === 'local') return <Typography variant='caption' color='text.secondary'>Local file</Typography>
        if (installedFrom === 'dev') return <Chip label='dev' size='small' variant='outlined' color='warning' />
        const short = installedFrom.length > 40 ? installedFrom.slice(0, 37) + '…' : installedFrom
        return <Tooltip title={installedFrom}><Typography variant='caption' color='text.secondary'><Link fontSize='inherit' sx={{ verticalAlign: 'middle', mr: 0.3 }} />{short}</Typography></Tooltip>
    }

    const providerGradient = (name: string) => {
        let hash = 0
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
        const hue = (Math.abs(hash) % 360 + 180) % 360
        const dark = theme.palette.mode === 'dark'
        const dots = `radial-gradient(circle, hsla(${hue}, 60%, 70%, ${dark ? 0.06 : 0.18}) 1px, transparent 1px)`
        return `${dots} 0 0 / 10px 10px, linear-gradient(315deg, hsla(${hue}, 75%, 58%, ${dark ? 0.07 : 0.12}) 0%, hsla(${hue}, 55%, 42%, ${dark ? 0.14 : 0.26}) 100%)`
    }

    const ViewToggle = () => (
        <Stack direction='row' spacing={0}>
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
    )

    const filteredIds = Object.keys(groupedAvailable).filter(id => !filterText || id.includes(filterText.toLowerCase()) || groupedAvailable[id][0].name?.toLowerCase().includes(filterText.toLowerCase()))

    return (
        <>
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '60vw', maxWidth: '60vw', height: '78vh' } }}>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Factory fontSize='small' />Manage providers</DialogTitle>
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{ mt: 1 }}>

                    <Stack direction='row' alignItems='center' spacing={1}>
                        <Typography variant='subtitle2'>Installed providers</Typography>
                        <TextField size='small' placeholder='Filter…' value={installedFilter} onChange={e => setInstalledFilter(e.target.value)} sx={{ flex: 1 }} slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: '0.75rem' } } }} />
                        <ViewToggle />
                    </Stack>
                    {installed.length === 0
                        ? <Typography variant='body2' color='text.secondary'>No providers installed.</Typography>
                        : viewMode === 'card'
                            ? <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.5 }}>
                                {installed.filter(p => !installedFilter || p.id.includes(installedFilter.toLowerCase()) || (p.displayName || p.name || '').toLowerCase().includes(installedFilter.toLowerCase())).map(provider => (
                                    <Box key={provider.id} sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: 1.5, minHeight: 100, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, background: providerGradient(provider.name) }}>
                                        <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                                            <Box sx={{ color: 'text.secondary', mt: 0.25 }}><Factory /></Box>
                                            <Box flex={1} minWidth={0}>
                                                <Stack direction='row' alignItems='center' spacing={0.5} sx={{ width: '100%' }}>
                                                    <Typography variant='body2' fontWeight='bold' sx={{ flex: 1 }}>{provider.displayName || provider.name || provider.id}</Typography>
                                                    <Chip label={`v${provider.version}`} size='small' sx={{ minWidth: 72 }} />
                                                </Stack>
                                                <Typography variant='caption' color='text.secondary' display='block' sx={{ mt: 0.5 }}>{provider.description}</Typography>
                                            </Box>
                                            <Tooltip title={provider.website ? 'Open provider website' : 'No website available'}>
                                                <span>
                                                    <IconButton size='small' sx={{ mr: -0.5 }} disabled={!provider.website} onClick={() => window.open(provider.website!, '_blank', 'noopener')}>
                                                        <OpenInNew fontSize='small' />
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                        </Stack>
                                        <Stack direction='row' justifyContent='space-between' alignItems='center' sx={{ mt: 1 }}>
                                            <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', mr: 1 }}>{resolveSource(provider.installedFrom)}</Box>
                                            <Tooltip title={provider.hasFront || provider.hasSchema ? 'Configure' : 'No configuration available'}>
                                                <span>
                                                    <IconButton size='small' disabled={!provider.hasFront && !provider.hasSchema} onClick={() => setExpandedId(provider.id)}>
                                                        <Settings fontSize='small' />
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                            <Tooltip title={provider.installedFrom === 'dev' ? 'Dev providers cannot be uninstalled' : 'Uninstall'}>
                                                <span>
                                                    <IconButton size='small' color='error' disabled={provider.installedFrom === 'dev' || uninstallingId === provider.id} onClick={() => uninstall(provider)}>
                                                        {uninstallingId === provider.id ? <CircularProgress size={16} /> : <Delete fontSize='small' />}
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                        </Stack>
                                    </Box>
                                ))}
                              </Box>
                            : <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                                {installed.filter(p => !installedFilter || p.id.includes(installedFilter.toLowerCase()) || (p.displayName || p.name || '').toLowerCase().includes(installedFilter.toLowerCase())).map(provider => (
                                    <Box key={provider.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
                                        <Box sx={{ color: 'text.secondary', flexShrink: 0, display: 'flex' }}><Factory fontSize='small' /></Box>
                                        <Typography variant='body2' fontWeight='bold' sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{provider.displayName || provider.name || provider.id}</Typography>
                                        <Box sx={{ flexShrink: 0 }}>{resolveSource(provider.installedFrom)}</Box>
                                        <Chip label={`v${provider.version}`} size='small' sx={{ minWidth: 72 }} />
                                        <Tooltip title='Configure'>
                                            <IconButton size='small' onClick={() => setExpandedId(provider.id)}>
                                                <Settings fontSize='small' />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title={provider.installedFrom === 'dev' ? 'Dev providers cannot be uninstalled' : 'Uninstall'}>
                                            <span>
                                                <IconButton size='small' color='error' disabled={provider.installedFrom === 'dev' || uninstallingId === provider.id} onClick={() => uninstall(provider)}>
                                                    {uninstallingId === provider.id ? <CircularProgress size={16} /> : <Delete fontSize='small' />}
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    </Box>
                                ))}
                              </Box>
                    }

                    <Typography variant='subtitle2' sx={{ pt: 1 }}>Install provider</Typography>
                    <Stack direction='row' spacing={1} alignItems='center'>
                        <TextField size='small' fullWidth placeholder='https://...' value={customUrl} onChange={e => setCustomUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') installFromUrl() }} />
                        <Tooltip title='Install from URL'>
                            <span>
                                <IconButton size='small' color='primary' disabled={installingCustom || !customUrl.trim()} onClick={installFromUrl}>
                                    {installingCustom ? <CircularProgress size={16} /> : <Download fontSize='small' />}
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Divider orientation='vertical' flexItem />
                        <input ref={fileInputRef} type='file' accept='.tgz,application/gzip' style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) installFromFile(f) }} />
                        <Tooltip title='Install from local file'>
                            <span>
                                <Button variant='outlined' size='small' startIcon={installingFile ? <CircularProgress size={14} /> : <FolderOpen fontSize='small' />} disabled={installingFile} onClick={() => fileInputRef.current?.click()} sx={{ whiteSpace: 'nowrap' }}>
                                    {installingFile ? 'Installing…' : 'Browse…'}
                                </Button>
                            </span>
                        </Tooltip>
                    </Stack>

                    <Stack direction='row' alignItems='center' spacing={1} sx={{ pt: 1 }}>
                        <Typography variant='subtitle2'>Available providers</Typography>
                        <TextField size='small' placeholder='Filter…' value={filterText} onChange={e => setFilterText(e.target.value)} sx={{ flex: 1 }} slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: '0.75rem' } } }} />
                        <Tooltip title='Refresh catalog'>
                            <span>
                                <IconButton size='small' sx={{ width: 30, height: 30 }} onClick={fetchManifest} disabled={loadingManifest}>
                                    {loadingManifest ? <CircularProgress size={16} /> : <Refresh fontSize='small' />}
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Stack>

                    {available.length === 0 && !loadingManifest && !error &&
                        <Typography variant='body2' color='text.secondary'>No providers available.</Typography>
                    }

                    {filteredIds.length > 0 && (
                        viewMode === 'card'
                            ? <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.5 }}>
                                {filteredIds.map(id => {
                                    const group = groupedAvailable[id]
                                    const provider = getSelectedProvider(id)
                                    const versions = group.map(p => p.version)
                                    return (
                                    <Box key={id} sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: 1.5, minHeight: 100, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, background: providerGradient(provider.name) }}>
                                        <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                                            <Box sx={{ color: 'text.secondary', mt: 0.25 }}><Factory /></Box>
                                            <Box flex={1} minWidth={0}>
                                                <Stack direction='row' alignItems='center' spacing={0.5} sx={{ width: '100%' }}>
                                                    <Typography variant='body2' fontWeight='bold' sx={{ flex: 1 }}>{provider.displayName || provider.name}</Typography>
                                                    {isDevInstalled(id) && <Chip label='dev active' size='small' variant='outlined' color='warning' />}
                                                    {isInstalled(id) && <Chip label='installed' color='success' size='small' icon={<CheckCircle />} />}
                                                    {versions.length > 1
                                                        ? <Select size='small' value={provider.version} onChange={e => setSelectedVersions(prev => ({ ...prev, [id]: e.target.value }))} sx={{ height: 24, fontSize: '0.75rem', minWidth: 80, '& .MuiSelect-select': { py: 0, px: 1 } }}>
                                                            {versions.map(v => <MenuItem key={v} value={v} sx={{ fontSize: '0.75rem' }}>{v}</MenuItem>)}
                                                          </Select>
                                                        : <Chip label={`v${provider.version}`} size='small' sx={{ minWidth: 72 }} />
                                                    }
                                                </Stack>
                                                <Typography variant='caption' color='text.secondary' display='block' sx={{ mt: 0.5 }}>{provider.description}</Typography>
                                                {provider.requires && provider.requires.length > 0 && (
                                                    <Stack direction='row' flexWrap='wrap' useFlexGap spacing={0.5} sx={{ mt: 0.5 }}>
                                                        <Typography variant='caption' color='text.disabled'>Requires:</Typography>
                                                        {provider.requires.map((r, i) => <Chip key={i} label={`${r.id} (${r.type[0].toUpperCase()}) ≥${r.minVersion}`} size='small' variant='outlined' sx={{ fontSize: '0.6rem', height: 18 }} />)}
                                                    </Stack>
                                                )}
                                            </Box>
                                            <Tooltip title={provider.website ? 'Open provider website' : 'No website available'}>
                                                <span>
                                                    <IconButton size='small' sx={{ mr: -0.5 }} disabled={!provider.website} onClick={() => window.open(provider.website!, '_blank', 'noopener')}>
                                                        <OpenInNew fontSize='small' />
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                        </Stack>
                                        <Stack direction='row' justifyContent='flex-end' sx={{ mt: 1 }}>
                                            {(() => { const unmet = (provider.requires ?? []).filter(r => !isRequirementMet(r)); return (
                                                <Tooltip title={isDevInstalled(id) ? 'Dev version active' : isInstalled(id) ? 'Already installed' : unmet.length > 0 ? `Requires: ${unmet.map(r => `${r.type} ${r.id} ≥${r.minVersion}`).join(', ')}` : 'Install'}>
                                                    <span><IconButton size='small' color='primary' disabled={isDevInstalled(id) || isInstalled(id) || installingId === id || unmet.length > 0} onClick={() => installFromCatalog(provider)}>
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
                                    const group = groupedAvailable[id]
                                    const provider = getSelectedProvider(id)
                                    const versions = group.map(p => p.version)
                                    const unmet = (provider.requires ?? []).filter(r => !isRequirementMet(r))
                                    return (
                                        <Box key={id} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
                                            <Box sx={{ color: 'text.secondary', flexShrink: 0, display: 'flex' }}><Factory fontSize='small' /></Box>
                                            <Typography variant='body2' fontWeight='bold' sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{provider.displayName || provider.name}</Typography>
                                            {isDevInstalled(id) && <Chip label='dev active' size='small' variant='outlined' color='warning' />}
                                            {isInstalled(id) && <Chip label='installed' color='success' size='small' icon={<CheckCircle />} />}
                                            {versions.length > 1
                                                ? <Select size='small' value={provider.version} onChange={e => setSelectedVersions(prev => ({ ...prev, [id]: e.target.value }))} sx={{ height: 24, fontSize: '0.75rem', minWidth: 80, '& .MuiSelect-select': { py: 0, px: 1 } }}>
                                                    {versions.map(v => <MenuItem key={v} value={v} sx={{ fontSize: '0.75rem' }}>{v}</MenuItem>)}
                                                  </Select>
                                                : <Chip label={`v${provider.version}`} size='small' sx={{ minWidth: 72 }} />
                                            }
                                            <Tooltip title={isDevInstalled(id) ? 'Dev version active' : isInstalled(id) ? 'Already installed' : unmet.length > 0 ? `Requires: ${unmet.map(r => `${r.type} ${r.id} ≥${r.minVersion}`).join(', ')}` : 'Install'}>
                                                <span><IconButton size='small' color='primary' disabled={isDevInstalled(id) || isInstalled(id) || installingId === id || unmet.length > 0} onClick={() => installFromCatalog(provider)}>
                                                    {installingId === id ? <CircularProgress size={16} /> : <Download fontSize='small' />}
                                                </IconButton></span>
                                            </Tooltip>
                                        </Box>
                                    )
                                })}
                              </Box>
                    )}

                </Stack>
            </DialogContent>
            {error && <Box sx={{ px: 3, pb: 1 }}><Typography variant='caption' color='error'>{error}</Typography></Box>}
            <DialogActions>
                <Button onClick={props.onClose}>CLOSE</Button>
            </DialogActions>
        </Dialog>

        {/* Provider with custom front.js (complex providers like syslog) */}
        {expandedId && installed.find(p => p.id === expandedId)?.hasFront && (() => {
            const CustomFront = frontLoaded[expandedId] ? window.__kwirth_providers__?.[expandedId]?.ConfigDialog : undefined
            return CustomFront
                ? <CustomFront onClose={() => setExpandedId(undefined)} backendUrl={backendUrl} accessString={accessString} />
                : null
        })()}

        {/* Generic config dialog for basic providers (schema-driven) */}
        {expandedId && !installed.find(p => p.id === expandedId)?.hasFront && (
            <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '480px', minHeight: '300px' } }}>
                <DialogTitle>Configure: {installed.find(p => p.id === expandedId)?.displayName ?? expandedId}</DialogTitle>
                <DialogContent sx={{ pt: '16px !important' }}>
                    {!configSchema
                        ? <Typography variant='body2' color='text.secondary'>This provider has no configurable options.</Typography>
                        : <Stack spacing={2}>{configSchema.map(f => renderConfigField(f))}</Stack>
                    }
                </DialogContent>
                <DialogActions>
                    {configSchema && (
                        <Button variant='contained' disabled={savingConfig} onClick={saveProviderConfig}>
                            {savingConfig ? <CircularProgress size={14} /> : 'Save'}
                        </Button>
                    )}
                    <Button onClick={() => setExpandedId(undefined)}>Cancel</Button>
                </DialogActions>
            </Dialog>
        )}
        </>
    )
}

export { ProviderDialog }
