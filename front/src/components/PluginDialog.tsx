import React, { useContext, useEffect, useState } from 'react'
import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material'
import * as MuiIcons from '@mui/icons-material'
import { CheckCircle, Delete, Download, Extension, Refresh } from '@mui/icons-material'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization } from '../tools/AuthorizationManagement'

const PLUGINS_MANIFEST_URL = 'https://raw.githubusercontent.com/kwirthmagnify/kwirth/refs/heads/master/plugins/manifest.json'

interface IPluginManifestEntry {
    id: string
    name: string
    version: string
    description: string
    icon?: string
    url: string
}

interface IInstalledPlugin {
    id: string
    name: string
    version: string
    description: string
    icon?: string
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

    const isInstalled = (id: string) => installed.some(p => p.id === id)

    const resolveIcon = (iconName?: string): React.ReactElement => {
        const IconComponent = iconName ? (MuiIcons as Record<string, React.ElementType>)[iconName] : undefined
        return IconComponent ? <IconComponent fontSize='small' /> : <Extension fontSize='small' />
    }

    const PluginRow = ({ icon, name, version, description, badge, action }: { icon?: string; name: string; version: string; description: string; badge?: React.ReactNode; action: React.ReactNode }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary' }}>{resolveIcon(icon)}</Box>
            <Box flex={1}>
                <Stack direction='row' alignItems='center' spacing={1} flexWrap='wrap'>
                    <Typography variant='body2' fontWeight='bold' component='span'>{name}</Typography>
                    <Chip label={`v${version}`} size='small' />
                    {badge}
                </Stack>
                <Typography variant='caption' color='text.secondary'>{description}</Typography>
            </Box>
            {action}
        </Box>
    )

    return (
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '55vw', maxWidth: '70vw' } }}>
            <DialogTitle>Manage plugins</DialogTitle>
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{ mt: 1 }}>
                    <Typography variant='subtitle2'>Installed plugins</Typography>
                    {installed.length === 0
                        ? <Typography variant='body2' color='text.secondary'>No plugins installed.</Typography>
                        : installed.map(plugin => (
                            <PluginRow
                                key={plugin.id}
                                icon={plugin.icon}
                                name={plugin.name}
                                version={plugin.version}
                                description={plugin.description}
                                action={
                                    <Tooltip title='Uninstall'>
                                        <span>
                                            <IconButton size='small' color='error' disabled={uninstallingId === plugin.id} onClick={() => uninstall(plugin)}>
                                                {uninstallingId === plugin.id ? <CircularProgress size={16} /> : <Delete fontSize='small' />}
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                }
                            />
                        ))
                    }

                    <Typography variant='subtitle2' sx={{ pt: 1 }}>Install from local path or URL</Typography>
                    <Stack direction='row' spacing={1} alignItems='center'>
                        <TextField
                            size='small'
                            fullWidth
                            placeholder='C:/path/to/plugin.tgz  or  https://...'
                            value={customUrl}
                            onChange={e => setCustomUrl(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') installFromUrl() }}
                        />
                        <Tooltip title='Install'>
                            <span>
                                <IconButton size='small' color='primary' disabled={installingCustom || !customUrl.trim()} onClick={installFromUrl}>
                                    {installingCustom ? <CircularProgress size={16} /> : <Download fontSize='small' />}
                                </IconButton>
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

                    {available.map(plugin => (
                        <PluginRow
                            key={plugin.id}
                            icon={plugin.icon}
                            name={plugin.name}
                            version={plugin.version}
                            description={plugin.description}
                            badge={isInstalled(plugin.id) ? <Chip label='installed' color='success' size='small' icon={<CheckCircle />} /> : undefined}
                            action={
                                <Tooltip title={isInstalled(plugin.id) ? 'Reinstall' : 'Install'}>
                                    <span>
                                        <IconButton size='small' color='primary' disabled={installingId === plugin.id} onClick={() => install(plugin)}>
                                            {installingId === plugin.id ? <CircularProgress size={16} /> : <Download fontSize='small' />}
                                        </IconButton>
                                    </span>
                                </Tooltip>
                            }
                        />
                    ))}

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
