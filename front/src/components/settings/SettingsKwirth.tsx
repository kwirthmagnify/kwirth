import React, { useState, useEffect, useContext } from 'react'
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, FormControl, FormControlLabel, IconButton, InputAdornment, InputLabel, MenuItem, Select, Stack, Tab, Tabs, TextField, Tooltip, Typography } from '@mui/material'
import { Add, Delete, Refresh, Visibility, VisibilityOff } from '@kwirthmagnify/kwirth-common-front/icons'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { IKwirthSettings, IMarketplace, IPackageRegistry, EPackageRegistryAuthType, EManifestAuthType } from '@kwirthmagnify/kwirth-common'
/*
    'import type' and not a normal import, deliberately. CRA transpiles with Babel, which compiles file by
    file and cannot tell whether an imported name is a type or a value: with a normal import it leaves the
    require in the bundle, and 'ELogLevel' — an enum, a value at runtime — has to exist in the copy of
    kwirth-common webpack is serving. Until the front end is restarted after touching common, it does not.
    'import type' is erased with certainty, so this screen never depends on it at runtime.
*/
import type { ELogLevel, ILogComponentInfo } from '@kwirthmagnify/kwirth-common'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addGetAuthorization, addPostAuthorization, addPutAuthorization } from '../../tools/AuthorizationManagement'

/*
    The levels of the log, as LITERALS and not as `ELogLevel.X`.

    ⚠️ An enum is a VALUE at runtime, so writing `ELogLevel.TRACE` here makes this screen depend on the
    bundle carrying the enum. While the copy of kwirth-common webpack is serving is the previous one —
    which is what happens until the front end is restarted after touching common — the import arrives
    `undefined` and the whole dialog blows up with "Cannot read properties of undefined". It happened.

    Typing them as ELogLevel keeps the check (a typo does not compile) and TypeScript erases the type when
    compiling, so nothing of common has to exist at runtime for this list to draw.
*/
const LOG_LEVEL_OPTIONS: { value: ELogLevel, label: string }[] = [
    { value: 'trace' as ELogLevel, label: 'Trace — everything, including the detail' },
    { value: 'info' as ELogLevel, label: 'Info — the usual' },
    { value: 'warn' as ELogLevel, label: 'Warnings and errors' },
    { value: 'error' as ELogLevel, label: 'Errors only' },
    { value: 'off' as ELogLevel, label: 'Off' }
]

// A semantic enum as the tab's id (the rule: never numbers)
enum ESettingsKwirthTab {
    GENERAL = 'general',
    LOG = 'log',
    MARKETPLACES = 'marketplaces',
    REGISTRIES = 'registries'
}

// An editable row: IMarketplace as it is (the token already travels inside manifestAuth) plus the state
// that lives only on screen.
interface IMarketplaceRow extends IMarketplace {
    tokenRevealed?: boolean
    testing?: boolean
    testResult?: string
}

interface IPackageRegistryRow extends IPackageRegistry {
    revealed?: boolean
}

