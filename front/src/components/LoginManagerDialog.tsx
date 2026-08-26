import React, { useContext, useEffect, useRef, useState } from 'react'
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, MenuItem, Stack, TextField, Tooltip, Typography, useTheme } from '@mui/material'
import { Chip } from '@mui/material'
import { CheckCircle, Delete, Download, FolderOpen, Link, LockPerson, OpenInNew, Refresh, Settings, ViewList, ViewModule, Visibility, VisibilityOff } from '@kwirthmagnify/kwirth-common-front/icons'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { DialogTitleHelp } from '@kwirthmagnify/kwirth-common-front'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization, addPutAuthorization } from '../tools/AuthorizationManagement'
import { versionGreaterThan } from '@kwirthmagnify/kwirth-common'
import { useKeyboard } from '../tools/useKeyboard'

const LOGINS_MANIFEST_URL = 'https://raw.githubusercontent.com/kwirthmagnify/kwirth/refs/heads/master/logins/manifest.json'

interface ILoginManifestEntry {
    id: string
    name: string
    displayName: string
    version: string
    description: string
    website?: string
    url: string
}

interface ILoginFieldDef {
    name: string
    label: string
    type?: 'text' | 'number' | 'boolean' | 'password' | 'select'
    required?: boolean
    options?: string[]
}

interface IInstalledLogin {
    id: string
    name: string
    displayName: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    requiresRestart?: boolean
    configSchema?: ILoginFieldDef[]
}

interface ILoginManagerDialogProps {
    onClose: () => void
    onRestartRequired?: () => void
}

