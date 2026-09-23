import React, { useContext, useEffect, useRef, useState } from 'react'
import { Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, MenuItem, Select, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { CheckCircle, Delete, Download, FolderOpen, Refresh, Settings, ViewList } from '@kwirthmagnify/kwirth-common-front/icons'
import { Upgrade, ViewModule } from '../../icons'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { versionGreaterThan } from '@kwirthmagnify/kwirth-common'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization } from '../../tools/AuthorizationManagement'
import { MarketplaceBadge, compactChip, PUBLIC_MARKETPLACE_LABEL } from './MarketplaceBadge'
import { ERestartAction } from './extensionRestart'
import { useKeyboard } from '../../tools/useKeyboard'
import { EChipIcon, EManagerSection, IExtensionAction, IExtensionChip, IExtensionManagerDescriptor, IExtensionRequirement } from './extensionManagerModel'
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
    /*
        Opcional porque no todo lo instalado la tiene: un conector de IdP bundled viene dentro de Kwirth y
        no lleva version propia. En el CATALOGO siempre esta — es lo que se elige en el desplegable.
    */
    version?: string
    url?: string
    marketplaceId?: string
    marketplaceLabel?: string
    requiresRestart?: boolean
    /*
        Dependencias entre extensiones, tal y como vienen en el manifest. Las puede declarar CUALQUIER
        tipo —aunque hasta ahora solo las miraban plugins y providers, cada uno con su copia—, asi que las
        entiende el generico: `requires` bloquea instalar si falta, `uses` solo se informa.
    */
    requires?: IExtensionRequirement[]
    uses?: IExtensionRequirement[]
}

interface IExtensionManagerDialogProps<TInstalled extends IMinimalEntry, TEntry extends IMinimalEntry> {
    descriptor: IExtensionManagerDescriptor<TInstalled, TEntry>
    onClose: () => void
    onRestartRequired?: (extension: string, action: ERestartAction) => void
}

/** Lo minimo para juzgar un requisito: que hay instalado de ese tipo y con que version. */
interface IVersionedRef {
    id: string
    version: string
}

/** Un plugin instalado, que es lo que ofrece el selector de plugins. */
interface IInstalledPluginRef {
    id: string
    displayName?: string
}

