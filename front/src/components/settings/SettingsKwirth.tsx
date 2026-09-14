import React, { useState, useEffect, useContext } from 'react'
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, IconButton, InputAdornment, InputLabel, MenuItem, Select, Stack, Tab, Tabs, TextField, Tooltip, Typography } from '@mui/material'
import { Add, Delete, Download, Refresh, Upload, Visibility, VisibilityOff } from '@kwirthmagnify/kwirth-common-front/icons'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { IKwirthSettings, IMarketplace, IPackageRegistry, EPackageRegistryAuthType, EManifestAuthType } from '@kwirthmagnify/kwirth-common'
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
}

const GENERAL_KEY = 'general'
const marketplaceKey = (id: string) => `marketplace:${id}`
const registryKey = (id: string) => `registry:${id}`

// Lo que se puede elegir de unos settings, sirvan de origen el formulario o un fichero importado.
const settingsItems = (settings: IKwirthSettings): ISelectableItem[] => [
    ...(settings.metricsInterval === undefined ? [] : [{
        key: GENERAL_KEY,
        label: 'Cluster metrics read interval',
        detail: `${settings.metricsInterval} seconds`
    }]),
    ...(settings.marketplaces ?? []).map(m => ({
        key: marketplaceKey(m.id),
        label: m.label.trim() === '' ? m.id : m.label,
        detail: m.url
    })),
    ...(settings.packageRegistries ?? []).map(r => ({
        key: registryKey(r.id),
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
                setMarketplaces((settings.marketplaces ?? []).map(m => ({ ...m })))
                setRegistries((settings.packageRegistries ?? []).map(r => ({ ...r })))
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

    // Se exporta lo que hay EN EL FORMULARIO, no lo guardado: lo que ves es lo que te llevas, incluidos los
    // cambios que aun no has aceptado. Y se exporta SOLO lo marcado, item a item.
    const doExport = () => {
        const chosenMarketplaces = marketplaces.filter(m => exportSelected.has(marketplaceKey(m.id)))
        const chosenRegistries = registries.filter(r => exportSelected.has(registryKey(r.id)))
        const payload: IKwirthSettingsExportFile = {
            kwirth: EXPORT_KIND,
            version: EXPORT_VERSION,
            credentialsIncluded: exportWithCredentials,
            settings: {
                ...(exportSelected.has(GENERAL_KEY) ? { metricsInterval } : {}),
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
        }
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = 'kwirth-settings.json'
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
            const parsed = JSON.parse(await file.text()) as IKwirthSettingsExportFile
            if (parsed?.kwirth !== EXPORT_KIND) throw new Error('not a Kwirth settings file')
            if (!parsed.settings) throw new Error('no settings in the file')
            setImportData(parsed)
            setImportSelected(new Set(settingsItems(parsed.settings).map(i => i.key)))
        }
        catch (err) {
            setError(`Invalid settings file: ${err instanceof Error ? err.message : err}`)
        }
    }

    // Importar NO guarda: deja el formulario cargado para que lo revises y decidas con OK o Cancel. Fusiona
    // por id —mismo id lo reemplaza, id nuevo se añade— para no perder marketplaces que el fichero no trae.
    const doImport = () => {
        if (!importData) return
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
        setImportResult(`Imported ${parts.length ? parts.join(', ') : 'nothing'}${replaced ? ` (${replaced} replaced)` : ''}.`
            + (importData.credentialsIncluded ? '' : ' The file carried no credentials, so the ones already set were kept.')
            + ' Nothing is saved until you press OK.')
        setImportData(undefined)
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
            const payload = JSON.stringify({ metricsInterval, marketplaces: cleaned, packageRegistries: cleanedRegistries })
            const response = await fetch(`${props.clusterUrl}/core/settings`, addPutAuthorization(props.accessString, payload))
            if (!response.ok) {
                const detail = await response.json().catch(() => ({}))
                setError(response.status === 403
                    ? 'You need the admin scope to manage Kwirth settings.'
                    : detail?.error ?? `Could not save settings (${response.status}).`)
                return
            }
            props.onClose(await response.json() as IKwirthSettings)
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
    const selectionList = (items: ISelectableItem[], selected: Set<string>, setSelected: (s: Set<string>) => void, note?: (item: ISelectableItem) => string|undefined) => {
        const toggle = (key: string, checked: boolean) => {
            const next = new Set(selected)
            if (checked) next.add(key)
            else next.delete(key)
            setSelected(next)
        }
        return (<>
            <FormControlLabel
                label='Select all'
                control={<Checkbox
                    checked={selected.size === items.length && items.length > 0}
                    indeterminate={selected.size > 0 && selected.size < items.length}
                    onChange={(_e, checked) => setSelected(checked ? new Set(items.map(i => i.key)) : new Set())} />} />
            <Box sx={{ maxHeight: 240, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 1, px: 1, py: 0.5 }}>
                { items.length === 0 && <Typography variant='body2' color='text.secondary' sx={{ py: 1 }}>Nothing to choose from.</Typography> }
                { items.map(item => {
                    const warning = note?.(item)
                    return (
                        <FormControlLabel key={item.key} sx={{ display: 'flex', alignItems: 'flex-start', mb: 0.5 }}
                            control={<Checkbox size='small' checked={selected.has(item.key)} onChange={(_e, checked) => toggle(item.key, checked)} />}
                            label={<Box>
                                <Typography variant='body2'>{item.label}{warning && <Typography component='span' variant='caption' color='warning.main'> — {warning}</Typography>}</Typography>
                                <Typography variant='caption' color='text.secondary'>{item.detail}</Typography>
                            </Box>} />
                    )
                }) }
            </Box>
        </>)
    }

    const formItems = (): ISelectableItem[] => settingsItems({ metricsInterval, marketplaces, packageRegistries: registries })
    const importItems = (): ISelectableItem[] => importData ? settingsItems(importData.settings) : []
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
                    <Tooltip title='Export these settings to a JSON file'>
                        <span><Button size='small' startIcon={<Download />} disabled={loading} onClick={() => { setExportWithCredentials(false); setExportSelected(new Set(formItems().map(i => i.key))); setExportOpen(true) }}>Export</Button></span>
                    </Tooltip>
                    <Tooltip title='Import settings from a JSON file'>
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
            <DialogTitle>Export Kwirth settings</DialogTitle>
            <DialogContent sx={{ pt: '16px !important', height: 420, overflowY: 'auto' }}>
                <Stack spacing={1}>
                    <Typography variant='body2'>
                        Pick what goes into the file. It carries what is in the form right now, including changes you have not
                        accepted yet.
                    </Typography>
                    { selectionList(formItems(), exportSelected, setExportSelected) }
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
        <Dialog open={importData !== undefined} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '700px' } }}>
            <DialogTitle>Import Kwirth settings</DialogTitle>
            <DialogContent sx={{ pt: '16px !important', height: 420, overflowY: 'auto' }}>
                <Stack spacing={1}>
                    <Typography variant='body2'>
                        Pick what to bring in. Nothing is saved yet: the chosen items land in the form, and it is the OK of the
                        settings dialog that writes them.
                    </Typography>
                    { selectionList(importItems(), importSelected, setImportSelected, alreadyThere) }
                    { importData && !importData.credentialsIncluded &&
                        <Alert severity='info'>
                            The file was exported without credentials. Whatever is already set is kept, so nothing is lost.
                        </Alert>
                    }
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button variant='contained' disabled={importSelected.size === 0} onClick={doImport}>Import</Button>
                <Button onClick={() => setImportData(undefined)}>Cancel</Button>
            </DialogActions>
        </Dialog>
    </>)
}

export { SettingsKwirth }
