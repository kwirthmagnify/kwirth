import React, { useContext, useEffect, useRef, useState } from 'react'
import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, MenuItem, Select, Stack, TextField, Tooltip, Typography, useTheme } from '@mui/material'
import { CheckCircle, Delete, Download, FolderOpen, Link, OpenInNew, Refresh, SmartToy, ViewList, ViewModule } from '../tools/KwirthIcons'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization } from '../tools/AuthorizationManagement'
import { versionGreaterThan } from '@kwirthmagnify/kwirth-common'
import { useKeyboard } from '../tools/useKeyboard'

const DAEMONS_MANIFEST_URL = 'https://raw.githubusercontent.com/kwirthmagnify/kwirth/refs/heads/master/daemons/manifest.json'

interface IRequirement {
    type: 'plugin' | 'daemon' | 'sender' | 'provider'
    id: string
    minVersion: string
}

interface IDaemonManifestEntry {
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    url: string
    requires?: IRequirement[]
}

interface IInstalledDaemon {
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    installedFrom?: string
}

interface IDaemonDialogProps {
    onClose: () => void
}

const DaemonDialog: React.FC<IDaemonDialogProps> = (props: IDaemonDialogProps) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType
    const theme = useTheme()
    useKeyboard(props.onClose)

    const [available, setAvailable] = useState<IDaemonManifestEntry[]>([])
    const [installed, setInstalled] = useState<IInstalledDaemon[]>([])
    const [loadingManifest, setLoadingManifest] = useState(false)
    const [installingId, setInstallingId] = useState<string | undefined>()
    const [uninstallingId, setUninstallingId] = useState<string | undefined>()
    const [error, setError] = useState<string | undefined>()
    const [filterText, setFilterText] = useState('')
    const [installedFilter, setInstalledFilter] = useState('')
    const [selectedVersions, setSelectedVersions] = useState<Record<string, string>>({})
    const [crossInstalled, setCrossInstalled] = useState<Record<string, { id: string, version: string }[]>>({})
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card')

    const groupedAvailable: Record<string, IDaemonManifestEntry[]> = available.reduce((acc, p) => { if (!acc[p.id]) acc[p.id]=[]; acc[p.id].push(p); return acc }, {} as Record<string, IDaemonManifestEntry[]>)
    Object.values(groupedAvailable).forEach(g => g.sort((a,b) => versionGreaterThan(a.version, b.version) ? -1 : 1))
    const getSelectedDaemon = (id: string): IDaemonManifestEntry => { const g=groupedAvailable[id]; const v=selectedVersions[id]??g[0].version; return g.find(p=>p.version===v)??g[0] }
    const [customUrl, setCustomUrl] = useState('')
    const [installingCustom, setInstallingCustom] = useState(false)
    const [installingFile, setInstallingFile] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        loadInstalled()
        fetchManifest()
    }, [])

    const loadInstalled = async () => {
        try {
            const res = await fetch(`${backendUrl}/daemons`, addGetAuthorization(accessString))
            setInstalled(await res.json())
        } catch (err) {
            setError(`Failed to load installed daemons: ${err}`)
        }
    }

    const fetchManifest = async () => {
        setError(undefined)
        setLoadingManifest(true)
        try {
            const res = await fetch(DAEMONS_MANIFEST_URL)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data: IDaemonManifestEntry[] = await res.json()
            setAvailable(data)
            const neededTypes = new Set(data.flatMap(e => e.requires ?? []).map(r => r.type).filter(t => t !== 'daemon'))
            if (neededTypes.size > 0) {
                const endpoints: Record<string, string> = { plugin: `${backendUrl}/plugins`, sender: `${backendUrl}/senders`, provider: `${backendUrl}/providers` }
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
        const list = req.type === 'daemon' ? installed : (crossInstalled[req.type] ?? [])
        const found = list.find(x => x.id === req.id)
        return !!found && (found.version === req.minVersion || versionGreaterThan(found.version, req.minVersion))
    }

    const installFromCatalog = async (daemon: IDaemonManifestEntry) => {
        setError(undefined)
        setInstallingId(daemon.id)
        try {
            const res = await fetch(`${backendUrl}/daemons/install`, addPostAuthorization(accessString, JSON.stringify({ url: daemon.url })))
            if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? `HTTP ${res.status}`) }
            await loadInstalled()
        } catch (err) {
            setError(`Failed to install ${daemon.name}: ${err}`)
        } finally {
            setInstallingId(undefined)
        }
    }

    const uninstall = async (daemon: IInstalledDaemon) => {
        setError(undefined)
        setUninstallingId(daemon.id)
        try {
            const res = await fetch(`${backendUrl}/daemons/${daemon.id}`, addDeleteAuthorization(accessString))
            if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? `HTTP ${res.status}`) }
            await loadInstalled()
        } catch (err) {
            setError(`Failed to uninstall ${daemon.name}: ${err}`)
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
            const res = await fetch(`${backendUrl}/daemons/install`, addPostAuthorization(accessString, JSON.stringify({ url })))
            if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? `HTTP ${res.status}`) }
            setCustomUrl('')
            await loadInstalled()
        } catch (err) {
            setError(`Failed to install daemon: ${err}`)
        } finally {
            setInstallingCustom(false)
        }
    }

    const installFromFile = async (file: File) => {
        setError(undefined)
        setInstallingFile(true)
        try {
            const res = await fetch(`${backendUrl}/daemons/upload`, {
                method: 'POST',
                headers: { Authorization: accessString ? `Bearer ${accessString}` : '', 'Content-Type': 'application/octet-stream', 'X-Kwirth-App': 'true' },
                body: file
            })
            if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? `HTTP ${res.status}`) }
            await loadInstalled()
        } catch (err) {
            setError(`Failed to install daemon: ${err}`)
        } finally {
            setInstallingFile(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const isInstalled = (id: string) => installed.some(d => d.id === id && d.installedFrom !== 'dev')
    const isDevInstalled = (id: string) => installed.some(d => d.id === id && d.installedFrom === 'dev')

    const resolveSource = (installedFrom?: string): React.ReactElement | null => {
        if (!installedFrom) return null
        if (installedFrom === 'local') return <Typography variant='caption' color='text.secondary'>Local file</Typography>
        if (installedFrom === 'dev') return <Chip label='dev' size='small' variant='outlined' color='warning' />
        const short = installedFrom.length > 40 ? installedFrom.slice(0, 37) + '…' : installedFrom
        return <Tooltip title={installedFrom}><Typography variant='caption' color='text.secondary'><Link fontSize='inherit' sx={{ verticalAlign: 'middle', mr: 0.3 }} />{short}</Typography></Tooltip>
    }

    const daemonGradient = (name: string) => {
        let hash = 0
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
        const hue = (Math.abs(hash) % 360 + 270) % 360
        const dark = theme.palette.mode === 'dark'
        const op = dark ? 0.04 : 0.12
        const crosses = `repeating-linear-gradient(0deg, hsla(${hue}, 60%, 70%, ${op}) 0px, hsla(${hue}, 60%, 70%, ${op}) 1px, transparent 1px, transparent 10px), repeating-linear-gradient(90deg, hsla(${hue}, 60%, 70%, ${op}) 0px, hsla(${hue}, 60%, 70%, ${op}) 1px, transparent 1px, transparent 10px)`
        return `${crosses}, linear-gradient(315deg, hsla(${hue}, 70%, 55%, ${dark ? 0.06 : 0.10}) 0%, hsla(${hue}, 50%, 40%, ${dark ? 0.12 : 0.22}) 100%)`
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

    const filteredIds = Object.keys(groupedAvailable).filter(id => !filterText || id.includes(filterText.toLowerCase()) || groupedAvailable[id][0].name?.toLowerCase().includes(filterText.toLowerCase()) || groupedAvailable[id][0].displayName?.toLowerCase().includes(filterText.toLowerCase()))

    return (
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '60vw', maxWidth: '60vw', height: '78vh' } }}>
            <DialogTitle>Manage daemons</DialogTitle>
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{ mt: 1 }}>

                    <Stack direction='row' alignItems='center' spacing={1}>
                        <Typography variant='subtitle2'>Installed daemons</Typography>
                        <TextField size='small' placeholder='Filter…' value={installedFilter} onChange={e => setInstalledFilter(e.target.value)} sx={{ flex: 1 }} slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: '0.75rem' } } }} />
                        <ViewToggle />
                    </Stack>
                    {installed.length === 0
                        ? <Typography variant='body2' color='text.secondary'>No daemons installed.</Typography>
                        : viewMode === 'card'
                            ? <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.5 }}>
                                {installed.filter(d => !installedFilter || d.id.includes(installedFilter.toLowerCase()) || (d.displayName || d.name || '').toLowerCase().includes(installedFilter.toLowerCase())).map(daemon => (
                                    <Box key={daemon.id} sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: 1.5, minHeight: 100, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, background: daemonGradient(daemon.name) }}>
                                        <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                                            <Box sx={{ color: 'text.secondary', mt: 0.25 }}><SmartToy /></Box>
                                            <Box flex={1} minWidth={0}>
                                                <Stack direction='row' alignItems='center' spacing={0.5} sx={{ width: '100%' }}>
                                                    <Typography variant='body2' fontWeight='bold' sx={{ flex: 1 }}>{daemon.displayName || daemon.name || daemon.id}</Typography>
                                                    <Chip label={`v${daemon.version}`} size='small' sx={{ minWidth: 72 }} />
                                                </Stack>
                                                <Typography variant='caption' color='text.secondary' display='block' sx={{ mt: 0.5 }}>{daemon.description}</Typography>
                                            </Box>
                                            {daemon.website && <Tooltip title='Open daemon website'><IconButton size='small' sx={{ mr: -0.5 }} onClick={() => window.open(daemon.website, '_blank', 'noopener')}><OpenInNew fontSize='small' /></IconButton></Tooltip>}
                                        </Stack>
                                        <Stack direction='row' justifyContent='space-between' alignItems='center' sx={{ mt: 1 }}>
                                            <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', mr: 1 }}>{resolveSource(daemon.installedFrom)}</Box>
                                            <Tooltip title={daemon.installedFrom === 'dev' ? 'Dev daemons cannot be uninstalled' : 'Uninstall'}>
                                                <span>
                                                    <IconButton size='small' color='error' disabled={daemon.installedFrom === 'dev' || uninstallingId === daemon.id} onClick={() => uninstall(daemon)}>
                                                        {uninstallingId === daemon.id ? <CircularProgress size={16} /> : <Delete fontSize='small' />}
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                        </Stack>
                                    </Box>
                                ))}
                              </Box>
                            : <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                                {installed.filter(d => !installedFilter || d.id.includes(installedFilter.toLowerCase()) || (d.displayName || d.name || '').toLowerCase().includes(installedFilter.toLowerCase())).map(daemon => (
                                    <Box key={daemon.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
                                        <Box sx={{ color: 'text.secondary', flexShrink: 0, display: 'flex' }}><SmartToy fontSize='small' /></Box>
                                        <Typography variant='body2' fontWeight='bold' sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{daemon.displayName || daemon.name || daemon.id}</Typography>
                                        <Box sx={{ flexShrink: 0 }}>{resolveSource(daemon.installedFrom)}</Box>
                                        <Chip label={`v${daemon.version}`} size='small' sx={{ minWidth: 72 }} />
                                        <Tooltip title={daemon.installedFrom === 'dev' ? 'Dev daemons cannot be uninstalled' : 'Uninstall'}>
                                            <span>
                                                <IconButton size='small' color='error' disabled={daemon.installedFrom === 'dev' || uninstallingId === daemon.id} onClick={() => uninstall(daemon)}>
                                                    {uninstallingId === daemon.id ? <CircularProgress size={16} /> : <Delete fontSize='small' />}
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    </Box>
                                ))}
                              </Box>
                    }

                    <Typography variant='subtitle2' sx={{ pt: 1 }}>Install daemon</Typography>
                    <Stack direction='row' spacing={1} alignItems='center'>
                        <TextField size='small' fullWidth placeholder='https://...' value={customUrl} onChange={e => setCustomUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') installFromUrl() }} />
                        <Tooltip title='Install from URL'><span><IconButton size='small' color='primary' disabled={installingCustom || !customUrl.trim()} onClick={installFromUrl}>{installingCustom ? <CircularProgress size={16} /> : <Download fontSize='small' />}</IconButton></span></Tooltip>
                        <Divider orientation='vertical' flexItem />
                        <input ref={fileInputRef} type='file' accept='.tgz,application/gzip' style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) installFromFile(f) }} />
                        <Tooltip title='Install from local file'><span>
                            <Button variant='outlined' size='small' startIcon={installingFile ? <CircularProgress size={14} /> : <FolderOpen fontSize='small' />} disabled={installingFile} onClick={() => fileInputRef.current?.click()} sx={{ whiteSpace: 'nowrap' }}>
                                {installingFile ? 'Installing…' : 'Browse…'}
                            </Button>
                        </span></Tooltip>
                    </Stack>

                    <Stack direction='row' alignItems='center' spacing={1} sx={{ pt: 1 }}>
                        <Typography variant='subtitle2'>Available daemons</Typography>
                        <TextField size='small' placeholder='Filter…' value={filterText} onChange={e => setFilterText(e.target.value)} sx={{ flex: 1 }} slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: '0.75rem' } } }} />
                        <Tooltip title='Refresh catalog'><span><IconButton size='small' sx={{ width: 30, height: 30 }} onClick={fetchManifest} disabled={loadingManifest}>{loadingManifest ? <CircularProgress size={16} /> : <Refresh fontSize='small' />}</IconButton></span></Tooltip>
                    </Stack>

                    {available.length === 0 && !loadingManifest &&
                        <Typography variant='body2' color='text.secondary'>No daemons available in catalog.</Typography>
                    }

                    {filteredIds.length > 0 && (
                        viewMode === 'card'
                            ? <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.5 }}>
                                {filteredIds.map(id => {
                                    const group = groupedAvailable[id]
                                    const daemon = getSelectedDaemon(id)
                                    const versions = group.map(p => p.version)
                                    return (
                                    <Box key={id} sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: 1.5, minHeight: 100, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, background: daemonGradient(daemon.name) }}>
                                        <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                                            <Box sx={{ color: 'text.secondary', mt: 0.25 }}><SmartToy /></Box>
                                            <Box flex={1} minWidth={0}>
                                                <Stack direction='row' alignItems='center' spacing={0.5} sx={{ width: '100%' }}>
                                                    <Typography variant='body2' fontWeight='bold' sx={{ flex: 1 }}>{daemon.displayName || daemon.name}</Typography>
                                                    {isDevInstalled(id) && <Chip label='dev active' size='small' variant='outlined' color='warning' />}
                                                    {isInstalled(id) && <Chip label='installed' color='success' size='small' icon={<CheckCircle />} />}
                                                    {versions.length > 1
                                                        ? <Select size='small' value={daemon.version} onChange={e => setSelectedVersions(prev => ({ ...prev, [id]: e.target.value }))} sx={{ height: 24, fontSize: '0.75rem', minWidth: 80, '& .MuiSelect-select': { py: 0, px: 1 } }}>
                                                            {versions.map(v => <MenuItem key={v} value={v} sx={{ fontSize: '0.75rem' }}>{v}</MenuItem>)}
                                                          </Select>
                                                        : <Chip label={`v${daemon.version}`} size='small' sx={{ minWidth: 72 }} />
                                                    }
                                                </Stack>
                                                <Typography variant='caption' color='text.secondary' display='block' sx={{ mt: 0.5 }}>{daemon.description}</Typography>
                                                {daemon.requires && daemon.requires.length > 0 && (
                                                    <Stack direction='row' flexWrap='wrap' useFlexGap spacing={0.5} sx={{ mt: 0.5 }}>
                                                        <Typography variant='caption' color='text.disabled'>Requires:</Typography>
                                                        {daemon.requires.map((r, i) => <Chip key={i} label={`${r.id} (${r.type[0].toUpperCase()}) ≥${r.minVersion}`} size='small' variant='outlined' sx={{ fontSize: '0.6rem', height: 18 }} />)}
                                                    </Stack>
                                                )}
                                            </Box>
                                            {daemon.website && <Tooltip title='Open daemon website'><IconButton size='small' sx={{ mr: -0.5 }} onClick={() => window.open(daemon.website, '_blank', 'noopener')}><OpenInNew fontSize='small' /></IconButton></Tooltip>}
                                        </Stack>
                                        <Stack direction='row' justifyContent='flex-end' sx={{ mt: 1 }}>
                                            {(() => { const unmet = (daemon.requires ?? []).filter(r => !isRequirementMet(r)); return (
                                                <Tooltip title={isDevInstalled(id) ? 'Dev version active' : isInstalled(id) ? 'Already installed' : unmet.length > 0 ? `Requires: ${unmet.map(r => `${r.type} ${r.id} ≥${r.minVersion}`).join(', ')}` : 'Install'}>
                                                    <span><IconButton size='small' color='primary' disabled={isDevInstalled(id) || isInstalled(id) || installingId === id || unmet.length > 0} onClick={() => installFromCatalog(daemon)}>
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
                                    const daemon = getSelectedDaemon(id)
                                    const versions = group.map(p => p.version)
                                    const unmet = (daemon.requires ?? []).filter(r => !isRequirementMet(r))
                                    return (
                                        <Box key={id} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
                                            <Box sx={{ color: 'text.secondary', flexShrink: 0, display: 'flex' }}><SmartToy fontSize='small' /></Box>
                                            <Typography variant='body2' fontWeight='bold' sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{daemon.displayName || daemon.name}</Typography>
                                            {isDevInstalled(id) && <Chip label='dev active' size='small' variant='outlined' color='warning' />}
                                            {isInstalled(id) && <Chip label='installed' color='success' size='small' icon={<CheckCircle />} />}
                                            {versions.length > 1
                                                ? <Select size='small' value={daemon.version} onChange={e => setSelectedVersions(prev => ({ ...prev, [id]: e.target.value }))} sx={{ height: 24, fontSize: '0.75rem', minWidth: 80, '& .MuiSelect-select': { py: 0, px: 1 } }}>
                                                    {versions.map(v => <MenuItem key={v} value={v} sx={{ fontSize: '0.75rem' }}>{v}</MenuItem>)}
                                                  </Select>
                                                : <Chip label={`v${daemon.version}`} size='small' sx={{ minWidth: 72 }} />
                                            }
                                            <Tooltip title={isDevInstalled(id) ? 'Dev version active' : isInstalled(id) ? 'Already installed' : unmet.length > 0 ? `Requires: ${unmet.map(r => `${r.type} ${r.id} ≥${r.minVersion}`).join(', ')}` : 'Install'}>
                                                <span><IconButton size='small' color='primary' disabled={isDevInstalled(id) || isInstalled(id) || installingId === id || unmet.length > 0} onClick={() => installFromCatalog(daemon)}>
                                                    {installingId === id ? <CircularProgress size={16} /> : <Download fontSize='small' />}
                                                </IconButton></span>
                                            </Tooltip>
                                        </Box>
                                    )
                                })}
                              </Box>
                    )}

                    {error && <Typography variant='caption' color='error'>{error}</Typography>}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={props.onClose}>CLOSE</Button>
            </DialogActions>
        </Dialog>
    )
}

export { DaemonDialog }
