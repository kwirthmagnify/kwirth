import React, { useContext, useEffect, useRef, useState } from 'react'
import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { CheckCircle, Delete, Download, FolderOpen, Link, OpenInNew, Refresh, SmartToy } from '@mui/icons-material'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization } from '../tools/AuthorizationManagement'

const DAEMONS_MANIFEST_URL = 'https://raw.githubusercontent.com/kwirthmagnify/kwirth/refs/heads/master/daemons/manifest.json'

interface IDaemonManifestEntry {
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    url: string
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

    const [available, setAvailable] = useState<IDaemonManifestEntry[]>([])
    const [installed, setInstalled] = useState<IInstalledDaemon[]>([])
    const [loadingManifest, setLoadingManifest] = useState(false)
    const [installingId, setInstallingId] = useState<string | undefined>()
    const [uninstallingId, setUninstallingId] = useState<string | undefined>()
    const [error, setError] = useState<string | undefined>()
    const [filterText, setFilterText] = useState('')
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
            setAvailable(await res.json())
        } catch {
            setAvailable([])
        } finally {
            setLoadingManifest(false)
        }
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
        if (installedFrom === 'dev') return <Typography variant='caption' color='warning.main'>dev</Typography>
        const short = installedFrom.length > 40 ? installedFrom.slice(0, 37) + '…' : installedFrom
        return <Tooltip title={installedFrom}><Typography variant='caption' color='text.secondary'><Link fontSize='inherit' sx={{ verticalAlign: 'middle', mr: 0.3 }} />{short}</Typography></Tooltip>
    }

    const daemonGradient = (name: string) => {
        let hash = 0
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
        const hue = (Math.abs(hash) % 360 + 270) % 360
        const crosses = `repeating-linear-gradient(0deg, hsla(${hue}, 60%, 70%, 0.12) 0px, hsla(${hue}, 60%, 70%, 0.12) 1px, transparent 1px, transparent 10px), repeating-linear-gradient(90deg, hsla(${hue}, 60%, 70%, 0.12) 0px, hsla(${hue}, 60%, 70%, 0.12) 1px, transparent 1px, transparent 10px)`
        return `${crosses}, linear-gradient(315deg, hsla(${hue}, 70%, 55%, 0.10) 0%, hsla(${hue}, 50%, 40%, 0.22) 100%)`
    }

    return (
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '60vw', maxWidth: '60vw' } }}>
            <DialogTitle>Manage daemons</DialogTitle>
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{ mt: 1 }}>
                    <Typography variant='subtitle2'>Installed daemons</Typography>
                    {installed.length === 0
                        ? <Typography variant='body2' color='text.secondary'>No daemons installed.</Typography>
                        : <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
                            {installed.map(daemon => (
                                <Box key={daemon.id} sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: 1.5, minHeight: 100, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, background: daemonGradient(daemon.name) }}>
                                    <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                                        <Box sx={{ color: 'text.secondary', mt: 0.25 }}><SmartToy /></Box>
                                        <Box flex={1} minWidth={0}>
                                            <Stack direction='row' alignItems='center' spacing={0.5}>
                                                <Typography variant='body2' fontWeight='bold'>{daemon.displayName || daemon.name || daemon.id}</Typography>
                                                <Typography variant='caption' color='text.secondary'>v{daemon.version}</Typography>
                                            </Stack>
                                            <Typography variant='caption' color='text.secondary' display='block' sx={{ mt: 0.5 }}>{daemon.description}</Typography>
                                        </Box>
                                        {daemon.website && <Tooltip title='Open daemon website'><IconButton size='small' sx={{ mt: -0.5, mr: -0.5 }} onClick={() => window.open(daemon.website, '_blank', 'noopener')}><OpenInNew fontSize='small' /></IconButton></Tooltip>}
                                    </Stack>
                                    <Stack direction='row' justifyContent='space-between' alignItems='center' sx={{ mt: 1 }}>
                                        <Box>{resolveSource(daemon.installedFrom)}</Box>
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
                        <Tooltip title='Refresh catalog'><span><IconButton size='small' onClick={fetchManifest} disabled={loadingManifest}>{loadingManifest ? <CircularProgress size={16} /> : <Refresh fontSize='small' />}</IconButton></span></Tooltip>
                    </Stack>

                    {available.length === 0 && !loadingManifest &&
                        <Typography variant='body2' color='text.secondary'>No daemons available in catalog.</Typography>
                    }

                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
                        {available.filter(d => !filterText || d.id.includes(filterText.toLowerCase()) || d.name?.toLowerCase().includes(filterText.toLowerCase()) || d.displayName?.toLowerCase().includes(filterText.toLowerCase())).map(daemon => (
                            <Box key={daemon.id} sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: 1.5, minHeight: 100, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, background: daemonGradient(daemon.name) }}>
                                <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                                    <Box sx={{ color: 'text.secondary', mt: 0.25 }}><SmartToy /></Box>
                                    <Box flex={1} minWidth={0}>
                                        <Stack direction='row' alignItems='center' spacing={0.5} flexWrap='wrap' useFlexGap>
                                            <Typography variant='body2' fontWeight='bold'>{daemon.displayName || daemon.name}</Typography>
                                            <Chip label={`v${daemon.version}`} size='small' />
                                            {isDevInstalled(daemon.id) && <Chip label='dev active' size='small' variant='outlined' color='warning' />}
                                            {isInstalled(daemon.id) && <Chip label='installed' color='success' size='small' icon={<CheckCircle />} />}
                                        </Stack>
                                        <Typography variant='caption' color='text.secondary' display='block' sx={{ mt: 0.5 }}>{daemon.description}</Typography>
                                    </Box>
                                    {daemon.website && <Tooltip title='Open daemon website'><IconButton size='small' sx={{ mt: -0.5, mr: -0.5 }} onClick={() => window.open(daemon.website, '_blank', 'noopener')}><OpenInNew fontSize='small' /></IconButton></Tooltip>}
                                </Stack>
                                <Stack direction='row' justifyContent='flex-end' sx={{ mt: 1 }}>
                                    <Tooltip title={isDevInstalled(daemon.id) ? 'Dev version active' : isInstalled(daemon.id) ? 'Already installed' : 'Install'}>
                                        <span>
                                            <IconButton size='small' color='primary' disabled={isDevInstalled(daemon.id) || isInstalled(daemon.id) || installingId === daemon.id} onClick={() => installFromCatalog(daemon)}>
                                                {installingId === daemon.id ? <CircularProgress size={16} /> : <Download fontSize='small' />}
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                </Stack>
                            </Box>
                        ))}
                    </Box>

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
