import React, { useContext, useEffect, useRef, useState } from 'react'
import { Box, Button, CircularProgress, Chip, Dialog, DialogActions, DialogContent, Divider, IconButton, Stack, TextField, Tooltip, Typography, useTheme } from '@mui/material'
import { CloudQueue, Delete, Description, Download, FolderOpen, Https, Link, OpenInNew, Refresh, ViewList, ViewModule } from '@kwirthmagnify/kwirth-common-front/icons'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { DialogTitleHelp } from '@kwirthmagnify/kwirth-common-front'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization } from '../tools/AuthorizationManagement'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { MarketplaceBadge, compactChip } from './MarketplaceBadge'
import { useKeyboard } from '../tools/useKeyboard'


// Una documentacion se identifica por el PAR (targetType, id): el id es el de la extension documentada
// y puede repetirse entre tipos — un plugin y un theme pueden llamarse igual y traer cada uno su guia.
interface IDocsManifestEntry {
    marketplaceId?: string
    marketplaceLabel?: string
    targetType: string
    id: string
    name: string
    version: string
    description: string
    website?: string
    url: string
}

const docsKey = (targetType: string, id: string) => `${targetType}/${id}`

interface IDocsMeta {
    id: string
    targetType: string
    name: string
    version: string
    description: string
    icon?: string
    website?: string
    installedFrom?: string
}

interface IDocsDialogProps {
    onClose: () => void
}