/*
    El selector de plugins de una entrada (ver IPluginSelectorSpec).

    ⚠️ Vive FUERA del diálogo a proposito. Definido dentro, cada render crearia un tipo de componente nuevo
    y React lo desmontaria y volveria a montar: el desplegable se cerraria solo al escribir en el filtro.
*/
const PluginMultiSelect: React.FC<{
    plugins: IInstalledPluginRef[]
    selected: string[]
    tooltip: string
    emptyLabel: string
    error?: string
    onChange: (pluginIds: string[]) => void
}> = ({ plugins, selected, tooltip, emptyLabel, error, onChange }) => {
    // Mientras el desplegable esta abierto NO hay tooltip: se pinta encima de la lista y tapa las primeras
    // opciones. Con el titulo vacio, MUI no lo muestra — mas simple que controlarlo con `open`.
    const [abierto, setAbierto] = useState(false)
    // Con varios seleccionados el valor no cabe, asi que el tooltip lo lleva entero: el desplegable es de
    // ancho FIJO y lo que sobra se recorta.
    const titulo = error || (selected.length > 0 ? <><b>{selected.join(', ')}</b><br />{tooltip}</> : tooltip)
    return (
    <Tooltip title={abierto ? '' : titulo} disableInteractive>
        <Select multiple size='small' displayEmpty value={selected} error={Boolean(error)}
            onOpen={() => setAbierto(true)} onClose={() => setAbierto(false)}
            onChange={e => onChange(e.target.value as string[])}
            // El texto de vacio se pinta, no se deja en blanco: "no lo usa nadie" es el estado por
            // defecto y es justo lo que explica que una extension recien instalada "no haga nada".
            renderValue={sel => (sel as string[]).length === 0
                ? <em style={{ fontSize: '0.7rem', opacity: 0.5 }}>{emptyLabel}</em>
                : (sel as string[]).join(', ')}
            // ⚠️ Ancho FIJO, no minWidth: con minWidth el desplegable crece con cada plugin concedido y
            // descuadra la tarjeta — y las tarjetas de una rejilla no cambian de tamaño por su contenido.
            sx={{
                // flexShrink 0: sin el, encoge cuando el chip vecino es mas ancho ('12 tools' vs '3 tools')
                // y las tarjetas dejan de alinear entre si.
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

    // Selector de plugins: la lista de plugins se pide UNA vez para todo el diálogo, no una por tarjeta.
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
                Los datos del TIPO se cargan ANTES de pintar lo instalado, no despues.

                Al reves se veia un parpadeo: el primer render llegaba con esos datos todavia vacios —en
                IdP, todos los conectores como 'not configured'— y un segundo render los corregia unos
                milisegundos despues. Pintando lo instalado al final, el chip sale bien a la primera.

                No se deja que un fallo aqui tumbe la lista: sin los datos del tipo se pinta igual, con
                los chips en su estado por defecto.
            */
            if (d.loadExtraData) await d.loadExtraData().catch(() => undefined)
            setInstalled(d.filterInstalled ? data.filter(d.filterInstalled) : data)
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
        Lo instalado de OTROS tipos, para poder decir si se cumplen los requisitos de una entrada del
        catalogo. Solo se pide lo que haga falta: si nada declara requisitos, no se pide nada.
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

    /** Un requisito se cumple si esta instalado y con version suficiente. */
    const requirementMet = (req: IExtensionRequirement): boolean => {
        const lista: IVersionedRef[] = req.extensionType === d.extensionType
            ? installed.filter(e => e.version).map(e => ({ id: d.keyOf(e), version: e.version! }))
            : (crossInstalled[req.extensionType] ?? [])
        const encontrado = lista.find(x => x.id === req.id)
        return Boolean(encontrado) && (encontrado!.version === req.minVersion || versionGreaterThan(encontrado!.version, req.minVersion))
    }

    /** Las dependencias en texto, para los tooltips: 'plugin log ≥0.5.0, sender email ≥0.1.0'. */
    const dependencyList = (deps: IExtensionRequirement[]): string =>
        deps.map(r => `${r.extensionType} ${r.id} ≥${r.minVersion}`).join(', ')

    /** Lo que falta para poder instalar esa entrada, ya redactado para el tooltip. */
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
            // Se deshace: dejar la UI diciendo que esta guardado cuando el back no lo guardo es peor que
            // el propio fallo — quien lo cambio se iria creyendo que el cambio esta puesto.
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

    // ── catalogo agrupado por clave, versiones de mas nueva a mas vieja ─────────
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
        Por que algo instalado NO se actualiza desde el catalogo, ya redactado para el tooltip.

        Son las dos procedencias que no las sirve un marketplace: lo de dev se cambia en kwirth-dev.json y
        lo bundled viaja dentro de Kwirth. El back las rechaza igual —no sabe su version—, asi que esto no
        es la defensa, es poder decir el motivo en vez de dejar un boton muerto.
    */
    const notUpdatableReason = (installedFrom?: string): string | undefined => {
        switch (installedFrom) {
            case 'dev': return 'A dev version is loaded — change it in kwirth-dev.json'
            case 'bundled': return 'Bundled with Kwirth — it is updated with Kwirth itself'
            default: return undefined
        }
    }

    /*
        La actualizacion disponible para algo instalado, si la hay.

        El dato ya estaba aqui: el catalogo viene agrupado por clave y con las versiones ordenadas de mas
        nueva a mas vieja, asi que basta comparar la primera con la instalada. No hace falta preguntarle
        nada al back ni reaprovechar el aviso del arranque.
    */
    const updateFor = (entry: TInstalled): TEntry | undefined => {
        if (updateBlocked(entry)) return undefined
        const group = grouped[d.keyOf(entry)]
        if (!group?.length || !entry.version) return undefined
        const newest = group[0]
        return newest.version && versionGreaterThan(newest.version, entry.version) ? newest : undefined
    }

    /** Por que no se puede actualizar algo instalado: su procedencia, o lo que diga su tipo. */
    const updateBlocked = (entry: TInstalled): string | undefined =>
        notUpdatableReason(d.toModel(entry).installedFrom) ?? d.updateBlockedReason?.(entry)

    /*
        El tooltip del boton de update, que es lo unico que se ve cuando esta deshabilitado —que es casi
        siempre—. Un 'Up to date' cuando lo que pasa es que el catalogo aun no ha cargado, o que la
        extension no esta en ninguno, seria mentira: son tres situaciones distintas y cada una lo dice.
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

    // ── instalar / desinstalar ──────────────────────────────────────────────────
    /*
        `replaced` es lo que habia instalado antes, cuando esto es una ACTUALIZACION y no una instalacion.

        Se necesita por el aviso de reinicio: hay que mirar `requiresRestart` en las DOS. Si la version
        que se va traia su router de express, ese router sigue montado aunque la nueva ya no declare
        ninguno —engancharlos y desengancharlos solo pasa al arrancar—, y preguntarselo solo a la nueva
        daria por buena una actualizacion que deja media extension vieja viva.
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
        Instalar y actualizar son la MISMA operacion, y por eso no hay dos caminos: el back reemplaza
        indice, codigo y modulo cargado, y lo unico que cambia es que hay que pedirle permiso con
        `upgrade` para pisar lo que ya esta. Hacerlo con desinstalar + instalar, que es lo que tocaba
        antes, se lleva por delante la configuracion de la extension.
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
            // Quitarla tampoco es inmediato: lo que se engancha al arrancar sigue montado hasta reiniciar.
            if (entry.requiresRestart) props.onRestartRequired?.(key, ERestartAction.UNINSTALL)
        }
        catch (err) { setError(`Failed to uninstall ${d.toModel(entry).name}: ${err}`) }
        finally { setUninstallingKey(undefined) }
    }

    // ── chips y acciones por seccion ────────────────────────────────────────────
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
        DE DONDE vino lo instalado. Lo pone el generico para los once tipos: estaba copiado diálogo a
        diálogo —misma tabla, mismos colores— y lo unico que cambiaba era el icono del chip 'Kwirth', que
        es el icono del propio tipo.

        Una URL suelta no pinta nada a proposito: la direccion recortada llenaba la fila sin decir gran
        cosa, y ya la da el tooltip del icono de procedencia (MarketplaceSourceIcon).
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
        Los chips se reparten en dos grupos (ver IExtensionViewProps): a la izquierda DE DONDE vino, a la
        derecha COMO esta. El estado —'3 configs', 'enabled', 'active', 'installed'— viaja pegado a los
        botones porque es lo que se mira justo antes de pulsarlos.
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
        // Que necesita y que aprovecha, con el detalle en el tooltip: en la tarjeta no cabe la lista, pero
        // sin el numero no hay forma de saber que una extension arrastra a otras.
        if (entry.requires?.length) chips.push({ label: `Requires ${entry.requires.length}`, variant: 'outlined', tooltip: `Requires: ${dependencyList(entry.requires)}` })
        if (entry.uses?.length) chips.push({ label: `Uses ${entry.uses.length}`, variant: 'outlined', tooltip: `Uses: ${dependencyList(entry.uses)}` })
        if (isDevInstalled(key)) chips.push({ label: 'dev active', variant: 'outlined', color: 'warning' })
        else if (isInstalled(key)) chips.push({ label: 'installed', color: 'success', icon: EChipIcon.ACTIVE })
        return chips.map((c, i) => renderChip(c, `status-${i}`))
    }

    const installedActions = (entry: TInstalled): IExtensionAction[] => {
        const actions = [...(d.actions?.(entry, EManagerSection.INSTALLED) ?? [])]
        if (d.renderConfigDialog) {
            // Visible y deshabilitado con el motivo, nunca escondido: una extension sin configuracion
            // tiene que DECIR que no la tiene, no dejar el hueco donde estaria la rueda de las demas.
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
            Visible siempre y deshabilitado con el motivo, como el de configurar: apareciendo solo cuando
            hay version nueva, los botones bailarian de sitio entre filas y la papelera acabaria justo
            donde estaba el update de la fila de arriba.
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
            Desde aqui tambien se actualiza, y ademas a una version CONCRETA —la del desplegable—, mientras
            que el boton de la seccion de instaladas va siempre a la mas nueva. Hacia atras no: volver a
            una version anterior deja el indice diciendo una cosa y la configuracion pensada para otra.
        */
        const isUpgrade = Boolean(current && !updateBlocked(current)
            && current.version && entry.version && versionGreaterThan(entry.version, current.version))
        const already = Boolean(current) && !isUpgrade
        const busy = installingKey === key || updatingKey === key
        return [
            ...(d.actions?.(entry, EManagerSection.AVAILABLE) ?? []),
            {
                icon: busy ? <CircularProgress size={16} /> : isUpgrade ? <Upgrade fontSize='small' /> : <Download fontSize='small' />,
                // ⚠️ A una extension de DEV no se le puede decir "desinstala primero": no se desinstala,
                // se quita de kwirth-dev.json. El consejo generico mandaba al usuario a pulsar una papelera
                // que esta deshabilitada. Lo traia ThemeManagerDialog y lo hereda el generico al migrarlo.
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

    const shownInstalled = installed.filter(e => matches(e, installedFilter))
    const shownKeys = Object.keys(grouped).filter(k => matches(grouped[k][0], availableFilter))

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
