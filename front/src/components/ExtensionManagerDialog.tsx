import React, { useContext, useEffect, useRef, useState } from 'react'
import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { CheckCircle, Delete, Download, FolderOpen, Refresh, Settings, ViewList, ViewModule } from '@kwirthmagnify/kwirth-common-front/icons'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { versionGreaterThan } from '@kwirthmagnify/kwirth-common'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization } from '../tools/AuthorizationManagement'
import { MarketplaceBadge, compactChip, PUBLIC_MARKETPLACE_LABEL } from './MarketplaceBadge'
import { ERestartAction } from './extensionRestart'
import { useKeyboard } from '../tools/useKeyboard'
import { EManagerSection, IExtensionAction, IExtensionManagerDescriptor } from './extensionManagerModel'
import { ExtensionCard, extensionRowCells, EXTENSION_ROW_COLUMNS } from './ExtensionCard'

/*
    Diálogo de gestión de extensiones GENERICO (plan: plans/extension-managers-ui/PLAN.md).

    Sustituye al esqueleto que estaba copiado once veces: dos secciones con su filtro, conmutador
    tarjeta/lista que vale para las dos (regla 5), catalogo agrupado por clave con sus versiones ordenadas,
    instalacion desde catalogo / URL / fichero, refresco del catalogo invalidando la cache del back,
    procedencia, linea de error y cierre.

    Lo propio de cada tipo entra por descriptor, nunca copiando esto.
*/

// Lo minimo que el generico necesita de cualquier entrada instalada o de catalogo. Cada tipo tiene su
// forma; el generico solo mira esto y deja el resto al descriptor.
interface IMinimalEntry {
    version: string
    url?: string
    marketplaceId?: string
    marketplaceLabel?: string
    requiresRestart?: boolean
}

interface IExtensionManagerDialogProps<TInstalled extends IMinimalEntry, TEntry extends IMinimalEntry> {
    descriptor: IExtensionManagerDescriptor<TInstalled, TEntry>
    onClose: () => void
    onRestartRequired?: (extension: string, action: ERestartAction) => void
}

