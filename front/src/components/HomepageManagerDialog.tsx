import React, { useContext, useEffect, useRef, useState } from 'react'
import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, Divider, IconButton, MenuItem, Select, Stack, TextField, Tooltip, Typography, useTheme } from '@mui/material'
import { CheckCircle, Delete, Download, FolderOpen, Home, Link, OpenInNew, Refresh, Settings, ViewList, ViewModule } from '@kwirthmagnify/kwirth-common-front/icons'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { DialogTitleHelp } from '@kwirthmagnify/kwirth-common-front'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization } from '../tools/AuthorizationManagement'
import { versionGreaterThan } from '@kwirthmagnify/kwirth-common'
import { useKeyboard } from '../tools/useKeyboard'

const HOMEPAGES_MANIFEST_URL = 'https://raw.githubusercontent.com/kwirthmagnify/kwirth/refs/heads/master/homepages/manifest.json'

interface IHomepageManifestEntry {
    id: string
    name: string
    displayName: string
    version: string
    description: string
    website?: string
    url: string
    previewUrl?: string
}

interface IInstalledHomepage {
    id: string
    name: string
    displayName: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    hasPreview?: boolean
    requiresRestart?: boolean
}

interface IHomepageManagerDialogProps {
    onClose: () => void
    activeHomepageId: string | undefined
    onActivate: (id: string | undefined, config: Record<string, any>) => void
    onHomepageLoad: (id: string) => void
    onHomepageUnload: (id: string) => void
    onRestartRequired?: () => void
}

