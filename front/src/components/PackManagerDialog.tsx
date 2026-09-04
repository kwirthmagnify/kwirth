import React, { useContext, useEffect, useRef, useState } from 'react'
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, Divider, IconButton, Stack, TextField, Tooltip, Typography, useTheme } from '@mui/material'
import { Chip } from '@mui/material'
import { CheckCircle, Delete, Download, Extension, FolderOpen, Link, OpenInNew, Refresh, ViewList, ViewModule } from '@kwirthmagnify/kwirth-common-front/icons'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { DialogTitleHelp } from '@kwirthmagnify/kwirth-common-front'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization } from '../tools/AuthorizationManagement'
import { versionGreaterThan, EExtensionType } from '@kwirthmagnify/kwirth-common'
import { MarketplaceBadge } from './MarketplaceBadge'
import { useKeyboard } from '../tools/useKeyboard'


interface IPackManifestEntry {
    marketplaceId?: string
    marketplaceLabel?: string
    id: string
    displayName: string
    version: string
    description: string
    website?: string
    url: string
    extensionTypes?: string[]
}

interface IPackExtensionRef {
    extensionType: string
    id: string
    tgz: string
}

interface IInstalledPack {
    id: string
    displayName: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    extensions: IPackExtensionRef[]
    requiresRestart?: boolean
}

interface IPackManagerDialogProps {
    onClose: () => void
    onPluginLoad: (id: string) => void
    onPluginUnload: (id: string) => void
    onThemeLoad: (id: string) => void
    onThemeUnload: (id: string) => void
    onHomepageLoad: (id: string) => void
    onHomepageUnload: (id: string) => void
    onRestartRequired?: () => void
}

