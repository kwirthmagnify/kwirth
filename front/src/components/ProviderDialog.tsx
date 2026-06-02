import React, { useContext, useEffect, useRef, useState } from 'react'
import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { CheckCircle, Checklist, Delete, Download, FolderOpen, Link, OpenInNew, Refresh } from '@mui/icons-material'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization } from '../tools/AuthorizationManagement'

const PROVIDERS_MANIFEST_URL = 'https://raw.githubusercontent.com/kwirthmagnify/kwirth/refs/heads/master/providers/manifest.json'

interface IProviderManifestEntry {
    id: string
    name: string
    version: string
    description: string
    website?: string
    url: string
}

interface IInstalledProvider {
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    installedFrom?: string
}

interface IProviderDialogProps {
    onClose: () => void
}

const ProviderDialog: React.FC<IProviderDialogProps> = (props: IProviderDialogProps) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType

    const [available, setAvailable] = useState<IProviderManifestEntry[]>([])
    const [installed, setInstalled] = useState<IInstalledProvider[]>([])
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
        } catch (err) {
            setError(`Failed to fetch provider catalog: ${err}`)
        } finally {
            setLoadingManifest(false)
        }
    }

    const installFromCatalog = async (provider: IProviderManifestEntry) => {
        setError(undefined)
        setInstallingId(provider.id)
        try {
            const res = await fetch(`${backendUrl}/providers/install`, addPostAuthorization(accessString, JSON.stringify({ url: provider.url })))
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
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
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
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
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
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
        } catch (err) {
            setError(`Failed to install provider: ${err}`)
        } finally {
            setInstallingFile(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const resolveSource = (installedFrom?: string): React.ReactElement | null => {
        if (!installedFrom) return null
        if (installedFrom === 'local')
            return <Typography variant='caption' color='text.secondary'>Local file</Typography>
        if (installedFrom === 'dev')
            return <Typography variant='caption' color='warning.main'>dev</Typography>
        const short = installedFrom.length > 40 ? installedFrom.slice(0, 37) + '…' : installedFrom
        return <Tooltip title={installedFrom}><Typography variant='caption' color='text.secondary'><Link fontSize='inherit' sx={{ verticalAlign: 'middle', mr: 0.3 }} />{short}</Typography></Tooltip>
    }

    const providerGradient = (name: string) => {
        let hash = 0
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
        const hue = (Math.abs(hash) % 360 + 180) % 360
        const dots = `radial-gradient(circle, hsla(${hue}, 60%, 70%, 0.18) 1px, transparent 1px)`
        return `${dots} 0 0 / 10px 10px, linear-gradient(315deg, hsla(${hue}, 75%, 58%, 0.12) 0%, hsla(${hue}, 55%, 42%, 0.26) 100%)`
    }

    return (
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '60vw', maxWidth: '60vw' } }}>
            <DialogTitle>Manage providers</DialogTitle>
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{ mt: 1 }}>
                    <Typography variant='subtitle2'>Installed providers</Typography>
                    {installed.length === 0
                        ? <Typography variant='body2' color='text.secondary'>No providers installed.</Typography>
                        : <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
                            {installed.map(provider => (
                                <Box key={provider.id} sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: 1.5, minHeight: 100, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, background: providerGradient(provider.name) }}>
                                    <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                                        <Box sx={{ color: 'text.secondary', mt: 0.25 }}><Checklist /></Box>
                                        <Box flex={1} minWidth={0}>
                                            <Stack direction='row' alignItems='center' spacing={0.5}>
                                                <Typography variant='body2' fontWeight='bold'>{provider.displayName || provider.name || provider.id}</Typography>
                                                <Typography variant='caption' color='text.secondary'>v{provider.version}</Typography>
                                            </Stack>
                                            <Typography variant='caption' color='text.secondary' display='block' sx={{ mt: 0.5 }}>{provider.description}</Typography>
                                        </Box>
                                        {provider.website &&
                                            <Tooltip title='Open provider website'>
                                                <IconButton size='small' sx={{ mt: -0.5, mr: -0.5 }} onClick={() => window.open(provider.website, '_blank', 'noopener')}>
                                                    <OpenInNew fontSize='small' />
                                                </IconButton>
                                            </Tooltip>
                                        }
                                    </Stack>
                                    <Stack direction='row' justifyContent='space-between' alignItems='center' sx={{ mt: 1 }}>
                                        <Box>{resolveSource(provider.installedFrom)}</Box>
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
                    }

                    <Typography variant='subtitle2' sx={{ pt: 1 }}>Install provider</Typography>
                    <Stack direction='row' spacing={1} alignItems='center'>
                        <TextField
                            size='small'
                            fullWidth
                            placeholder='https://...'
                            value={customUrl}
                            onChange={e => setCustomUrl(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') installFromUrl() }}
                        />
                        <Tooltip title='Install from URL'>
                            <span>
                                <IconButton size='small' color='primary' disabled={installingCustom || !customUrl.trim()} onClick={installFromUrl}>
                                    {installingCustom ? <CircularProgress size={16} /> : <Download fontSize='small' />}
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Divider orientation='vertical' flexItem />
                        <input
                            ref={fileInputRef}
                            type='file'
                            accept='.tgz,application/gzip'
                            style={{ display: 'none' }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) installFromFile(f) }}
                        />
                        <Tooltip title='Install from local file'>
                            <span>
                                <Button
                                    variant='outlined'
                                    size='small'
                                    startIcon={installingFile ? <CircularProgress size={14} /> : <FolderOpen fontSize='small' />}
                                    disabled={installingFile}
                                    onClick={() => fileInputRef.current?.click()}
                                    sx={{ whiteSpace: 'nowrap' }}
                                >
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
                                <IconButton size='small' onClick={fetchManifest} disabled={loadingManifest}>
                                    {loadingManifest ? <CircularProgress size={16} /> : <Refresh fontSize='small' />}
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Stack>

                    {available.length === 0 && !loadingManifest && !error &&
                        <Typography variant='body2' color='text.secondary'>No providers available.</Typography>
                    }

                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
                        {available.filter(p => !filterText || p.id.includes(filterText.toLowerCase()) || p.name?.toLowerCase().includes(filterText.toLowerCase())).map(provider => (
                            <Box key={provider.id} sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: 1.5, minHeight: 100, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, background: providerGradient(provider.name) }}>
                                <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                                    <Box sx={{ color: 'text.secondary', mt: 0.25 }}><Checklist /></Box>
                                    <Box flex={1} minWidth={0}>
                                        <Stack direction='row' alignItems='center' spacing={0.5} flexWrap='wrap' useFlexGap>
                                            <Typography variant='body2' fontWeight='bold'>{provider.name}</Typography>
                                            <Chip label={`v${provider.version}`} size='small' />
                                            {isDevInstalled(provider.id) && <Chip label='dev active' size='small' variant='outlined' color='warning' />}
                                            {isInstalled(provider.id) && <Chip label='installed' color='success' size='small' icon={<CheckCircle />} />}
                                        </Stack>
                                        <Typography variant='caption' color='text.secondary' display='block' sx={{ mt: 0.5 }}>{provider.description}</Typography>
                                    </Box>
                                    {provider.website &&
                                        <Tooltip title='Open provider website'>
                                            <IconButton size='small' sx={{ mt: -0.5, mr: -0.5 }} onClick={() => window.open(provider.website, '_blank', 'noopener')}>
                                                <OpenInNew fontSize='small' />
                                            </IconButton>
                                        </Tooltip>
                                    }
                                </Stack>
                                <Stack direction='row' justifyContent='flex-end' sx={{ mt: 1 }}>
                                    <Tooltip title={isDevInstalled(provider.id) ? 'A dev version is already loaded' : isInstalled(provider.id) ? 'Already installed' : 'Install'}>
                                        <span>
                                            <IconButton size='small' color='primary' disabled={isDevInstalled(provider.id) || isInstalled(provider.id) || installingId === provider.id} onClick={() => installFromCatalog(provider)}>
                                                {installingId === provider.id ? <CircularProgress size={16} /> : <Download fontSize='small' />}
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

export { ProviderDialog }
