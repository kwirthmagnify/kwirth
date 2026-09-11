import React, { useContext, useEffect, useRef, useState } from 'react'
import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, MenuItem, Select, Stack, TextField, Tooltip, Typography, useTheme } from '@mui/material'
import * as MuiIcons from '@kwirthmagnify/kwirth-common-front/icons'
import { CheckCircle, CloudQueue, Delete, Download, Extension, FolderOpen, Https, Link, Launch, Refresh, Settings, ViewList, ViewModule } from '@kwirthmagnify/kwirth-common-front/icons'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization } from '../tools/AuthorizationManagement'
import { versionGreaterThan, EExtensionType } from '@kwirthmagnify/kwirth-common'
import { MarketplaceBadge, MarketplaceSourceIcon, compactChip, PUBLIC_MARKETPLACE_LABEL } from './MarketplaceBadge'
import { ERestartAction } from './extensionRestart'
import { useKeyboard } from '../tools/useKeyboard'
import { extensionCardSx, extensionCardDescriptionSx, extensionCardTitleSx, dependencyList } from './extensionCardStyle'
import { sanitizeSvg } from '../tools/sanitizeSvg'


interface IRequirement {
    extensionType: EExtensionType
    id: string
    minVersion: string
}

interface IPluginManifestEntry {
    marketplaceId?: string
    marketplaceLabel?: string
    id: string
    extensionType?: EExtensionType    // tipo de extensión de la entrada (marketplace unificado / packs)
    name: string
    displayName: string
    version: string
    description: string
    icon?: string
    website?: string
    url: string
    requires?: IRequirement[]   // dependencias OBLIGATORIAS: bloquean el install si no están instaladas
    uses?: IRequirement[]       // dependencias OPCIONALES: si están, el consumidor las usa; si no, funciona sin ellas
}

interface IInstalledPlugin {
    id: string
    name: string
    displayName: string
    version: string
    description: string
    icon?: string
    website?: string
    installedFrom?: string

    marketplaceId?: string

    marketplaceLabel?: string
    requiresRestart?: boolean
}

interface IPluginManagerDialogProps {
    onClose: () => void
    onPluginLoaded: (id: string) => void
    onPluginUnloaded: (id: string) => void
    onRestartRequired?: (extension: string, action: ERestartAction) => void
}

