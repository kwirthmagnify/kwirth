import React, { useContext, useEffect, useRef, useState } from 'react'
import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material'
import * as MuiIcons from '@mui/icons-material'
import { CheckCircle, Delete, Download, Extension, FolderOpen, Link, OpenInNew, Refresh } from '@mui/icons-material'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization } from '../tools/AuthorizationManagement'

const PLUGINS_MANIFEST_URL = 'https://raw.githubusercontent.com/kwirthmagnify/kwirth/refs/heads/master/plugins/manifest.json'

interface IPluginManifestEntry {
    id: string
    name: string
    version: string
    description: string
    icon?: string
    website?: string
    url: string
}

interface IInstalledPlugin {
    id: string
    name: string
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

    const [available, setAvailable] = useState<IPluginManifestEntry[]>([])
    const [installed, setInstalled] = useState<IInstalledPlugin[]>([])
    const [loadingManifest, setLoadingManifest] = useState(false)
    const [installingId, setInstallingId] = useState<string | undefined>()
    const [uninstallingId, setUninstallingId] = useState<string | undefined>()
    const [error, setError] = useState<string | undefined>()
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
        } catch (err) {
            setError(`Failed to fetch plugin catalog: ${err}`)
        } finally {
            setLoadingManifest(false)
        }
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
        if (installedFrom === 'local')
            return <Chip icon={<FolderOpen />} label='Local file' size='small' variant='outlined' />
        if (installedFrom.includes('github.com/kwirthmagnify'))
            return <Chip icon={<Extension />} label='Kwirth' size='small' variant='outlined' color='primary' />
        const short = installedFrom.length > 40 ? installedFrom.slice(0, 37) + '…' : installedFrom
        return <Tooltip title={installedFrom}><Chip icon={<Link />} label={short} size='small' variant='outlined' /></Tooltip>
    }

    const resolveIcon = (iconName?: string): React.ReactElement => {
        const IconComponent = iconName ? (MuiIcons as Record<string, React.ElementType>)[iconName] : undefined
        return IconComponent ? <IconComponent /> : <Extension />
    }

    const pluginGradient = (name: string) => {
        let hash = 0
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
        const hue = Math.abs(hash) % 360
        return `linear-gradient(315deg, hsla(${hue}, 75%, 58%, 0.12) 0%, hsla(${hue}, 55%, 42%, 0.26) 100%)`
    }

    const PluginCard = ({ icon, name, version, description, badge, source, website, action }: { icon?: string; name: string; version: string; description: string; badge?: React.ReactNode; source?: React.ReactNode; website?: string; action: React.ReactNode }) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: 1.5, minHeight: 120, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, background: pluginGradient(name) }}>
            <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                <Box sx={{ color: 'text.secondary', mt: 0.25 }}>{resolveIcon(icon)}</Box>
                <Box flex={1} minWidth={0}>
                    <Stack direction='row' alignItems='center' spacing={0.5} flexWrap='wrap' useFlexGap>
                        <Typography variant='body2' fontWeight='bold' component='span'>{name}</Typography>
                        <Chip label={`v${version}`} size='small' />
                        {badge}
                    </Stack>
                    <Typography variant='caption' color='text.secondary' display='block' sx={{ mt: 0.5 }}>{description}</Typography>
                </Box>
                {website &&
                    <Tooltip title='Open plugin website'>
                        <IconButton size='small' sx={{ mt: -0.5, mr: -0.5 }} onClick={() => window.open(website, '_blank', 'noopener')}>
                            <OpenInNew fontSize='small' />
                        </IconButton>
                    </Tooltip>
                }
            </Stack>
            <Stack direction='row' justifyContent='space-between' alignItems='center' sx={{ mt: 1 }}>
                <Box>{source}</Box>
                {action}
            </Stack>
        </Box>
    )

    return (
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '72vw', maxWidth: '72vw' } }}>
            <DialogTitle>Manage plugins</DialogTitle>
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{ mt: 1 }}>
                    <Typography variant='subtitle2'>Installed plugins</Typography>
                    {installed.length === 0
                        ? <Typography variant='body2' color='text.secondary'>No plugins installed.</Typography>
                        : <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
                            {installed.map(plugin => (
                                <PluginCard
                                    key={plugin.id}
                                    icon={plugin.icon}
                                    name={plugin.name}
                                    version={plugin.version}
                                    description={plugin.description}
                                    website={plugin.website}
                                    source={resolveSource(plugin.installedFrom)}
                                    action={
                                        <Tooltip title={plugin.installedFrom === 'dev' ? 'Dev plugins cannot be uninstalled' : 'Uninstall'}>
                                            <span>
                                                <IconButton size='small' color='error' disabled={plugin.installedFrom === 'dev' || uninstallingId === plugin.id} onClick={() => uninstall(plugin)}>
                                                    {uninstallingId === plugin.id ? <CircularProgress size={16} /> : <Delete fontSize='small' />}
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    }
                                />
                            ))}
                          </Box>
                    }

                    <Typography variant='subtitle2' sx={{ pt: 1 }}>Install plugin</Typography>
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
                        <Typography variant='subtitle2' flex={1}>Available plugins</Typography>
                        <Tooltip title='Refresh catalog'>
                            <span>
                                <IconButton size='small' onClick={fetchManifest} disabled={loadingManifest}>
                                    {loadingManifest ? <CircularProgress size={16} /> : <Refresh fontSize='small' />}
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Stack>

                    {available.length === 0 && !loadingManifest && !error &&
                        <Typography variant='body2' color='text.secondary'>No plugins available.</Typography>
                    }

                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
                        {available.map(plugin => (
                            <PluginCard
                                key={plugin.id}
                                icon={plugin.icon}
                                name={plugin.name}
                                version={plugin.version}
                                description={plugin.description}
                                website={plugin.website}
                                badge={isDevInstalled(plugin.id) ? <Chip label='dev active' size='small' variant='outlined' color='warning' /> : isInstalled(plugin.id) ? <Chip label='installed' color='success' size='small' icon={<CheckCircle />} /> : undefined}
                                action={
                                    <Tooltip title={isDevInstalled(plugin.id) ? 'A dev version is already loaded' : isInstalled(plugin.id) ? 'Reinstall' : 'Install'}>
                                        <span>
                                            <IconButton size='small' color='primary' disabled={isDevInstalled(plugin.id) || installingId === plugin.id} onClick={() => install(plugin)}>
                                                {installingId === plugin.id ? <CircularProgress size={16} /> : <Download fontSize='small' />}
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                }
                            />
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

export { PluginDialog }
