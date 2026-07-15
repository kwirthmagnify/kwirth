import React, { useContext, useEffect, useRef, useState } from 'react'
import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, IconButton, MenuItem, Select, Stack, Switch, TextField, Tooltip, Typography, useTheme } from '@mui/material'
import { CheckCircle, Delete, Download, FolderOpen, Key, Link, OpenInNew, Refresh, Settings, ViewList, ViewModule, Visibility, VisibilityOff } from '@kwirthmagnify/kwirth-common-front/icons'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { DialogTitleHelp } from '@kwirthmagnify/kwirth-common-front'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization, addPutAuthorization } from '../tools/AuthorizationManagement'
import { versionGreaterThan } from '@kwirthmagnify/kwirth-common'

const IDPS_MANIFEST_URL = 'https://raw.githubusercontent.com/kwirthmagnify/kwirth/refs/heads/master/idps/manifest.json'

// tipos de la API (front-local, como hace ProviderDialog con su IProviderSchemaField)
type IdpFieldType = 'text' | 'number' | 'boolean' | 'password'
interface IIdpConfigFieldDef { name: string; label: string; type?: IdpFieldType; required?: boolean; options?: string[] }
interface IIdpConnectorInfo { id: string; label: string; kind: string; schema: IIdpConfigFieldDef[]; installed: boolean; version?: string; installedFrom?: string; website?: string; description?: string }
interface IIdpInstanceConfig { id: string; connectorId: string; label: string; enabled: boolean; config: Record<string, unknown> }
interface IIdpConnectorManifestEntry { id: string; name: string; displayName?: string; version: string; description: string; website?: string; url: string }

interface IManageIdpsProps {
    onClose: () => void
}

