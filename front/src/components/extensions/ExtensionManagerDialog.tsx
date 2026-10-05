import React, { useContext, useEffect, useRef, useState } from 'react'
import { Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, MenuItem, Select, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { CheckCircle, Delete, Download, FolderOpen, Refresh, Settings, ViewList } from '@kwirthmagnify/kwirth-common-front/icons'
import { Upgrade, ViewModule } from '../../icons'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { versionGreaterThan } from '@kwirthmagnify/kwirth-common'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization } from '../../tools/AuthorizationManagement'
import { compactChip, PUBLIC_MARKETPLACE_LABEL } from './MarketplaceBadge'
import { ERestartAction } from './extensionRestart'
import { useKeyboard } from '../../tools/useKeyboard'
import { EChipIcon, EManagerSection, IExtensionAction, IExtensionChip, IExtensionManagerDescriptor, IExtensionRequirement } from './extensionManagerModel'
import { ExtensionCard, extensionRowCells, EXTENSION_ROW_COLUMNS } from './ExtensionCard'

/*
    The GENERIC extension management dialog (plan: plans/completed/extension-managers-ui/PLAN.md).

    It replaces the skeleton that was copied eleven times: two sections with their filter, a card/list
    toggle serving both (rule 5), a catalogue grouped by key with its versions sorted, installation from
    catalogue / URL / file, refreshing the catalogue by invalidating the back end's cache, provenance,
    the error line and closing.

    Whatever is a type's own comes in through its descriptor, never by copying this.
*/

// The minimum the generic dialog needs from any installed or catalogue entry. Each type has its own
// shape; the generic dialog only looks at this and leaves the rest to the descriptor.
interface IMinimalEntry {
    /*
        Optional because not everything installed has one: a bundled IdP connector comes inside Kwirth
        and carries no version of its own. In the CATALOGUE it is always there — it is what gets chosen
        in the dropdown.
    */
    version?: string
    url?: string
    marketplaceId?: string
    marketplaceLabel?: string
    requiresRestart?: boolean
    /*
        Dependencies between extensions, exactly as they come in the manifest. ANY type may declare them
        —even though until now only plugins and providers looked at them, each with its own copy— so the
        generic one understands them: `requires` blocks installing when missing, `uses` is only reported.
    */
    requires?: IExtensionRequirement[]
    uses?: IExtensionRequirement[]
}

interface IExtensionManagerDialogProps<TInstalled extends IMinimalEntry, TEntry extends IMinimalEntry> {
    descriptor: IExtensionManagerDescriptor<TInstalled, TEntry>
    onClose: () => void
    onRestartRequired?: (extension: string, action: ERestartAction) => void
}

/** The minimum for judging a requirement: what is installed of that type and with which version. */
interface IVersionedRef {
    id: string
    version: string
}

/** An installed plugin, which is what the plugin selector offers. */
interface IInstalledPluginRef {
    id: string
    displayName?: string
}