const DocsDialog: React.FC<IDocsDialogProps> = (props: IDocsDialogProps) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType
    const theme = useTheme()
    useKeyboard(props.onClose)

    const docsGradient = (id: string) => {
        let hash = 0
        for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
        const hue = Math.abs(hash) % 360
        const dark = theme.palette.mode === 'dark'
        const stripes = `repeating-linear-gradient(135deg, hsla(${hue}, 70%, 65%, ${dark ? 0.10 : 0.28}) 0px, hsla(${hue}, 70%, 65%, ${dark ? 0.10 : 0.28}) 1px, transparent 1px, transparent 10px)`
        return `${stripes}, linear-gradient(315deg, hsla(${hue}, 75%, 58%, ${dark ? 0.09 : 0.16}) 0%, hsla(${hue}, 55%, 42%, ${dark ? 0.18 : 0.34}) 100%)`
    }

    const [available, setAvailable] = useState<IDocsManifestEntry[]>([])

    const marketplaceOfInstalled = (targetType: string, id: string): string|undefined =>
        available.find(e => e.id === id && e.targetType === targetType)?.marketplaceLabel
    const [installed, setInstalled] = useState<IDocsMeta[]>([])
    const [loadingManifest, setLoadingManifest] = useState(false)
    const [installingId, setInstallingId] = useState<string | undefined>()
    const [uninstallingId, setUninstallingId] = useState<string | undefined>()
    const [error, setError] = useState<string | undefined>()
    const [customUrl, setCustomUrl] = useState('')
    const [installingCustom, setInstallingCustom] = useState(false)
    const [installingFile, setInstallingFile] = useState(false)
    const [filterText, setFilterText] = useState('')
    const [installedFilter, setInstalledFilter] = useState('')
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card')
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        loadInstalled()
        fetchManifest()
    }, [])

    const loadInstalled = async () => {
        try {
            const res = await fetch(`${backendUrl}/core/docs`, addGetAuthorization(accessString))
            const data: IDocsMeta[] = await res.json()
            setInstalled(data)
        }
        catch (err) {
            setError(`Failed to load installed docs: ${err}`)
        }
    }

    const fetchManifest = async () => {
        setError(undefined)
        setLoadingManifest(true)
        try {
            const res = await fetch(`${backendUrl}/core/marketplace/${EExtensionType.DOCS}`, addGetAuthorization(accessString))
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data: IDocsManifestEntry[] = await res.json()
            setAvailable(data)
        }
        catch {
            // silently ignore — no public docs manifest yet
        }
        finally {
            setLoadingManifest(false)
        }
    }

    const openDocs = (targetType: string, id: string) => {
        window.open(`${backendUrl}/core/docs/${targetType}/${id}/`, '_blank', 'noopener')
    }

    const installFromUrl = async () => {
        const url = customUrl.trim()
        if (!url) return
        setError(undefined)
        setInstallingCustom(true)
        try {
            const res = await fetch(`${backendUrl}/core/docs/install`, addPostAuthorization(accessString, JSON.stringify({ url })))
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            await loadInstalled()
            setCustomUrl('')
        }
        catch (err) {
            setError(`Failed to install docs: ${err}`)
        }
        finally {
            setInstallingCustom(false)
        }
    }

    const installFromManifest = async (entry: IDocsManifestEntry) => {
        setError(undefined)
        setInstallingId(docsKey(entry.targetType, entry.id))
        try {
            const res = await fetch(`${backendUrl}/core/docs/install`, addPostAuthorization(accessString, JSON.stringify({ url: entry.url })))
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            await loadInstalled()
        }
        catch (err) {
            setError(`Failed to install ${entry.name}: ${err}`)
        }
        finally {
            setInstallingId(undefined)
        }
    }

    const installFromFile = async (file: File) => {
        setError(undefined)
        setInstallingFile(true)
        try {
            const res = await fetch(`${backendUrl}/core/docs/upload`, {
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
            await loadInstalled()
        }
        catch (err) {
            setError(`Failed to install docs: ${err}`)
        }
        finally {
            setInstallingFile(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const uninstall = async (doc: IDocsMeta) => {
        setError(undefined)
        setUninstallingId(docsKey(doc.targetType, doc.id))
        try {
            const res = await fetch(`${backendUrl}/core/docs/${doc.targetType}/${doc.id}`, addDeleteAuthorization(accessString))
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            await loadInstalled()
        }
        catch (err) {
            setError(`Failed to uninstall docs: ${err}`)
        }
        finally {
            setUninstallingId(undefined)
        }
    }

    const isInstalled = (targetType: string, id: string) => installed.some(d => d.id === id && d.targetType === targetType)

    const resolveSource = (installedFrom?: string): React.ReactElement | null => {
        if (!installedFrom) return null
        if (installedFrom === 'bundled')
            return <Chip label='bundled' size='small' variant='outlined' color='secondary' sx={compactChip} />
        if (installedFrom === 'dev')
            return <Chip label='dev' size='small' variant='outlined' color='warning' sx={compactChip} />
        if (installedFrom === 'local')
            return <Chip icon={<FolderOpen />} label='Local file' size='small' variant='outlined' />
        if (installedFrom.includes('github.com/kwirthmagnify'))
            return <Chip icon={<Description />} label='Kwirth' size='small' variant='outlined' color='primary' />
        const short = installedFrom.length > 40 ? installedFrom.slice(0, 37) + '…' : installedFrom
        return <Tooltip title={installedFrom}><Chip icon={<Link />} label={short} size='small' variant='outlined' sx={{ maxWidth: '100%' }} /></Tooltip>
    }

    const DocsCard = ({ targetType, id, name, version, description, source, website, action }: { targetType: string; id: string; name: string; version: string; description: string; source?: React.ReactNode; website?: string; action: React.ReactNode }) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: 1.5, minHeight: 100, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, background: docsGradient(id) }}>
            <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                <Box sx={{ color: 'text.secondary', mt: 0.25 }}><Description /></Box>
                <Box flex={1} minWidth={0}>
                    <Stack direction='row' alignItems='center' spacing={0.5} sx={{ width: '100%' }}>
                        <Typography variant='body2' fontWeight='bold' component='span' sx={{ flex: 1 }}>{name || id}</Typography>
                        <Chip label={`v${version}`} size='small' sx={{ ...compactChip, minWidth: 62 }} />
                    </Stack>
                    <Typography variant='caption' color='text.secondary' display='block' sx={{ mt: 0.5 }}>{description}</Typography>
                </Box>
                <Tooltip title={website ? 'Open website' : 'No website available'}>
                    <span>
                        <IconButton size='small' sx={{ mr: -0.5 }} disabled={!website} onClick={() => window.open(website!, '_blank', 'noopener')}>
                            <OpenInNew fontSize='small' />
                        </IconButton>
                    </span>
                </Tooltip>
            </Stack>
            <Stack direction='row' justifyContent='space-between' alignItems='center' sx={{ mt: 1 }}>
                <Tooltip title={marketplaceOfInstalled(targetType, id) ? `From the private '${marketplaceOfInstalled(targetType, id)}' marketplace` : 'From the public Kwirth marketplace'}>
                    <Box sx={{ color: marketplaceOfInstalled(targetType, id) ? 'warning.main' : 'text.secondary', display: 'flex', alignItems: 'center', mr: 0.75 }}>
                        { marketplaceOfInstalled(targetType, id) ? <Https fontSize='small' /> : <CloudQueue fontSize='small' /> }
                    </Box>
                </Tooltip>
                <Box sx={{ mr: 0.75 }}><MarketplaceBadge label={marketplaceOfInstalled(targetType, id)} /></Box>
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

    const filteredInstalled = installed.filter(d => !installedFilter || d.id.includes(installedFilter.toLowerCase()) || (d.name || '').toLowerCase().includes(installedFilter.toLowerCase()))
    const filteredAvailable = available.filter(d => !filterText || d.id.includes(filterText.toLowerCase()) || d.name.toLowerCase().includes(filterText.toLowerCase()))

    return (
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '72vw', maxWidth: '72vw', height: '80vh' } }}>
            <DialogTitleHelp section='guide/extensions/docs/index?id=admin-guide' docsUrl={backendUrl + '/core/docs/core/kwirth'}>Manage documentation</DialogTitleHelp>
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{ mt: 1 }}>

                    <Stack direction='row' alignItems='center' spacing={1}>
                        <Typography variant='subtitle2'>Installed documentation</Typography>
                        <TextField size='small' placeholder='Filter…' value={installedFilter} onChange={e => setInstalledFilter(e.target.value)} sx={{ flex: 1 }} slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: '0.75rem' } } }} />
                        <ViewToggle />
                    </Stack>

                    {filteredInstalled.length === 0
                        ? <Typography variant='body2' color='text.secondary'>No documentation packages installed.</Typography>
                        : viewMode === 'card'
                            ? <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
                                {filteredInstalled.map(doc => (
                                    <DocsCard
                                        key={docsKey(doc.targetType, doc.id)}
                                        targetType={doc.targetType}
                                        id={doc.id}
                                        name={doc.name}
                                        version={doc.version}
                                        description={doc.description}
                                        website={doc.website}
                                        source={resolveSource(doc.installedFrom)}
                                        action={
                                            <Stack direction='row' alignItems='center' spacing={0.5}>
                                                <Tooltip title='Open in new tab'>
                                                    <IconButton size='small' color='primary' onClick={() => openDocs(doc.targetType, doc.id)}>
                                                        <OpenInNew fontSize='small' />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title={(doc.installedFrom === 'bundled' || doc.installedFrom === 'dev') ? 'Cannot uninstall bundled/dev docs' : 'Uninstall'}>
                                                    <span>
                                                        <IconButton size='small' color='error' disabled={doc.installedFrom === 'bundled' || doc.installedFrom === 'dev' || uninstallingId === docsKey(doc.targetType, doc.id)} onClick={() => uninstall(doc)}>
                                                            {uninstallingId === docsKey(doc.targetType, doc.id) ? <CircularProgress size={16} /> : <Delete fontSize='small' />}
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            </Stack>
                                        }
                                    />
                                ))}
                              </Box>
                            : <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden',
                                         display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto auto',
                                         columnGap: 1, alignItems: 'center', px: 1.5 }}>
                                {filteredInstalled.flatMap((doc, i, arr) => [
                                    <Box key={`${docsKey(doc.targetType, doc.id)}-icon`} sx={{ color: 'text.secondary', display: 'flex', py: 1 }}><Description fontSize='small' /></Box>,
                                    <Typography key={`${docsKey(doc.targetType, doc.id)}-name`} variant='body2' fontWeight='bold' sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', py: 1 }}>{doc.name || doc.id}</Typography>,
                                    <Box key={`${docsKey(doc.targetType, doc.id)}-source`} sx={{ py: 1 }}>{resolveSource(doc.installedFrom)}</Box>,
                                    <Box key={`${docsKey(doc.targetType, doc.id)}-ver`} sx={{ py: 1 }}><Chip label={`v${doc.version}`} size='small' sx={compactChip} /></Box>,
                                    <Box key={`${docsKey(doc.targetType, doc.id)}-open`} sx={{ py: 1 }}>
                                        <Tooltip title='Open in new tab'>
                                            <IconButton size='small' color='primary' onClick={() => openDocs(doc.targetType, doc.id)}>
                                                <OpenInNew fontSize='small' />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>,
                                    <Box key={`${docsKey(doc.targetType, doc.id)}-del`} sx={{ py: 1 }}>
                                        <Tooltip title={doc.installedFrom === 'bundled' ? 'Bundled docs cannot be uninstalled' : 'Uninstall'}>
                                            <span>
                                                <IconButton size='small' color='error' disabled={doc.installedFrom === 'bundled' || uninstallingId === docsKey(doc.targetType, doc.id)} onClick={() => uninstall(doc)}>
                                                    {uninstallingId === docsKey(doc.targetType, doc.id) ? <CircularProgress size={16} /> : <Delete fontSize='small' />}
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    </Box>,
                                    ...(i < arr.length - 1 ? [<Box key={`${docsKey(doc.targetType, doc.id)}-sep`} sx={{ gridColumn: '1 / -1', borderBottom: 1, borderColor: 'divider', mx: -1.5 }} />] : [])
                                ])}
                              </Box>
                    }

                    <Typography variant='subtitle2' sx={{ pt: 1 }}>Install documentation package</Typography>
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

                    {available.length > 0 && <>
                        <Stack direction='row' alignItems='center' spacing={1} sx={{ pt: 1 }}>
                            <Typography variant='subtitle2'>Available documentation</Typography>
                            <TextField size='small' placeholder='Filter…' value={filterText} onChange={e => setFilterText(e.target.value)} sx={{ flex: 1 }} slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: '0.75rem' } } }} />
                            <Tooltip title='Refresh catalog'>
                                <span>
                                    <IconButton size='small' sx={{ width: 30, height: 30 }} onClick={fetchManifest} disabled={loadingManifest}>
                                        {loadingManifest ? <CircularProgress size={16} /> : <Refresh fontSize='small' />}
                                    </IconButton>
                                </span>
                            </Tooltip>
                        </Stack>
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
                            {filteredAvailable.map(entry => (
                                <DocsCard
                                    key={docsKey(entry.targetType, entry.id)}
                                    targetType={entry.targetType}
                                    id={entry.id}
                                    name={entry.name}
                                    version={entry.version}
                                    description={entry.description}
                                    website={entry.website}
                                    action={
                                        <Tooltip title={isInstalled(entry.targetType, entry.id) ? 'Already installed' : 'Install'}>
                                            <span>
                                                <IconButton size='small' color='primary' disabled={isInstalled(entry.targetType, entry.id) || installingId === docsKey(entry.targetType, entry.id)} onClick={() => installFromManifest(entry)}>
                                                    {installingId === docsKey(entry.targetType, entry.id) ? <CircularProgress size={16} /> : <Download fontSize='small' />}
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    }
                                />
                            ))}
                        </Box>
                    </>}

                </Stack>
            </DialogContent>
            {error && <Box sx={{ px: 3, pb: 1 }}><Typography variant='caption' color='error'>{error}</Typography></Box>}
            <DialogActions>
                <Button onClick={props.onClose}>CLOSE</Button>
            </DialogActions>
        </Dialog>
    )
}

export { DocsDialog }
