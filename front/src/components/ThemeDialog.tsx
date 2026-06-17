import React, { useContext, useEffect, useRef, useState } from 'react'
import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, MenuItem, Select, Stack, TextField, Tooltip, Typography, useTheme } from '@mui/material'
import { CheckCircle, Delete, Download, FolderOpen, Link, OpenInNew, Palette, Refresh, ViewList, ViewModule } from '../tools/KwirthIcons'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization } from '../tools/AuthorizationManagement'
import { versionGreaterThan } from '@kwirthmagnify/kwirth-common'
import { useKeyboard } from '../tools/useKeyboard'

const THEMES_MANIFEST_URL = 'https://raw.githubusercontent.com/kwirthmagnify/kwirth/refs/heads/master/themes/manifest.json'

interface IThemeManifestEntry {
    id: string
    name: string
    displayName: string
    version: string
    description: string
    website?: string
    url: string
    previewUrl?: string
}

interface IInstalledTheme {
    id: string
    name: string
    displayName: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    hasPreview?: boolean
}

interface IThemeDialogProps {
    onClose: () => void
    activeThemeName: string | undefined
    onActivate: (name: string | undefined) => void
    onThemeLoad: (id: string) => void
    onThemeUnload: (id: string) => void
}

const ThemeDialog: React.FC<IThemeDialogProps> = (props: IThemeDialogProps) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType
    const theme = useTheme()
    useKeyboard(props.onClose)

    const [available, setAvailable] = useState<IThemeManifestEntry[]>([])
    const [installed, setInstalled] = useState<IInstalledTheme[]>([])
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
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card')
    const fileInputRef = useRef<HTMLInputElement>(null)

    const groupedAvailable: Record<string, IThemeManifestEntry[]> = available.reduce((acc, p) => {
        if (!acc[p.id]) acc[p.id] = []
        acc[p.id].push(p)
        return acc
    }, {} as Record<string, IThemeManifestEntry[]>)
    Object.values(groupedAvailable).forEach(group => group.sort((a, b) => versionGreaterThan(a.version, b.version) ? -1 : 1))

    const getSelectedEntry = (id: string): IThemeManifestEntry => {
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
            const res = await fetch(`${backendUrl}/themes`, addGetAuthorization(accessString))
            const data: IInstalledTheme[] = await res.json()
            setInstalled(data)
        } catch (err) {
            setError(`Failed to load installed themes: ${err}`)
        }
    }

    const fetchManifest = async () => {
        setError(undefined)
        setLoadingManifest(true)
        try {
            const res = await fetch(THEMES_MANIFEST_URL)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data: IThemeManifestEntry[] = await res.json()
            setAvailable(data)
        } catch (err) {
            setError(`Failed to fetch theme catalog: ${err}`)
        } finally {
            setLoadingManifest(false)
        }
    }

    const install = async (theme: IThemeManifestEntry) => {
        setError(undefined)
        setInstallingId(theme.id)
        try {
            const res = await fetch(`${backendUrl}/themes/install`, addPostAuthorization(accessString, JSON.stringify({ url: theme.url })))
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            await loadInstalled()
            props.onThemeLoad(theme.id)
        } catch (err) {
            setError(`Failed to install ${theme.name}: ${err}`)
        } finally {
            setInstallingId(undefined)
        }
    }

    const uninstall = async (t: IInstalledTheme) => {
        setError(undefined)
        setUninstallingId(t.id)
        try {
            const res = await fetch(`${backendUrl}/themes/${t.id}`, addDeleteAuthorization(accessString))
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            props.onThemeUnload(t.id)
            await loadInstalled()
        } catch (err) {
            setError(`Failed to uninstall ${t.name}: ${err}`)
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
            const res = await fetch(`${backendUrl}/themes/install`, addPostAuthorization(accessString, JSON.stringify({ url })))
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            const meta: IInstalledTheme = await res.json()
            await loadInstalled()
            props.onThemeLoad(meta.id)
            setCustomUrl('')
        } catch (err) {
            setError(`Failed to install theme: ${err}`)
        } finally {
            setInstallingCustom(false)
        }
    }

    const installFromFile = async (file: File) => {
        setError(undefined)
        setInstallingFile(true)
        try {
            const res = await fetch(`${backendUrl}/themes/upload`, {
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
            const meta: IInstalledTheme = await res.json()
            await loadInstalled()
            props.onThemeLoad(meta.id)
        } catch (err) {
            setError(`Failed to install theme: ${err}`)
        } finally {
            setInstallingFile(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const isInstalled = (id: string) => installed.some(p => p.id === id && p.installedFrom !== 'dev')
    const isDevInstalled = (id: string) => installed.some(p => p.id === id && p.installedFrom === 'dev')
    const isActive = (id: string) => props.activeThemeName === id

    const resolveSource = (installedFrom?: string): React.ReactElement | null => {
        if (!installedFrom) return null
        if (installedFrom === 'dev')
            return <Chip label='dev' size='small' variant='outlined' color='warning' />
        if (installedFrom === 'local')
            return <Chip icon={<FolderOpen />} label='Local file' size='small' variant='outlined' />
        if (installedFrom.includes('github.com/kwirthmagnify'))
            return <Chip icon={<Palette />} label='Kwirth' size='small' variant='outlined' color='primary' />
        const short = installedFrom.length > 40 ? installedFrom.slice(0, 37) + '…' : installedFrom
        return <Tooltip title={installedFrom}><Chip icon={<Link />} label={short} size='small' variant='outlined' sx={{ maxWidth: '100%' }} /></Tooltip>
    }

    const themeGradient = (name: string) => {
        let hash = 0
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
        const hue = Math.abs(hash) % 360
        const dark = theme.palette.mode === 'dark'
        return `linear-gradient(315deg, hsla(${hue}, 75%, 58%, ${dark ? 0.07 : 0.12}) 0%, hsla(${hue}, 55%, 42%, ${dark ? 0.14 : 0.26}) 100%)`
    }

    const ThemeCard = ({ name, displayName, version, versions, onVersionChange, description, badge, source, website, action, previewUrl }: { name: string; displayName: string; version: string; versions?: string[]; onVersionChange?: (v: string) => void; description: string; badge?: React.ReactNode; source?: React.ReactNode; website?: string; action: React.ReactNode; previewUrl?: string }) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: 1.5, minHeight: 120, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, background: previewUrl ? undefined : themeGradient(name), backgroundImage: previewUrl ? `url(${previewUrl})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}>
            <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                <Box sx={{ color: 'text.secondary', mt: 0.25 }}><Palette /></Box>
                <Box flex={1} minWidth={0}>
                    <Stack direction='row' alignItems='center' spacing={0.5} sx={{ width: '100%' }}>
                        <Typography variant='body2' fontWeight='bold' component='span' sx={{ flex: 1 }}>{displayName || name}</Typography>
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
                </Box>
                {website &&
                    <Tooltip title='Open theme website'>
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
            <DialogTitle>Manage themes</DialogTitle>
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{ mt: 1 }}>

                    <Stack direction='row' alignItems='center' spacing={1}>
                        <Typography variant='subtitle2'>Installed themes</Typography>
                        <TextField size='small' placeholder='Filter…' value={installedFilter} onChange={e => setInstalledFilter(e.target.value)} sx={{ flex: 1 }} slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: '0.75rem' } } }} />
                        <ViewToggle />
                    </Stack>
                    {installed.length === 0
                        ? <Typography variant='body2' color='text.secondary'>No themes installed.</Typography>
                        : viewMode === 'card'
                            ? <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
                                {installed.filter(p => !installedFilter || p.id.includes(installedFilter.toLowerCase()) || (p.displayName || p.name).toLowerCase().includes(installedFilter.toLowerCase())).map(t => (
                                    <ThemeCard
                                        key={t.id}
                                        name={t.name}
                                        displayName={t.displayName}
                                        version={t.version}
                                        description={t.description}
                                        website={t.website}
                                        source={resolveSource(t.installedFrom)}
                                        previewUrl={t.hasPreview ? `${backendUrl}/themes/${t.id}/preview` : undefined}
                                        badge={isActive(t.id) ? <Chip label='active' size='small' color='primary' icon={<CheckCircle />} /> : undefined}
                                        action={
                                            <Stack direction='row' alignItems='center' spacing={0.5}>
                                                {isActive(t.id)
                                                    ? <Button size='small' variant='outlined' onClick={() => props.onActivate(undefined)}>DEACTIVATE</Button>
                                                    : <Button size='small' variant='contained' onClick={() => props.onActivate(t.id)}>ACTIVATE</Button>
                                                }
                                                <Tooltip title={t.installedFrom === 'dev' ? 'Dev themes cannot be uninstalled' : 'Uninstall'}>
                                                    <span>
                                                        <IconButton size='small' color='error' disabled={t.installedFrom === 'dev' || uninstallingId === t.id} onClick={() => uninstall(t)}>
                                                            {uninstallingId === t.id ? <CircularProgress size={16} /> : <Delete fontSize='small' />}
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            </Stack>
                                        }
                                    />
                                ))}
                              </Box>
                            : <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden',
                                         display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto auto auto',
                                         columnGap: 1, alignItems: 'center', px: 1.5 }}>
                                {installed.filter(p => !installedFilter || p.id.includes(installedFilter.toLowerCase()) || (p.displayName || p.name).toLowerCase().includes(installedFilter.toLowerCase())).flatMap((t, i, arr) => [
                                    <Box key={`${t.id}-icon`} sx={{ color: 'text.secondary', display: 'flex', py: 1 }}><Palette fontSize='small' /></Box>,
                                    <Typography key={`${t.id}-name`} variant='body2' fontWeight='bold' sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', py: 1 }}>{t.displayName || t.name}</Typography>,
                                    <Box key={`${t.id}-active`} sx={{ py: 1 }}>{isActive(t.id) && <Chip label='active' size='small' color='primary' icon={<CheckCircle />} />}</Box>,
                                    <Box key={`${t.id}-source`} sx={{ py: 1 }}>{resolveSource(t.installedFrom)}</Box>,
                                    <Box key={`${t.id}-ver`} sx={{ py: 1 }}><Chip label={`v${t.version}`} size='small' /></Box>,
                                    <Box key={`${t.id}-btn`} sx={{ py: 1 }}>
                                        {isActive(t.id)
                                            ? <Button size='small' variant='outlined' onClick={() => props.onActivate(undefined)}>DEACTIVATE</Button>
                                            : <Button size='small' variant='contained' onClick={() => props.onActivate(t.id)}>ACTIVATE</Button>}
                                    </Box>,
                                    <Box key={`${t.id}-del`} sx={{ py: 1 }}>
                                        <Tooltip title={t.installedFrom === 'dev' ? 'Dev themes cannot be uninstalled' : 'Uninstall'}>
                                            <span>
                                                <IconButton size='small' color='error' disabled={t.installedFrom === 'dev' || uninstallingId === t.id} onClick={() => uninstall(t)}>
                                                    {uninstallingId === t.id ? <CircularProgress size={16} /> : <Delete fontSize='small' />}
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    </Box>,
                                    ...(i < arr.length - 1 ? [<Box key={`${t.id}-sep`} sx={{ gridColumn: '1 / -1', borderBottom: 1, borderColor: 'divider', mx: -1.5 }} />] : [])
                                ])}
                              </Box>
                    }

                    <Typography variant='subtitle2' sx={{ pt: 1 }}>Install theme</Typography>
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
                        <Typography variant='subtitle2'>Available themes</Typography>
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
                        <Typography variant='body2' color='text.secondary'>No themes available.</Typography>
                    }

                    {filteredIds.length > 0 && (
                        viewMode === 'card'
                            ? <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
                                {filteredIds.map(id => {
                                    const group = groupedAvailable[id]
                                    const t = getSelectedEntry(id)
                                    const versions = group.map(p => p.version)
                                    return (
                                        <ThemeCard
                                            key={id}
                                            name={t.name}
                                            displayName={t.displayName}
                                            version={t.version}
                                            versions={versions}
                                            onVersionChange={v => setSelectedVersions(prev => ({ ...prev, [id]: v }))}
                                            description={t.description}
                                            website={t.website}
                                            previewUrl={t.previewUrl}
                                            badge={isDevInstalled(id) ? <Chip label='dev' size='small' variant='outlined' color='warning' /> : isInstalled(id) ? <Chip label='installed' color='success' size='small' icon={<CheckCircle />} /> : undefined}
                                            action={
                                                <Tooltip title={isDevInstalled(id) ? 'A dev version is already loaded' : isInstalled(id) ? 'Already installed — uninstall first' : 'Install'}>
                                                    <span>
                                                        <IconButton size='small' color='primary' disabled={isDevInstalled(id) || isInstalled(id) || installingId === id} onClick={() => install(t)}>
                                                            {installingId === id ? <CircularProgress size={16} /> : <Download fontSize='small' />}
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            }
                                        />
                                    )
                                })}
                              </Box>
                            : <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden',
                                         display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto',
                                         columnGap: 1, alignItems: 'center', px: 1.5 }}>
                                {filteredIds.flatMap((id, i, arr) => {
                                    const group = groupedAvailable[id]
                                    const t = getSelectedEntry(id)
                                    const versions = group.map(p => p.version)
                                    return [
                                        <Box key={`${id}-icon`} sx={{ color: 'text.secondary', display: 'flex', py: 1 }}><Palette fontSize='small' /></Box>,
                                        <Typography key={`${id}-name`} variant='body2' fontWeight='bold' sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', py: 1 }}>{t.displayName || t.name}</Typography>,
                                        <Box key={`${id}-status`} sx={{ py: 1 }}>
                                            {isDevInstalled(id) ? <Chip label='dev' size='small' variant='outlined' color='warning' />
                                            : isInstalled(id) ? <Chip label='installed' color='success' size='small' icon={<CheckCircle />} />
                                            : null}
                                        </Box>,
                                        <Box key={`${id}-ver`} sx={{ py: 1 }}>
                                            {versions.length > 1
                                                ? <Select size='small' value={t.version} onChange={e => setSelectedVersions(prev => ({ ...prev, [id]: e.target.value }))} sx={{ height: 24, fontSize: '0.75rem', minWidth: 80, '& .MuiSelect-select': { py: 0, px: 1 } }}>
                                                    {versions.map(v => <MenuItem key={v} value={v} sx={{ fontSize: '0.75rem' }}>{v}</MenuItem>)}
                                                  </Select>
                                                : <Chip label={`v${t.version}`} size='small' />}
                                        </Box>,
                                        <Box key={`${id}-install`} sx={{ py: 1 }}>
                                            <Tooltip title={isDevInstalled(id) ? 'A dev version is already loaded' : isInstalled(id) ? 'Already installed — uninstall first' : 'Install'}>
                                                <span>
                                                    <IconButton size='small' color='primary' disabled={isDevInstalled(id) || isInstalled(id) || installingId === id} onClick={() => install(t)}>
                                                        {installingId === id ? <CircularProgress size={16} /> : <Download fontSize='small' />}
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                        </Box>,
                                        ...(i < arr.length - 1 ? [<Box key={`${id}-sep`} sx={{ gridColumn: '1 / -1', borderBottom: 1, borderColor: 'divider', mx: -1.5 }} />] : [])
                                    ]
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

export { ThemeDialog }
