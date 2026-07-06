import React, { useContext, useEffect, useRef, useState } from 'react'
import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, MenuItem, Select, Stack, TextField, Tooltip, Typography, useTheme } from '@mui/material'
import * as MuiIcons from '../tools/KwirthIcons'
import { CheckCircle, Delete, Download, Extension, FolderOpen, Link, OpenInNew, Refresh, ViewList, ViewModule } from '../tools/KwirthIcons'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization } from '../tools/AuthorizationManagement'
import { versionGreaterThan, EExtensionType } from '@kwirthmagnify/kwirth-common'
import { useKeyboard } from '../tools/useKeyboard'

const PLUGINS_MANIFEST_URL = 'https://raw.githubusercontent.com/kwirthmagnify/kwirth/refs/heads/master/plugins/manifest.json'

interface IRequirement {
    type: EExtensionType
    id: string
    minVersion: string
}

interface IPluginManifestEntry {
    id: string
    type?: EExtensionType    // tipo de extensión de la entrada (marketplace unificado / packs)
    name: string
    displayName: string
    version: string
    description: string
    icon?: string
    website?: string
    url: string
    requires?: IRequirement[]
}

interface IInstalledPlugin {
    id: string
    name: string
    displayName: string
    version: string
    description: string
    icon?: string
    website?: string
    installedFrom?: string
}

interface IPluginDialogProps {
    onClose: () => void
    onPluginLoaded: (id: string) => void
    onPluginUnloaded: (id: string) => void
}