const PackManagerDialog: React.FC<IPackManagerDialogProps> = (props: IPackManagerDialogProps) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType
    const theme = useTheme()
    useKeyboard(props.onClose)

    const [available, setAvailable] = useState<IPackManifestEntry[]>([])
    const [installed, setInstalled] = useState<IInstalledPack[]>([])
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
    const fileInputRef = useRef<HTMLInputElement>(null)

    const packGradient = (name: string) => {
        let hash = 0
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
        const hue = Math.abs(hash) % 360
        const dark = theme.palette.mode === 'dark'
        const alpha = dark ? 0.06 : 0.18
        const lines1 = `repeating-linear-gradient(0deg, hsla(${hue}, 65%, 70%, ${alpha}) 0px, transparent 1px, transparent 12px)`
        const lines2 = `repeating-linear-gradient(90deg, hsla(${hue}, 65%, 70%, ${alpha}) 0px, transparent 1px, transparent 12px)`
        return `${lines1}, ${lines2}, linear-gradient(315deg, hsla(${hue}, 75%, 58%, ${dark ? 0.07 : 0.12}) 0%, hsla(${hue}, 55%, 42%, ${dark ? 0.12 : 0.20}) 100%)`
    }

    const groupedAvailable: Record<string, IPackManifestEntry[]> = available.reduce((acc, p) => {
        if (!acc[p.id]) acc[p.id] = []
        acc[p.id].push(p)
        return acc
    }, {} as Record<string, IPackManifestEntry[]>)
    Object.values(groupedAvailable).forEach(group => group.sort((a, b) => versionGreaterThan(a.version, b.version) ? -1 : 1))

    const getSelectedEntry = (id: string): IPackManifestEntry => {
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
            const res = await fetch(`${backendUrl}/core/packs`, addGetAuthorization(accessString))
            const data: IInstalledPack[] = await res.json()
            setInstalled(data)
        }
        catch (err) {
            setError(`Failed to load installed packs: ${err}`)
        }
    }

    const fetchManifest = async () => {
        setError(undefined)
        setLoadingManifest(true)
        try {
            const res = await fetch(`${backendUrl}/core/marketplace/${EExtensionType.PACK}`, addGetAuthorization(accessString))
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data: IPackManifestEntry[] = await res.json()
            setAvailable(data)
        }
        catch {
            // catalog is optional — no error shown if unavailable
        }
        finally {
            setLoadingManifest(false)
        }
    }

    const loadPackFrontAssets = (meta: IInstalledPack) => {
        for (const ext of meta.extensions) {
            if (ext.extensionType === 'plugin')   props.onPluginLoad(ext.id)
            if (ext.extensionType === 'theme')    props.onThemeLoad(ext.id)
            if (ext.extensionType === 'homepage') props.onHomepageLoad(ext.id)
        }
    }

    const unloadPackFrontAssets = (meta: IInstalledPack) => {
        for (const ext of meta.extensions) {
            if (ext.extensionType === 'plugin')   props.onPluginUnload(ext.id)
            if (ext.extensionType === 'theme')    props.onThemeUnload(ext.id)
            if (ext.extensionType === 'homepage') props.onHomepageUnload(ext.id)
        }
    }

    const install = async (entry: IPackManifestEntry) => {
        setError(undefined)
        setInstallingId(entry.id)
        try {
            const res = await fetch(`${backendUrl}/core/packs/install`, addPostAuthorization(accessString, JSON.stringify({ url: entry.url })))
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            const meta: IInstalledPack = await res.json()
            await loadInstalled()
            loadPackFrontAssets(meta)
            if (meta.requiresRestart) props.onRestartRequired?.()
        }
        catch (err) {
            setError(`Failed to install pack ${entry.displayName}: ${err}`)
        }
        finally {
            setInstallingId(undefined)
        }
    }

    const uninstall = async (pack: IInstalledPack) => {
        setError(undefined)
        setUninstallingId(pack.id)
        try {
            const res = await fetch(`${backendUrl}/core/packs/${pack.id}`, addDeleteAuthorization(accessString))
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            unloadPackFrontAssets(pack)
            await loadInstalled()
        }
        catch (err) {
            setError(`Failed to uninstall pack ${pack.displayName}: ${err}`)
        }
        finally {
            setUninstallingId(undefined)
        }
    }

    const installFromUrl = async () => {
        const url = customUrl.trim()
        if (!url) return
        setError(undefined)
        setInstallingCustom(true)
        try {
            const res = await fetch(`${backendUrl}/core/packs/install`, addPostAuthorization(accessString, JSON.stringify({ url })))
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            const meta: IInstalledPack = await res.json()
            await loadInstalled()
            loadPackFrontAssets(meta)
            if (meta.requiresRestart) props.onRestartRequired?.()
            setCustomUrl('')
        }
        catch (err) {
            setError(`Failed to install pack: ${err}`)
        }
        finally {
            setInstallingCustom(false)
        }
    }

    const installFromFile = async (file: File) => {
        setError(undefined)
        setInstallingFile(true)
        try {
            const res = await fetch(`${backendUrl}/core/packs/upload`, {
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
            const meta: IInstalledPack = await res.json()
            await loadInstalled()
            loadPackFrontAssets(meta)
            if (meta.requiresRestart) props.onRestartRequired?.()
        }
        catch (err) {
            setError(`Failed to install pack: ${err}`)
        }
        finally {
            setInstallingFile(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const isInstalled = (id: string) => installed.some(p => p.id === id)

    const resolveSource = (installedFrom?: string): React.ReactElement | null => {
        if (!installedFrom) return null
        if (installedFrom === 'local') return <Chip icon={<FolderOpen />} label='Local file' size='small' variant='outlined' />
        if (installedFrom.includes('github.com/kwirthmagnify')) return <Chip icon={<Extension />} label='Kwirth' size='small' variant='outlined' color='primary' />
        const short = installedFrom.length > 40 ? installedFrom.slice(0, 37) + '…' : installedFrom
        return <Tooltip title={installedFrom}><Chip icon={<Link />} label={short} size='small' variant='outlined' sx={{ maxWidth: '100%' }} /></Tooltip>
    }

    const membersSummary = (extensions: IPackExtensionRef[]) => {
        const counts: Record<string, number> = {}
        for (const e of extensions) counts[e.extensionType] = (counts[e.extensionType] ?? 0) + 1
        return Object.entries(counts).map(([type, n]) => `${n} ${type}${n > 1 ? 's' : ''}`).join(', ')
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

    const PackCard = ({ id, displayName, version, description, badge, source, website, members, action }: { id: string; displayName: string; version: string; description: string; badge?: React.ReactNode; source?: React.ReactNode; website?: string; members?: string; action: React.ReactNode }) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: 1.5, minHeight: 100, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, background: packGradient(id) }}>
            <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                <Box sx={{ color: 'text.secondary', mt: 0.25 }}><Extension /></Box>
                <Box flex={1} minWidth={0}>
                    <Stack direction='row' alignItems='center' spacing={0.5} sx={{ width: '100%' }}>
                        <Typography variant='body2' fontWeight='bold' component='span' sx={{ flex: 1 }}>{displayName}</Typography>
                        {badge}
                        <Chip label={`v${version}`} size='small' sx={{ minWidth: 72 }} />
                    </Stack>
                    <Typography variant='caption' color='text.secondary' display='block' sx={{ mt: 0.5 }}>{description}</Typography>
                    {members && <Typography variant='caption' color='text.disabled' display='block'>{members}</Typography>}
                </Box>
                <Tooltip title={website ? 'Open pack website' : 'No website available'}>
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

    const filteredIds = Object.keys(groupedAvailable).filter(id => !filterText || id.includes(filterText.toLowerCase()) || groupedAvailable[id][0].displayName?.toLowerCase().includes(filterText.toLowerCase()))
    const filteredInstalled = installed.filter(p => !installedFilter || p.id.includes(installedFilter.toLowerCase()) || p.displayName.toLowerCase().includes(installedFilter.toLowerCase()))

    return (
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '72vw', maxWidth: '72vw', height: '80vh' } }}>
            <DialogTitleHelp section='guide/extensions/packs/index'>Manage extension packs</DialogTitleHelp>
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{ mt: 1 }}>

                    <Stack direction='row' alignItems='center' spacing={1}>
                        <Typography variant='subtitle2'>Installed packs</Typography>
                        <TextField size='small' placeholder='Filter…' value={installedFilter} onChange={e => setInstalledFilter(e.target.value)} sx={{ flex: 1 }} slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: '0.75rem' } } }} />
                        <ViewToggle />
                    </Stack>

                    {installed.length === 0
                        ? <Typography variant='body2' color='text.secondary'>No packs installed.</Typography>
                        : viewMode === 'card'
                            ? <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
                                {filteredInstalled.map(pack => (
                                    <PackCard
                                        key={pack.id}
                                        id={pack.id}
                                        displayName={pack.displayName}
                                        version={pack.version}
                                        description={pack.description}
                                        source={resolveSource(pack.installedFrom)}
                                        website={pack.website}
                                        members={membersSummary(pack.extensions)}
                                        action={
                                            <Tooltip title='Uninstall pack (removes all member extensions)'>
                                                <span>
                                                    <IconButton size='small' color='error' disabled={uninstallingId === pack.id} onClick={() => uninstall(pack)}>
                                                        {uninstallingId === pack.id ? <CircularProgress size={16} /> : <Delete fontSize='small' />}
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                        }
                                    />
                                ))}
                              </Box>
                            : <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto', columnGap: 1, alignItems: 'center', px: 1.5 }}>
                                {filteredInstalled.flatMap((pack, i, arr) => [
                                    <Box key={`${pack.id}-icon`} sx={{ color: 'text.secondary', display: 'flex', py: 1 }}><Extension fontSize='small' /></Box>,
                                    <Box key={`${pack.id}-name`} sx={{ py: 1, minWidth: 0 }}>
                                        <Typography variant='body2' fontWeight='bold' sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pack.displayName}</Typography>
                                        <Typography variant='caption' color='text.secondary'>{pack.description}</Typography>
                                        <Typography variant='caption' color='text.disabled' display='block'>{membersSummary(pack.extensions)}</Typography>
                                    </Box>,
                                    <Box key={`${pack.id}-version`} sx={{ py: 1 }}><Chip label={`v${pack.version}`} size='small' sx={{ minWidth: 72 }} /></Box>,
                                    <Box key={`${pack.id}-source`} sx={{ py: 1 }}>{resolveSource(pack.installedFrom)}</Box>,
                                    <Box key={`${pack.id}-del`} sx={{ py: 1 }}>
                                        <Tooltip title='Uninstall pack (removes all member extensions)'>
                                            <span>
                                                <IconButton size='small' color='error' disabled={uninstallingId === pack.id} onClick={() => uninstall(pack)}>
                                                    {uninstallingId === pack.id ? <CircularProgress size={16} /> : <Delete fontSize='small' />}
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    </Box>,
                                    ...(i < arr.length - 1 ? [<Box key={`${pack.id}-sep`} sx={{ gridColumn: '1 / -1', borderBottom: 1, borderColor: 'divider', mx: -1.5 }} />] : [])
                                ])}
                              </Box>
                    }

                    <Typography variant='subtitle2' sx={{ pt: 1 }}>Install pack</Typography>
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

                    {filteredIds.length > 0 && (
                        <>
                            <Stack direction='row' alignItems='center' spacing={1} sx={{ pt: 1 }}>
                                <Typography variant='subtitle2'>Available packs</Typography>
                                <TextField size='small' placeholder='Filter…' value={filterText} onChange={e => setFilterText(e.target.value)} sx={{ flex: 1 }} slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: '0.75rem' } } }} />
                                <Tooltip title='Refresh catalog'>
                                    <span>
                                        <IconButton size='small' sx={{ width: 30, height: 30 }} onClick={fetchManifest} disabled={loadingManifest}>
                                            {loadingManifest ? <CircularProgress size={16} /> : <Refresh fontSize='small' />}
                                        </IconButton>
                                    </span>
                                </Tooltip>
                            </Stack>
                            {viewMode === 'card'
                                ? <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
                                    {filteredIds.map(id => {
                                        const t = getSelectedEntry(id)
                                        return (
                                            <PackCard
                                                key={id}
                                                id={id}
                                                displayName={t.displayName}
                                                version={t.version}
                                                description={t.description}
                                                website={t.website}
                                                members={t.extensionTypes?.join(', ')}
                                                badge={<>
                                                    {isInstalled(id) ? <Chip label='installed' color='success' size='small' icon={<CheckCircle />} /> : undefined}
                                                    <MarketplaceBadge label={getSelectedEntry(id).marketplaceLabel} />
                                                </>}
                                                action={
                                                    <Tooltip title={isInstalled(id) ? 'Already installed — uninstall first' : 'Install pack'}>
                                                        <span>
                                                            <IconButton size='small' color='primary' disabled={isInstalled(id) || installingId === id} onClick={() => install(t)}>
                                                                {installingId === id ? <CircularProgress size={16} /> : <Download fontSize='small' />}
                                                            </IconButton>
                                                        </span>
                                                    </Tooltip>
                                                }
                                            />
                                        )
                                    })}
                                  </Box>
                                : <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', columnGap: 1, alignItems: 'center', px: 1.5 }}>
                                    {filteredIds.flatMap((id, i, arr) => {
                                        const t = getSelectedEntry(id)
                                        return [
                                            <Box key={`${id}-icon`} sx={{ color: 'text.secondary', display: 'flex', py: 1 }}><Extension fontSize='small' /></Box>,
                                            <Box key={`${id}-name`} sx={{ py: 1, minWidth: 0 }}>
                                                <Typography variant='body2' fontWeight='bold' sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.displayName}</Typography>
                                                <Typography variant='caption' color='text.secondary'>{t.description}</Typography>
                                                {t.extensionTypes && <Typography variant='caption' color='text.disabled' display='block'>{t.extensionTypes.join(', ')}</Typography>}
                                            </Box>,
                                            <Box key={`${id}-status`} sx={{ py: 1 }}>
                                                {isInstalled(id) ? <Chip label='installed' color='success' size='small' icon={<CheckCircle />} /> : null}
                                            </Box>,
                                            <Box key={`${id}-install`} sx={{ py: 1 }}>
                                                <Tooltip title={isInstalled(id) ? 'Already installed — uninstall first' : 'Install pack'}>
                                                    <span>
                                                        <IconButton size='small' color='primary' disabled={isInstalled(id) || installingId === id} onClick={() => install(t)}>
                                                            {installingId === id ? <CircularProgress size={16} /> : <Download fontSize='small' />}
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            </Box>,
                                            ...(i < arr.length - 1 ? [<Box key={`${id}-sep`} sx={{ gridColumn: '1 / -1', borderBottom: 1, borderColor: 'divider', mx: -1.5 }} />] : [])
                                        ]
                                    })}
                                  </Box>
                            }
                        </>
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

export { PackManagerDialog }