/*
    An entry's plugin selector (see IPluginSelectorSpec).

    ⚠️ It lives OUTSIDE the dialog on purpose. Defined inside, every render would create a new component
    type and React would unmount and remount it: the dropdown would close by itself when typing in the
    filter.
*/
const PluginMultiSelect: React.FC<{
    plugins: IInstalledPluginRef[]
    selected: string[]
    tooltip: string
    emptyLabel: string
    error?: string
    onChange: (pluginIds: string[]) => void
}> = ({ plugins, selected, tooltip, emptyLabel, error, onChange }) => {
    // While the dropdown is open there is NO tooltip: it draws over the list and covers the first
    // options. With an empty title, MUI does not show it — simpler than controlling it with `open`.
    const [abierto, setAbierto] = useState(false)
    // With several selected the value does not fit, so the tooltip carries it whole: the dropdown is of
    // FIXED width and what overflows is clipped.
    const titulo = error || (selected.length > 0 ? <><b>{selected.join(', ')}</b><br />{tooltip}</> : tooltip)
    return (
    <Tooltip title={abierto ? '' : titulo} disableInteractive>
        <Select multiple size='small' displayEmpty value={selected} error={Boolean(error)}
            onOpen={() => setAbierto(true)} onClose={() => setAbierto(false)}
            onChange={e => onChange(e.target.value as string[])}
            // The empty text is drawn, not left blank: "nobody uses it" is the default state and is
            // exactly what explains why a freshly installed extension "does nothing".
            renderValue={sel => (sel as string[]).length === 0
                ? <em style={{ fontSize: '0.7rem', opacity: 0.5 }}>{emptyLabel}</em>
                : (sel as string[]).join(', ')}
            // ⚠️ FIXED width, not minWidth: with minWidth the dropdown grows with every granted plugin and
            // throws the card out of line — and the cards of a grid do not change size with their content.
            sx={{
                // flexShrink 0: without it, it shrinks when the neighbouring chip is wider ('12 tools' vs
                // '3 tools') and the cards stop aligning with each other.
                height: 22, fontSize: '0.7rem', width: 110, minWidth: 110, maxWidth: 110, flexShrink: 0,
                '& .MuiSelect-select': { py: 0, px: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
            }}>
            {/* Con casilla: sin ella un desplegable no parece de seleccion multiple y nadie prueba a
                marcar dos. Mismo criterio que el ToolSelector de common-ai. */}
            {plugins.map(p => (
                <MenuItem key={p.id} value={p.id} sx={{ fontSize: '0.7rem', py: 0.25 }}>
                    <Checkbox size='small' checked={selected.includes(p.id)} sx={{ p: 0.5 }} />
                    {p.displayName || p.id}
                </MenuItem>
            ))}
        </Select>
    </Tooltip>
    )
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
    const [updatingKey, setUpdatingKey] = useState<string | undefined>()
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

    // Plugin selector: the plugin list is asked for ONCE for the whole dialog, not once per card.
    const [crossInstalled, setCrossInstalled] = useState<Record<string, IVersionedRef[]>>({})
    const [plugins, setPlugins] = useState<IInstalledPluginRef[]>([])
    const [pluginSel, setPluginSel] = useState<Record<string, string[]>>({})
    const [pluginSelError, setPluginSelError] = useState<Record<string, string>>({})

    const loadInstalled = async () => {
        try {
            const res = await fetch(`${backendUrl}${d.endpoints.installed}`, addGetAuthorization(accessString))
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json() as TInstalled[]
            /*
                The TYPE's data is loaded BEFORE painting what is installed, not after.

                The other way round showed a flicker: the first render arrived with that data still
                empty —in IdP, every connector as 'not configured'— and a second render corrected it a
                few milliseconds later. Painting what is installed last, the chip comes out right first time.

                A failure here is not allowed to bring the list down: without the type's data it is
                painted just the same, with the chips in their default state.
            */
            if (d.loadExtraData) await d.loadExtraData().catch(() => undefined)
            setInstalled(d.filterInstalled ? data.filter(d.filterInstalled) : data)
        }
        catch (err) {
            setError(`Failed to load installed ${d.noun.plural}: ${err}`)
        }
    }

    // refresh: the back end caches each manifest for 5 minutes, so refreshing has to ask explicitly for it
    // to be invalidated. Without this the button refreshes nothing and a freshly published extension does
    // not appear until the TTL expires.
    const fetchManifest = async (refresh = false) => {
        setError(undefined)
        setLoadingManifest(true)
        try {
            const res = await fetch(`${backendUrl}/core/marketplace/${d.extensionType}${refresh ? '?refresh=true' : ''}`, addGetAuthorization(accessString))
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const entradas = await res.json() as TEntry[]
            setAvailable(entradas)
            await loadRequirementTargets(entradas)
        }
        catch {
            setAvailable([])   // un catalogo vacio no es un error: puede no haber manifest de este tipo
        }
        finally {
            setLoadingManifest(false)
        }
    }

    /*
        What is installed of OTHER types, so as to be able to say whether a catalogue entry's
        requirements are met. Only what is needed is asked for: if nothing declares requirements,
        nothing is asked for.
    */
    const loadRequirementTargets = async (entradas: TEntry[]) => {
        const tipos = new Set(entradas.flatMap(e => [...(e.requires ?? []), ...(e.uses ?? [])]).map(r => r.extensionType).filter(t => t !== d.extensionType))
        if (tipos.size === 0) return
        const resultados: Record<string, IVersionedRef[]> = {}
        await Promise.all([...tipos].map(async t => {
            try {
                const r = await fetch(`${backendUrl}/core/${t}s`, addGetAuthorization(accessString))
                if (r.ok) resultados[t] = await r.json()
            }
            catch { /* si no se puede saber, el requisito se da por no cumplido y se dice en el tooltip */ }
        }))
        setCrossInstalled(resultados)
    }

    /** A requirement is met when it is installed and with a sufficient version. */
    const requirementMet = (req: IExtensionRequirement): boolean => {
        const lista: IVersionedRef[] = req.extensionType === d.extensionType
            ? installed.filter(e => e.version).map(e => ({ id: d.keyOf(e), version: e.version! }))
            : (crossInstalled[req.extensionType] ?? [])
        const encontrado = lista.find(x => x.id === req.id)
        return Boolean(encontrado) && (encontrado!.version === req.minVersion || versionGreaterThan(encontrado!.version, req.minVersion))
    }

    /** The dependencies as text, for the tooltips: 'plugin log ≥0.5.0, sender email ≥0.1.0'. */
    const dependencyList = (deps: IExtensionRequirement[]): string =>
        deps.map(r => `${r.extensionType} ${r.id} ≥${r.minVersion}`).join(', ')

    /** What is missing before that entry can be installed, already worded for the tooltip. */
    const requirementsBlocking = (entry: TEntry): string | undefined => {
        const faltan = (entry.requires ?? []).filter(r => !requirementMet(r))
        return faltan.length === 0 ? undefined : `Requires: ${dependencyList(faltan)}`
    }

    const loadPluginSelector = async () => {
        const spec = d.pluginSelector
        if (!spec) return
        try {
            const [pl, sel] = await Promise.all([
                fetch(`${backendUrl}/core/plugins`, addGetAuthorization(accessString)).then(r => r.json() as Promise<IInstalledPluginRef[]>),
                spec.load()
            ])
            setPlugins(pl)
            setPluginSel(sel)
        }
        catch (err) { setError(`Failed to load plugins: ${err}`) }
    }

    const changePluginSel = async (entry: TInstalled, pluginIds: string[]) => {
        const spec = d.pluginSelector
        if (!spec) return
        const key = d.keyOf(entry)
        const anterior = pluginSel[key] ?? []
        setPluginSel(s => ({ ...s, [key]: pluginIds }))   // optimista: el desplegable responde al momento
        try {
            await spec.save(entry, pluginIds)
            setPluginSelError(e => { const { [key]: _quitado, ...resto } = e; return resto })
        }
        catch (err) {
            // It is undone: leaving the UI saying it is saved when the back end did not save it is worse
            // than the failure itself — whoever changed it would walk away believing the change is in place.
            setPluginSel(s => ({ ...s, [key]: anterior }))
            setPluginSelError(e => ({ ...e, [key]: `Could not save: ${err}` }))
        }
    }

    const pluginControl = (entry: TInstalled) => {
        const spec = d.pluginSelector
        if (!spec || plugins.length === 0) return undefined
        const key = d.keyOf(entry)
        return <PluginMultiSelect
            plugins={plugins}
            selected={pluginSel[key] ?? []}
            tooltip={spec.tooltip}
            emptyLabel={spec.emptyLabel ?? 'No plugin'}
            error={pluginSelError[key]}
            onChange={ids => changePluginSel(entry, ids)}
        />
    }

    useEffect(() => { loadInstalled(); fetchManifest(); loadPluginSelector() }, [])

    // ── catalogue grouped by key, versions from newest to oldest ───────────────
    const grouped = available.reduce((acc, e) => {
        const k = d.keyOf(e)
        ;(acc[k] ||= []).push(e)
        return acc
    }, {} as Record<string, TEntry[]>)
    Object.values(grouped).forEach(g => g.sort((a, b) => versionGreaterThan(a.version ?? '', b.version ?? '') ? -1 : 1))

    const selectedEntry = (key: string): TEntry => {
        const group = grouped[key]
        return group.find(e => e.version === selectedVersions[key]) ?? group[0]
    }

    const installedByKey = new Map(installed.map(e => [d.keyOf(e), e]))
    const isInstalled = (key: string) => installedByKey.has(key)
    const isDevInstalled = (key: string) => installedByKey.get(key)?.['installedFrom' as keyof TInstalled] === 'dev'

    /*
        Why something installed is NOT updated from the catalogue, already worded for the tooltip.

        These are the two provenances a marketplace does not serve: the dev one is changed in
        kwirth-dev.json and the bundled one travels inside Kwirth. The back end rejects them anyway —it
        does not know their version— so this is not the defence, it is being able to say the reason
        instead of leaving a dead button.
    */
    const notUpdatableReason = (installedFrom?: string): string | undefined => {
        switch (installedFrom) {
            case 'dev': return 'A dev version is loaded — change it in kwirth-dev.json'
            case 'bundled': return 'Bundled with Kwirth — it is updated with Kwirth itself'
            default: return undefined
        }
    }

    /*
        The update available for something installed, if there is one.

        The data was already here: the catalogue comes grouped by key and with the versions sorted
        newest to oldest, so comparing the first with the installed one is enough. There is no need to
        ask the back end anything nor to reuse the startup notice.
    */
    const updateFor = (entry: TInstalled): TEntry | undefined => {
        if (updateBlocked(entry)) return undefined
        const group = grouped[d.keyOf(entry)]
        if (!group?.length || !entry.version) return undefined
        const newest = group[0]
        return newest.version && versionGreaterThan(newest.version, entry.version) ? newest : undefined
    }

    /** Why something installed cannot be updated: its provenance, or whatever its type says. */
    const updateBlocked = (entry: TInstalled): string | undefined =>
        notUpdatableReason(d.toModel(entry).installedFrom) ?? d.updateBlockedReason?.(entry)

    /*
        The update button's tooltip, which is the only thing visible when it is disabled —which is
        almost always. An 'Up to date' when what is really happening is that the catalogue has not
        loaded yet, or that the extension is in none of them, would be a lie: they are three different
        situations and each one says so.
    */
    const updateTooltip = (entry: TInstalled, newer?: TEntry): string => {
        const blocked = updateBlocked(entry)
        if (blocked) return blocked
        if (newer) return `Update to v${newer.version}`
        if (loadingManifest) return 'Checking the catalog for a newer version…'
        if (!grouped[d.keyOf(entry)]?.length) return 'Not in any catalog — there is nothing to update from'
        return entry.version ? `Up to date (v${entry.version})` : 'No version information — cannot tell if there is an update'
    }

    const matches = (entry: TInstalled | TEntry, filter: string) => {
        if (!filter) return true
        const f = filter.toLowerCase()
        return d.keyOf(entry).toLowerCase().includes(f) || d.toModel(entry).name.toLowerCase().includes(f)
    }

    // ── install / uninstall ─────────────────────────────────────────────────────
    /*
        `replaced` is what was installed before, when this is an UPDATE and not an installation.

        It is needed for the restart notice: `requiresRestart` has to be looked at on BOTH. If the
        version going away brought its express router, that router is still mounted even though the new
        one no longer declares any —hooking them up and unhooking them only happens at startup— and
        asking only the new one would wave through an update that leaves half of the old extension alive.
    */
    const afterInstall = async (meta: TInstalled, replaced?: TInstalled) => {
        await loadInstalled()
        d.onInstalled?.(meta)
        if (meta.requiresRestart || replaced?.requiresRestart)
            props.onRestartRequired?.(d.keyOf(meta), replaced ? ERestartAction.UPDATE : ERestartAction.INSTALL)
    }

    const postInstall = async (body: Record<string, unknown>): Promise<TInstalled> => {
        const res = await fetch(`${backendUrl}${d.endpoints.install}`, addPostAuthorization(accessString, JSON.stringify(body)))
        if (!res.ok) {
            const detail = await res.json().catch(() => ({}))
            throw new Error(detail?.error ?? `HTTP ${res.status}`)
        }
        return await res.json()
    }

    /*
        Installing and updating are the SAME operation, which is why there are not two paths: the back
        end replaces index, code and loaded module, and the only thing that changes is that permission
        has to be asked with `upgrade` in order to overwrite what is already there. Doing it with
        uninstall + install, which is what used to be required, takes the extension's configuration away.
    */
    const installFromCatalog = async (entry: TEntry, replaced?: TInstalled) => {
        const key = d.keyOf(entry)
        setError(undefined)
        if (replaced) setUpdatingKey(key)
        else setInstallingKey(key)
        try {
            const body = { url: entry.url, marketplaceId: entry.marketplaceId, marketplaceLabel: entry.marketplaceLabel ?? PUBLIC_MARKETPLACE_LABEL, upgrade: Boolean(replaced) }
            await afterInstall(await postInstall(body), replaced)
        }
        catch (err) { setError(`Failed to ${replaced ? 'update' : 'install'} ${d.toModel(entry).name}: ${err}`) }
        finally {
            setUpdatingKey(undefined)
            setInstallingKey(undefined)
        }
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
            // Removing it is not immediate either: what is hooked in at startup stays mounted until a restart.
            if (entry.requiresRestart) props.onRestartRequired?.(key, ERestartAction.UNINSTALL)
        }
        catch (err) { setError(`Failed to uninstall ${d.toModel(entry).name}: ${err}`) }
        finally { setUninstallingKey(undefined) }
    }

    // ── chips and actions per section ──────────────────────────────────────────
    const TypeIcon = d.icon

    const chipIcon = (icon?: EChipIcon): React.ReactElement | undefined => {
        switch (icon) {
            case EChipIcon.ACTIVE: return <CheckCircle />
            case EChipIcon.FILE: return <FolderOpen />
            case EChipIcon.TYPE: return <TypeIcon />
            default: return undefined
        }
    }

    const renderChip = (chip: IExtensionChip, key: string): React.ReactNode => {
        const el = <Chip key={key} label={chip.label} size='small' color={chip.color ?? 'default'}
            variant={chip.variant ?? 'filled'} icon={chipIcon(chip.icon)} sx={compactChip} />
        return chip.tooltip ? <Tooltip key={key} title={chip.tooltip}>{el}</Tooltip> : el
    }

    /*
        WHERE what is installed came from. The generic one puts it there for all eleven types: it was
        copied dialog by dialog —same table, same colours— and the only thing that changed was the
        'Kwirth' chip's icon, which is the type's own icon.

        A bare URL deliberately paints nothing: the truncated address filled the row without saying much,
        and the provenance icon's tooltip already gives it (MarketplaceSourceIcon).
    */
    const sourceChip = (installedFrom?: string): IExtensionChip | undefined => {
        if (!installedFrom) return undefined
        if (installedFrom === 'dev') return { label: 'dev', variant: 'outlined', color: 'warning' }
        if (installedFrom === 'bundled') return { label: 'bundled', variant: 'outlined' }
        if (installedFrom === 'local') return { label: 'Local file', variant: 'outlined', icon: EChipIcon.FILE }
        if (installedFrom.startsWith('pack:')) return { label: 'via pack', variant: 'outlined', color: 'secondary', tooltip: `Installed by pack '${installedFrom.slice(5)}'` }
        if (installedFrom.includes('github.com/kwirthmagnify')) return { label: 'Kwirth', variant: 'outlined', color: 'primary', icon: EChipIcon.TYPE }
        return undefined
    }

    /*
        The chips are split into two groups (see IExtensionViewProps): on the left WHERE it came from, on
        the right HOW it is. The status —'3 configs', 'enabled', 'active', 'installed'— travels right
        next to the buttons because it is what gets looked at just before pressing them.
    */
    const originChips = (entry: TInstalled): React.ReactNode[] => {
        const src = sourceChip(d.toModel(entry).installedFrom)
        return src ? [renderChip(src, 'src')] : []
    }

    const installedStatusChips = (entry: TInstalled): React.ReactNode[] => {
        const chips = [...(d.extraChips?.(entry, EManagerSection.INSTALLED) ?? [])]
        const n = d.configCount?.(entry)
        if (n !== undefined && n > 0) chips.push({ label: `${n} config${n > 1 ? 's' : ''}`, color: 'primary', variant: 'outlined' })
        return chips.map((c, i) => renderChip(c, `status-${i}`))
    }

    const availableStatusChips = (key: string, entry: TEntry): React.ReactNode[] => {
        const chips = [...(d.extraChips?.(entry, EManagerSection.AVAILABLE) ?? [])]
        // What it needs and what it takes advantage of, with the detail in the tooltip: the list does not
        // fit on the card, but without the number there is no way to know an extension drags others along.
        if (entry.requires?.length) chips.push({ label: `Requires ${entry.requires.length}`, variant: 'outlined', tooltip: `Requires: ${dependencyList(entry.requires)}` })
        if (entry.uses?.length) chips.push({ label: `Uses ${entry.uses.length}`, variant: 'outlined', tooltip: `Uses: ${dependencyList(entry.uses)}` })
        if (isDevInstalled(key)) chips.push({ label: 'dev active', variant: 'outlined', color: 'warning' })
        else if (isInstalled(key)) chips.push({ label: 'installed', color: 'success', icon: EChipIcon.ACTIVE })
        return chips.map((c, i) => renderChip(c, `status-${i}`))
    }

    const installedActions = (entry: TInstalled): IExtensionAction[] => {
        const actions = [...(d.actions?.(entry, EManagerSection.INSTALLED) ?? [])]
        if (d.renderConfigDialog) {
            // Visible and disabled with the reason, never hidden: an extension with no configuration has
            // to SAY it has none, not leave the gap where everybody else's gear would be.
            const verdict = d.canConfigure?.(entry) ?? { allowed: true }
            actions.push({
                icon: <Settings fontSize='small' />,
                tooltip: verdict.allowed ? 'Configure' : (verdict.reason ?? 'No configuration available'),
                disabled: !verdict.allowed,
                onClick: () => setConfiguring(entry)
            })
        }
        const key = d.keyOf(entry)
        const newer = updateFor(entry)
        /*
            Always visible and disabled with the reason, like the configure one: showing up only when
            there is a new version, the buttons would dance about between rows and the bin would end up
            exactly where the row above's update was.
        */
        actions.push({
            icon: updatingKey === key ? <CircularProgress size={16} /> : <Upgrade fontSize='small' />,
            tooltip: updateTooltip(entry, newer),
            disabled: !newer || updatingKey === key,
            color: 'primary',
            onClick: () => { if (newer) installFromCatalog(newer, entry) }
        })

        const verdict = d.canUninstall(entry)
        actions.push({
            icon: uninstallingKey === key ? <CircularProgress size={16} /> : <Delete fontSize='small' />,
            tooltip: verdict.allowed ? (d.uninstallTooltip ?? 'Uninstall') : (verdict.reason ?? 'Cannot be uninstalled'),
            disabled: !verdict.allowed || uninstallingKey === key,
            color: 'error',
            onClick: () => uninstall(entry)
        })
        return actions
    }

    const availableActions = (key: string, entry: TEntry): IExtensionAction[] => {
        const blocked = requirementsBlocking(entry) ?? d.installBlockedReason?.(entry)
        const current = installedByKey.get(key)
        /*
            Updating also happens from here, and to a SPECIFIC version at that —the dropdown's— whereas
            the button in the installed section always goes to the newest. Not backwards: going back to
            an earlier version leaves the index saying one thing and the configuration meant for another.
        */
        const isUpgrade = Boolean(current && !updateBlocked(current)
            && current.version && entry.version && versionGreaterThan(entry.version, current.version))
        const already = Boolean(current) && !isUpgrade
        const busy = installingKey === key || updatingKey === key
        return [
            ...(d.actions?.(entry, EManagerSection.AVAILABLE) ?? []),
            {
                icon: busy ? <CircularProgress size={16} /> : isUpgrade ? <Upgrade fontSize='small' /> : <Download fontSize='small' />,
                // ⚠️ A DEV extension cannot be told to "uninstall first": it is not uninstalled, it is
                // removed from kwirth-dev.json. The generic advice sent the user to press a bin that is
                // disabled. ThemeManagerDialog carried this and the generic dialog inherits it on migration.
                tooltip: isDevInstalled(key) ? 'A dev version is already loaded'
                    : isUpgrade ? `Update to v${entry.version}`
                        : already ? (updateBlocked(current!)
                            ?? `Already installed (v${current?.version ?? '?'}) — pick a newer version to update`)
                            : blocked ?? 'Install',
                disabled: already || !!blocked || busy,
                color: 'primary',
                onClick: () => installFromCatalog(entry, isUpgrade ? current : undefined)
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

    // Alphabetical by the name the card paints, so an update (reload of the list) keeps every card in place.
    const byName = (a: TInstalled | TEntry, b: TInstalled | TEntry) => d.toModel(a).name.localeCompare(d.toModel(b).name, undefined, { sensitivity: 'base' })
    const shownInstalled = installed.filter(e => matches(e, installedFilter)).sort(byName)
    const shownKeys = Object.keys(grouped).filter(k => matches(grouped[k][0], availableFilter)).sort((a, b) => byName(grouped[a][0], grouped[b][0]))

    return (<>
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '72vw', maxWidth: '72vw', height: '80vh' } }}>
            {d.helpSection
                ? <DialogTitleHelp section={d.helpSection} docsUrl={docsUrl(backendUrl, 'core', 'kwirth')}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><TypeIcon fontSize='small' />{d.title}</Box>
                  </DialogTitleHelp>
                : <DialogTitle><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><TypeIcon fontSize='small' />{d.title}</Box></DialogTitle>
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
                                    <ExtensionCard key={d.keyOf(entry)} model={d.toModel(entry)} fallbackIcon={<TypeIcon fontSize='small' />}
                                        chips={originChips(entry)} statusChips={installedStatusChips(entry)} inlineControl={pluginControl(entry)}
                                        actions={installedActions(entry)} />
                                ))}
                              </Box>
                            : <Box sx={listGridSx}>
                                {shownInstalled.flatMap((entry, i, arr) => {
                                    const key = d.keyOf(entry)
                                    return [
                                        ...extensionRowCells(key, { model: d.toModel(entry), fallbackIcon: <TypeIcon fontSize='small' />, chips: originChips(entry), statusChips: installedStatusChips(entry), inlineControl: pluginControl(entry), actions: installedActions(entry) }),
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
                                <IconButton size='small' aria-label='Install from URL' color='primary' disabled={installingCustom || !customUrl.trim()} onClick={installFromUrl}>
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
                                <IconButton size='small' aria-label='Refresh catalog' sx={{ width: 30, height: 30 }} onClick={() => fetchManifest(true)} disabled={loadingManifest}>
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
                                        <ExtensionCard key={key} model={d.toModel(entry)} fallbackIcon={<TypeIcon fontSize='small' />}
                                            versions={grouped[key].map(e => e.version ?? '')}
                                            onVersionChange={v => setSelectedVersions(prev => ({ ...prev, [key]: v }))}
                                            statusChips={availableStatusChips(key, entry)} actions={availableActions(key, entry)} />
                                    )
                                })}
                              </Box>
                            : <Box sx={listGridSx}>
                                {shownKeys.flatMap((key, i, arr) => {
                                    const entry = selectedEntry(key)
                                    return [
                                        ...extensionRowCells(key, {
                                            model: d.toModel(entry), fallbackIcon: <TypeIcon fontSize='small' />,
                                            versions: grouped[key].map(e => e.version ?? ''),
                                            onVersionChange: v => setSelectedVersions(prev => ({ ...prev, [key]: v })),
                                            statusChips: availableStatusChips(key, entry), actions: availableActions(key, entry)
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
                <Button variant='outlined' onClick={props.onClose}>CLOSE</Button>
            </DialogActions>
        </Dialog>

        {/* El diálogo de configuracion es del TIPO, no del generico: siete tipos lo resuelven de siete
            maneras distintas (JSON libre, schema, CRUD con nombre, localStorage…). Va como hermano y no
            anidado dentro del Dialog principal. */}
        {configuring && d.renderConfigDialog?.(configuring, () => { setConfiguring(undefined); loadInstalled() })}
    </>)
}

export { ExtensionManagerDialog }