const LoginManagerDialog: React.FC<ILoginManagerDialogProps> = (props: ILoginManagerDialogProps) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType
    const theme = useTheme()
    useKeyboard(props.onClose)

    const [available, setAvailable] = useState<ILoginManifestEntry[]>([])
    const [installed, setInstalled] = useState<IInstalledLogin[]>([])
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
    const [configLogin, setConfigLogin] = useState<IInstalledLogin | undefined>()
    const [configValues, setConfigValues] = useState<Record<string, string>>({})
    const [configSaving, setConfigSaving] = useState(false)
    const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})

    const loginGradient = (name: string) => {
        let hash = 0
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
        const hue = Math.abs(hash) % 360
        const dark = theme.palette.mode === 'dark'
        const alpha = dark ? 0.06 : 0.18
        const lines1 = `repeating-linear-gradient(0deg, hsla(${hue}, 65%, 70%, ${alpha}) 0px, transparent 1px, transparent 12px)`
        const lines2 = `repeating-linear-gradient(90deg, hsla(${hue}, 65%, 70%, ${alpha}) 0px, transparent 1px, transparent 12px)`
        return `${lines1}, ${lines2}, linear-gradient(315deg, hsla(${hue}, 75%, 58%, ${dark ? 0.07 : 0.12}) 0%, hsla(${hue}, 55%, 42%, ${dark ? 0.12 : 0.20}) 100%)`
    }

    const groupedAvailable: Record<string, ILoginManifestEntry[]> = available.reduce((acc, p) => {
        if (!acc[p.id]) acc[p.id] = []
        acc[p.id].push(p)
        return acc
    }, {} as Record<string, ILoginManifestEntry[]>)
    Object.values(groupedAvailable).forEach(group => group.sort((a, b) => versionGreaterThan(a.version, b.version) ? -1 : 1))

    const getSelectedEntry = (id: string): ILoginManifestEntry => {
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
            const res = await fetch(`${backendUrl}/core/logins`, addGetAuthorization(accessString))
            const data: IInstalledLogin[] = await res.json()
            setInstalled(data)
        }
        catch (err) {
            setError(`Failed to load installed logins: ${err}`)
        }
    }

    const fetchManifest = async () => {
        setError(undefined)
        setLoadingManifest(true)
        try {
            const res = await fetch(LOGINS_MANIFEST_URL)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data: ILoginManifestEntry[] = await res.json()
            setAvailable(data)
        }
        catch {
            // catalog is optional — no error shown if unavailable
        }
        finally {
            setLoadingManifest(false)
        }
    }

    const install = async (entry: ILoginManifestEntry) => {
        setError(undefined)
        setInstallingId(entry.id)
        try {
            const res = await fetch(`${backendUrl}/core/logins/install`, addPostAuthorization(accessString, JSON.stringify({ url: entry.url })))
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            const meta: IInstalledLogin = await res.json()
            await loadInstalled()
            if (meta.requiresRestart) props.onRestartRequired?.()
        }
        catch (err) {
            setError(`Failed to install ${entry.name}: ${err}`)
        }
        finally {
            setInstallingId(undefined)
        }
    }

    const uninstall = async (login: IInstalledLogin) => {
        setError(undefined)
        setUninstallingId(login.id)
        try {
            const res = await fetch(`${backendUrl}/core/logins/${login.id}`, addDeleteAuthorization(accessString))
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            await loadInstalled()
        }
        catch (err) {
            setError(`Failed to uninstall ${login.name}: ${err}`)
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
            const res = await fetch(`${backendUrl}/core/logins/install`, addPostAuthorization(accessString, JSON.stringify({ url })))
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            const meta: IInstalledLogin = await res.json()
            await loadInstalled()
            if (meta.requiresRestart) props.onRestartRequired?.()
            setCustomUrl('')
        }
        catch (err) {
            setError(`Failed to install login extension: ${err}`)
        }
        finally {
            setInstallingCustom(false)
        }
    }

    const installFromFile = async (file: File) => {
        setError(undefined)
        setInstallingFile(true)
        try {
            const res = await fetch(`${backendUrl}/core/logins/upload`, {
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
            const meta: IInstalledLogin = await res.json()
            await loadInstalled()
            if (meta.requiresRestart) props.onRestartRequired?.()
        }
        catch (err) {
            setError(`Failed to install login extension: ${err}`)
        }
        finally {
            setInstallingFile(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const openConfig = async (login: IInstalledLogin) => {
        setShowSecrets({})
        try {
            const res = await fetch(`${backendUrl}/core/logins/${login.id}/config`, addGetAuthorization(accessString))
            const cfg = res.ok ? await res.json() : {}
            const vals: Record<string, string> = {}
            for (const field of login.configSchema ?? []) vals[field.name] = cfg[field.name] ?? ''
            setConfigValues(vals)
        }
        catch {
            const vals: Record<string, string> = {}
            for (const field of login.configSchema ?? []) vals[field.name] = ''
            setConfigValues(vals)
        }
        setConfigLogin(login)
    }

    const saveConfig = async () => {
        if (!configLogin) return
        setConfigSaving(true)
        try {
            const body: Record<string, unknown> = {}
            for (const field of configLogin.configSchema ?? []) {
                const val = configValues[field.name]
                if (val !== undefined && val !== '') body[field.name] = field.type === 'number' ? Number(val) : val
            }
            await fetch(`${backendUrl}/core/logins/${configLogin.id}/config`, addPutAuthorization(accessString, JSON.stringify(body)))
            setConfigLogin(undefined)
        }
        catch (err) {
            setError(`Failed to save config: ${err}`)
        }
        finally {
            setConfigSaving(false)
        }
    }

    const isInstalled = (id: string) => installed.some(p => p.id === id && p.installedFrom !== 'dev')
    const isDevInstalled = (id: string) => installed.some(p => p.id === id && p.installedFrom === 'dev')

    const resolveSource = (installedFrom?: string): React.ReactElement | null => {
        if (!installedFrom) return null
        if (installedFrom === 'dev') return <Chip label='dev' size='small' variant='outlined' color='warning' />
        if (installedFrom === 'bundled') return <Chip label='bundled' size='small' variant='outlined' color='default' />
        if (installedFrom === 'local') return <Chip icon={<FolderOpen />} label='Local file' size='small' variant='outlined' />
        if (installedFrom.startsWith('pack:'))
            return <Tooltip title={`Installed by pack '${installedFrom.slice(5)}'`}><Chip label='via pack' size='small' variant='outlined' color='secondary' /></Tooltip>
        if (installedFrom.includes('github.com/kwirthmagnify')) return <Chip icon={<LockPerson />} label='Kwirth' size='small' variant='outlined' color='primary' />
        const short = installedFrom.length > 40 ? installedFrom.slice(0, 37) + '…' : installedFrom
        return <Tooltip title={installedFrom}><Chip icon={<Link />} label={short} size='small' variant='outlined' sx={{ maxWidth: '100%' }} /></Tooltip>
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

    const LoginCard = ({ id, displayName, version, description, badge, source, website, action }: { id: string; displayName: string; version: string; description: string; badge?: React.ReactNode; source?: React.ReactNode; website?: string; action: React.ReactNode }) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: 1.5, minHeight: 100, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, background: loginGradient(id) }}>
            <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                <Box sx={{ color: 'text.secondary', mt: 0.25 }}><LockPerson /></Box>
                <Box flex={1} minWidth={0}>
                    <Stack direction='row' alignItems='center' spacing={0.5} sx={{ width: '100%' }}>
                        <Typography variant='body2' fontWeight='bold' component='span' sx={{ flex: 1 }}>{displayName}</Typography>
                        {badge}
                        <Chip label={`v${version}`} size='small' sx={{ minWidth: 72 }} />
                    </Stack>
                    <Typography variant='caption' color='text.secondary' display='block' sx={{ mt: 0.5 }}>{description}</Typography>
                </Box>
                <Tooltip title={website ? 'Open login extension website' : 'No website available'}>
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
    const filteredInstalled = installed.filter(p => !installedFilter || p.id.includes(installedFilter.toLowerCase()) || (p.displayName || p.name).toLowerCase().includes(installedFilter.toLowerCase()))

    return (
        <>
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '72vw', maxWidth: '72vw', height: '80vh' } }}>
            <DialogTitleHelp section='guide/extensions/logins/index'>Manage login extensions</DialogTitleHelp>
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{ mt: 1 }}>

                    <Stack direction='row' alignItems='center' spacing={1}>
                        <Typography variant='subtitle2'>Installed login extensions</Typography>
                        <TextField size='small' placeholder='Filter…' value={installedFilter} onChange={e => setInstalledFilter(e.target.value)} sx={{ flex: 1 }} slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: '0.75rem' } } }} />
                        <ViewToggle />
                    </Stack>

                    {installed.length === 0
                        ? <Typography variant='body2' color='text.secondary'>No login extensions installed. The default Kwirth login page is always available.</Typography>
                        : viewMode === 'card'
                            ? <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
                                {filteredInstalled.map(login => (
                                    <LoginCard
                                        key={login.id}
                                        id={login.id}
                                        displayName={login.displayName || login.name}
                                        version={login.version}
                                        description={login.description}
                                        source={resolveSource(login.installedFrom)}
                                        website={login.website}
                                        action={
                                            <Stack direction='row' spacing={0.5}>
                                                {login.configSchema && login.configSchema.length > 0 && (
                                                    <Tooltip title='Configure'>
                                                        <IconButton size='small' onClick={() => openConfig(login)}>
                                                            <Settings fontSize='small' />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                                <Tooltip title={login.installedFrom === 'dev' ? 'Dev login extensions cannot be uninstalled' : login.installedFrom?.startsWith('pack:') ? 'Installed via pack — uninstall the pack instead' : 'Uninstall'}>
                                                    <span>
                                                        <IconButton size='small' color='error' disabled={login.installedFrom === 'dev' || login.installedFrom?.startsWith('pack:') || uninstallingId === login.id} onClick={() => uninstall(login)}>
                                                            {uninstallingId === login.id ? <CircularProgress size={16} /> : <Delete fontSize='small' />}
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            </Stack>
                                        }
                                    />
                                ))}
                              </Box>
                            : <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto', columnGap: 1, alignItems: 'center', px: 1.5 }}>
                                {filteredInstalled.flatMap((login, i, arr) => [
                                    <Box key={`${login.id}-icon`} sx={{ color: 'text.secondary', display: 'flex', py: 1 }}><LockPerson fontSize='small' /></Box>,
                                    <Box key={`${login.id}-name`} sx={{ py: 1, minWidth: 0 }}>
                                        <Typography variant='body2' fontWeight='bold' sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{login.displayName || login.name}</Typography>
                                        <Typography variant='caption' color='text.secondary'>{login.description}</Typography>
                                    </Box>,
                                    <Box key={`${login.id}-version`} sx={{ py: 1 }}><Chip label={`v${login.version}`} size='small' sx={{ minWidth: 72 }} /></Box>,
                                    <Box key={`${login.id}-source`} sx={{ py: 1 }}>{resolveSource(login.installedFrom)}</Box>,
                                    <Box key={`${login.id}-del`} sx={{ py: 1 }}>
                                        <Stack direction='row' spacing={0.5}>
                                            {login.configSchema && login.configSchema.length > 0 && (
                                                <Tooltip title='Configure'>
                                                    <IconButton size='small' onClick={() => openConfig(login)}>
                                                        <Settings fontSize='small' />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                            <Tooltip title={login.installedFrom === 'dev' ? 'Dev login extensions cannot be uninstalled' : login.installedFrom?.startsWith('pack:') ? 'Installed via pack — uninstall the pack instead' : 'Uninstall'}>
                                                <span>
                                                    <IconButton size='small' color='error' disabled={login.installedFrom === 'dev' || login.installedFrom?.startsWith('pack:') || uninstallingId === login.id} onClick={() => uninstall(login)}>
                                                        {uninstallingId === login.id ? <CircularProgress size={16} /> : <Delete fontSize='small' />}
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                        </Stack>
                                    </Box>,
                                    ...(i < arr.length - 1 ? [<Box key={`${login.id}-sep`} sx={{ gridColumn: '1 / -1', borderBottom: 1, borderColor: 'divider', mx: -1.5 }} />] : [])
                                ])}
                              </Box>
                    }

                    <Typography variant='subtitle2' sx={{ pt: 1 }}>Install login extension</Typography>
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
                                <Typography variant='subtitle2'>Available login extensions</Typography>
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
                                            <LoginCard
                                                key={id}
                                                id={id}
                                                displayName={t.displayName || t.name}
                                                version={t.version}
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
                                : <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', columnGap: 1, alignItems: 'center', px: 1.5 }}>
                                    {filteredIds.flatMap((id, i, arr) => {
                                        const t = getSelectedEntry(id)
                                        return [
                                            <Box key={`${id}-icon`} sx={{ color: 'text.secondary', display: 'flex', py: 1 }}><LockPerson fontSize='small' /></Box>,
                                            <Box key={`${id}-name`} sx={{ py: 1, minWidth: 0 }}>
                                                <Typography variant='body2' fontWeight='bold' sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.displayName || t.name}</Typography>
                                                <Typography variant='caption' color='text.secondary'>{t.description}</Typography>
                                            </Box>,
                                            <Box key={`${id}-status`} sx={{ py: 1 }}>
                                                {isDevInstalled(id) ? <Chip label='dev' size='small' variant='outlined' color='warning' />
                                                : isInstalled(id) ? <Chip label='installed' color='success' size='small' icon={<CheckCircle />} />
                                                : null}
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

        {configLogin && (
            <Dialog open={true} maxWidth='xs' fullWidth>
                <DialogTitle>Configure — {configLogin.displayName || configLogin.name}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        {(configLogin.configSchema ?? []).map(field => field.type === 'select'
                            ? (
                                <TextField
                                    key={field.name}
                                    select
                                    label={field.label}
                                    value={configValues[field.name] ?? ''}
                                    onChange={e => setConfigValues(v => ({ ...v, [field.name]: e.target.value }))}
                                    size='small'
                                    fullWidth
                                    required={field.required}
                                    sx={{ '& .MuiOutlinedInput-root': { backgroundColor: 'transparent' } }}
                                >
                                    {(field.options ?? []).map(opt => (
                                        <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                                    ))}
                                </TextField>
                            )
                            : (
                                <TextField
                                    key={field.name}
                                    label={field.label}
                                    type={field.type === 'password' && !showSecrets[field.name] ? 'password' : 'text'}
                                    value={configValues[field.name] ?? ''}
                                    onChange={e => setConfigValues(v => ({ ...v, [field.name]: e.target.value }))}
                                    size='small'
                                    fullWidth
                                    required={field.required}
                                    sx={{ '& .MuiOutlinedInput-root': { backgroundColor: 'transparent' } }}
                                    slotProps={{
                                        htmlInput: { autoComplete: 'off' },
                                        ...(field.type === 'password' ? {
                                            input: {
                                                endAdornment: (
                                                    <IconButton size='small' edge='end' onClick={() => setShowSecrets(s => ({ ...s, [field.name]: !s[field.name] }))} title={showSecrets[field.name] ? 'Hide' : 'Show'}>
                                                        {showSecrets[field.name] ? <VisibilityOff fontSize='small' /> : <Visibility fontSize='small' />}
                                                    </IconButton>
                                                )
                                            }
                                        } : {})
                                    }}
                                />
                            )
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={saveConfig} disabled={configSaving}>
                        {configSaving ? <CircularProgress size={16} /> : 'SAVE'}
                    </Button>
                    <Button onClick={() => setConfigLogin(undefined)}>CANCEL</Button>
                </DialogActions>
            </Dialog>
        )}
        </>
    )
}

export { LoginManagerDialog }