const ManageIdps: React.FC<IManageIdpsProps> = (props: IManageIdpsProps) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType
    const theme = useTheme()

    const [connectors, setConnectors] = useState<IIdpConnectorInfo[]>([])
    const [instances, setInstances] = useState<IIdpInstanceConfig[]>([])
    const [available, setAvailable] = useState<IIdpConnectorManifestEntry[]>([])
    const [loadingManifest, setLoadingManifest] = useState(false)
    const [installingId, setInstallingId] = useState<string | undefined>()
    const [uninstallingId, setUninstallingId] = useState<string | undefined>()
    const [installingCustom, setInstallingCustom] = useState(false)
    const [installingFile, setInstallingFile] = useState(false)
    const [customUrl, setCustomUrl] = useState('')
    const [installedFilter, setInstalledFilter] = useState('')
    const [availableFilter, setAvailableFilter] = useState('')
    const [selectedVersions, setSelectedVersions] = useState<Record<string, string>>({})
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card')
    const [error, setError] = useState<string | undefined>()
    const fileInputRef = useRef<HTMLInputElement>(null)

    // instancia en edicion (config lanzada desde la card del conector)
    const [editing, setEditing] = useState<IIdpInstanceConfig | undefined>(undefined)
    const [revealed, setRevealed] = useState<Record<string, boolean>>({})
    const [editConnector, setEditConnector] = useState<IIdpConnectorInfo | undefined>(undefined)
    const [isNew, setIsNew] = useState(false)
    const [savingConfig, setSavingConfig] = useState(false)

    const load = async () => {
        try {
            const [cRes, iRes] = await Promise.all([
                fetch(`${backendUrl}/idp/connectors`, addGetAuthorization(accessString)),
                fetch(`${backendUrl}/idp`, addGetAuthorization(accessString))
            ])
            if (cRes.ok) setConnectors(await cRes.json())
            if (iRes.ok) setInstances(await iRes.json())
        }
        catch (err) { setError(`Failed to load identity providers: ${err}`) }
    }

    const fetchManifest = async () => {
        setError(undefined); setLoadingManifest(true)
        try {
            const res = await fetch(IDPS_MANIFEST_URL)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            setAvailable(await res.json())
        }
        catch { setAvailable([]) }   // marketplace opcional (EPIC G)
        finally { setLoadingManifest(false) }
    }

    useEffect(() => { load(); fetchManifest() }, [])

    // la instancia de un conector se identifica por id === connectorId (1 instancia por conector, como los providers)
    const instanceOf = (connectorId: string) => instances.find(i => i.id === connectorId)

    // ---- config (Settings desde la card) ----
    const openConfig = (c: IIdpConnectorInfo) => {
        const existing = instanceOf(c.id)
        setEditConnector(c)
        setIsNew(!existing)
        setRevealed({})
        setEditing(existing ? { ...existing, config: { ...existing.config } } : { id: c.id, connectorId: c.id, label: c.label, enabled: false, config: {} })
    }
    const closeConfig = () => { setEditing(undefined); setEditConnector(undefined); setRevealed({}) }
    const setCfg = (name: string, value: unknown) => setEditing(prev => prev ? { ...prev, config: { ...prev.config, [name]: value } } : prev)
    // muestra/oculta un campo secreto; al revelar trae el valor real (sin enmascarar) del export (admin-only)
    const toggleReveal = async (name: string) => {
        if (revealed[name]) { setRevealed(prev => ({ ...prev, [name]: false })); return }
        if (editing && !isNew) {
            try {
                const res = await fetch(`${backendUrl}/idp/export`, addGetAuthorization(accessString))
                if (res.ok) {
                    const all = await res.json()
                    const real = all?.[editing.id]?.config?.[name]
                    if (real !== undefined) setCfg(name, real)
                }
            }
            catch { /* si el export falla, se muestra el valor actual del campo */ }
        }
        setRevealed(prev => ({ ...prev, [name]: true }))
    }
    const saveConfig = async () => {
        if (!editing) return
        setSavingConfig(true)
        try {
            const res = isNew
                ? await fetch(`${backendUrl}/idp`, addPostAuthorization(accessString, JSON.stringify(editing)))
                : await fetch(`${backendUrl}/idp/${editing.id}`, addPutAuthorization(accessString, JSON.stringify(editing)))
            if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? `HTTP ${res.status}`) }
            closeConfig(); await load()
        }
        catch (err) { setError(`Failed to save '${editing.id}': ${err}`) }
        finally { setSavingConfig(false) }
    }
    const renderConfigField = (field: IIdpConfigFieldDef) => {
        const val = editing?.config[field.name]
        if (field.type === 'boolean') return <FormControlLabel key={field.name} control={<Switch checked={!!val} onChange={e => setCfg(field.name, e.target.checked)} />} label={field.label} />
        const isSecret = field.type === 'password'
        const inputType = field.type === 'number' ? 'number' : (isSecret && !revealed[field.name]) ? 'password' : 'text'
        return <TextField key={field.name} size='small' fullWidth label={field.label} type={inputType} value={val ?? ''} required={field.required}
            onChange={e => setCfg(field.name, field.type === 'number' ? Number(e.target.value) : e.target.value)}
            slotProps={isSecret ? { input: { endAdornment: (
                <IconButton size='small' edge='end' onClick={() => toggleReveal(field.name)} title={revealed[field.name] ? 'Hide' : 'Show'}>
                    { revealed[field.name] ? <VisibilityOff fontSize='small'/> : <Visibility fontSize='small'/> }
                </IconButton>
            ) } } : undefined} />
    }

    // ---- marketplace (available connectors) ----
    const grouped: Record<string, IIdpConnectorManifestEntry[]> = available.reduce((acc, e) => { (acc[e.id] ||= []).push(e); return acc }, {} as Record<string, IIdpConnectorManifestEntry[]>)
    Object.values(grouped).forEach(g => g.sort((a, b) => versionGreaterThan(a.version, b.version) ? -1 : 1))
    const getSelected = (id: string) => { const g = grouped[id]; const v = selectedVersions[id] ?? g[0].version; return g.find(e => e.version === v) ?? g[0] }
    const isInstalled = (id: string) => connectors.some(c => c.id === id)

    const idpGradient = (name: string) => {
        let hash = 0
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
        const hue = (Math.abs(hash) % 360 + 300) % 360
        const dark = theme.palette.mode === 'dark'
        const op = dark ? 0.07 : 0.20
        const diamonds = [
            `repeating-linear-gradient(45deg, hsla(${hue}, 65%, 70%, ${op}) 0px, hsla(${hue}, 65%, 70%, ${op}) 1px, transparent 1px, transparent 8px)`,
            `repeating-linear-gradient(-45deg, hsla(${hue}, 65%, 70%, ${op}) 0px, hsla(${hue}, 65%, 70%, ${op}) 1px, transparent 1px, transparent 8px)`,
        ].join(', ')
        return `${diamonds}, linear-gradient(315deg, hsla(${hue}, 70%, 55%, ${dark ? 0.06 : 0.10}) 0%, hsla(${hue}, 50%, 40%, ${dark ? 0.12 : 0.22}) 100%)`
    }

    const ViewToggle = () => (
        <Stack direction='row' spacing={0}>
            <Tooltip title='Card view'><IconButton size='small' color={viewMode === 'card' ? 'primary' : 'default'} onClick={() => setViewMode('card')}><ViewModule fontSize='small' /></IconButton></Tooltip>
            <Tooltip title='List view'><IconButton size='small' color={viewMode === 'list' ? 'primary' : 'default'} onClick={() => setViewMode('list')}><ViewList fontSize='small' /></IconButton></Tooltip>
        </Stack>
    )

    // ---- connector install/uninstall (EPIC G endpoints) ----
    const installFromCatalog = async (entry: IIdpConnectorManifestEntry) => {
        setError(undefined); setInstallingId(entry.id)
        try {
            const res = await fetch(`${backendUrl}/idp/connectors/install`, addPostAuthorization(accessString, JSON.stringify({ url: entry.url })))
            if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? `HTTP ${res.status}`) }
            await load()
        }
        catch (err) { setError(`Failed to install ${entry.name}: ${err}`) }
        finally { setInstallingId(undefined) }
    }
    const installFromUrl = async () => {
        const url = customUrl.trim(); if (!url) return
        setError(undefined); setInstallingCustom(true)
        try {
            const res = await fetch(`${backendUrl}/idp/connectors/install`, addPostAuthorization(accessString, JSON.stringify({ url })))
            if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? `HTTP ${res.status}`) }
            setCustomUrl(''); await load()
        }
        catch (err) { setError(`Failed to install connector: ${err}`) }
        finally { setInstallingCustom(false) }
    }
    const installFromFile = async (file: File) => {
        setError(undefined); setInstallingFile(true)
        try {
            const res = await fetch(`${backendUrl}/idp/connectors/upload`, { method: 'POST', headers: { Authorization: accessString ? `Bearer ${accessString}` : '', 'Content-Type': 'application/octet-stream', 'X-Kwirth-App': 'true' }, body: file })
            if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? `HTTP ${res.status}`) }
            await load()
        }
        catch (err) { setError(`Failed to install connector: ${err}`) }
        finally { setInstallingFile(false); if (fileInputRef.current) fileInputRef.current.value = '' }
    }
    const uninstallConnector = async (c: IIdpConnectorInfo) => {
        setError(undefined); setUninstallingId(c.id)
        try {
            const res = await fetch(`${backendUrl}/idp/connectors/${c.id}`, addDeleteAuthorization(accessString))
            if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? `HTTP ${res.status}`) }
            await load()
        }
        catch (err) { setError(`Failed to uninstall ${c.id}: ${err}`) }
        finally { setUninstallingId(undefined) }
    }

    const shownConnectors = connectors.filter(c => !installedFilter || c.id.includes(installedFilter.toLowerCase()) || c.label.toLowerCase().includes(installedFilter.toLowerCase()))
    const availableIds = Object.keys(grouped).filter(id => !availableFilter || id.includes(availableFilter.toLowerCase()) || grouped[id][0].name?.toLowerCase().includes(availableFilter.toLowerCase()))

    // estado de configuracion de un conector (para el chip de la card)
    const statusChip = (c: IIdpConnectorInfo) => {
        const inst = instanceOf(c.id)
        if (inst?.enabled) return <Chip label='enabled' color='success' size='small' icon={<CheckCircle />} />
        if (inst) return <Chip label='disabled' size='small' variant='outlined' />
        return <Chip label='not configured' size='small' variant='outlined' color='warning' />
    }
    // origen del conector (dev/bundled/local/instalado-por-URL), calcado del resolveSource de ProviderDialog
    const resolveSource = (from?: string): React.ReactElement | null => {
        if (!from) return null
        if (from === 'dev') return <Chip label='dev' size='small' variant='outlined' color='warning' />
        if (from === 'bundled') return <Chip label='bundled' size='small' variant='outlined' />
        if (from === 'local') return <Typography variant='caption' color='text.secondary'>Local file</Typography>
        const short = from.length > 40 ? from.slice(0, 37) + '…' : from
        return <Tooltip title={from}><Typography variant='caption' color='text.secondary'><Link fontSize='inherit' sx={{ verticalAlign: 'middle', mr: 0.3 }} />{short}</Typography></Tooltip>
    }
    const websiteButton = (website?: string) =>
        <Tooltip title={website ? 'Open connector website' : 'No website available'}><span><IconButton size='small' sx={{ mr: -0.5 }} disabled={!website} onClick={() => window.open(website!, '_blank', 'noopener')}><OpenInNew fontSize='small' /></IconButton></span></Tooltip>

    return (<>
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '72vw', maxWidth: '72vw', height: '80vh' } }}>
            <DialogTitleHelp section='guide/admin/07-idp-integration?id=enabling-an-idp' docsUrl={backendUrl + '/docs/core/kwirth'}><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Key fontSize='small' />Identity providers</Box></DialogTitleHelp>
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{ mt: 1 }}>

                    {/* ---- installed connectors (config desde la card, como providers) ---- */}
                    <Stack direction='row' alignItems='center' spacing={1}>
                        <Typography variant='subtitle2'>Installed connectors</Typography>
                        <TextField size='small' placeholder='Filter…' value={installedFilter} onChange={e => setInstalledFilter(e.target.value)} sx={{ flex: 1 }} slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: '0.75rem' } } }} />
                        <ViewToggle />
                    </Stack>
                    { connectors.length === 0
                        ? <Typography variant='body2' color='text.secondary'>No connectors installed. Install one below or enable a bundled/dev connector.</Typography>
                        : viewMode === 'card'
                            ? <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
                                { shownConnectors.map(c => (
                                    <Box key={c.id} sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: 1.5, minHeight: 100, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, background: idpGradient(c.id) }}>
                                        <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                                            <Box sx={{ color: 'text.secondary', mt: 0.25 }}><Key /></Box>
                                            <Box flex={1} minWidth={0}>
                                                <Stack direction='row' alignItems='center' spacing={0.5} sx={{ width: '100%' }}>
                                                    <Typography variant='body2' fontWeight='bold' sx={{ flex: 1 }}>{c.label}</Typography>
                                                    {c.version && <Chip label={`v${c.version}`} size='small' sx={{ minWidth: 72 }} />}
                                                </Stack>
                                                <Typography variant='caption' color='text.secondary' display='block' sx={{ mt: 0.5 }}>{c.description || `${c.id} · ${c.kind}`}</Typography>
                                            </Box>
                                            {websiteButton(c.website)}
                                        </Stack>
                                        <Stack direction='row' justifyContent='space-between' alignItems='center' sx={{ mt: 1 }}>
                                            <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', mr: 1 }}>{resolveSource(c.installedFrom)}</Box>
                                            <Stack direction='row' spacing={0.5} alignItems='center'>
                                                {statusChip(c)}
                                                <Tooltip title='Configure'><IconButton size='small' onClick={() => openConfig(c)}><Settings fontSize='small' /></IconButton></Tooltip>
                                                <Tooltip title={c.installed ? 'Uninstall' : 'Bundled/dev connector (cannot be uninstalled)'}>
                                                    <span><IconButton size='small' color='error' disabled={!c.installed || uninstallingId === c.id} onClick={() => uninstallConnector(c)}>
                                                        { uninstallingId === c.id ? <CircularProgress size={16} /> : <Delete fontSize='small' /> }
                                                    </IconButton></span>
                                                </Tooltip>
                                            </Stack>
                                        </Stack>
                                    </Box>
                                )) }
                              </Box>
                            : <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                                { shownConnectors.map(c => (
                                    <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
                                        <Key fontSize='small' sx={{ color: 'text.secondary' }} />
                                        <Typography variant='body2' fontWeight='bold' sx={{ flex: 1, minWidth: 0 }} noWrap>{c.label}</Typography>
                                        <Box sx={{ flexShrink: 0 }}>{resolveSource(c.installedFrom)}</Box>
                                        {c.version && <Chip label={`v${c.version}`} size='small' sx={{ minWidth: 72 }} />}
                                        {statusChip(c)}
                                        <Tooltip title='Configure'><IconButton size='small' onClick={() => openConfig(c)}><Settings fontSize='small' /></IconButton></Tooltip>
                                        <Tooltip title={c.installed ? 'Uninstall' : 'Bundled/dev connector (cannot be uninstalled)'}>
                                            <span><IconButton size='small' color='error' disabled={!c.installed || uninstallingId === c.id} onClick={() => uninstallConnector(c)}>
                                                { uninstallingId === c.id ? <CircularProgress size={16} /> : <Delete fontSize='small' /> }
                                            </IconButton></span>
                                        </Tooltip>
                                    </Box>
                                )) }
                              </Box>
                    }

                    {/* ---- install connector ---- */}
                    <Typography variant='subtitle2' sx={{ pt: 1 }}>Install connector</Typography>
                    <Stack direction='row' spacing={1} alignItems='center'>
                        <TextField size='small' fullWidth placeholder='https://...' value={customUrl} onChange={e => setCustomUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') installFromUrl() }} />
                        <Tooltip title='Install from URL'><span><IconButton size='small' color='primary' disabled={installingCustom || !customUrl.trim()} onClick={installFromUrl}>{ installingCustom ? <CircularProgress size={16} /> : <Download fontSize='small' /> }</IconButton></span></Tooltip>
                        <Divider orientation='vertical' flexItem />
                        <input ref={fileInputRef} type='file' accept='.tgz,application/gzip' style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) installFromFile(f) }} />
                        <Tooltip title='Install from local file'><span><Button variant='outlined' size='small' startIcon={installingFile ? <CircularProgress size={14} /> : <FolderOpen fontSize='small' />} disabled={installingFile} onClick={() => fileInputRef.current?.click()} sx={{ whiteSpace: 'nowrap' }}>{ installingFile ? 'Installing…' : 'Browse…' }</Button></span></Tooltip>
                    </Stack>

                    {/* ---- available connectors (marketplace) ---- */}
                    <Stack direction='row' alignItems='center' spacing={1} sx={{ pt: 1 }}>
                        <Typography variant='subtitle2'>Available connectors</Typography>
                        <TextField size='small' placeholder='Filter…' value={availableFilter} onChange={e => setAvailableFilter(e.target.value)} sx={{ flex: 1 }} slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: '0.75rem' } } }} />
                        <Tooltip title='Refresh catalog'><span><IconButton size='small' sx={{ width: 30, height: 30 }} onClick={fetchManifest} disabled={loadingManifest}>{ loadingManifest ? <CircularProgress size={16} /> : <Refresh fontSize='small' /> }</IconButton></span></Tooltip>
                    </Stack>
                    { availableIds.length === 0 && !loadingManifest
                        ? <Typography variant='body2' color='text.secondary'>No connectors available in the catalog.</Typography>
                        : <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
                            { availableIds.map(id => {
                                const group = grouped[id]
                                const entry = getSelected(id)
                                const versions = group.map(e => e.version)
                                return (
                                    <Box key={id} sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: 1.5, minHeight: 100, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, background: idpGradient(entry.name) }}>
                                        <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                                            <Box sx={{ color: 'text.secondary', mt: 0.25 }}><Key /></Box>
                                            <Box flex={1} minWidth={0}>
                                                <Stack direction='row' alignItems='center' spacing={0.5}>
                                                    <Typography variant='body2' fontWeight='bold' sx={{ flex: 1 }}>{entry.displayName || entry.name}</Typography>
                                                    { isInstalled(id) && <Chip label='installed' color='success' size='small' icon={<CheckCircle />} /> }
                                                    { versions.length > 1
                                                        ? <Select size='small' value={entry.version} onChange={e => setSelectedVersions(prev => ({ ...prev, [id]: e.target.value }))} sx={{ height: 24, fontSize: '0.75rem', minWidth: 80, '& .MuiSelect-select': { py: 0, px: 1 } }}>{ versions.map(v => <MenuItem key={v} value={v} sx={{ fontSize: '0.75rem' }}>{v}</MenuItem>) }</Select>
                                                        : <Chip label={`v${entry.version}`} size='small' sx={{ minWidth: 72 }} />
                                                    }
                                                </Stack>
                                                <Typography variant='caption' color='text.secondary' display='block' sx={{ mt: 0.5 }}>{entry.description}</Typography>
                                            </Box>
                                            <Tooltip title={entry.website ? 'Open connector website' : 'No website available'}><span><IconButton size='small' sx={{ mr: -0.5 }} disabled={!entry.website} onClick={() => window.open(entry.website!, '_blank', 'noopener')}><OpenInNew fontSize='small' /></IconButton></span></Tooltip>
                                        </Stack>
                                        <Stack direction='row' justifyContent='flex-end' sx={{ mt: 1 }}>
                                            <Tooltip title={isInstalled(id) ? 'Already installed' : 'Install'}><span><IconButton size='small' color='primary' disabled={isInstalled(id) || installingId === id} onClick={() => installFromCatalog(entry)}>{ installingId === id ? <CircularProgress size={16} /> : <Download fontSize='small' /> }</IconButton></span></Tooltip>
                                        </Stack>
                                    </Box>
                                )
                            }) }
                          </Box>
                    }

                </Stack>
            </DialogContent>
            { error && <Box sx={{ px: 3, pb: 1 }}><Typography variant='caption' color='error'>{error}</Typography></Box> }
            <DialogActions>
                <Button onClick={props.onClose}>CLOSE</Button>
            </DialogActions>
        </Dialog>

        {/* config de la instancia del conector (lanzado desde la card, schema-driven) */}
        { editing && editConnector &&
            <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '480px', minHeight: '360px' } }}>
                <DialogTitle>Configure: {editConnector.label}</DialogTitle>
                <DialogContent sx={{ pt: '16px !important' }}>
                    <Stack spacing={2}>
                        <TextField size='small' fullWidth label='Login button label' value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })} />
                        <FormControlLabel control={<Switch checked={editing.enabled} onChange={e => setEditing({ ...editing, enabled: e.target.checked })} />} label='Enabled (show on login screen)' />
                        { editConnector.schema.length > 0 && <Typography variant='subtitle2'>Connector configuration</Typography> }
                        { editConnector.schema.map(f => renderConfigField(f)) }
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button variant='contained' disabled={savingConfig} onClick={saveConfig}>{ savingConfig ? <CircularProgress size={14} /> : 'SAVE' }</Button>
                    <Button onClick={closeConfig}>CANCEL</Button>
                </DialogActions>
            </Dialog>
        }
    </>)
}

export { ManageIdps }
