import React, { useContext, useEffect, useState } from 'react'
import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { CheckCircle, Delete, Download, Refresh } from '@mui/icons-material'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization } from '../tools/AuthorizationManagement'
import { TChannelConstructor } from '../channels/IChannel'

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
    frontChannels: Map<string, TChannelConstructor>
}

const DEFAULT_MANIFEST_URL = 'https://raw.githubusercontent.com/jfvilas/kwirth/master/plugins/manifest.json'

const PluginDialog: React.FC<IPluginDialogProps> = (props: IPluginDialogProps) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType

    const [manifestUrl, setManifestUrl] = useState(DEFAULT_MANIFEST_URL)
    const [available, setAvailable] = useState<IPluginManifestEntry[]>([])
    const [installed, setInstalled] = useState<IInstalledPlugin[]>([])
    const [loadingManifest, setLoadingManifest] = useState(false)
    const [installingId, setInstallingId] = useState<string | undefined>()
    const [uninstallingId, setUninstallingId] = useState<string | undefined>()
    const [error, setError] = useState<string | undefined>()

    useEffect(() => {
        loadInstalled()
    }, [])

    const loadInstalled = async () => {
        try {
            const res = await fetch(`${backendUrl}/api/plugins`, addGetAuthorization(accessString))
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
            const res = await fetch(manifestUrl)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data: IPluginManifestEntry[] = await res.json()
            setAvailable(data)
        } catch (err) {
            setError(`Failed to fetch manifest: ${err}`)
        } finally {
            setLoadingManifest(false)
        }
    }

    const install = async (plugin: IPluginManifestEntry) => {
        setError(undefined)
        setInstallingId(plugin.id)
        try {
            const res = await fetch(`${backendUrl}/api/plugins/install`, addPostAuthorization(accessString, JSON.stringify({ url: plugin.url })))
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            await loadInstalled()
            loadPluginFront(plugin.id)
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
            const res = await fetch(`${backendUrl}/api/plugins/${plugin.id}`, addDeleteAuthorization(accessString))
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            props.frontChannels.delete(plugin.id)
            await loadInstalled()
        } catch (err) {
            setError(`Failed to uninstall ${plugin.name}: ${err}`)
        } finally {
            setUninstallingId(undefined)
        }
    }

    const loadPluginFront = (id: string) => {
        const existing = document.getElementById(`kwirth-plugin-${id}`)
        if (existing) existing.remove()
        const script = document.createElement('script')
        script.id = `kwirth-plugin-${id}`
        script.src = `${backendUrl}/api/plugins/${id}/front`
        script.onload = () => {
            const PluginChannel = window.__kwirth_plugins__?.[id]
            if (PluginChannel) props.frontChannels.set(id, PluginChannel as TChannelConstructor)
        }
        document.head.appendChild(script)
    }

    const isInstalled = (id: string) => installed.some(p => p.id === id)

    return (
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '55vw', maxWidth: '70vw' } }}>
            <DialogTitle>Manage plugins</DialogTitle>
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{ mt: 1 }}>
                    <Typography variant='subtitle2'>Installed plugins</Typography>
                    {installed.length === 0
                        ? <Typography variant='body2' color='text.secondary'>No plugins installed.</Typography>
                        : installed.map(plugin => (
                            <Box key={plugin.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                                <Box flex={1}>
                                    <Typography variant='body2' fontWeight='bold'>{plugin.name} <Chip label={`v${plugin.version}`} size='small' /></Typography>
                                    <Typography variant='caption' color='text.secondary'>{plugin.description}</Typography>
                                </Box>
                                <Tooltip title='Uninstall'>
                                    <span>
                                        <IconButton size='small' color='error' disabled={uninstallingId === plugin.id} onClick={() => uninstall(plugin)}>
                                            {uninstallingId === plugin.id ? <CircularProgress size={16} /> : <Delete fontSize='small' />}
                                        </IconButton>
                                    </span>
                                </Tooltip>
                            </Box>
                        ))
                    }

                    <Typography variant='subtitle2' sx={{ pt: 1 }}>Available plugins</Typography>
                    <Stack direction='row' spacing={1} alignItems='center'>
                        <TextField
                            label='Manifest URL'
                            value={manifestUrl}
                            onChange={e => setManifestUrl(e.target.value)}
                            fullWidth
                            variant='standard'
                            size='small'
                            slotProps={{
                                input: {
                                    endAdornment: (
                                        <InputAdornment position='end'>
                                            <Tooltip title='Fetch manifest'>
                                                <span>
                                                    <IconButton size='small' onClick={fetchManifest} disabled={loadingManifest}>
                                                        {loadingManifest ? <CircularProgress size={16} /> : <Refresh fontSize='small' />}
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                        </InputAdornment>
                                    )
                                }
                            }}
                        />
                    </Stack>

                    {available.length > 0 && available.map(plugin => (
                        <Box key={plugin.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                            <Box flex={1}>
                                <Typography variant='body2' fontWeight='bold'>
                                    {plugin.name} <Chip label={`v${plugin.version}`} size='small' />
                                    {isInstalled(plugin.id) && <Chip label='installed' color='success' size='small' icon={<CheckCircle />} sx={{ ml: 1 }} />}
                                </Typography>
                                <Typography variant='caption' color='text.secondary'>{plugin.description}</Typography>
                            </Box>
                            <Tooltip title={isInstalled(plugin.id) ? 'Reinstall' : 'Install'}>
                                <span>
                                    <IconButton size='small' color='primary' disabled={installingId === plugin.id} onClick={() => install(plugin)}>
                                        {installingId === plugin.id ? <CircularProgress size={16} /> : <Download fontSize='small' />}
                                    </IconButton>
                                </span>
                            </Tooltip>
                        </Box>
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
