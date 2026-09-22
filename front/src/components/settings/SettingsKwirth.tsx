import React, { useState, useEffect, useContext } from 'react'
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, IconButton, InputAdornment, InputLabel, MenuItem, Select, Stack, Tab, Tabs, TextField, Tooltip, Typography } from '@mui/material'
import { Add, Delete, Download, Refresh, Upload, Visibility, VisibilityOff } from '@kwirthmagnify/kwirth-common-front/icons'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { IKwirthSettings, IMarketplace, IPackageRegistry, EPackageRegistryAuthType, EManifestAuthType, EExtensionType,
    IConfigBundle, IExportableEntry, IImportPreviewEntry, IImportReport, EBundleEntryStatus,
    CONFIG_BUNDLE_KIND, CORE_SETTINGS_KEY, CORE_SHARED_AI_KEY, bundleEntryKey } from '@kwirthmagnify/kwirth-common'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addGetAuthorization, addPostAuthorization, addPutAuthorization } from '../../tools/AuthorizationManagement'

// Enum semantico como id de tab (regla: nunca numeros)
enum ESettingsKwirthTab {
    GENERAL = 'general',
    MARKETPLACES = 'marketplaces',
    REGISTRIES = 'registries'
}

// Fila editable: IMarketplace tal cual (el token ya viaja dentro de manifestAuth) mas el estado que solo
// vive en la pantalla.
interface IMarketplaceRow extends IMarketplace {
    tokenRevealed?: boolean
    testing?: boolean
    testResult?: string
}

interface IPackageRegistryRow extends IPackageRegistry {
    revealed?: boolean
}

// Formato del fichero de export/import. 'version' permite evolucionarlo sin romper ficheros antiguos, y
// 'credentialsIncluded' dice si los tokens/contraseñas viajan dentro o se vaciaron al exportar.
interface IKwirthSettingsExportFile {
    kwirth: string
    version: number
    credentialsIncluded: boolean
    settings: IKwirthSettings
}

const EXPORT_KIND = 'kwirth-settings'
const EXPORT_VERSION = 1

// Un item de la lista de export/import. La clave lleva el tipo delante para que un marketplace y un
// registro con el mismo id no se pisen en el mismo Set.
interface ISelectableItem {
    key: string
    label: string
    detail: string
    /** Bloque en el que se agrupa. Los ajustes del core van juntos; las extensiones, por tipo. */
    group: string
}

const GROUP_GENERAL = 'General'

// Nombre de bloque por tipo de extension. En plural, que es como se llaman en el resto de la UI.
const groupOf = (type: EExtensionType): string => {
    switch (type) {
        case EExtensionType.PLUGIN: return 'Plugins'
        case EExtensionType.PROVIDER: return 'Providers'
        case EExtensionType.SENDER: return 'Senders'
        case EExtensionType.WEBHOOK: return 'Webhooks'
        case EExtensionType.IDP: return 'Identity providers'
        case EExtensionType.AITOOLSET: return 'AI toolsets'
        case EExtensionType.THEME: return 'Themes'
        case EExtensionType.HOMEPAGE: return 'Homepages'
        case EExtensionType.LOGIN: return 'Logins'
        case EExtensionType.DOCS: return 'Documentation'
        case EExtensionType.PACK: return 'Packs'
        default: return 'Extensions'
    }
}

const GENERAL_KEY = 'general'
const marketplaceKey = (id: string) => `marketplace:${id}`
const registryKey = (id: string) => `registry:${id}`

// Lo que se puede elegir de unos settings, sirvan de origen el formulario o un fichero importado.
const settingsItems = (settings: IKwirthSettings): ISelectableItem[] => [
    ...(settings.metricsInterval === undefined ? [] : [{
        key: GENERAL_KEY,
        group: GROUP_GENERAL,
        label: 'Cluster metrics read interval',
        detail: `${settings.metricsInterval} seconds`
    }]),
    ...(settings.marketplaces ?? []).map(m => ({
        key: marketplaceKey(m.id),
        group: GROUP_GENERAL,
        label: m.label.trim() === '' ? m.id : m.label,
        detail: m.url
    })),
    ...(settings.packageRegistries ?? []).map(r => ({
        key: registryKey(r.id),
        group: GROUP_GENERAL,
        label: r.label.trim() === '' ? r.id : r.label,
        detail: r.url
    }))
]

interface ISettingsKwirthProps {
    onClose:(settings?:IKwirthSettings) => void
    clusterName?: string
    clusterUrl: string
    accessString: string
}