const PluginManagerDialog: React.FC<IPluginManagerDialogProps> = (props: IPluginManagerDialogProps) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType
    const theme = useTheme()
    useKeyboard(props.onClose)

    const [available, setAvailable] = useState<IPluginManifestEntry[]>([])
    const [installed, setInstalled] = useState<IInstalledPlugin[]>([])
    const [loadingManifest, setLoadingManifest] = useState(false)
    const [installingId, setInstallingId] = useState<string | undefined>()
    const [uninstallingId, setUninstallingId] = useState<string | undefined>()
    // Editor de config de instalación del plugin (JSON genérico) — gear del plugin manager.
    const [configId, setConfigId] = useState<string | undefined>()
    const [configText, setConfigText] = useState('')
    const [configBusy, setConfigBusy] = useState(false)
    const [configError, setConfigError] = useState<string | undefined>()
    const [error, setError] = useState<string | undefined>()
    const [customUrl, setCustomUrl] = useState('')
    const [installingCustom, setInstallingCustom] = useState(false)
    const [installingFile, setInstallingFile] = useState(false)
    const [selectedVersions, setSelectedVersions] = useState<Record<string, string>>({})
    const [filterText, setFilterText] = useState('')
    const [installedFilter, setInstalledFilter] = useState('')
    const [crossInstalled, setCrossInstalled] = useState<Record<string, { id: string, version: string }[]>>({})
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card')
    const fileInputRef = useRef<HTMLInputElement>(null)

    const groupedAvailable: Record<string, IPluginManifestEntry[]> = available.reduce((acc, p) => {
        if (!acc[p.id]) acc[p.id] = []
        acc[p.id].push(p)
        return acc
    }, {} as Record<string, IPluginManifestEntry[]>)
    Object.values(groupedAvailable).forEach(group => group.sort((a, b) => versionGreaterThan(a.version, b.version) ? -1 : 1))

    const getSelectedEntry = (id: string): IPluginManifestEntry => {
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
            const res = await fetch(`${backendUrl}/core/plugins`, addGetAuthorization(accessString))
            const data: IInstalledPlugin[] = await res.json()
            setInstalled(data)
        } catch (err) {
            setError(`Failed to load installed plugins: ${err}`)
        }
    }

    // refresh: el back cachea cada manifest 5 minutos, asi que el boton de refrescar el catalogo tiene que
    // pedir explicitamente que lo invalide. Sin esto el boton no refrescaba nada: volvia a preguntar y el
    // back respondia lo mismo de su cache, y una extension recien publicada no aparecia hasta pasado el TTL.
    const fetchManifest = async (refresh = false) => {
        setError(undefined)
        setLoadingManifest(true)
        try {
            const res = await fetch(`${backendUrl}/core/marketplace/${EExtensionType.PLUGIN}${refresh ? '?refresh=true' : ''}`, addGetAuthorization(accessString))
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data: IPluginManifestEntry[] = await res.json()
            setAvailable(data)
            const neededTypes = new Set(data.flatMap(e => [...(e.requires ?? []), ...(e.uses ?? [])]).map(r => r.extensionType).filter(t => t !== 'plugin'))
            if (neededTypes.size > 0) {
                const endpoints: Record<string, string> = { sender: `${backendUrl}/core/senders`, provider: `${backendUrl}/core/providers` }
                const results: Record<string, { id: string, version: string }[]> = {}
                await Promise.all([...neededTypes].map(async t => {
                    try { const r = await fetch(endpoints[t], addGetAuthorization(accessString)); if (r.ok) results[t] = await r.json() } catch {}
                }))
                setCrossInstalled(results)
            }
        } catch (err) {
            setError(`Failed to fetch plugin catalog: ${err}`)
        } finally {
            setLoadingManifest(false)
        }
    }

    const openConfig = async (id: string) => {
        setConfigError(undefined); setConfigId(id); setConfigText(''); setConfigBusy(true)
        try {
            const res = await fetch(`${backendUrl}/core/plugins/${id}/config`, addGetAuthorization(accessString))
            const cfg = res.ok ? await res.json() : {}
            setConfigText(JSON.stringify(cfg ?? {}, null, 2))
        } catch (e) { setConfigText('{}'); setConfigError(`Failed to load config: ${e}`) }
        finally { setConfigBusy(false) }
    }
    const saveConfig = async () => {
        let parsed: unknown
        try { parsed = JSON.parse(configText || '{}') } catch { setConfigError('Invalid JSON'); return }
        setConfigBusy(true); setConfigError(undefined)
        try {
            const res = await fetch(`${backendUrl}/core/plugins/${configId}/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: accessString ? `Bearer ${accessString}` : '', 'X-Kwirth-App': 'true' }, body: JSON.stringify(parsed) })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            setConfigId(undefined)
        } catch (e) { setConfigError(`Failed to save config: ${e}`) }
        finally { setConfigBusy(false) }
    }
    const exportConfig = () => {
        const blob = new Blob([configText || '{}'], { type: 'application/json' })
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${configId}-config.json`; a.click(); URL.revokeObjectURL(a.href)
    }
    const importConfig = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]; e.target.value = ''
        if (!f) return
        try { setConfigText(JSON.stringify(JSON.parse(await f.text()), null, 2)); setConfigError(undefined) }
        catch { setConfigError('Invalid JSON file') }
    }

    const isRequirementMet = (req: IRequirement): boolean => {
        const list = req.extensionType === 'plugin' ? installed : (crossInstalled[req.extensionType] ?? [])
        const found = list.find(x => x.id === req.id)
        return !!found && (found.version === req.minVersion || versionGreaterThan(found.version, req.minVersion))
    }

    const install = async (plugin: IPluginManifestEntry) => {
        setError(undefined)
        setInstallingId(plugin.id)
        try {
            const res = await fetch(`${backendUrl}/core/plugins/install`, addPostAuthorization(accessString, JSON.stringify({ url: plugin.url, marketplaceId: plugin.marketplaceId, marketplaceLabel: plugin.marketplaceLabel ?? PUBLIC_MARKETPLACE_LABEL })))
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            const meta: IInstalledPlugin = await res.json()
            await loadInstalled()
            props.onPluginLoaded(meta.id)
            if (meta.requiresRestart) props.onRestartRequired?.(meta.id, ERestartAction.INSTALL)
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
            const res = await fetch(`${backendUrl}/core/plugins/${plugin.id}`, addDeleteAuthorization(accessString))
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            props.onPluginUnloaded(plugin.id)
            await loadInstalled()
            // Quitarla tampoco es inmediato: lo que se engancha al arrancar (su router, por ejemplo)
            // sigue montado hasta que se reinicie, aunque ya no salga en la lista.
            if (plugin.requiresRestart) props.onRestartRequired?.(plugin.id, ERestartAction.UNINSTALL)
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
            const res = await fetch(`${backendUrl}/core/plugins/install`, addPostAuthorization(accessString, JSON.stringify({ url })))
            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error ?? `HTTP ${res.status}`)
            }
            const meta: IInstalledPlugin = await res.json()
            await loadInstalled()
            props.onPluginLoaded(meta.id)
            if (meta.requiresRestart) props.onRestartRequired?.(meta.id, ERestartAction.INSTALL)
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
            const res = await fetch(`${backendUrl}/core/plugins/upload`, {
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
            if (meta.requiresRestart) props.onRestartRequired?.(meta.id, ERestartAction.INSTALL)
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
        if (installedFrom === 'dev')
            return <Chip label='dev' size='small' variant='outlined' color='warning' sx={compactChip} />
        if (installedFrom === 'local')
            return <Chip icon={<FolderOpen />} label='Local file' size='small' variant='outlined' sx={compactChip} />
        if (installedFrom === 'bundled')
            return <Chip label='bundled' size='small' variant='outlined' color='secondary' sx={compactChip} />
        if (installedFrom.startsWith('pack:'))
            return <Tooltip title={`Installed by pack '${installedFrom.slice(5)}'`}><Chip label='via pack' size='small' variant='outlined' color='secondary' sx={compactChip} /></Tooltip>
        if (installedFrom.includes('github.com/kwirthmagnify'))
            return <Chip icon={<Extension />} label='Kwirth' size='small' variant='outlined' color='primary' sx={compactChip} />
        // Descargado de una URL suelta: no se pinta nada. La direccion recortada llenaba la fila sin
        // decir gran cosa, y ya la da el tooltip del icono de procedencia (MarketplaceSourceIcon).
        return null
    }

    /*
        El 'icon' del package.json de una extension admite DOS formas:

          - el nombre de un icono del set curado ('Newspaper', 'Science'...), que es como estaba
          - un SVG en crudo, para que una extension pueda traer SU icono

        Lo segundo existe porque el set curado lo sirve el paquete comun: un plugin que quisiera un
        icono propio obligaba a anadir un export a kwirthicons, publicar common-front y reconstruir el
        core. Para un plugin de terceros eso es directamente imposible.

        El SVG se SANEA con lista blanca antes de pintarlo (ver sanitizeSvg): viene del package.json de
        una extension que puede haberse instalado desde un marketplace ajeno, y un SVG admite <script>
        y manejadores on*.
    */
    const resolveIcon = (iconName?: string): React.ReactElement => {
        const svg = sanitizeSvg(iconName)
        if (svg) {
            return <Box component='span' sx={{ display: 'flex', width: 24, height: 24 }}
                dangerouslySetInnerHTML={{ __html: svg }} />
        }
        const IconComponent = iconName ? (MuiIcons as Record<string, React.ElementType>)[iconName] : undefined
        return IconComponent ? <IconComponent /> : <Extension />
    }

    const pluginGradient = (name: string) => {
        let hash = 0
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
        const hue = Math.abs(hash) % 360
        const dark = theme.palette.mode === 'dark'
        return `linear-gradient(315deg, hsla(${hue}, 75%, 58%, ${dark ? 0.07 : 0.12}) 0%, hsla(${hue}, 55%, 42%, ${dark ? 0.14 : 0.26}) 100%)`
    }

    const PluginCard = ({ icon, name, displayName, version, versions, onVersionChange, description, badge, source, website, action, requires, uses, marketplaceLabel, installedFrom }: { icon?: string; name: string; displayName: string; version: string; versions?: string[]; onVersionChange?: (v: string) => void; description: string; badge?: React.ReactNode; source?: React.ReactNode; website?: string; action: React.ReactNode; requires?: IRequirement[]; uses?: IRequirement[]; marketplaceLabel?: string; installedFrom?: string }) => (
        <Box sx={{ ...extensionCardSx, background: pluginGradient(name) }}>
            <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                <Box sx={{ color: 'text.secondary', mt: 0.25 }}>{resolveIcon(icon)}</Box>
                <Box flex={1} minWidth={0}>
                    <Stack direction='row' alignItems='center' spacing={0.5} sx={{ width: '100%' }}>
                        <Typography variant='body2' fontWeight='bold' component='span' sx={extensionCardTitleSx}>{displayName||name}</Typography>
                        {badge}
                        {versions
                            ? <Select size='small' value={version} onChange={e => onVersionChange?.(e.target.value)}
                                sx={{ height: 24, fontSize: '0.75rem', minWidth: 80, '& .MuiSelect-select': { py: 0, px: 1 } }}>
                                {versions.map(v => <MenuItem key={v} value={v} sx={{ fontSize: '0.75rem' }}>{v}</MenuItem>)}
                              </Select>
                            : <Chip label={`v${version}`} size='small' sx={{ ...compactChip, minWidth: 62 }} />
                        }
                    </Stack>
                    <Typography variant='caption' color='text.secondary' display='block' sx={extensionCardDescriptionSx}>{description}</Typography>
                </Box>
                <Tooltip title={website ? 'Open plugin website' : 'No website available'}>
                    <span>
                        <IconButton size='small' sx={{ mr: -0.5 }} disabled={!website} onClick={() => window.open(website!, '_blank', 'noopener')}>
                            <Launch fontSize='small' />
                        </IconButton>
                    </span>
                </Tooltip>
            </Stack>
            <Stack direction='row' justifyContent='space-between' alignItems='center' sx={{ mt: 1 }}>
                { /* abajo a la izquierda, lo primero: DE DONDE viene. Candado solo para lo privado; lo
                     publico lleva un icono distinto, no un candado, para que no se lean como lo mismo. */ }
                <MarketplaceSourceIcon label={marketplaceLabel} installedFrom={installedFrom} />
                { /* Las dependencias van pegadas al chip del marketplace, en esta misma linea: resumidas en
                     un chip con el detalle en el tooltip. Como fila propia bajo la descripcion hacian crecer
                     la tarjeta y rompian la altura comun de los diez tipos. */ }
                <Stack direction='row' alignItems='center' spacing={0.5} sx={{ mr: 0.75 }}>
                    <MarketplaceBadge label={marketplaceLabel} installedFrom={installedFrom} />
                    {requires && requires.length > 0 && (
                        <Tooltip title={`Requires: ${dependencyList(requires)}`}>
                            <Chip label={`Requires ${requires.length}`} size='small' variant='outlined' sx={compactChip} />
                        </Tooltip>
                    )}
                    {uses && uses.length > 0 && (
                        <Tooltip title={`Uses: ${dependencyList(uses)}`}>
                            <Chip label={`Uses ${uses.length}`} size='small' variant='outlined'
                                sx={{ ...compactChip, opacity: uses.every(isRequirementMet) ? 1 : 0.45 }} />
                        </Tooltip>
                    )}
                </Stack>
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
            <DialogTitleHelp section='guide/extensions/plugins/index?id=managing-channel-plugins' docsUrl={docsUrl(backendUrl, 'core', 'kwirth')}>Manage plugins</DialogTitleHelp>
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{ mt: 1 }}>

                    <Stack direction='row' alignItems='center' spacing={1}>
                        <Typography variant='subtitle2'>Installed plugins</Typography>
                        <TextField size='small' placeholder='Filter…' value={installedFilter} onChange={e => setInstalledFilter(e.target.value)} sx={{ flex: 1 }} slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: '0.75rem' } } }} />
                        <ViewToggle />
                    </Stack>
                    {installed.length === 0
                        ? <Typography variant='body2' color='text.secondary'>No plugins installed.</Typography>
                        : viewMode === 'card'
                            ? <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
                                {installed.filter(p => !installedFilter || p.id.includes(installedFilter.toLowerCase()) || (p.displayName || p.name).toLowerCase().includes(installedFilter.toLowerCase())).map(plugin => (
                                    <PluginCard
                                        key={plugin.id}
                                        icon={plugin.icon}
                                        name={plugin.name}
                                        displayName={plugin.displayName}
                                        version={plugin.version}
                                        description={plugin.description}
                                        website={plugin.website}
                                        source={resolveSource(plugin.installedFrom)}
                                        marketplaceLabel={plugin.marketplaceLabel}
                                        installedFrom={plugin.installedFrom}
                                        action={
                                            <>
                                                <Tooltip title='Configure'>
                                                    <span><IconButton size='small' onClick={() => openConfig(plugin.id)}><Settings fontSize='small' /></IconButton></span>
                                                </Tooltip>
                                                <Tooltip title={plugin.installedFrom === 'dev' ? 'Dev plugins cannot be uninstalled' : plugin.installedFrom === 'bundled' ? 'Bundled plugins cannot be uninstalled' : plugin.installedFrom?.startsWith('pack:') ? 'Installed via pack — uninstall the pack instead' : 'Uninstall'}>
                                                    <span>
                                                        <IconButton size='small' color='error' disabled={plugin.installedFrom === 'dev' || plugin.installedFrom === 'bundled' || plugin.installedFrom?.startsWith('pack:') || uninstallingId === plugin.id} onClick={() => uninstall(plugin)}>
                                                            {uninstallingId === plugin.id ? <CircularProgress size={16} /> : <Delete fontSize='small' />}
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            </>
                                        }
                                    />
                                ))}
                              </Box>
                            : <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                                {installed.filter(p => !installedFilter || p.id.includes(installedFilter.toLowerCase()) || (p.displayName || p.name).toLowerCase().includes(installedFilter.toLowerCase())).map(plugin => (
                                    <Box key={plugin.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
                                        <Box sx={{ color: 'text.secondary', flexShrink: 0, display: 'flex' }}>{resolveIcon(plugin.icon)}</Box>
                                        <Typography variant='body2' fontWeight='bold' sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plugin.displayName || plugin.name}</Typography>
                                        <MarketplaceSourceIcon label={plugin.marketplaceLabel} installedFrom={plugin.installedFrom} />
                                        <MarketplaceBadge label={plugin.marketplaceLabel} installedFrom={plugin.installedFrom} />
                                        <Box sx={{ flexShrink: 0 }}>{resolveSource(plugin.installedFrom)}</Box>
                                        <Chip label={`v${plugin.version}`} size='small' sx={{ ...compactChip, minWidth: 62 }} />
                                        <Tooltip title='Configure'>
                                            <span><IconButton size='small' onClick={() => openConfig(plugin.id)}><Settings fontSize='small' /></IconButton></span>
                                        </Tooltip>
                                        <Tooltip title={plugin.installedFrom === 'dev' ? 'Dev plugins cannot be uninstalled' : plugin.installedFrom === 'bundled' ? 'Bundled plugins cannot be uninstalled' : plugin.installedFrom?.startsWith('pack:') ? 'Installed via pack — uninstall the pack instead' : 'Uninstall'}>
                                            <span>
                                                <IconButton size='small' color='error' disabled={plugin.installedFrom === 'dev' || plugin.installedFrom === 'bundled' || plugin.installedFrom?.startsWith('pack:') || uninstallingId === plugin.id} onClick={() => uninstall(plugin)}>
                                                    {uninstallingId === plugin.id ? <CircularProgress size={16} /> : <Delete fontSize='small' />}
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    </Box>
                                ))}
                              </Box>
                    }

                    <Typography variant='subtitle2' sx={{ pt: 1 }}>Install plugin</Typography>
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
                        <Typography variant='subtitle2'>Available plugins</Typography>
                        <TextField size='small' placeholder='Filter…' value={filterText} onChange={e => setFilterText(e.target.value)} sx={{ flex: 1 }} slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: '0.75rem' } } }} />
                        <Tooltip title='Refresh catalog'>
                            <span>
                                <IconButton size='small' sx={{ width: 30, height: 30 }} onClick={() => fetchManifest(true)} disabled={loadingManifest}>
                                    {loadingManifest ? <CircularProgress size={16} /> : <Refresh fontSize='small' />}
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Stack>

                    {available.length === 0 && !loadingManifest && !error &&
                        <Typography variant='body2' color='text.secondary'>No plugins available.</Typography>
                    }

                    {filteredIds.length > 0 && (
                        viewMode === 'card'
                            ? <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
                                {filteredIds.map(id => {
                                    const group = groupedAvailable[id]
                                    const plugin = getSelectedEntry(id)
                                    const versions = group.map(p => p.version)
                                    return (
                                        <PluginCard
                                            key={id}
                                            icon={plugin.icon}
                                            name={plugin.name}
                                            displayName={plugin.displayName}
                                            version={plugin.version}
                                            versions={versions}
                                            onVersionChange={v => setSelectedVersions(prev => ({ ...prev, [id]: v }))}
                                            description={plugin.description}
                                            website={plugin.website}
                                            marketplaceLabel={plugin.marketplaceLabel}
                                            badge={isDevInstalled(id) ? <Chip label='dev active' size='small' variant='outlined' color='warning' sx={compactChip} /> : isInstalled(id) ? <Chip label='installed' color='success' size='small' icon={<CheckCircle />} sx={compactChip} /> : undefined}
                                            requires={plugin.requires}
                                            uses={plugin.uses}
                                            action={(() => {
                                                const unmet = (plugin.requires ?? []).filter(r => !isRequirementMet(r))
                                                return (
                                                    <Tooltip title={isDevInstalled(id) ? 'A dev version is already loaded' : isInstalled(id) ? 'Already installed — uninstall first' : unmet.length > 0 ? `Requires: ${unmet.map(r => `${r.extensionType} ${r.id} ≥${r.minVersion}`).join(', ')}` : 'Install'}>
                                                        <span>
                                                            <IconButton size='small' color='primary' disabled={isDevInstalled(id) || isInstalled(id) || installingId === id || unmet.length > 0} onClick={() => install(plugin)}>
                                                                {installingId === id ? <CircularProgress size={16} /> : <Download fontSize='small' />}
                                                            </IconButton>
                                                        </span>
                                                    </Tooltip>
                                                )
                                            })()}
                                        />
                                    )
                                })}
                              </Box>
                            : <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                                {filteredIds.map(id => {
                                    const group = groupedAvailable[id]
                                    const plugin = getSelectedEntry(id)
                                    const versions = group.map(p => p.version)
                                    const unmet = (plugin.requires ?? []).filter(r => !isRequirementMet(r))
                                    return (
                                        <Box key={id} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
                                            <Box sx={{ color: 'text.secondary', flexShrink: 0, display: 'flex' }}>{resolveIcon(plugin.icon)}</Box>
                                            <Typography variant='body2' fontWeight='bold' sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plugin.displayName || plugin.name}</Typography>
                                            <MarketplaceSourceIcon label={plugin.marketplaceLabel} />
                                            <MarketplaceBadge label={plugin.marketplaceLabel} />
                                            {isDevInstalled(id) && <Chip label='dev active' size='small' variant='outlined' color='warning' sx={compactChip} />}
                                            {isInstalled(id) && <Chip label='installed' color='success' size='small' icon={<CheckCircle />} sx={compactChip} />}
                                            <Select size='small' value={plugin.version} onChange={e => setSelectedVersions(prev => ({ ...prev, [id]: e.target.value }))} sx={{ height: 24, fontSize: '0.75rem', minWidth: 80, '& .MuiSelect-select': { py: 0, px: 1 } }}>
                                                    {versions.map(v => <MenuItem key={v} value={v} sx={{ fontSize: '0.75rem' }}>{v}</MenuItem>)}
                                                  </Select>
                                            <Tooltip title={isDevInstalled(id) ? 'A dev version is already loaded' : isInstalled(id) ? 'Already installed — uninstall first' : unmet.length > 0 ? `Requires: ${unmet.map(r => `${r.extensionType} ${r.id} ≥${r.minVersion}`).join(', ')}` : 'Install'}>
                                                <span>
                                                    <IconButton size='small' color='primary' disabled={isDevInstalled(id) || isInstalled(id) || installingId === id || unmet.length > 0} onClick={() => install(plugin)}>
                                                        {installingId === id ? <CircularProgress size={16} /> : <Download fontSize='small' />}
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                        </Box>
                                    )
                                })}
                              </Box>
                    )}

                </Stack>
            </DialogContent>
            {error && <Box sx={{ px: 3, pb: 1 }}><Typography variant='caption' color='error'>{error}</Typography></Box>}
            <DialogActions>
                <Button onClick={props.onClose}>CLOSE</Button>
            </DialogActions>
            {configId !== undefined && (
                <Dialog open PaperProps={{ sx: { width: 560, maxWidth: '95vw' } }}>
                    <DialogTitleHelp section='guide/extensions/plugins/index?id=managing-channel-plugins' docsUrl={docsUrl(backendUrl, 'core', 'kwirth')}>Configure {configId}</DialogTitleHelp>
                    <DialogContent>
                        <Typography variant='body2' color='text.secondary' sx={{ mb: 1 }}>Installation config (JSON) for this plugin — read by the plugin at runtime.</Typography>
                        <TextField multiline minRows={8} fullWidth value={configText} onChange={e => setConfigText(e.target.value)} disabled={configBusy} slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 12 } } }} />
                        {configError && <Typography variant='caption' color='error' sx={{ display: 'block', mt: 1 }}>{configError}</Typography>}
                        <Stack direction='row' spacing={1} sx={{ mt: 1 }}>
                            <Button size='small' onClick={exportConfig}>Export</Button>
                            <Button size='small' component='label'>Import<input type='file' accept='.json,application/json' hidden onChange={importConfig} /></Button>
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button variant='contained' disabled={configBusy} onClick={saveConfig}>OK</Button>
                        <Button variant='outlined' color='inherit' onClick={() => setConfigId(undefined)}>Cancel</Button>
                    </DialogActions>
                </Dialog>
            )}
        </Dialog>
    )
}

export { PluginManagerDialog }
