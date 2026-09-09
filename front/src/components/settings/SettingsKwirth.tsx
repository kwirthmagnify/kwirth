import React, { useState, useEffect, useContext } from 'react'
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, FormControl, FormControlLabel, IconButton, InputAdornment, InputLabel, MenuItem, Select, Stack, Tab, Tabs, TextField, Tooltip, Typography } from '@mui/material'
import { Add, Delete, Refresh, Visibility, VisibilityOff } from '@kwirthmagnify/kwirth-common-front/icons'
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
                { error!=='' && <Alert severity='error' sx={{ mt: 2 }}>{error}</Alert> }
            </DialogContent>
            <DialogActions>
                <Button variant='outlined' onClick={ok} disabled={loading || error!=='' || metricsInterval<=0 || !rowsValid()}>OK</Button>
                <Button variant='outlined' onClick={() => props.onClose(undefined)}>Cancel</Button>
            </DialogActions>
        </Dialog>
    </>)
}

export { SettingsKwirth }