const SettingsKwirth: React.FC<ISettingsKwirthProps> = (props:ISettingsKwirthProps) => {
    const [tab, setTab] = useState<ESettingsKwirthTab>(ESettingsKwirthTab.GENERAL)
    const [metricsInterval, setMetricsInterval] = useState<number>(0)
    const [previousLogLines, setPreviousLogLines] = useState<number>(0)
    const [marketplaces, setMarketplaces] = useState<IMarketplaceRow[]>([])
    const [registries, setRegistries] = useState<IPackageRegistryRow[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [exportOpen, setExportOpen] = useState(false)
    const [exportSelected, setExportSelected] = useState<Set<string>>(new Set())
    const [exportWithCredentials, setExportWithCredentials] = useState(false)
    const [importData, setImportData] = useState<IKwirthSettingsExportFile|undefined>(undefined)
    const [importSelected, setImportSelected] = useState<Set<string>>(new Set())
    const [importResult, setImportResult] = useState<string|undefined>(undefined)
    /*
        Lo que aportan las EXTENSIONES. El core no sabe que hay dentro de cada una —solo ellas saben que
        de lo suyo es configuracion—, asi que aqui solo se listan y se marcan; el contenido lo pide y lo
        entrega el back. Ver `plans/config-portability/PRD.md`.
    */
    const [extensions, setExtensions] = useState<IExportableEntry[]>([])
    const [importBundle, setImportBundle] = useState<IConfigBundle|undefined>(undefined)
    const [importPreview, setImportPreview] = useState<IImportPreviewEntry[]>([])
    /*
        Las extensiones marcadas al importar NO se aplican al cerrar el dialogo de import: quedan aqui y
        se aplican al pulsar OK, con los ajustes. Este dialogo promete desde siempre que nada se guarda
        hasta OK, y el bundle no es excusa para romperla a medias.
    */
    const [pendingExtensions, setPendingExtensions] = useState<string[]>([])
    const importFileRef = React.useRef<HTMLInputElement>(null)
    const { backendUrl } = useContext(SessionContext) as SessionContextType

    // el dialogo se busca sus propios datos: pide a Kwirth los valores efectivos que rigen ahora mismo
    useEffect(() => {
        const load = async () => {
            try {
                const response = await fetch(`${props.clusterUrl}/core/settings`, addGetAuthorization(props.accessString))
                if (!response.ok) {
                    setError(response.status === 403 ? 'You need the admin scope to manage Kwirth settings.' : `Could not read settings (${response.status}).`)
                    return
                }
                const settings = await response.json() as IKwirthSettings
                setMetricsInterval(settings.metricsInterval ?? 0)
                setPreviousLogLines(settings.previousLogLines ?? 0)
                setMarketplaces((settings.marketplaces ?? []).map(m => ({ ...m })))
                setRegistries((settings.packageRegistries ?? []).map(r => ({ ...r })))

                // Que extensiones pueden aportar configuracion. Si esto falla no se rompe la pantalla:
                // los ajustes se siguen pudiendo editar y exportar, solo que sin la parte de extensiones.
                const ext = await fetch(`${props.clusterUrl}/core/config-bundle/exportable`, addGetAuthorization(props.accessString))
                if (ext.ok) setExtensions(await ext.json() as IExportableEntry[])
            }
            catch {
                setError('Could not reach Kwirth to read its settings.')
            }
            finally {
                setLoading(false)
            }
        }
        load()
    }, [props.clusterUrl, props.accessString])

    const patchRow = (index: number, patch: Partial<IMarketplaceRow>) => {
        setMarketplaces(prev => prev.map((m, i) => i === index ? { ...m, ...patch } : m))
    }

    // manifestAuth es un objeto anidado: hay que reconstruirlo entero para no perder el resto de campos
    // (el token entre ellos) al tocar uno solo.
    const patchManifestAuth = (index: number, patch: Partial<IMarketplace['manifestAuth']>) => {
        const current = marketplaces[index].manifestAuth
        patchRow(index, { manifestAuth: { type: current?.type ?? EManifestAuthType.NONE, ...current, ...patch } })
    }

    // El ojo solo alterna entre puntos y texto: el valor guardado ya esta en el campo desde el GET.
    const toggleToken = (index: number) => patchRow(index, { tokenRevealed: !marketplaces[index].tokenRevealed })

    const addRow = () => {
        setMarketplaces(prev => [...prev, { id: `marketplace-${Date.now()}`, url: '', label: '', enabled: true }])
    }

    const patchRegistry = (index: number, patch: Partial<IPackageRegistryRow>) => {
        setRegistries(prev => prev.map((r, i) => i === index ? { ...r, ...patch } : r))
    }

    const patchRegistryAuth = (index: number, patch: Partial<IPackageRegistry['auth']>) => {
        const current = registries[index].auth
        patchRegistry(index, { auth: { type: current?.type ?? EPackageRegistryAuthType.NONE, ...current, ...patch } })
    }

    const addRegistry = () => {
        setRegistries(prev => [...prev, {
            id: `registry-${Date.now()}`,
            url: '',
            label: '',
            enabled: true,
            auth: { type: EPackageRegistryAuthType.NONE }
        }])
    }

    // La prueba la hace el BACK: si el manifest esta detras de un token privado, el navegador no puede
    // leerlo. Comprueba la lectura del manifest y su token; la contraseña del registro de paquetes no se
    // valida aqui, porque solo entra en juego al descargar un paquete.
    const testRow = async (index: number) => {
        const row = marketplaces[index]
        patchRow(index, { testing: true, testResult: undefined })
        try {
            const payload = JSON.stringify({
                marketplace: { id: row.id, url: row.url.trim(), label: row.label, enabled: row.enabled, ...(row.manifestAuth ? { manifestAuth: { type: row.manifestAuth.type } } : {}) },
                ...(row.manifestAuth?.token ? { token: row.manifestAuth.token } : {})
            })
            const response = await fetch(`${props.clusterUrl}/core/marketplace/test`, addPostAuthorization(props.accessString, payload))
            if (!response.ok) {
                patchRow(index, { testing: false, testResult: `Test failed (HTTP ${response.status})` })
                return
            }
            const result = await response.json() as { ok: boolean, entries?: number, extensionTypes?: string[], error?: string }
            patchRow(index, {
                testing: false,
                testResult: result.ok
                    ? `Manifest OK, ${result.entries} entries${result.extensionTypes?.length ? ` (${result.extensionTypes.join(', ')})` : ''}`
                    : result.error ?? 'Manifest could not be read'
            })
        }
        catch {
            patchRow(index, { testing: false, testResult: 'Could not reach Kwirth to run the test' })
        }
    }

    const rowsValid = () =>
        marketplaces.every(m => /^https?:\/\/.+/i.test(m.url) && m.label.trim() !== '') &&
        registries.every(r =>
            /^https?:\/\/.+/i.test(r.url) &&
            r.label.trim() !== '' &&
            (r.auth?.type !== EPackageRegistryAuthType.BASIC || (r.auth.username ?? '').trim() !== '')
        )

    /*
        Las extensiones, como items de la lista. Se listan TODAS las instaladas, puedan exportar o no:
        quien mira esto tiene que ver su plugin y por que no entra, no encontrarse una lista corta sin
        explicacion. Las que no pueden salen sin casilla, con el motivo.
    */
    const extensionItems = (): ISelectableItem[] => extensions.map(e => ({
        key: bundleEntryKey(e.type, e.id),
        group: groupOf(e.type),
        label: e.displayName,
        detail: e.status === EBundleEntryStatus.AVAILABLE
            ? `${e.version ?? ''}${e.marketplace ? ` · ${e.marketplace}` : ''}`.trim() || 'configuration'
            : e.status === EBundleEntryStatus.NOT_SUPPORTED
                ? 'this extension cannot export its configuration yet'
                : 'not running here, so there is nothing to ask'
    }))

    const exportableExtensionKeys = (): string[] =>
        extensions.filter(e => e.status === EBundleEntryStatus.AVAILABLE).map(e => bundleEntryKey(e.type, e.id))

    // Se exporta lo que hay EN EL FORMULARIO, no lo guardado: lo que ves es lo que te llevas, incluidos los
    // cambios que aun no has aceptado. Y se exporta SOLO lo marcado, item a item.
    const doExport = async () => {
        const chosenMarketplaces = marketplaces.filter(m => exportSelected.has(marketplaceKey(m.id)))
        const chosenRegistries = registries.filter(r => exportSelected.has(registryKey(r.id)))
        const settings: IKwirthSettings = {
            ...(exportSelected.has(GENERAL_KEY) ? { metricsInterval, previousLogLines } : {}),
            marketplaces: chosenMarketplaces.map(m => ({
                id: m.id,
                url: m.url.trim(),
                label: m.label.trim(),
                enabled: m.enabled,
                ...(m.manifestAuth ? { manifestAuth: {
                    type: m.manifestAuth.type,
                    ...(m.manifestAuth.username ? { username: m.manifestAuth.username } : {}),
                    ...(exportWithCredentials && m.manifestAuth.token ? { token: m.manifestAuth.token } : {})
                } } : {})
            })),
            packageRegistries: chosenRegistries.map(r => ({
                id: r.id,
                url: r.url.trim(),
                label: r.label.trim(),
                enabled: r.enabled,
                ...(r.auth ? { auth: {
                    type: r.auth.type,
                    ...(r.auth.username ? { username: r.auth.username } : {}),
                    ...(exportWithCredentials && r.auth.token ? { token: r.auth.token } : {}),
                    ...(exportWithCredentials && r.auth.password ? { password: r.auth.password } : {})
                } } : {})
            }))
        }

        /*
            El bundle lo arma el back —es quien puede preguntarle a cada extension por lo suyo—, pero los
            AJUSTES se sustituyen por los del formulario: este dialogo siempre ha exportado lo que ves en
            pantalla, cambios sin aceptar incluidos, y eso no se pierde por pasar a un fichero mas grande.
        */
        const chosenExtensions = exportableExtensionKeys().filter(k => exportSelected.has(k))
        let bundle: IConfigBundle
        try {
            const query = `include=${encodeURIComponent(chosenExtensions.join(','))}&credentials=${exportWithCredentials}`
            const response = await fetch(`${props.clusterUrl}/core/config-bundle/export?${query}`, addGetAuthorization(props.accessString))
            if (!response.ok) {
                setError(`Could not build the configuration file (${response.status}).`)
                return
            }
            bundle = await response.json() as IConfigBundle
        }
        catch {
            setError('Could not reach Kwirth to build the configuration file.')
            return
        }

        bundle.core.settings = settings
        if (!exportSelected.has(CORE_SHARED_AI_KEY)) delete bundle.core.sharedAi

        const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = 'kwirth-config.json'
        link.click()
        URL.revokeObjectURL(link.href)
        setExportOpen(false)
    }

    // El back entiende un secreto vacio como 'borralo'. Un fichero exportado SIN credenciales no debe por
    // tanto tumbar las que ya hay: si la entrada importada no trae secreto y ya existia una con ese id, se
    // conserva el que estuviera en el formulario. Para un id nuevo no hay nada que conservar.
    const mergeMarketplace = (incoming: IMarketplace, current?: IMarketplaceRow): IMarketplaceRow => {
        const token = incoming.manifestAuth?.token ?? current?.manifestAuth?.token
        return {
            ...incoming,
            ...(incoming.manifestAuth ? { manifestAuth: { ...incoming.manifestAuth, ...(token ? { token } : {}) } } : {})
        }
    }

    const mergeRegistry = (incoming: IPackageRegistry, current?: IPackageRegistryRow): IPackageRegistryRow => {
        const token = incoming.auth?.token ?? current?.auth?.token
        const password = incoming.auth?.password ?? current?.auth?.password
        return {
            ...incoming,
            ...(incoming.auth ? { auth: { ...incoming.auth, ...(token ? { token } : {}), ...(password ? { password } : {}) } } : {})
        }
    }

    // Leer el fichero NO importa nada todavia: abre la lista para que elijas que entra. Se premarca todo.
    const openImport = async (file: File) => {
        setError(''); setImportResult(undefined)
        try {
            const parsed = JSON.parse(await file.text()) as { kwirth?: string, kind?: string }

            /*
                Dos formatos. El nuevo lleva la configuracion entera; el viejo —solo ajustes— se sigue
                aceptando, porque alguien puede tener uno guardado de antes y no hay motivo para
                invalidarselo.
            */
            if (parsed?.kind === CONFIG_BUNDLE_KIND) {
                const bundle = parsed as unknown as IConfigBundle
                // La vista previa la calcula el BACK: es quien sabe que extensiones hay aqui y cuales
                // pueden recibir lo que trae el fichero.
                const response = await fetch(`${props.clusterUrl}/core/config-bundle/preview`,
                    addPostAuthorization(props.accessString, JSON.stringify(bundle)))
                if (!response.ok) {
                    const detail = await response.json().catch(() => ({}))
                    setError(detail?.error ?? `Could not read the configuration file (${response.status}).`)
                    return
                }
                const previa = await response.json() as IImportPreviewEntry[]
                setImportBundle(bundle)
                setImportPreview(previa)
                setImportData(bundle.core.settings
                    ? { kwirth: EXPORT_KIND, version: EXPORT_VERSION, credentialsIncluded: bundle.meta.includesCredentials, settings: bundle.core.settings as IKwirthSettings }
                    : undefined)
                // Se premarca lo que se puede aplicar; lo que no, ni se puede marcar.
                setImportSelected(new Set([
                    ...(bundle.core.settings ? settingsItems(bundle.core.settings as IKwirthSettings).map(i => i.key) : []),
                    ...previa.filter(p => p.status !== EBundleEntryStatus.NOT_INSTALLED
                        && p.status !== EBundleEntryStatus.NOT_SUPPORTED
                        && p.status !== EBundleEntryStatus.NOT_INSTANTIATED)
                        .map(p => bundleEntryKey(p.type, p.id))
                ]))
                return
            }

            const legacy = parsed as unknown as IKwirthSettingsExportFile
            if (legacy?.kwirth !== EXPORT_KIND) throw new Error('not a Kwirth configuration file')
            if (!legacy.settings) throw new Error('no settings in the file')
            setImportBundle(undefined)
            setImportPreview([])
            setImportData(legacy)
            setImportSelected(new Set(settingsItems(legacy.settings).map(i => i.key)))
        }
        catch (err) {
            setError(`Invalid configuration file: ${err instanceof Error ? err.message : err}`)
        }
    }

    // Importar NO guarda: deja el formulario cargado para que lo revises y decidas con OK o Cancel. Fusiona
    // por id —mismo id lo reemplaza, id nuevo se añade— para no perder marketplaces que el fichero no trae.
    const doImport = () => {
        /*
            Las extensiones no se aplican aqui. Se apuntan y se mandan al pulsar OK, junto con los
            ajustes: este dialogo promete que nada se guarda hasta OK, y aplicar la mitad al cerrar esta
            ventana seria romperla justo donde mas confunde.
        */
        const extensionesMarcadas = importPreview
            .map(p => bundleEntryKey(p.type, p.id))
            .filter(k => importSelected.has(k))
        setPendingExtensions(extensionesMarcadas)

        if (!importData) {
            setImportResult(extensionesMarcadas.length
                ? `${extensionesMarcadas.length} extension(s) will be configured when you press OK.`
                : 'Nothing selected.')
            setImportPreview([])
            return
        }
        const incomingMarketplaces = (importData.settings.marketplaces ?? []).filter(m => importSelected.has(marketplaceKey(m.id)))
        const incomingRegistries = (importData.settings.packageRegistries ?? []).filter(r => importSelected.has(registryKey(r.id)))

        let replaced = 0
        setMarketplaces(prev => {
            const byId = new Map(prev.map(m => [m.id, m]))
            for (const m of incomingMarketplaces) {
                if (byId.has(m.id)) replaced++
                byId.set(m.id, mergeMarketplace(m, byId.get(m.id)))
            }
            return [...byId.values()]
        })
        setRegistries(prev => {
            const byId = new Map(prev.map(r => [r.id, r]))
            for (const r of incomingRegistries) {
                if (byId.has(r.id)) replaced++
                byId.set(r.id, mergeRegistry(r, byId.get(r.id)))
            }
            return [...byId.values()]
        })
        const general = importSelected.has(GENERAL_KEY) && importData.settings.metricsInterval !== undefined
        if (general) setMetricsInterval(importData.settings.metricsInterval!)

        const parts: string[] = []
        if (general) parts.push('the metrics interval')
        if (incomingMarketplaces.length) parts.push(`${incomingMarketplaces.length} marketplace(s)`)
        if (incomingRegistries.length) parts.push(`${incomingRegistries.length} registry(ies)`)
        if (extensionesMarcadas.length) parts.push(`${extensionesMarcadas.length} extension(s)`)
        setImportResult(`Imported ${parts.length ? parts.join(', ') : 'nothing'}${replaced ? ` (${replaced} replaced)` : ''}.`
            + (importData.credentialsIncluded ? '' : ' The file carried no credentials, so the ones already set were kept.')
            + ' Nothing is saved until you press OK.')
        setImportData(undefined)
        setImportPreview([])
    }

    const ok = async () => {
        setError('')
        try {
            // se envia lo que hay en el formulario, secretos incluidos: el back los desvia a su almacen
            // cifrado. Un campo vacio significa borrar el secreto guardado, asi que se manda tal cual.
            const cleaned = marketplaces.map(m => ({
                id: m.id,
                url: m.url.trim(),
                label: m.label.trim(),
                enabled: m.enabled,
                ...(m.manifestAuth ? { manifestAuth: { type: m.manifestAuth.type, ...(m.manifestAuth.username ? { username: m.manifestAuth.username.trim() } : {}), token: m.manifestAuth.token ?? '' } } : {})
            }))
            const cleanedRegistries = registries.map(r => ({
                id: r.id,
                url: r.url.trim(),
                label: r.label.trim(),
                enabled: r.enabled,
                ...(r.auth ? { auth: {
                    type: r.auth.type,
                    ...(r.auth.username ? { username: r.auth.username.trim() } : {}),
                    ...(r.auth.type === EPackageRegistryAuthType.BEARER
                        ? { token: r.auth.token ?? '' }
                        : { password: r.auth.password ?? '' })
                } } : {})
            }))
            const payload = JSON.stringify({ metricsInterval, previousLogLines, marketplaces: cleaned, packageRegistries: cleanedRegistries })
            const response = await fetch(`${props.clusterUrl}/core/settings`, addPutAuthorization(props.accessString, payload))
            if (!response.ok) {
                const detail = await response.json().catch(() => ({}))
                setError(response.status === 403
                    ? 'You need the admin scope to manage Kwirth settings.'
                    : detail?.error ?? `Could not save settings (${response.status}).`)
                return
            }
            const guardados = await response.json() as IKwirthSettings

            /*
                Y ahora las extensiones del fichero importado. Van despues de los ajustes a proposito: si
                el PUT falla, no se toca nada mas. Una entrada que no se pueda aplicar no detiene a las
                demas —de eso se encarga el back—, y lo que quede sin aplicar se cuenta aqui en vez de
                cerrar la ventana como si todo hubiera ido bien.
            */
            if (importBundle && pendingExtensions.length > 0) {
                const payload = JSON.stringify({ bundle: importBundle, include: pendingExtensions })
                const imported = await fetch(`${props.clusterUrl}/core/config-bundle/import`, addPostAuthorization(props.accessString, payload))
                if (!imported.ok) {
                    setError(`Settings were saved, but the extensions could not be configured (${imported.status}).`)
                    return
                }
                const report = await imported.json() as IImportReport
                const fallidas = report.entries.filter(e => e.error || !e.result)
                if (fallidas.length > 0) {
                    setError(`Settings were saved. ${report.entries.length - fallidas.length} of ${report.entries.length} extension(s) configured; `
                        + fallidas.map(f => `${f.id}: ${f.error ?? f.status}`).join('; '))
                    return
                }
            }

            props.onClose(guardados)
        }
        catch {
            setError('Could not reach Kwirth to save its settings.')
        }
    }

    const marketplaceRow = (m: IMarketplaceRow, index: number) => {
        const tokenAuth = m.manifestAuth !== undefined && m.manifestAuth.type !== EManifestAuthType.NONE
        return (
            <Box key={m.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                <Stack direction='row' spacing={1} alignItems='center'>
                    <TextField value={m.label} onChange={e => patchRow(index, { label: e.target.value })} variant='standard' label='Name' sx={{ width: '25%' }} />
                    <TextField value={m.url} onChange={e => patchRow(index, { url: e.target.value })} variant='standard' label='Manifest URL' sx={{ flexGrow: 1 }} placeholder='https://…/manifest.json' />
                    <FormControlLabel control={<Checkbox checked={m.enabled} onChange={e => patchRow(index, { enabled: e.target.checked })} />} label='Enabled' />
                    <Tooltip title='Check the manifest can be read'>
                        <span><IconButton size='small' onClick={() => testRow(index)} disabled={m.testing || !/^https?:\/\/.+/i.test(m.url)}><Refresh fontSize='small' /></IconButton></span>
                    </Tooltip>
                    <Tooltip title='Remove this marketplace'>
                        <IconButton size='small' color='error' onClick={() => setMarketplaces(prev => prev.filter((_, i) => i !== index))}><Delete fontSize='small' /></IconButton>
                    </Tooltip>
                </Stack>
                <Stack direction='row' spacing={1} alignItems='center' sx={{ mt: 1 }}>
                    <FormControlLabel
                        control={<Checkbox checked={tokenAuth} onChange={e => patchManifestAuth(index, { type: e.target.checked ? EManifestAuthType.PRIVATE_TOKEN : EManifestAuthType.NONE })} />}
                        label='Manifest needs a token' />
                    <FormControl variant='standard' sx={{ width: '22%' }} disabled={!tokenAuth}>
                        <InputLabel>Header</InputLabel>
                        <Select value={m.manifestAuth?.type ?? EManifestAuthType.NONE}
                            onChange={e => patchManifestAuth(index, { type: e.target.value as EManifestAuthType })}>
                            <MenuItem value={EManifestAuthType.PRIVATE_TOKEN}>PRIVATE-TOKEN (GitLab)</MenuItem>
                            <MenuItem value={EManifestAuthType.BEARER}>Authorization: Bearer (GitHub)</MenuItem>
                            <MenuItem value={EManifestAuthType.BASIC}>Authorization: Basic (Azure DevOps)</MenuItem>
                        </Select>
                    </FormControl>
                    { /* Solo Basic necesita usuario. Azure DevOps lo ignora y solo mira el PAT, asi que se
                         puede dejar vacio; se muestra deshabilitado en los demas para no cambiar de tamaño. */ }
                    <TextField value={m.manifestAuth?.username ?? ''} onChange={e => patchManifestAuth(index, { username: e.target.value })}
                        variant='standard' label='Manifest user' sx={{ width: '18%' }}
                        disabled={!tokenAuth || m.manifestAuth?.type !== EManifestAuthType.BASIC} />
                    <TextField value={m.manifestAuth?.token ?? ''} onChange={e => patchManifestAuth(index, { token: e.target.value })}
                        variant='standard' label='Token'
                        type={m.tokenRevealed ? 'text' : 'password'} sx={{ flexGrow: 1 }} disabled={!tokenAuth}
                        slotProps={{ input: { endAdornment: (
                            <InputAdornment position='end'>
                                <IconButton size='small' onClick={() => toggleToken(index)} disabled={!tokenAuth} title={m.tokenRevealed ? 'Hide' : 'Show'}>
                                    { m.tokenRevealed ? <VisibilityOff fontSize='small' /> : <Visibility fontSize='small' /> }
                                </IconButton>
                            </InputAdornment>) } }} />
                </Stack>
                { m.testing && <Stack direction='row' spacing={1} alignItems='center' sx={{ mt: 1 }}><CircularProgress size={14} /><Typography variant='caption'>Reading manifest…</Typography></Stack> }
                { m.testResult && <Typography variant='caption' color={m.testResult.startsWith('Manifest OK') ? 'success.main' : 'error.main'}>{m.testResult}</Typography> }
            </Box>
        )
    }

    const registryRow = (r: IPackageRegistryRow, index: number) => {
        const type = r.auth?.type ?? EPackageRegistryAuthType.NONE
        const needsAuth = type !== EPackageRegistryAuthType.NONE
        const basic = type === EPackageRegistryAuthType.BASIC
        const bearer = type === EPackageRegistryAuthType.BEARER
        return (
            <Box key={r.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                <Stack direction='row' spacing={1} alignItems='center'>
                    <TextField value={r.label} onChange={e => patchRegistry(index, { label: e.target.value })} variant='standard' label='Name' sx={{ width: '25%' }} />
                    <TextField value={r.url} onChange={e => patchRegistry(index, { url: e.target.value })} variant='standard' label='Base URL' sx={{ flexGrow: 1 }} placeholder='https://…/repository/my-repo' />
                    <FormControlLabel control={<Checkbox checked={r.enabled} onChange={e => patchRegistry(index, { enabled: e.target.checked })} />} label='Enabled' />
                    <Tooltip title='Remove this registry'>
                        <IconButton size='small' color='error' onClick={() => setRegistries(prev => prev.filter((_, i) => i !== index))}><Delete fontSize='small' /></IconButton>
                    </Tooltip>
                </Stack>
                <Stack direction='row' spacing={1} alignItems='center' sx={{ mt: 1 }}>
                    <FormControlLabel
                        control={<Checkbox checked={needsAuth} onChange={e => patchRegistryAuth(index, { type: e.target.checked ? EPackageRegistryAuthType.BEARER : EPackageRegistryAuthType.NONE })} />}
                        label='Needs credentials' />
                    { /* Bearer y Basic NO son intercambiables: el endpoint npm de un Nexus con user tokens
                         acepta el token como Bearer y rechaza esa misma credencial como Basic. */ }
                    <FormControl variant='standard' sx={{ width: '22%' }} disabled={!needsAuth}>
                        <InputLabel>Auth</InputLabel>
                        <Select value={bearer || basic ? type : EPackageRegistryAuthType.BEARER}
                            onChange={e => patchRegistryAuth(index, { type: e.target.value as EPackageRegistryAuthType })}>
                            <MenuItem value={EPackageRegistryAuthType.BEARER}>Token (Bearer)</MenuItem>
                            <MenuItem value={EPackageRegistryAuthType.BASIC}>User and password (Basic)</MenuItem>
                        </Select>
                    </FormControl>
                    { /* El usuario solo aplica a Basic; se deja visible y deshabilitado para no cambiar de
                         tamaño al alternar (regla: habilitar/deshabilitar, nunca mostrar/ocultar). */ }
                    <TextField value={r.auth?.username ?? ''} onChange={e => patchRegistryAuth(index, { username: e.target.value })}
                        variant='standard' label='User' sx={{ width: '20%' }} disabled={!basic} />
                    <TextField
                        value={(bearer ? r.auth?.token : r.auth?.password) ?? ''}
                        onChange={e => patchRegistryAuth(index, bearer ? { token: e.target.value } : { password: e.target.value })}
                        variant='standard' label={bearer ? 'Token' : 'Password'}
                        type={r.revealed ? 'text' : 'password'} sx={{ flexGrow: 1 }} disabled={!needsAuth}
                        slotProps={{ input: { endAdornment: (
                            <InputAdornment position='end'>
                                <IconButton size='small' onClick={() => patchRegistry(index, { revealed: !r.revealed })} disabled={!needsAuth} title={r.revealed ? 'Hide' : 'Show'}>
                                    { r.revealed ? <VisibilityOff fontSize='small' /> : <Visibility fontSize='small' /> }
                                </IconButton>
                            </InputAdornment>) } }} />
                </Stack>
            </Box>
        )
    }

    // La misma lista marcable sirve para elegir que se exporta y que se importa. 'note' solo lo usa el
    // import, para avisar de que ese id ya existe y va a reemplazar al que hay.
    // `disabled` deja items VISIBLES pero no marcables: una extension que no puede exportar se enseña
    // con su motivo, porque una lista corta sin explicacion es peor que un hueco declarado.
    /*
        La lista de seleccion, por BLOQUES: los ajustes del core en uno, y las extensiones agrupadas por
        tipo. Plana era ilegible en cuanto pasaban de una docena — un sender, un IdP y un plugin no se
        eligen con el mismo criterio, y verlos revueltos obliga a leerse la lista entera.

        Cada bloque lleva su propia casilla, que marca o desmarca solo lo suyo. `disabled` deja items
        VISIBLES pero no marcables: una extension que no puede exportar se enseña con su motivo, porque
        una lista corta sin explicacion es peor que un hueco declarado.
    */
    const selectionList = (items: ISelectableItem[], selected: Set<string>, setSelected: (s: Set<string>) => void, note?: (item: ISelectableItem) => string|undefined, disabled?: (item: ISelectableItem) => boolean) => {
        const marcables = items.filter(i => !disabled?.(i))

        const set = (keys: string[], checked: boolean) => {
            const next = new Set(selected)
            for (const k of keys) {
                if (checked) next.add(k)
                else next.delete(k)
            }
            setSelected(next)
        }

        // Se respeta el orden en que llegan los items: el bloque general primero, y las extensiones
        // en el orden en que las devuelve el back.
        const bloques: { nombre: string, items: ISelectableItem[] }[] = []
        for (const item of items) {
            const ultimo = bloques.find(b => b.nombre === item.group)
            if (ultimo) ultimo.items.push(item)
            else bloques.push({ nombre: item.group, items: [item] })
        }

        const casilla = (keys: string[], label: React.ReactNode, size?: 'small') => {
            const marcadas = keys.filter(k => selected.has(k)).length
            return <FormControlLabel label={label} control={<Checkbox size={size}
                checked={marcadas === keys.length && keys.length > 0}
                indeterminate={marcadas > 0 && marcadas < keys.length}
                onChange={(_e, checked) => set(keys, checked)} />} />
        }

        return (<>
            { casilla(marcables.map(i => i.key), 'Select all') }
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 1, px: 1, py: 0.5 }}>
                { items.length === 0 && <Typography variant='body2' color='text.secondary' sx={{ py: 1 }}>Nothing to choose from.</Typography> }
                { bloques.map((bloque, indice) => (
                    <Box key={bloque.nombre} sx={{ mb: 1, ...(indice > 0 ? { borderTop: 1, borderColor: 'divider', pt: 1 } : {}) }}>
                        { casilla(bloque.items.filter(i => !disabled?.(i)).map(i => i.key),
                            <Typography variant='caption' sx={{ textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', fontWeight: 600 }}>{bloque.nombre}</Typography>,
                            'small') }
                        { bloque.items.map(item => {
                            const warning = note?.(item)
                            return (
                                <FormControlLabel key={item.key} sx={{ display: 'flex', alignItems: 'flex-start', mb: 0.5, ml: 2 }}
                                    control={<Checkbox size='small' disabled={disabled?.(item)} checked={selected.has(item.key)} onChange={(_e, checked) => set([item.key], checked)} />}
                                    label={<Box>
                                        <Typography variant='body2'>{item.label}{warning && <Typography component='span' variant='caption' color='warning.main'> — {warning}</Typography>}</Typography>
                                        <Typography variant='caption' color='text.secondary'>{item.detail}</Typography>
                                    </Box>} />
                            )
                        }) }
                    </Box>
                )) }
            </Box>
        </>)
    }

    const formItems = (): ISelectableItem[] => settingsItems({ metricsInterval, marketplaces, packageRegistries: registries })

    // El almacen comun de IA no pertenece a ninguna extension —lo comparten varias—, asi que es una
    // entrada propia, al mismo nivel que los ajustes.
    const sharedAiItem: ISelectableItem = {
        key: CORE_SHARED_AI_KEY,
        group: GROUP_GENERAL,
        label: 'Shared AI configuration',
        detail: 'models and providers shared by every extension that uses AI'
    }

    const exportItems = (): ISelectableItem[] => [...formItems(), sharedAiItem, ...extensionItems()]

    const importItems = (): ISelectableItem[] => [
        ...(importData ? settingsItems(importData.settings) : []),
        ...(importBundle?.core.sharedAi !== undefined ? [sharedAiItem] : []),
        ...importPreview.map(p => ({
            key: bundleEntryKey(p.type, p.id),
            group: groupOf(p.type),
            label: p.displayName,
            detail: p.status === EBundleEntryStatus.NOT_INSTALLED ? 'not installed here — it will be skipped'
                : p.status === EBundleEntryStatus.NOT_SUPPORTED ? 'installed, but it cannot import configuration yet'
                : p.status === EBundleEntryStatus.NOT_INSTANTIATED ? 'not running here, so it cannot be configured'
                : p.status === EBundleEntryStatus.VERSION_DIFFERS ? `file says ${p.version}, installed is ${p.installedVersion}`
                : `${p.version ?? 'configuration'}`
        }))
    ]

    // Lo que el fichero trae pero aqui no se puede aplicar: se ve, no se marca.
    const notApplicable = (item: ISelectableItem): boolean => {
        const p = importPreview.find(e => bundleEntryKey(e.type, e.id) === item.key)
        return p !== undefined && p.status !== EBundleEntryStatus.AVAILABLE && p.status !== EBundleEntryStatus.VERSION_DIFFERS
    }

    // Y lo que no se puede exportar, igual.
    const notExportable = (item: ISelectableItem): boolean => {
        const e = extensions.find(x => bundleEntryKey(x.type, x.id) === item.key)
        return e !== undefined && e.status !== EBundleEntryStatus.AVAILABLE
    }
    const alreadyThere = (item: ISelectableItem): string|undefined => {
        if (item.key === GENERAL_KEY) return 'overwrites the current value'
        const existing = formItems().some(i => i.key === item.key)
        return existing ? 'replaces the one already set' : undefined
    }

    return (<>
        <Dialog open={true} fullWidth maxWidth='md' disableRestoreFocus={true}>
            <DialogTitleHelp section='guide/admin/02-initial-config?id=kwirth-settings' docsUrl={docsUrl(backendUrl, 'core', 'kwirth')}>Kwirth settings</DialogTitleHelp>
            <DialogContent sx={{ height: 460, overflowY: 'auto' }}>
                <Tabs value={tab} onChange={(_e, v) => setTab(v as ESettingsKwirthTab)}>
                    <Tab label='General' value={ESettingsKwirthTab.GENERAL} />
                    <Tab label='Marketplaces' value={ESettingsKwirthTab.MARKETPLACES} />
                    <Tab label='Package registries' value={ESettingsKwirthTab.REGISTRIES} />
                </Tabs>

                <Box hidden={tab !== ESettingsKwirthTab.GENERAL}>
                    <Stack spacing={2} direction='column' sx={{ mt: 2 }}>
                        <Typography variant='body2'>Configuration of Kwirth itself on cluster <b>{props.clusterName}</b>. These settings are stored by Kwirth and survive a restart.</Typography>
                        <TextField value={metricsInterval} onChange={(e) => setMetricsInterval(+e.target.value)} variant='standard' label='Cluster metrics read interval (seconds)' type='number' sx={{ width: '40%' }} disabled={loading || error!==''} />
                        {/* El log del contenedor anterior se lee UNA vez, al arrancar: cambiar esto no
                            tiene efecto hasta el siguiente arranque del core. */}
                        <TextField value={previousLogLines} onChange={(e) => setPreviousLogLines(+e.target.value)} variant='standard' label='Previous container log lines to keep (on startup)' type='number' sx={{ width: '40%' }} disabled={loading || error!==''} helperText='Read once when kwirth starts, so a change applies from the next restart' />
                    </Stack>
                </Box>

                <Box hidden={tab !== ESettingsKwirthTab.MARKETPLACES}>
                    <Stack spacing={2} direction='column' sx={{ mt: 2 }}>
                        <Typography variant='body2'>
                            Extra marketplaces to install extensions from, on top of the public Kwirth one. Each URL points at a
                            single manifest, which may list extensions of several types. A marketplace listed here takes precedence
                            over the public one, so it can publish its own <i>log</i> without clashing.
                        </Typography>
                        { marketplaces.map(marketplaceRow) }
                        { marketplaces.length === 0 && <Typography variant='body2' color='text.secondary'>No extra marketplaces. Only the public Kwirth marketplace is used.</Typography> }
                        <Box><Button startIcon={<Add />} onClick={addRow} disabled={loading || error!==''}>Add marketplace</Button></Box>
                    </Stack>
                </Box>

                <Box hidden={tab !== ESettingsKwirthTab.REGISTRIES}>
                    <Stack spacing={2} direction='column' sx={{ mt: 2 }}>
                        <Typography variant='body2'>
                            Where packages are <b>downloaded</b> from, which is not where the manifests live: a marketplace only
                            lists extensions, and each entry says which URL its tarball comes from. Kwirth picks the credentials
                            by matching that URL against the <b>Base URL</b> below, treated as a prefix — so one registry can
                            cover a whole server, or just one repository inside it. When several match, the longest one wins.
                            Registries are only needed for private servers; public packages download anonymously.
                        </Typography>
                        { registries.map(registryRow) }
                        { registries.length === 0 && <Typography variant='body2' color='text.secondary'>No package registries. Every package is downloaded anonymously.</Typography> }
                        <Box><Button startIcon={<Add />} onClick={addRegistry} disabled={loading || error!==''}>Add registry</Button></Box>
                    </Stack>
                </Box>

                { loading && <Stack direction='row' spacing={1} alignItems='center' sx={{ mt: 2 }}><CircularProgress size={16} /><Typography variant='body2'>Reading current settings…</Typography></Stack> }
                { importResult && <Alert severity='info' sx={{ mt: 2 }} onClose={() => setImportResult(undefined)}>{importResult}</Alert> }
                { error!=='' && <Alert severity='error' sx={{ mt: 2 }}>{error}</Alert> }
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'space-between', px: 2 }}>
                <Stack direction='row' spacing={1}>
                    <input ref={importFileRef} type='file' accept='.json,application/json' style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) openImport(f) }} />
                    <Tooltip title='Export this Kwirth configuration to a JSON file'>
                        <span><Button size='small' startIcon={<Download />} disabled={loading} onClick={() => { setExportWithCredentials(false); setExportSelected(new Set([...formItems().map(i => i.key), CORE_SHARED_AI_KEY, ...exportableExtensionKeys()])); setExportOpen(true) }}>Export</Button></span>
                    </Tooltip>
                    <Tooltip title='Import a Kwirth configuration from a JSON file'>
                        <span><Button size='small' startIcon={<Upload />} disabled={loading} onClick={() => importFileRef.current?.click()}>Import</Button></span>
                    </Tooltip>
                </Stack>
                <Stack direction='row' spacing={1}>
                    <Button variant='outlined' onClick={ok} disabled={loading || error!=='' || metricsInterval<=0 || !rowsValid()}>OK</Button>
                    <Button variant='outlined' onClick={() => props.onClose(undefined)}>Cancel</Button>
                </Stack>
            </DialogActions>
        </Dialog>

        {/* Export — se elige item a item, y aparte si las credenciales viajan dentro del fichero */}
        <Dialog open={exportOpen} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '700px' } }}>
            <DialogTitle>Export Kwirth configuration</DialogTitle>
            <DialogContent sx={{ pt: '16px !important', height: 500, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <Stack spacing={1} sx={{ flex: 1, minHeight: 0 }}>
                    <Typography variant='body2'>
                        Pick what goes into the file. Settings carry what is in the form right now, including changes you have
                        not accepted yet; each extension is asked for its own configuration.
                    </Typography>
                    { selectionList(exportItems(), exportSelected, setExportSelected, undefined, notExportable) }
                    <FormControlLabel
                        label='Include credentials'
                        control={<Checkbox checked={exportWithCredentials} onChange={(_e, checked) => setExportWithCredentials(checked)} />} />
                    {exportWithCredentials
                        ? <Alert severity='warning'>
                            Tokens and passwords will be written to the file in clear text. Treat it as a secret.
                          </Alert>
                        : <Alert severity='info'>
                            Credentials are left out. Whoever imports the file keeps the ones already set, and has to type the
                            missing ones.
                          </Alert>
                    }
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button variant='contained' disabled={exportSelected.size === 0} onClick={doExport}>Export</Button>
                <Button onClick={() => setExportOpen(false)}>Cancel</Button>
            </DialogActions>
        </Dialog>

        {/* Import — el fichero ya esta leido, aqui se elige que entra en el formulario */}
        <Dialog open={importData !== undefined || importPreview.length > 0} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '700px' } }}>
            <DialogTitle>Import Kwirth configuration</DialogTitle>
            <DialogContent sx={{ pt: '16px !important', height: 500, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <Stack spacing={1} sx={{ flex: 1, minHeight: 0 }}>
                    <Typography variant='body2'>
                        Pick what to bring in. Nothing is saved yet: settings land in the form and extensions are configured
                        when you press OK on the settings dialog.
                    </Typography>
                    { selectionList(importItems(), importSelected, setImportSelected, alreadyThere, notApplicable) }
                    { importData && !importData.credentialsIncluded &&
                        <Alert severity='info'>
                            The file was exported without credentials. Whatever is already set is kept, so nothing is lost.
                        </Alert>
                    }
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button variant='contained' disabled={importSelected.size === 0} onClick={doImport}>Import</Button>
                <Button onClick={() => { setImportData(undefined); setImportBundle(undefined); setImportPreview([]) }}>Cancel</Button>
            </DialogActions>
        </Dialog>
    </>)
}

export { SettingsKwirth }