/*
    This dialog used to carry its own export/import of the settings, with its own file format
    ('kwirth-settings'), its own selection list and its own two sub-dialogs. It is gone: Kwirth
    portability (Settings → Configuration, the config bundle) does the same and does it better — it also
    carries what the EXTENSIONS store, which this could never reach, and it is one format instead of two
    that had to be kept in step.

    The log settings travel in that bundle without anything extra: the core exports IKwirthSettings whole,
    so a new field is in it the moment it exists.
*/

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
    /*
        How talkative the core's log is, per component.

        The list of components comes from the BACK END, it is not an enum here: the same approach as the
        RBAC scope catalogue. That way adding a component means touching one place, and this screen cannot
        end up offering one that no longer exists — or hiding one that was just added.
    */
    const [logComponents, setLogComponents] = useState<ILogComponentInfo[]>([])
    const [logLevels, setLogLevels] = useState<Record<string, ELogLevel>>({})
    const [logAnsi, setLogAnsi] = useState(true)
    const [marketplaces, setMarketplaces] = useState<IMarketplaceRow[]>([])
    const [registries, setRegistries] = useState<IPackageRegistryRow[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const { backendUrl } = useContext(SessionContext) as SessionContextType

    // the dialog fetches its own data: it asks Kwirth for the effective values that rule right now
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
                /*
                    The back end answers with what is IN FORCE, not with what is stored, so with nothing
                    configured this opens showing the defaults the core is really writing under instead of
                    a blank form.
                */
                setLogLevels(settings.log?.levels ?? {})
                setLogAnsi(settings.log?.ansi ?? true)
                // If this fails the screen does not break: the tab simply has nothing to draw.
                const components = await fetch(`${props.clusterUrl}/core/settings/log/components`, addGetAuthorization(props.accessString))
                if (components.ok) setLogComponents(await components.json() as ILogComponentInfo[])
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

    // manifestAuth is a nested object: it has to be rebuilt whole so the other fields (the token among
    // them) are not lost when touching a single one.
    const patchManifestAuth = (index: number, patch: Partial<IMarketplace['manifestAuth']>) => {
        const current = marketplaces[index].manifestAuth
        patchRow(index, { manifestAuth: { type: current?.type ?? EManifestAuthType.NONE, ...current, ...patch } })
    }

    // The eye only toggles between dots and text: the stored value has been in the field since the GET.
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

    // The test is done by the BACK END: if the manifest sits behind a private token, the browser cannot
    // read it. It checks reading the manifest and its token; the package registry's password is not
    // validated here, because it only comes into play when downloading a package.
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
            // what is in the form is sent, secrets included: the back end diverts them to its encrypted
            // store. An empty field means deleting the stored secret, so it is sent exactly as it is.
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
            const payload = JSON.stringify({ metricsInterval, previousLogLines, marketplaces: cleaned, packageRegistries: cleanedRegistries,
                log: { levels: logLevels, ansi: logAnsi } })
            const response = await fetch(`${props.clusterUrl}/core/settings`, addPutAuthorization(props.accessString, payload))
            if (!response.ok) {
                const detail = await response.json().catch(() => ({}))
                setError(response.status === 403
                    ? 'You need the admin scope to manage Kwirth settings.'
                    : detail?.error ?? `Could not save settings (${response.status}).`)
                return
            }
            const guardados = await response.json() as IKwirthSettings


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
    /*
        The log, back to what Kwirth writes with nothing configured.

        ONLY the log, and the button only shows on its tab. A generic 'reset' over this dialog would mean
        emptying the marketplaces and the package registries — configuration somebody composed by hand, not
        a value with a sensible default to fall back to — and a button pressed for the log has no business
        wiping that.

        It EMPTIES the map rather than filling it with 'info': an absent key means "whatever the core's
        default is", so a Kwirth that changes that default later follows it instead of staying pinned to
        today's value.
    */
    const resetLog = () => {
        setLogLevels({})
        setLogAnsi(true)
    }

    /*
        One row of the log tab. The same one serves a component and one of its writers, because they
        differ only in the indent and in having an inherited value: an id with nothing set is NOT at info,
        it is at whatever its component is, and saying so is what keeps 'set one channel to trace' from
        reading as 'set every channel one by one'.
    */
    const levelRow = (key: string, label: string, description: string|undefined, nested: boolean, inheritsFrom?: string) => {
        const chosen = logLevels[key]
        return <Stack key={key} direction='row' spacing={2} alignItems='center' sx={{ pl: nested ? 4 : 0 }}>
            <Box sx={{ width: '55%' }}>
                <Typography variant='body2' color={nested ? 'text.secondary' : 'text.primary'}>
                    {label} { !nested && <Typography component='span' variant='body2' color='text.secondary'>[{key}]</Typography> }
                </Typography>
                { description && <Typography variant='caption' color='text.secondary'>{description}</Typography> }
            </Box>
            <FormControl variant='standard' sx={{ width: '30%' }} disabled={loading || error!==''}>
                { !nested && <InputLabel>Level</InputLabel> }
                <Select value={chosen ?? (nested ? '' : 'info')} displayEmpty={nested}
                    onChange={(e) => setLogLevels(prev => {
                        const next = { ...prev }
                        // The empty option is 'inherit', which is not a level: hence reading it as a
                        // plain string instead of as ELogLevel.
                        const chosenValue = e.target.value as string
                        // Choosing 'inherit' REMOVES the key rather than storing a value: an id with
                        // nothing of its own has to follow its component when that one is changed later.
                        if (chosenValue === '') delete next[key]
                        else next[key] = chosenValue as ELogLevel
                        return next
                    })}>
                    { nested && <MenuItem value=''>Same as {inheritsFrom}</MenuItem> }
                    { LOG_LEVEL_OPTIONS.map(option =>
                        <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                    )}
                </Select>
            </FormControl>
        </Stack>
    }

    return (<>
        <Dialog open={true} fullWidth maxWidth='md' disableRestoreFocus={true}>
            <DialogTitleHelp section='guide/admin/02-initial-config?id=kwirth-settings' docsUrl={docsUrl(backendUrl, 'core', 'kwirth')}>Kwirth settings</DialogTitleHelp>
            <DialogContent sx={{ height: 460, overflowY: 'auto' }}>
                <Tabs value={tab} onChange={(_e, v) => setTab(v as ESettingsKwirthTab)}>
                    <Tab label='General' value={ESettingsKwirthTab.GENERAL} />
                    <Tab label='Log' value={ESettingsKwirthTab.LOG} />
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

                <Box hidden={tab !== ESettingsKwirthTab.LOG}>
                    <Stack spacing={2} direction='column' sx={{ mt: 2 }}>
                        <Typography variant='body2'>
                            How talkative Kwirth's own log is. Each component writes from the level chosen here upwards, so
                            turning one down lowers the noise without losing what matters. It applies <b>immediately</b>, with no
                            restart — the log is precisely what you turn up while something is going wrong.
                        </Typography>
                        {/*
                            Errors are the exception and it is said here rather than left to be discovered: a filter is for
                            lowering noise, not for hiding a failure that nobody then finds out about.
                        */}
                        <Alert severity='info' sx={{ py: 0 }}>Errors are always written, whatever level a component is set to.</Alert>
                        { logComponents.map(component => <React.Fragment key={component.id}>
                            { levelRow(component.id, component.label, component.description, false) }
                            {/*
                                And under each component, whoever writes under it. An id inherits its
                                component's level until it is given one of its own, so 'Same as…' is not a
                                decoration: it is what keeps this from turning into a list of levels to
                                maintain one by one.
                            */}
                            { (component.ids ?? []).map(id => levelRow(`${component.id}:${id}`, id, undefined, true, component.id)) }
                        </React.Fragment>)}
                        { logComponents.length === 0 && <Typography variant='body2' color='text.secondary'>Could not read the log components from Kwirth.</Typography> }
                        <FormControlLabel control={<Checkbox checked={logAnsi} onChange={(e) => setLogAnsi(e.target.checked)} disabled={loading || error!==''} />}
                            label={<Typography variant='body2'>Colour the output (ANSI)</Typography>} />
                        <Typography variant='caption' color='text.secondary' sx={{ mt: -1 }}>
                            Helpful on a terminal, in the way anywhere else: collected into a file or forwarded to a log service,
                            the colour codes travel as rubbish in the middle of the message.
                        </Typography>
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
            <DialogActions sx={{ justifyContent: 'space-between', px: 2 }}>
                {/*
                    Only on the log tab, and it says so. No confirmation is needed because nothing here is
                    written until OK: Cancel undoes it.
                */}
                <Box>
                    { tab === ESettingsKwirthTab.LOG &&
                        <Button size='small' onClick={resetLog} disabled={loading || error!==''}>Reset to defaults</Button> }
                </Box>
                <Stack direction='row' spacing={1}>
                    <Button variant='outlined' onClick={ok} disabled={loading || error!=='' || metricsInterval<=0 || !rowsValid()}>OK</Button>
                    <Button variant='outlined' onClick={() => props.onClose(undefined)}>Cancel</Button>
                </Stack>
            </DialogActions>
        </Dialog>

    </>)
}

export { SettingsKwirth }