const HomepageManagerDialog: React.FC<IHomepageManagerDialogProps> = (props: IHomepageManagerDialogProps) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType
    const theme = useTheme()
    useKeyboard(props.onClose)

    const [available, setAvailable] = useState<IHomepageManifestEntry[]>([])
    const [installed, setInstalled] = useState<IInstalledHomepage[]>([])
    const [loadingManifest, setLoadingManifest] = useState(false)
    const [installingId, setInstallingId] = useState<string | undefined>()
    const [uninstallingId, setUninstallingId] = useState<string | undefined>()
    const [error, setError] = useState<string | undefined>()
    const [customUrl, setCustomUrl] = useState('')
    const [installingCustom, setInstallingCustom] = useState(false)
    const [installingFile, setInstallingFile] = useState(false)
    const [filterText, setFilterText] = useState('')
    const [installedFilter, setInstalledFilter] = useState('')
    const [selectedVersions, setSelectedVersions] = useState<Record<string, string>>({})
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card')
    const [setupHomepageId, setSetupHomepageId] = useState<string | undefined>()
    const [setupConfig, setSetupConfig] = useState<Record<string, any>>({})
    const fileInputRef = useRef<HTMLInputElement>(null)

    const getExt = (id: string) => (window as any).__kwirth_homepages__?.[id]

    const handleActivate = (id: string) => {
        const ext = getExt(id)
        if (ext?.SetupDialog) {
            const saved = localStorage.getItem(`kwirth.homepage.config.${id}`)
            setSetupConfig(saved ? JSON.parse(saved) : (ext.defaultConfig ?? {}))
            setSetupHomepageId(id)
        } else {
            props.onActivate(id, ext?.defaultConfig ?? {})
        }
    }

    const openReconfigure = (id: string) => {
        const ext = getExt(id)
        const saved = localStorage.getItem(`kwirth.homepage.config.${id}`)
        setSetupConfig(saved ? JSON.parse(saved) : (ext?.defaultConfig ?? {}))
        setSetupHomepageId(id)
    }

    const groupedAvailable: Record<string, IHomepageManifestEntry[]> = available.reduce((acc, p) => {
        if (!acc[p.id]) acc[p.id] = []
        acc[p.id].push(p)
        return acc
    }, {} as Record<string, IHomepageManifestEntry[]>)
    Object.values(groupedAvailable).forEach(group => group.sort((a, b) => versionGreaterThan(a.version, b.version) ? -1 : 1))

    const getSelectedEntry = (id: string): IHomepageManifestEntry => {
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
            const res = await fetch(`${backendUrl}/core/homepages`, addGetAuthorization(accessString))
            const data: IInstalledHomepage[] = await res.json()
            setInstalled(data)
        } catch (err) {
            setError(`Failed to load installed homepages: ${err}`)
        }
    }

    const fetchManifest = async () => {
        setError(undefined)
        setLoadingManifest(true)
        try {
            const res = await fetch(HOMEPAGES_MANIFEST_URL)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data: IHomepageManifestEntry[] = await res.json()
            setAvailable(data)
        } catch (err) {
            setError(`Failed to fetch homepage catalog: ${err}`)
        } finally {
            setLoadingManifest(false)
        }
    }

    const install = async (hp: IHomepageManifestEntry) => {
        setError(undefined)
        setInstallingId(hp.id)
        try {
            const res = await fetch(`${backendUrl}/core/homepages/install`, addPostAuthorization(accessString, JSON.stringify({ url: hp.url })))
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            const meta: IInstalledHomepage = await res.json()
            await loadInstalled()
            props.onHomepageLoad(meta.id)
            if (meta.requiresRestart) props.onRestartRequired?.()
        } catch (err) {
            setError(`Failed to install ${hp.name}: ${err}`)
        } finally {
            setInstallingId(undefined)
        }
    }

    const uninstall = async (hp: IInstalledHomepage) => {
        setError(undefined)
        setUninstallingId(hp.id)
        try {
            const res = await fetch(`${backendUrl}/core/homepages/${hp.id}`, addDeleteAuthorization(accessString))
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            if (props.activeHomepageId === hp.id) props.onActivate(undefined, {})
            props.onHomepageUnload(hp.id)
            await loadInstalled()
        } catch (err) {
            setError(`Failed to uninstall ${hp.name}: ${err}`)
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
            const res = await fetch(`${backendUrl}/core/homepages/install`, addPostAuthorization(accessString, JSON.stringify({ url })))
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            const meta: IInstalledHomepage = await res.json()
            await loadInstalled()
            props.onHomepageLoad(meta.id)
            if (meta.requiresRestart) props.onRestartRequired?.()
            setCustomUrl('')
        } catch (err) {
            setError(`Failed to install homepage: ${err}`)
        } finally {
            setInstallingCustom(false)
        }
    }

    const installFromFile = async (file: File) => {
        setError(undefined)
        setInstallingFile(true)
        try {
            const res = await fetch(`${backendUrl}/core/homepages/upload`, {
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
            const meta: IInstalledHomepage = await res.json()
            await loadInstalled()
            props.onHomepageLoad(meta.id)
            if (meta.requiresRestart) props.onRestartRequired?.()
        } catch (err) {
            setError(`Failed to install homepage: ${err}`)
        } finally {
            setInstallingFile(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const isInstalled = (id: string) => installed.some(p => p.id === id && p.installedFrom !== 'dev')
    const isDevInstalled = (id: string) => installed.some(p => p.id === id && p.installedFrom === 'dev')
    const isActive = (id: string) => props.activeHomepageId === id

    const resolveSource = (installedFrom?: string): React.ReactElement | null => {
        if (!installedFrom) return null
        if (installedFrom === 'dev') return <Chip label='dev' size='small' variant='outlined' color='warning' />
        if (installedFrom === 'local') return <Chip icon={<FolderOpen />} label='Local file' size='small' variant='outlined' />
        if (installedFrom.startsWith('pack:'))
            return <Tooltip title={`Installed by pack '${installedFrom.slice(5)}'`}><Chip label='via pack' size='small' variant='outlined' color='secondary' /></Tooltip>
        if (installedFrom.includes('github.com/kwirthmagnify')) return <Chip icon={<Home />} label='Kwirth' size='small' variant='outlined' color='primary' />
        const short = installedFrom.length > 40 ? installedFrom.slice(0, 37) + '…' : installedFrom
        return <Tooltip title={installedFrom}><Chip icon={<Link />} label={short} size='small' variant='outlined' sx={{ maxWidth: '100%' }} /></Tooltip>
    }

    const homepageGradient = (name: string) => {
        let hash = 0
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
        const hue = Math.abs(hash) % 360
        const dark = theme.palette.mode === 'dark'
        return `linear-gradient(315deg, hsla(${hue}, 75%, 58%, ${dark ? 0.07 : 0.12}) 0%, hsla(${hue}, 55%, 42%, ${dark ? 0.14 : 0.26}) 100%)`
    }

    const HomepageCard = ({ id, displayName, version, versions, onVersionChange, description, badge, source, website, action }: { id: string; displayName: string; version: string; versions?: string[]; onVersionChange?: (v: string) => void; description: string; badge?: React.ReactNode; source?: React.ReactNode; website?: string; action: React.ReactNode }) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: 1.5, minHeight: 100, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, background: homepageGradient(id) }}>
            <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                <Box sx={{ color: 'text.secondary', mt: 0.25 }}><Home /></Box>
                <Box flex={1} minWidth={0}>
                    <Stack direction='row' alignItems='center' spacing={0.5} sx={{ width: '100%' }}>
                        <Typography variant='body2' fontWeight='bold' component='span' sx={{ flex: 1 }}>{displayName}</Typography>
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
                <Tooltip title={website ? 'Open homepage website' : 'No website available'}>
                    <span>
                        <IconButton size='small' sx={{ mr: -0.5 }} disabled={!website} onClick={() => window.open(website!, '_blank', 'noopener')}>
                            <OpenInNew fontSize='small' />
                        </IconButton>
                    </span>
                </Tooltip>
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

    const filteredIds = Object.keys(groupedAvailable).filter(id => !filterText || id.includes(filterText.toLowerCase()) || groupedAvailable[id][0].displayName?.toLowerCase().includes(filterText.toLowerCase()))
    const filteredInstalled = installed.filter(p => !installedFilter || p.id.includes(installedFilter.toLowerCase()) || (p.displayName || p.name).toLowerCase().includes(installedFilter.toLowerCase()))

    return (
        <>
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '72vw', maxWidth: '72vw', height: '80vh' } }}>
            <DialogTitleHelp section='guide/extensions/homepages/index?id=admin-guide' docsUrl={backendUrl + '/core/docs/core/kwirth'}>Manage homepages</DialogTitleHelp>
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{ mt: 1 }}>

                    <Stack direction='row' alignItems='center' spacing={1}>
                        <Typography variant='subtitle2'>Installed homepages</Typography>
                        <TextField size='small' placeholder='Filter…' value={installedFilter} onChange={e => setInstalledFilter(e.target.value)} sx={{ flex: 1 }} slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: '0.75rem' } } }} />
                        <ViewToggle />
                    </Stack>

                    {installed.length === 0
                        ? <Typography variant='body2' color='text.secondary'>No homepages installed. The built-in homepage is always available.</Typography>
                        : viewMode === 'card'
                            ? <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
                                {filteredInstalled.map(hp => (
                                    <HomepageCard
                                        key={hp.id}
                                        id={hp.id}
                                        displayName={hp.displayName || hp.name}
                                        version={hp.version}
                                        description={hp.description}
                                        badge={isActive(hp.id) ? <Chip label='active' size='small' color='primary' icon={<CheckCircle />} /> : undefined}
                                        source={resolveSource(hp.installedFrom)}
                                        website={hp.website}
                                        action={
                                            <Stack direction='row' alignItems='center' spacing={0.5}>
                                                {isActive(hp.id)
                                                    ? <Button size='small' variant='outlined' sx={{ minWidth: 100 }} onClick={() => props.onActivate(undefined, {})}>DEACTIVATE</Button>
                                                    : <Button size='small' variant='contained' sx={{ minWidth: 100 }} onClick={() => handleActivate(hp.id)}>ACTIVATE</Button>
                                                }
                                                {isActive(hp.id) && getExt(hp.id)?.SetupDialog && (
                                                    <Tooltip title='Configure'>
                                                        <IconButton size='small' onClick={() => openReconfigure(hp.id)}>
                                                            <Settings fontSize='small' />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                                <Tooltip title={hp.installedFrom === 'dev' ? 'Dev homepages cannot be uninstalled' : hp.installedFrom?.startsWith('pack:') ? 'Installed via pack — uninstall the pack instead' : 'Uninstall'}>
                                                    <span>
                                                        <IconButton size='small' color='error' disabled={hp.installedFrom === 'dev' || hp.installedFrom?.startsWith('pack:') || uninstallingId === hp.id} onClick={() => uninstall(hp)}>
                                                            {uninstallingId === hp.id ? <CircularProgress size={16} /> : <Delete fontSize='small' />}
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            </Stack>
                                        }
                                    />
                                ))}
                              </Box>
                            : <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto auto auto', columnGap: 1, alignItems: 'center', px: 1.5 }}>
                                {filteredInstalled.flatMap((hp, i, arr) => [
                                    <Box key={`${hp.id}-icon`} sx={{ color: 'text.secondary', display: 'flex', py: 1 }}><Home fontSize='small' /></Box>,
                                    <Box key={`${hp.id}-name`} sx={{ py: 1, minWidth: 0 }}>
                                        <Typography variant='body2' fontWeight='bold' sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hp.displayName || hp.name}</Typography>
                                        <Typography variant='caption' color='text.secondary'>{hp.description}</Typography>
                                    </Box>,
                                    <Box key={`${hp.id}-active`} sx={{ py: 1 }}>{isActive(hp.id) && <Chip label='active' size='small' color='primary' icon={<CheckCircle />} />}</Box>,
                                    <Box key={`${hp.id}-version`} sx={{ py: 1 }}><Chip label={`v${hp.version}`} size='small' sx={{ minWidth: 72 }} /></Box>,
                                    <Box key={`${hp.id}-source`} sx={{ py: 1 }}>{resolveSource(hp.installedFrom)}</Box>,
                                    <Box key={`${hp.id}-btn`} sx={{ py: 1 }}>
                                        <Stack direction='row' alignItems='center' spacing={0.5}>
                                            {isActive(hp.id)
                                                ? <Button size='small' variant='outlined' sx={{ minWidth: 100 }} onClick={() => props.onActivate(undefined, {})}>DEACTIVATE</Button>
                                                : <Button size='small' variant='contained' sx={{ minWidth: 100 }} onClick={() => handleActivate(hp.id)}>ACTIVATE</Button>
                                            }
                                            {isActive(hp.id) && getExt(hp.id)?.SetupDialog && (
                                                <Tooltip title='Configure'>
                                                    <IconButton size='small' onClick={() => openReconfigure(hp.id)}>
                                                        <Settings fontSize='small' />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                        </Stack>
                                    </Box>,
                                    <Box key={`${hp.id}-del`} sx={{ py: 1 }}>
                                        <Tooltip title={hp.installedFrom === 'dev' ? 'Dev homepages cannot be uninstalled' : hp.installedFrom?.startsWith('pack:') ? 'Installed via pack — uninstall the pack instead' : 'Uninstall'}>
                                            <span>
                                                <IconButton size='small' color='error' disabled={hp.installedFrom === 'dev' || hp.installedFrom?.startsWith('pack:') || uninstallingId === hp.id} onClick={() => uninstall(hp)}>
                                                    {uninstallingId === hp.id ? <CircularProgress size={16} /> : <Delete fontSize='small' />}
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    </Box>,
                                    ...(i < arr.length - 1 ? [<Box key={`${hp.id}-sep`} sx={{ gridColumn: '1 / -1', borderBottom: 1, borderColor: 'divider', mx: -1.5 }} />] : [])
                                ])}
                              </Box>
                    }

                    <Typography variant='subtitle2' sx={{ pt: 1 }}>Install homepage</Typography>
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
                        <Typography variant='subtitle2'>Available homepages</Typography>
                        <TextField size='small' placeholder='Filter…' value={filterText} onChange={e => setFilterText(e.target.value)} sx={{ flex: 1 }} slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: '0.75rem' } } }} />
                        <Tooltip title='Refresh catalog'>
                            <span>
                                <IconButton size='small' sx={{ width: 30, height: 30 }} onClick={fetchManifest} disabled={loadingManifest}>
                                    {loadingManifest ? <CircularProgress size={16} /> : <Refresh fontSize='small' />}
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Stack>

                    {filteredIds.length === 0 && !loadingManifest && !error &&
                        <Typography variant='body2' color='text.secondary'>No homepages available in catalog.</Typography>
                    }

                    {filteredIds.length > 0 && (
                        viewMode === 'card'
                            ? <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
                                {filteredIds.map(id => {
                                    const group = groupedAvailable[id]
                                    const t = getSelectedEntry(id)
                                    const versions = group.map(p => p.version)
                                    return (
                                        <HomepageCard
                                            key={id}
                                            id={id}
                                            displayName={t.displayName || t.name}
                                            version={t.version}
                                            versions={versions}
                                            onVersionChange={v => setSelectedVersions(prev => ({ ...prev, [id]: v }))}
                                            description={t.description}
                                            website={t.website}
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
                            : <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto', columnGap: 1, alignItems: 'center', px: 1.5 }}>
                                {filteredIds.flatMap((id, i, arr) => {
                                    const group = groupedAvailable[id]
                                    const t = getSelectedEntry(id)
                                    const versions = group.map(p => p.version)
                                    return [
                                        <Box key={`${id}-icon`} sx={{ color: 'text.secondary', display: 'flex', py: 1 }}><Home fontSize='small' /></Box>,
                                        <Box key={`${id}-name`} sx={{ py: 1, minWidth: 0 }}>
                                            <Typography variant='body2' fontWeight='bold' sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.displayName || t.name}</Typography>
                                            <Typography variant='caption' color='text.secondary'>{t.description}</Typography>
                                        </Box>,
                                        <Box key={`${id}-status`} sx={{ py: 1 }}>
                                            {isDevInstalled(id) ? <Chip label='dev' size='small' variant='outlined' color='warning' />
                                            : isInstalled(id) ? <Chip label='installed' color='success' size='small' icon={<CheckCircle />} />
                                            : null}
                                        </Box>,
                                        <Box key={`${id}-version`} sx={{ py: 1 }}>
                                            {versions.length > 1
                                                ? <Select size='small' value={t.version} onChange={e => setSelectedVersions(prev => ({ ...prev, [id]: e.target.value }))} sx={{ height: 24, fontSize: '0.75rem', minWidth: 80, '& .MuiSelect-select': { py: 0, px: 1 } }}>
                                                    {versions.map(v => <MenuItem key={v} value={v} sx={{ fontSize: '0.75rem' }}>{v}</MenuItem>)}
                                                  </Select>
                                                : <Chip label={`v${t.version}`} size='small' sx={{ minWidth: 72 }} />
                                            }
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

        {setupHomepageId && (() => {
            const ext = getExt(setupHomepageId)
            if (!ext?.SetupDialog) return null
            const SetupComp = ext.SetupDialog
            return <SetupComp
                config={setupConfig}
                onSave={(cfg: Record<string, any>) => { props.onActivate(setupHomepageId, cfg); setSetupHomepageId(undefined) }}
                onClose={() => setSetupHomepageId(undefined)}
            />
        })()}
        </>
    )
}

export { HomepageManagerDialog }