const PluginDialog: React.FC<IPluginDialogProps> = (props: IPluginDialogProps) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType
    const theme = useTheme()
    useKeyboard(props.onClose)

    const [available, setAvailable] = useState<IPluginManifestEntry[]>([])
    const [installed, setInstalled] = useState<IInstalledPlugin[]>([])
    const [loadingManifest, setLoadingManifest] = useState(false)
    const [installingId, setInstallingId] = useState<string | undefined>()
    const [uninstallingId, setUninstallingId] = useState<string | undefined>()
    const [error, setError] = useState<string | undefined>()
    const [customUrl, setCustomUrl] = useState('')
    const [installingCustom, setInstallingCustom] = useState(false)
    const [installingFile, setInstallingFile] = useState(false)
    const [selectedVersions, setSelectedVersions] = useState<Record<string, string>>({})
    const [filterText, setFilterText] = useState('')
    const [installedFilter, setInstalledFilter] = useState('')
    const [crossInstalled, setCrossInstalled] = useState<Record<string, { id: string, version: string }[]>>({})
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card')
    const fileInputRef = useRef<HTMLInputElement>(null)

    const groupedAvailable: Record<string, IPluginManifestEntry[]> = available.reduce((acc, p) => {
        if (!acc[p.id]) acc[p.id] = []
        acc[p.id].push(p)
        return acc
    }, {} as Record<string, IPluginManifestEntry[]>)
    Object.values(groupedAvailable).forEach(group => group.sort((a, b) => versionGreaterThan(a.version, b.version) ? -1 : 1))

    const getSelectedEntry = (id: string): IPluginManifestEntry => {
        const group = groupedAvailable[id]
        const version = selectedVersions[id] ?? group[0].version
        return group.find(p => p.version === version) ?? group[0]
    }

    useEffect(() => {
        loadInstalled()
        fetchManifest()
    }, [])

    const loadInstalled = async () => {
        try {
            const res = await fetch(`${backendUrl}/plugins`, addGetAuthorization(accessString))
            const data: IInstalledPlugin[] = await res.json()
            setInstalled(data)
        } catch (err) {
            setError(`Failed to load installed plugins: ${err}`)
        }
    }

    const fetchManifest = async () => {
        setError(undefined)
        setLoadingManifest(true)
        try {
            const res = await fetch(PLUGINS_MANIFEST_URL)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data: IPluginManifestEntry[] = await res.json()
            setAvailable(data)
            const neededTypes = new Set(data.flatMap(e => e.requires ?? []).map(r => r.type).filter(t => t !== 'plugin'))
            if (neededTypes.size > 0) {
                const endpoints: Record<string, string> = { sender: `${backendUrl}/senders`, provider: `${backendUrl}/providers` }
                const results: Record<string, { id: string, version: string }[]> = {}
                await Promise.all([...neededTypes].map(async t => {
                    try { const r = await fetch(endpoints[t], addGetAuthorization(accessString)); if (r.ok) results[t] = await r.json() } catch {}
                }))
                setCrossInstalled(results)
            }
        } catch (err) {
            setError(`Failed to fetch plugin catalog: ${err}`)
        } finally {
            setLoadingManifest(false)
        }
    }

    const isRequirementMet = (req: IRequirement): boolean => {
        const list = req.type === 'plugin' ? installed : (crossInstalled[req.type] ?? [])
        const found = list.find(x => x.id === req.id)
        return !!found && (found.version === req.minVersion || versionGreaterThan(found.version, req.minVersion))
    }

    const install = async (plugin: IPluginManifestEntry) => {
        setError(undefined)
        setInstallingId(plugin.id)
        try {
            const res = await fetch(`${backendUrl}/plugins/install`, addPostAuthorization(accessString, JSON.stringify({ url: plugin.url })))
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            await loadInstalled()
            props.onPluginLoaded(plugin.id)
        } catch (err) {
            setError(`Failed to install ${plugin.name}: ${err}`)
        } finally {
            setInstallingId(undefined)
        }
    }

    const uninstall = async (plugin: IInstalledPlugin) => {
        setError(undefined)
        setUninstallingId(plugin.id)
        try {
            const res = await fetch(`${backendUrl}/plugins/${plugin.id}`, addDeleteAuthorization(accessString))
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            props.onPluginUnloaded(plugin.id)
            await loadInstalled()
        } catch (err) {
            setError(`Failed to uninstall ${plugin.name}: ${err}`)
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
            const res = await fetch(`${backendUrl}/plugins/install`, addPostAuthorization(accessString, JSON.stringify({ url })))
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            const meta: IInstalledPlugin = await res.json()
            await loadInstalled()
            props.onPluginLoaded(meta.id)
            setCustomUrl('')
        } catch (err) {
            setError(`Failed to install plugin: ${err}`)
        } finally {
            setInstallingCustom(false)
        }
    }

    const installFromFile = async (file: File) => {
        setError(undefined)
        setInstallingFile(true)
        try {
            const res = await fetch(`${backendUrl}/plugins/upload`, {
                method: 'POST',
                headers: {
                    Authorization: accessString ? `Bearer ${accessString}` : '',
                    'Content-Type': 'application/octet-stream',
                    'X-Kwirth-App': 'true'
                },
                body: file
            })
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            const meta: IInstalledPlugin = await res.json()
            await loadInstalled()
            props.onPluginLoaded(meta.id)
        } catch (err) {
            setError(`Failed to install plugin: ${err}`)
        } finally {
            setInstallingFile(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const isInstalled = (id: string) => installed.some(p => p.id === id && p.installedFrom !== 'dev')
    const isDevInstalled = (id: string) => installed.some(p => p.id === id && p.installedFrom === 'dev')

    const resolveSource = (installedFrom?: string): React.ReactElement | null => {
        if (!installedFrom) return null
        if (installedFrom === 'dev')
            return <Chip label='dev' size='small' variant='outlined' color='warning' />
        if (installedFrom === 'local')
            return <Chip icon={<FolderOpen />} label='Local file' size='small' variant='outlined' />
        if (installedFrom === 'bundled')
            return <Chip label='bundled' size='small' variant='outlined' color='secondary' />
        if (installedFrom.includes('github.com/kwirthmagnify'))
            return <Chip icon={<Extension />} label='Kwirth' size='small' variant='outlined' color='primary' />
        const short = installedFrom.length > 40 ? installedFrom.slice(0, 37) + '…' : installedFrom
        return <Tooltip title={installedFrom}><Chip icon={<Link />} label={short} size='small' variant='outlined' sx={{ maxWidth: '100%' }} /></Tooltip>
    }

    const resolveIcon = (iconName?: string): React.ReactElement => {
        const IconComponent = iconName ? (MuiIcons as Record<string, React.ElementType>)[iconName] : undefined
        return IconComponent ? <IconComponent /> : <Extension />
    }

    const pluginGradient = (name: string) => {
        let hash = 0
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
        const hue = Math.abs(hash) % 360
        const dark = theme.palette.mode === 'dark'
        return `linear-gradient(315deg, hsla(${hue}, 75%, 58%, ${dark ? 0.07 : 0.12}) 0%, hsla(${hue}, 55%, 42%, ${dark ? 0.14 : 0.26}) 100%)`
    }

    const PluginCard = ({ icon, name, displayName, version, versions, onVersionChange, description, badge, source, website, action, requires }: { icon?: string; name: string; displayName: string; version: string; versions?: string[]; onVersionChange?: (v: string) => void; description: string; badge?: React.ReactNode; source?: React.ReactNode; website?: string; action: React.ReactNode; requires?: IRequirement[] }) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: 1.5, minHeight: 120, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, background: pluginGradient(name) }}>
            <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                <Box sx={{ color: 'text.secondary', mt: 0.25 }}>{resolveIcon(icon)}</Box>
                <Box flex={1} minWidth={0}>
                    <Stack direction='row' alignItems='center' spacing={0.5} sx={{ width: '100%' }}>
                        <Typography variant='body2' fontWeight='bold' component='span' sx={{ flex: 1 }}>{displayName||name}</Typography>
                        {badge}
                        {versions && versions.length > 1
                            ? <Select size='small' value={version} onChange={e => onVersionChange?.(e.target.value)}
                                sx={{ height: 24, fontSize: '0.75rem', minWidth: 80, '& .MuiSelect-select': { py: 0, px: 1 } }}>
                                {versions.map(v => <MenuItem key={v} value={v} sx={{ fontSize: '0.75rem' }}>{v}</MenuItem>)}
                              </Select>
                            : <Chip label={`v${version}`} size='small' sx={{ minWidth: 72 }} />
                        }
                    </Stack>
                    <Typography variant='caption' color='text.secondary' display='block' sx={{ mt: 0.5 }}>{description}</Typography>
                    {requires && requires.length > 0 && (
                        <Stack direction='row' flexWrap='wrap' useFlexGap spacing={0.5} sx={{ mt: 0.5 }}>
                            <Typography variant='caption' color='text.disabled'>Requires:</Typography>
                            {requires.map((r, i) => <Chip key={i} label={`${r.id} (${r.type[0].toUpperCase()}) ≥${r.minVersion}`} size='small' variant='outlined' sx={{ fontSize: '0.6rem', height: 18 }} />)}
                        </Stack>
                    )}
                </Box>
                {website &&
                    <Tooltip title='Open plugin website'>
                        <IconButton size='small' sx={{ mr: -0.5 }} onClick={() => window.open(website, '_blank', 'noopener')}>
                            <OpenInNew fontSize='small' />
                        </IconButton>
                    </Tooltip>
                }
            </Stack>
            <Stack direction='row' justifyContent='space-between' alignItems='center' sx={{ mt: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', mr: 1 }}>{source}</Box>
                {action}
            </Stack>
        </Box>
    )

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
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '72vw', maxWidth: '72vw', height: '80vh' } }}>
            <DialogTitle>Manage plugins</DialogTitle>
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{ mt: 1 }}>

                    <Stack direction='row' alignItems='center' spacing={1}>
                        <Typography variant='subtitle2'>Installed plugins</Typography>
                        <TextField size='small' placeholder='Filter…' value={installedFilter} onChange={e => setInstalledFilter(e.target.value)} sx={{ flex: 1 }} slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: '0.75rem' } } }} />
                        <ViewToggle />
                    </Stack>
                    {installed.length === 0
                        ? <Typography variant='body2' color='text.secondary'>No plugins installed.</Typography>
                        : viewMode === 'card'
                            ? <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
                                {installed.filter(p => !installedFilter || p.id.includes(installedFilter.toLowerCase()) || (p.displayName || p.name).toLowerCase().includes(installedFilter.toLowerCase())).map(plugin => (
                                    <PluginCard
                                        key={plugin.id}
                                        icon={plugin.icon}
                                        name={plugin.name}
                                        displayName={plugin.displayName}
                                        version={plugin.version}
                                        description={plugin.description}
                                        website={plugin.website}
                                        source={resolveSource(plugin.installedFrom)}
                                        action={
                                            <Tooltip title={plugin.installedFrom === 'dev' ? 'Dev plugins cannot be uninstalled' : plugin.installedFrom === 'bundled' ? 'Bundled plugins cannot be uninstalled' : 'Uninstall'}>
                                                <span>
                                                    <IconButton size='small' color='error' disabled={plugin.installedFrom === 'dev' || plugin.installedFrom === 'bundled' || uninstallingId === plugin.id} onClick={() => uninstall(plugin)}>
                                                        {uninstallingId === plugin.id ? <CircularProgress size={16} /> : <Delete fontSize='small' />}
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                        }
                                    />
                                ))}
                              </Box>
                            : <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                                {installed.filter(p => !installedFilter || p.id.includes(installedFilter.toLowerCase()) || (p.displayName || p.name).toLowerCase().includes(installedFilter.toLowerCase())).map(plugin => (
                                    <Box key={plugin.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
                                        <Box sx={{ color: 'text.secondary', flexShrink: 0, display: 'flex' }}>{resolveIcon(plugin.icon)}</Box>
                                        <Typography variant='body2' fontWeight='bold' sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plugin.displayName || plugin.name}</Typography>
                                        <Box sx={{ flexShrink: 0 }}>{resolveSource(plugin.installedFrom)}</Box>
                                        <Chip label={`v${plugin.version}`} size='small' sx={{ minWidth: 72 }} />
                                        <Tooltip title={plugin.installedFrom === 'dev' ? 'Dev plugins cannot be uninstalled' : plugin.installedFrom === 'bundled' ? 'Bundled plugins cannot be uninstalled' : 'Uninstall'}>
                                            <span>
                                                <IconButton size='small' color='error' disabled={plugin.installedFrom === 'dev' || plugin.installedFrom === 'bundled' || uninstallingId === plugin.id} onClick={() => uninstall(plugin)}>
                                                    {uninstallingId === plugin.id ? <CircularProgress size={16} /> : <Delete fontSize='small' />}
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    </Box>
                                ))}
                              </Box>
                    }

                    <Typography variant='subtitle2' sx={{ pt: 1 }}>Install plugin</Typography>
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
                        <Typography variant='subtitle2'>Available plugins</Typography>
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
                        <Typography variant='body2' color='text.secondary'>No plugins available.</Typography>
                    }

                    {filteredIds.length > 0 && (
                        viewMode === 'card'
                            ? <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
                                {filteredIds.map(id => {
                                    const group = groupedAvailable[id]
                                    const plugin = getSelectedEntry(id)
                                    const versions = group.map(p => p.version)
                                    return (
                                        <PluginCard
                                            key={id}
                                            icon={plugin.icon}
                                            name={plugin.name}
                                            displayName={plugin.displayName}
                                            version={plugin.version}
                                            versions={versions}
                                            onVersionChange={v => setSelectedVersions(prev => ({ ...prev, [id]: v }))}
                                            description={plugin.description}
                                            website={plugin.website}
                                            badge={isDevInstalled(id) ? <Chip label='dev active' size='small' variant='outlined' color='warning' /> : isInstalled(id) ? <Chip label='installed' color='success' size='small' icon={<CheckCircle />} /> : undefined}
                                            requires={plugin.requires}
                                            action={(() => {
                                                const unmet = (plugin.requires ?? []).filter(r => !isRequirementMet(r))
                                                return (
                                                    <Tooltip title={isDevInstalled(id) ? 'A dev version is already loaded' : isInstalled(id) ? 'Already installed — uninstall first' : unmet.length > 0 ? `Requires: ${unmet.map(r => `${r.type} ${r.id} ≥${r.minVersion}`).join(', ')}` : 'Install'}>
                                                        <span>
                                                            <IconButton size='small' color='primary' disabled={isDevInstalled(id) || isInstalled(id) || installingId === id || unmet.length > 0} onClick={() => install(plugin)}>
                                                                {installingId === id ? <CircularProgress size={16} /> : <Download fontSize='small' />}
                                                            </IconButton>
                                                        </span>
                                                    </Tooltip>
                                                )
                                            })()}
                                        />
                                    )
                                })}
                              </Box>
                            : <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                                {filteredIds.map(id => {
                                    const group = groupedAvailable[id]
                                    const plugin = getSelectedEntry(id)
                                    const versions = group.map(p => p.version)
                                    const unmet = (plugin.requires ?? []).filter(r => !isRequirementMet(r))
                                    return (
                                        <Box key={id} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
                                            <Box sx={{ color: 'text.secondary', flexShrink: 0, display: 'flex' }}>{resolveIcon(plugin.icon)}</Box>
                                            <Typography variant='body2' fontWeight='bold' sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plugin.displayName || plugin.name}</Typography>
                                            {isDevInstalled(id) && <Chip label='dev active' size='small' variant='outlined' color='warning' />}
                                            {isInstalled(id) && <Chip label='installed' color='success' size='small' icon={<CheckCircle />} />}
                                            {versions.length > 1
                                                ? <Select size='small' value={plugin.version} onChange={e => setSelectedVersions(prev => ({ ...prev, [id]: e.target.value }))} sx={{ height: 24, fontSize: '0.75rem', minWidth: 80, '& .MuiSelect-select': { py: 0, px: 1 } }}>
                                                    {versions.map(v => <MenuItem key={v} value={v} sx={{ fontSize: '0.75rem' }}>{v}</MenuItem>)}
                                                  </Select>
                                                : <Chip label={`v${plugin.version}`} size='small' sx={{ minWidth: 72 }} />
                                            }
                                            <Tooltip title={isDevInstalled(id) ? 'A dev version is already loaded' : isInstalled(id) ? 'Already installed — uninstall first' : unmet.length > 0 ? `Requires: ${unmet.map(r => `${r.type} ${r.id} ≥${r.minVersion}`).join(', ')}` : 'Install'}>
                                                <span>
                                                    <IconButton size='small' color='primary' disabled={isDevInstalled(id) || isInstalled(id) || installingId === id || unmet.length > 0} onClick={() => install(plugin)}>
                                                        {installingId === id ? <CircularProgress size={16} /> : <Download fontSize='small' />}
                                                    </IconButton>
                                                </span>
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
    )
}

export { PluginDialog }