const ExtensionManagerDialog = <TInstalled extends IMinimalEntry, TEntry extends IMinimalEntry>(
    props: IExtensionManagerDialogProps<TInstalled, TEntry>
) => {
    const { descriptor: d } = props
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType
    useKeyboard(props.onClose)

    const [installed, setInstalled] = useState<TInstalled[]>([])
    const [available, setAvailable] = useState<TEntry[]>([])
    const [loadingManifest, setLoadingManifest] = useState(false)
    const [installingKey, setInstallingKey] = useState<string | undefined>()
    const [uninstallingKey, setUninstallingKey] = useState<string | undefined>()
    const [installingCustom, setInstallingCustom] = useState(false)
    const [installingFile, setInstallingFile] = useState(false)
    const [customUrl, setCustomUrl] = useState('')
    const [installedFilter, setInstalledFilter] = useState('')
    const [availableFilter, setAvailableFilter] = useState('')
    const [selectedVersions, setSelectedVersions] = useState<Record<string, string>>({})
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card')
    const [configuring, setConfiguring] = useState<TInstalled | undefined>()
    const [error, setError] = useState<string | undefined>()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const loadInstalled = async () => {
        try {
            const res = await fetch(`${backendUrl}${d.endpoints.installed}`, addGetAuthorization(accessString))
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            setInstalled(await res.json())
            await d.loadExtraData?.()
        }
        catch (err) {
            setError(`Failed to load installed ${d.noun.plural}: ${err}`)
        }
    }

    // refresh: el back cachea cada manifest 5 minutos, asi que refrescar tiene que pedir explicitamente que
    // lo invalide. Sin esto el boton no refresca nada y una extension recien publicada no aparece hasta que
    // vence el TTL.
    const fetchManifest = async (refresh = false) => {
        setError(undefined)
        setLoadingManifest(true)
        try {
            const res = await fetch(`${backendUrl}/core/marketplace/${d.extensionType}${refresh ? '?refresh=true' : ''}`, addGetAuthorization(accessString))
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            setAvailable(await res.json())
        }
        catch {
            setAvailable([])   // un catalogo vacio no es un error: puede no haber manifest de este tipo
        }
        finally {
            setLoadingManifest(false)
        }
    }

    useEffect(() => { loadInstalled(); fetchManifest() }, [])

    // ── catalogo agrupado por clave, versiones de mas nueva a mas vieja ─────────
    const grouped = available.reduce((acc, e) => {
        const k = d.keyOf(e)
        ;(acc[k] ||= []).push(e)
        return acc
    }, {} as Record<string, TEntry[]>)
    Object.values(grouped).forEach(g => g.sort((a, b) => versionGreaterThan(a.version, b.version) ? -1 : 1))

    const selectedEntry = (key: string): TEntry => {
        const group = grouped[key]
        return group.find(e => e.version === selectedVersions[key]) ?? group[0]
    }

    const installedByKey = new Map(installed.map(e => [d.keyOf(e), e]))
    const isInstalled = (key: string) => installedByKey.has(key)
    const isDevInstalled = (key: string) => installedByKey.get(key)?.['installedFrom' as keyof TInstalled] === 'dev'

    const matches = (entry: TInstalled | TEntry, filter: string) => {
        if (!filter) return true
        const f = filter.toLowerCase()
        return d.keyOf(entry).toLowerCase().includes(f) || d.toModel(entry).name.toLowerCase().includes(f)
    }

    // ── instalar / desinstalar ──────────────────────────────────────────────────
    const afterInstall = async (meta: TInstalled) => {
        await loadInstalled()
        d.onInstalled?.(meta)
        if (meta.requiresRestart) props.onRestartRequired?.(d.keyOf(meta), ERestartAction.INSTALL)
    }

    const postInstall = async (body: Record<string, unknown>): Promise<TInstalled> => {
        const res = await fetch(`${backendUrl}${d.endpoints.install}`, addPostAuthorization(accessString, JSON.stringify(body)))
        if (!res.ok) {
            const detail = await res.json().catch(() => ({}))
            throw new Error(detail?.error ?? `HTTP ${res.status}`)
        }
        return await res.json()
    }

    const installFromCatalog = async (entry: TEntry) => {
        const key = d.keyOf(entry)
        setError(undefined)
        setInstallingKey(key)
        try {
            await afterInstall(await postInstall({ url: entry.url, marketplaceId: entry.marketplaceId, marketplaceLabel: entry.marketplaceLabel ?? PUBLIC_MARKETPLACE_LABEL }))
        }
        catch (err) { setError(`Failed to install ${d.toModel(entry).name}: ${err}`) }
        finally { setInstallingKey(undefined) }
    }

    const installFromUrl = async () => {
        const url = customUrl.trim()
        if (!url) return
        setError(undefined)
        setInstallingCustom(true)
        try {
            await afterInstall(await postInstall({ url }))
            setCustomUrl('')
        }
        catch (err) { setError(`Failed to install ${d.noun.singular}: ${err}`) }
        finally { setInstallingCustom(false) }
    }

    const installFromFile = async (file: File) => {
        setError(undefined)
        setInstallingFile(true)
        try {
            const res = await fetch(`${backendUrl}${d.endpoints.upload}`, {
                method: 'POST',
                headers: { Authorization: accessString ? `Bearer ${accessString}` : '', 'Content-Type': 'application/octet-stream', 'X-Kwirth-App': 'true' },
                body: file
            })
            if (!res.ok) {
                const detail = await res.json().catch(() => ({}))
                throw new Error(detail?.error ?? `HTTP ${res.status}`)
            }
            await afterInstall(await res.json())
        }
        catch (err) { setError(`Failed to install ${d.noun.singular}: ${err}`) }
        finally {
            setInstallingFile(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const uninstall = async (entry: TInstalled) => {
        const key = d.keyOf(entry)
        setError(undefined)
        setUninstallingKey(key)
        try {
            const res = await fetch(`${backendUrl}${d.endpoints.remove(entry)}`, addDeleteAuthorization(accessString))
            if (!res.ok) {
                const detail = await res.json().catch(() => ({}))
                throw new Error(detail?.error ?? `HTTP ${res.status}`)
            }
            d.onUninstalled?.(entry)
            await loadInstalled()
            // Quitarla tampoco es inmediato: lo que se engancha al arrancar sigue montado hasta reiniciar.
            if (entry.requiresRestart) props.onRestartRequired?.(key, ERestartAction.UNINSTALL)
        }
        catch (err) { setError(`Failed to uninstall ${d.toModel(entry).name}: ${err}`) }
        finally { setUninstallingKey(undefined) }
    }

    // ── chips y acciones por seccion ────────────────────────────────────────────
    const installedChips = (entry: TInstalled): React.ReactNode[] => {
        const chips = [...(d.extraChips?.(entry, EManagerSection.INSTALLED) ?? [])]
        const n = d.configCount?.(entry)
        if (n !== undefined && n > 0)
            chips.push(<Chip key='cfg' label={`${n} config${n > 1 ? 's' : ''}`} size='small' color='primary' variant='outlined' sx={compactChip} />)
        return chips
    }

    const availableChips = (key: string, entry: TEntry): React.ReactNode[] => {
        const chips = [...(d.extraChips?.(entry, EManagerSection.AVAILABLE) ?? [])]
        if (isDevInstalled(key)) chips.push(<Chip key='dev' label='dev active' size='small' variant='outlined' color='warning' sx={compactChip} />)
        else if (isInstalled(key)) chips.push(<Chip key='inst' label='installed' color='success' size='small' icon={<CheckCircle />} sx={compactChip} />)
        return chips
    }

    const installedActions = (entry: TInstalled): IExtensionAction[] => {
        const actions = [...(d.actions?.(entry, EManagerSection.INSTALLED) ?? [])]
        if (d.renderConfigDialog && (d.canConfigure?.(entry) ?? true))
            actions.push({ icon: <Settings fontSize='small' />, tooltip: 'Configure', onClick: () => setConfiguring(entry) })
        const verdict = d.canUninstall(entry)
        const key = d.keyOf(entry)
        actions.push({
            icon: uninstallingKey === key ? <CircularProgress size={16} /> : <Delete fontSize='small' />,
            tooltip: verdict.allowed ? 'Uninstall' : (verdict.reason ?? 'Cannot be uninstalled'),
            disabled: !verdict.allowed || uninstallingKey === key,
            color: 'error',
            onClick: () => uninstall(entry)
        })
        return actions
    }

    const availableActions = (key: string, entry: TEntry): IExtensionAction[] => {
        const blocked = d.installBlockedReason?.(entry)
        const already = isInstalled(key)
        return [
            ...(d.actions?.(entry, EManagerSection.AVAILABLE) ?? []),
            {
                icon: installingKey === key ? <CircularProgress size={16} /> : <Download fontSize='small' />,
                // ⚠️ A una extension de DEV no se le puede decir "desinstala primero": no se desinstala,
                // se quita de kwirth-dev.json. El consejo generico mandaba al usuario a pulsar una papelera
                // que esta deshabilitada. Lo traia ThemeManagerDialog y lo hereda el generico al migrarlo.
                tooltip: isDevInstalled(key) ? 'A dev version is already loaded'
                    : already ? 'Already installed — uninstall first'
                        : blocked ?? 'Install',
                disabled: already || !!blocked || installingKey === key,
                color: 'primary',
                onClick: () => installFromCatalog(entry)
            }
        ]
    }

    const ViewToggle = () => (
        <Stack direction='row' spacing={0}>
            <Tooltip title='Card view'>
                <IconButton size='small' color={viewMode === 'card' ? 'primary' : 'default'} onClick={() => setViewMode('card')}><ViewModule fontSize='small' /></IconButton>
            </Tooltip>
            <Tooltip title='List view'>
                <IconButton size='small' color={viewMode === 'list' ? 'primary' : 'default'} onClick={() => setViewMode('list')}><ViewList fontSize='small' /></IconButton>
            </Tooltip>
        </Stack>
    )

    const cardGridSx = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }
    const listGridSx = {
        border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden',
        display: 'grid', gridTemplateColumns: EXTENSION_ROW_COLUMNS, columnGap: 1, alignItems: 'center', px: 1.5
    }
    const separator = (key: string) => <Box key={`${key}-sep`} sx={{ gridColumn: '1 / -1', borderBottom: 1, borderColor: 'divider', mx: -1.5 }} />

    const shownInstalled = installed.filter(e => matches(e, installedFilter))
    const shownKeys = Object.keys(grouped).filter(k => matches(grouped[k][0], availableFilter))

    return (<>
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '72vw', maxWidth: '72vw', height: '80vh' } }}>
            {d.helpSection
                ? <DialogTitleHelp section={d.helpSection} docsUrl={docsUrl(backendUrl, 'core', 'kwirth')}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{d.icon}{d.title}</Box>
                  </DialogTitleHelp>
                : <DialogTitle><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{d.icon}{d.title}</Box></DialogTitle>
            }
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{ mt: 1 }}>

                    <Stack direction='row' alignItems='center' spacing={1}>
                        <Typography variant='subtitle2'>Installed {d.noun.plural}</Typography>
                        <TextField size='small' placeholder='Filter…' value={installedFilter} onChange={e => setInstalledFilter(e.target.value)} sx={{ flex: 1 }} slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: '0.75rem' } } }} />
                        <ViewToggle />
                    </Stack>

                    {shownInstalled.length === 0
                        ? <Typography variant='body2' color='text.secondary'>No {d.noun.plural} installed.</Typography>
                        : viewMode === 'card'
                            ? <Box sx={cardGridSx}>
                                {shownInstalled.map(entry => (
                                    <ExtensionCard key={d.keyOf(entry)} model={d.toModel(entry)} fallbackIcon={d.icon}
                                        chips={installedChips(entry)} inlineControl={d.inlineControl?.(entry, EManagerSection.INSTALLED)}
                                        actions={installedActions(entry)} />
                                ))}
                              </Box>
                            : <Box sx={listGridSx}>
                                {shownInstalled.flatMap((entry, i, arr) => {
                                    const key = d.keyOf(entry)
                                    return [
                                        ...extensionRowCells(key, { model: d.toModel(entry), fallbackIcon: d.icon, chips: installedChips(entry), inlineControl: d.inlineControl?.(entry, EManagerSection.INSTALLED), actions: installedActions(entry) }),
                                        ...(i < arr.length - 1 ? [separator(key)] : [])
                                    ]
                                })}
                              </Box>
                    }

                    <Typography variant='subtitle2' sx={{ pt: 1 }}>Install {d.noun.singular}</Typography>
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
                        <Typography variant='subtitle2'>Available {d.noun.plural}</Typography>
                        <TextField size='small' placeholder='Filter…' value={availableFilter} onChange={e => setAvailableFilter(e.target.value)} sx={{ flex: 1 }} slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: '0.75rem' } } }} />
                        <Tooltip title='Refresh catalog'>
                            <span>
                                <IconButton size='small' sx={{ width: 30, height: 30 }} onClick={() => fetchManifest(true)} disabled={loadingManifest}>
                                    {loadingManifest ? <CircularProgress size={16} /> : <Refresh fontSize='small' />}
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Stack>

                    {shownKeys.length === 0 && !loadingManifest
                        ? <Typography variant='body2' color='text.secondary'>No {d.noun.plural} available.</Typography>
                        : viewMode === 'card'
                            ? <Box sx={cardGridSx}>
                                {shownKeys.map(key => {
                                    const entry = selectedEntry(key)
                                    return (
                                        <ExtensionCard key={key} model={d.toModel(entry)} fallbackIcon={d.icon}
                                            versions={grouped[key].map(e => e.version)}
                                            onVersionChange={v => setSelectedVersions(prev => ({ ...prev, [key]: v }))}
                                            chips={availableChips(key, entry)} actions={availableActions(key, entry)} />
                                    )
                                })}
                              </Box>
                            : <Box sx={listGridSx}>
                                {shownKeys.flatMap((key, i, arr) => {
                                    const entry = selectedEntry(key)
                                    return [
                                        ...extensionRowCells(key, {
                                            model: d.toModel(entry), fallbackIcon: d.icon,
                                            versions: grouped[key].map(e => e.version),
                                            onVersionChange: v => setSelectedVersions(prev => ({ ...prev, [key]: v })),
                                            chips: availableChips(key, entry), actions: availableActions(key, entry)
                                        }),
                                        ...(i < arr.length - 1 ? [separator(key)] : [])
                                    ]
                                })}
                              </Box>
                    }

                </Stack>
            </DialogContent>
            {error && <Box sx={{ px: 3, pb: 1 }}><Typography variant='caption' color='error'>{error}</Typography></Box>}
            <DialogActions>
                <Button onClick={props.onClose}>CLOSE</Button>
            </DialogActions>
        </Dialog>

        {/* El diálogo de configuracion es del TIPO, no del generico: siete tipos lo resuelven de siete
            maneras distintas (JSON libre, schema, CRUD con nombre, localStorage…). Va como hermano y no
            anidado dentro del Dialog principal. */}
        {configuring && d.renderConfigDialog?.(configuring, () => { setConfiguring(undefined); loadInstalled() })}
    </>)
}

export { ExtensionManagerDialog }
