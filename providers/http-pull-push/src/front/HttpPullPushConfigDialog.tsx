import React, { useEffect, useRef, useState } from 'react'
import {
    Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
    DialogTitle, Divider, FormControl, FormControlLabel, IconButton, InputLabel, MenuItem,
    Select, Stack, Switch, TextField, Tooltip, Typography
} from '@mui/material'
import { Add, ContentCopy, Delete, Download, Upload } from '@mui/icons-material'
import {
    EAuthType, EEmitMode, EHttpMethod, EResponseType, IHttpPullConfig, IHttpPullTestResult, newHttpPullConfig
} from '../common/HttpPullPush'
import { validateConfigs } from '../common/Validation'
import HeaderEditor from './HeaderEditor'
import SecretField from './SecretField'

interface IHttpPullPushConfigDialogProps {
    onClose: () => void
    backendUrl: string
    accessString: string
}

// Formato del fichero de export/import. 'version' permite evolucionarlo sin romper ficheros antiguos.
interface IConfigExportFile {
    provider: string
    version: number
    credentialsIncluded: boolean
    configs: IHttpPullConfig[]
}

// El provider es dueño de su configuracion: este dialogo habla con SU router, montado por el core detras
// de validacion de accessKey, y no con el endpoint de config generico del core.
const CONFIG_URL = (backendUrl: string) => `${backendUrl}/core/providerconfig/http-pull-push/configs`
const TEST_URL = (backendUrl: string) => `${backendUrl}/core/providerconfig/http-pull-push/test`

const EXPORT_VERSION = 1
const METHODS_WITH_BODY = [EHttpMethod.POST, EHttpMethod.PUT, EHttpMethod.PATCH]

const authHeaders = (accessString: string) => ({
    Authorization: accessString ? `Bearer ${accessString}` : '',
    'Content-Type': 'application/json',
    'X-Kwirth-App': 'true'
})

// Deja una conexion sin sus campos secretos, para exportarla sin credenciales.
const stripCredentials = (config: IHttpPullConfig): IHttpPullConfig => ({
    ...config,
    auth: {
        ...config.auth,
        password: undefined,
        token: undefined,
        headerValue: undefined
    }
})

const HttpPullPushConfigDialog: React.FC<IHttpPullPushConfigDialogProps> = ({ onClose, backendUrl, accessString }) => {
    const [configs, setConfigs] = useState<IHttpPullConfig[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [deletingName, setDeletingName] = useState<string | undefined>()
    const [error, setError] = useState<string | undefined>()
    const [errors, setErrors] = useState<string[]>([])

    // Formulario: 'editingName' con valor = editando esa conexion; undefined con showForm = alta nueva.
    const [showForm, setShowForm] = useState(false)
    const [editingName, setEditingName] = useState<string | undefined>()
    const [form, setForm] = useState<IHttpPullConfig>(newHttpPullConfig(''))

    // Prueba de la conexion, ejecutada en el back
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<IHttpPullTestResult | undefined>()

    // Export / import
    const [exportOpen, setExportOpen] = useState(false)
    const [exportSelected, setExportSelected] = useState<Set<string>>(new Set())
    const [exportWithCredentials, setExportWithCredentials] = useState(false)
    const [importData, setImportData] = useState<IConfigExportFile | undefined>()
    const [importSelected, setImportSelected] = useState<Set<string>>(new Set())
    const importFileRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        fetch(CONFIG_URL(backendUrl), { headers: { Authorization: accessString ? `Bearer ${accessString}` : '', 'X-Kwirth-App': 'true' } })
            .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
            .then((data: IHttpPullConfig[]) => setConfigs(Array.isArray(data) ? data : []))
            .catch(err => setError(`Failed to load connections: ${err}`))
            .finally(() => setLoading(false))
    }, [])

    /*
        Persiste la lista completa. El provider valida, guarda (credenciales al Secret, el resto al
        ConfigMap) y reconcilia sus pollers en caliente, asi que cada accion surte efecto al momento.
    */
    const persist = async (next: IHttpPullConfig[]): Promise<boolean> => {
        const found = validateConfigs(next)
        setErrors(found)
        if (found.length > 0) return false

        setSaving(true)
        setError(undefined)
        try {
            const res = await fetch(CONFIG_URL(backendUrl), {
                method: 'PUT',
                headers: authHeaders(accessString),
                body: JSON.stringify(next)
            })
            if (!res.ok) {
                const payload = await res.json().catch(() => undefined)
                if (payload?.errors) {
                    setErrors(payload.errors as string[])
                    return false
                }
                throw new Error(`HTTP ${res.status}`)
            }
            setConfigs(next)
            return true
        }
        catch (err) {
            setError(`Failed to save: ${err}`)
            return false
        }
        finally {
            setSaving(false)
        }
    }

    const freeName = (base: string): string => {
        const used = new Set(configs.map(c => c.name))
        if (!used.has(base)) return base
        let index = 2
        while (used.has(`${base}-${index}`)) index++
        return `${base}-${index}`
    }

    const startNew = () => {
        setForm(newHttpPullConfig(freeName('connection')))
        setEditingName(undefined)
        setErrors([])
        setShowForm(true)
    }

    const startEdit = (config: IHttpPullConfig) => {
        setForm({ ...config })
        setEditingName(config.name)
        setErrors([])
        setShowForm(true)
    }

    const startClone = () => {
        setForm(prev => ({ ...prev, name: freeName(`${prev.name}-copy`) }))
        setEditingName(undefined)
        setErrors([])
        setShowForm(true)
    }

    const submitForm = async () => {
        const next = editingName
            ? configs.map(c => c.name === editingName ? form : c)
            : [...configs, form]
        if (await persist(next)) {
            setShowForm(false)
            setEditingName(undefined)
        }
    }

    const removeConnection = async (name: string) => {
        setDeletingName(name)
        const ok = await persist(configs.filter(c => c.name !== name))
        setDeletingName(undefined)
        if (ok && editingName === name) {
            setShowForm(false)
            setEditingName(undefined)
        }
    }

    const patch = (changes: Partial<IHttpPullConfig>) => { setForm(prev => ({ ...prev, ...changes })); setTestResult(undefined) }
    const patchAuth = (changes: Partial<IHttpPullConfig['auth']>) => { setForm(prev => ({ ...prev, auth: { ...prev.auth, ...changes } })); setTestResult(undefined) }

    /*
        La prueba la hace el BACK con la conexion tal y como esta en el formulario, sin guardarla. Tiene que
        ser el back porque es quien tiene la red del cluster, los certificados y la identidad con los que se
        hara el pull de verdad: una prueba desde el navegador no diria nada.
    */
    const testConnection = async () => {
        setTesting(true)
        setTestResult(undefined)
        setError(undefined)
        try {
            const res = await fetch(TEST_URL(backendUrl), {
                method: 'POST',
                headers: authHeaders(accessString),
                body: JSON.stringify(form)
            })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            setTestResult(await res.json() as IHttpPullTestResult)
        }
        catch (err) {
            setError(`Could not run the test: ${err}`)
        }
        finally {
            setTesting(false)
        }
    }

    const doExport = () => {
        const chosen = configs.filter(c => exportSelected.has(c.name))
        const payload: IConfigExportFile = {
            provider: 'http-pull-push',
            version: EXPORT_VERSION,
            credentialsIncluded: exportWithCredentials,
            configs: exportWithCredentials ? chosen : chosen.map(stripCredentials)
        }
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'http-pull-push-connections.json'
        link.click()
        URL.revokeObjectURL(url)
        setExportOpen(false)
    }

    const openImport = (file: File) => {
        const reader = new FileReader()
        reader.onload = () => {
            try {
                const parsed = JSON.parse(String(reader.result)) as IConfigExportFile
                if (!Array.isArray(parsed?.configs)) throw new Error('no connections in the file')
                if (parsed.provider && parsed.provider !== 'http-pull-push') throw new Error(`the file belongs to provider '${parsed.provider}'`)
                setImportData(parsed)
                setImportSelected(new Set(parsed.configs.map(c => c.name)))
            }
            catch (err) {
                setError(`Invalid import file: ${err}`)
            }
        }
        reader.readAsText(file)
        if (importFileRef.current) importFileRef.current.value = ''
    }

    // Importar reemplaza las conexiones cuyo nombre ya exista y añade las nuevas.
    const doImport = async () => {
        if (!importData) return
        const chosen = importData.configs.filter(c => importSelected.has(c.name))
        const byName = new Map(configs.map(c => [c.name, c]))
        for (const config of chosen) byName.set(config.name, { ...newHttpPullConfig(config.name), ...config })
        if (await persist([...byName.values()])) setImportData(undefined)
    }

    const showBody = METHODS_WITH_BODY.includes(form.method)
    const isHttps = (form.url ?? '').toLowerCase().startsWith('https://')
    const importReplacing = importData
        ? importData.configs.filter(c => importSelected.has(c.name) && configs.some(existing => existing.name === c.name)).length
        : 0

    return <>
        <Dialog open maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '1000px', height: '700px' } }}>
            <DialogTitle>HTTP Pull-Push Provider — Connections</DialogTitle>

            <DialogContent sx={{ pt: '16px !important', display: 'flex', gap: 2, overflow: 'hidden' }}>
                {loading
                    ? <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%', mt: 4 }}><CircularProgress /></Box>
                    : <>
                        {/* Izquierda — lista de conexiones */}
                        <Box sx={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Typography variant='caption' color='text.secondary' fontWeight='bold'>Connections</Typography>

                            <Box sx={{ flex: 1, border: 1, borderColor: 'divider', borderRadius: 1, overflowY: 'auto' }}>
                                {configs.length === 0
                                    ? <Typography variant='caption' color='text.disabled' sx={{ p: 1, display: 'block' }}>No connections yet.</Typography>
                                    : configs.map(config => (
                                        <Box key={config.name} sx={{
                                            display: 'flex', alignItems: 'center', px: 1, py: 0.5,
                                            borderBottom: 1, borderColor: 'divider',
                                            borderLeft: editingName === config.name ? 3 : 0, borderLeftColor: 'primary.main',
                                            bgcolor: editingName === config.name ? 'action.selected' : 'transparent',
                                            opacity: config.enabled ? 1 : 0.55
                                        }}>
                                            <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', cursor: 'pointer' }} onClick={() => startEdit(config)}>
                                                <Typography variant='body2' fontWeight='bold' noWrap>{config.name}</Typography>
                                                <Typography variant='caption' color='text.secondary' noWrap display='block'>{config.url || '—'}</Typography>
                                            </Box>
                                            <Chip size='small' label={config.enabled ? 'on' : 'off'}
                                                color={config.enabled ? 'success' : 'default'} sx={{ mr: 0.5 }} />
                                            <Tooltip title='Delete'>
                                                <span>
                                                    {/* aria-label con el nombre: hay un boton de borrar por fila y sin esto son
                                                        indistinguibles para un lector de pantalla (y para un test) */}
                                                    <IconButton size='small' color='error' aria-label={`Delete ${config.name}`}
                                                        disabled={deletingName === config.name || saving}
                                                        onClick={() => removeConnection(config.name)}>
                                                        {deletingName === config.name ? <CircularProgress size={12} /> : <Delete sx={{ fontSize: 14 }} />}
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                        </Box>
                                    ))
                                }
                            </Box>

                            <Stack direction='row' spacing={0.5}>
                                <Button size='small' startIcon={<Add />} onClick={startNew} sx={{ flex: 1 }}>New</Button>
                                <Button size='small' startIcon={<ContentCopy />} disabled={!showForm} onClick={startClone} sx={{ flex: 1 }}>Clone</Button>
                            </Stack>
                        </Box>

                        <Divider orientation='vertical' flexItem />

                        {/* Derecha — formulario de la conexion */}
                        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1.5, overflow: 'hidden' }}>
                            {!showForm
                                ? <Box sx={{ m: 'auto', color: 'text.disabled' }}>
                                    <Typography variant='body2'>Select a connection to edit or click New.</Typography>
                                  </Box>
                                : <>
                                    <Typography variant='caption' color='text.secondary' fontWeight='bold'>
                                        {editingName ? `Editing: ${editingName}` : 'New connection'}
                                    </Typography>

                                    <Box sx={{ flex: 1, overflowY: 'auto', pr: 1, pt: 1 }}>
                                        <Stack spacing={2}>

                                            <Stack direction='row' spacing={2} alignItems='center'>
                                                {/* 'Connection name' y no 'Name': es el identificador que usan los suscriptores, y
                                                    evita ambiguedad con el 'Name' del editor de cabeceras */}
                                                <TextField size='small' label='Connection name' value={form.name} sx={{ width: 220 }}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ name: e.target.value })} />
                                                <FormControlLabel label='Enabled' control={
                                                    <Switch checked={form.enabled} onChange={(_e, checked) => patch({ enabled: checked })} />
                                                } />
                                            </Stack>

                                            {!form.enabled &&
                                                <Alert severity='info'>
                                                    This connection is stored but not operative: it is not polled and delivers nothing.
                                                </Alert>
                                            }

                                            <Stack direction='row' spacing={2}>
                                                <FormControl size='small' sx={{ width: 120 }}>
                                                    <InputLabel>Method</InputLabel>
                                                    <Select label='Method' value={form.method}
                                                        onChange={e => patch({ method: e.target.value as EHttpMethod })}>
                                                        {Object.values(EHttpMethod).map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                                                    </Select>
                                                </FormControl>
                                                <TextField size='small' label='URL' value={form.url} sx={{ flex: 1 }}
                                                    placeholder='https://api.example.com/quotes'
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ url: e.target.value })} />
                                            </Stack>

                                            <Stack direction='row' spacing={2}>
                                                <TextField size='small' label='Interval (s)' type='number' sx={{ width: 130 }}
                                                    value={form.intervalSeconds}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ intervalSeconds: parseInt(e.target.value, 10) || 0 })}
                                                    slotProps={{ htmlInput: { min: 1 } }} />
                                                <TextField size='small' label='Timeout (ms)' type='number' sx={{ width: 140 }}
                                                    value={form.timeoutMs}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ timeoutMs: parseInt(e.target.value, 10) || 0 })}
                                                    slotProps={{ htmlInput: { min: 1 } }} />
                                                <TextField size='small' label='Retries' type='number' sx={{ width: 110 }}
                                                    value={form.retries}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ retries: parseInt(e.target.value, 10) || 0 })}
                                                    slotProps={{ htmlInput: { min: 0 } }} />
                                            </Stack>

                                            <Stack direction='row' spacing={2} alignItems='center' flexWrap='wrap' useFlexGap>
                                                <FormControl size='small' sx={{ width: 160 }}>
                                                    <InputLabel>Response</InputLabel>
                                                    <Select label='Response' value={form.responseType}
                                                        onChange={e => patch({ responseType: e.target.value as EResponseType })}>
                                                        <MenuItem value={EResponseType.JSON}>JSON (parsed)</MenuItem>
                                                        <MenuItem value={EResponseType.TEXT}>Text (raw)</MenuItem>
                                                    </Select>
                                                </FormControl>
                                                <FormControl size='small' sx={{ width: 200 }}>
                                                    <InputLabel>Emit</InputLabel>
                                                    <Select label='Emit' value={form.emitMode}
                                                        onChange={e => patch({ emitMode: e.target.value as EEmitMode })}>
                                                        <MenuItem value={EEmitMode.ALWAYS}>Always</MenuItem>
                                                        <MenuItem value={EEmitMode.ON_CHANGE}>Only when it changes</MenuItem>
                                                    </Select>
                                                </FormControl>
                                                <FormControlLabel label='Accept self-signed certificates' control={
                                                    <Switch checked={form.allowInsecureTls} disabled={!isHttps}
                                                        onChange={(_e, checked) => patch({ allowInsecureTls: checked })} />
                                                } />
                                            </Stack>

                                            <Divider />

                                            {/* Autenticacion: los campos dependen del modo elegido */}
                                            <Stack direction='row' spacing={2} alignItems='center' flexWrap='wrap' useFlexGap>
                                                <FormControl size='small' sx={{ width: 160 }}>
                                                    <InputLabel>Auth</InputLabel>
                                                    <Select label='Auth' value={form.auth.type}
                                                        onChange={e => patchAuth({ type: e.target.value as EAuthType })}>
                                                        <MenuItem value={EAuthType.NONE}>None</MenuItem>
                                                        <MenuItem value={EAuthType.BASIC}>Basic</MenuItem>
                                                        <MenuItem value={EAuthType.BEARER}>Bearer token</MenuItem>
                                                        <MenuItem value={EAuthType.HEADER}>Custom header</MenuItem>
                                                    </Select>
                                                </FormControl>

                                                {form.auth.type === EAuthType.BASIC && <>
                                                    <TextField size='small' label='Username' value={form.auth.username ?? ''} sx={{ width: 200 }}
                                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => patchAuth({ username: e.target.value })} />
                                                    <SecretField label='Password' value={form.auth.password ?? ''}
                                                        onChange={v => patchAuth({ password: v })} />
                                                </>}

                                                {form.auth.type === EAuthType.BEARER &&
                                                    <SecretField label='Token' value={form.auth.token ?? ''} width={360}
                                                        onChange={v => patchAuth({ token: v })} />
                                                }

                                                {form.auth.type === EAuthType.HEADER && <>
                                                    <TextField size='small' label='Header name' value={form.auth.headerName ?? ''} sx={{ width: 200 }}
                                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => patchAuth({ headerName: e.target.value })} />
                                                    <SecretField label='Header value' value={form.auth.headerValue ?? ''}
                                                        onChange={v => patchAuth({ headerValue: v })} />
                                                </>}
                                            </Stack>

                                            <Divider />

                                            <HeaderEditor headers={form.headers} onChange={h => patch({ headers: h })} />

                                            {showBody &&
                                                <TextField size='small' label='Body' multiline minRows={3} value={form.body ?? ''}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ body: e.target.value })} />
                                            }
                                        </Stack>
                                    </Box>

                                    {errors.length > 0 &&
                                        <Alert severity='warning' sx={{ py: 0 }}>
                                            {errors.map((e, i) => <div key={i}>{e}</div>)}
                                        </Alert>
                                    }
                                    {error && <Alert severity='error' sx={{ py: 0 }}>{error}</Alert>}

                                    {/* Resultado de la prueba: lo ha ejecutado el back, no el navegador */}
                                    {testResult &&
                                        <Alert severity={testResult.ok ? (testResult.status && testResult.status < 400 ? 'success' : 'warning') : 'error'} sx={{ py: 0 }}>
                                            {testResult.ok
                                                ? <>
                                                    <Typography variant='body2'>
                                                        HTTP {testResult.status} · {testResult.durationMs} ms · {testResult.bytes} bytes
                                                        {form.responseType === EResponseType.JSON && testResult.jsonParsed === false && ' · body is not valid JSON'}
                                                    </Typography>
                                                    {testResult.preview &&
                                                        <Box component='pre' sx={{ m: 0, mt: 0.5, maxHeight: 120, overflow: 'auto', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                                            {testResult.preview}
                                                        </Box>
                                                    }
                                                  </>
                                                : <Typography variant='body2'>{testResult.error} ({testResult.durationMs} ms)</Typography>
                                            }
                                        </Alert>
                                    }

                                    <Stack direction='row' justifyContent='flex-end' spacing={1}>
                                        <Tooltip title='Run the request now, from the Kwirth backend — the same network, certificates and identity the real polling uses'>
                                            <span>
                                                <Button size='small' disabled={testing || saving} onClick={testConnection}>
                                                    {testing ? <CircularProgress size={14} /> : 'Test'}
                                                </Button>
                                            </span>
                                        </Tooltip>
                                        <Button size='small' variant='contained' disabled={saving || testing} onClick={submitForm}>
                                            {saving ? <CircularProgress size={14} /> : editingName ? 'Update' : 'Add'}
                                        </Button>
                                        <Button size='small' disabled={saving} onClick={() => { setShowForm(false); setEditingName(undefined); setErrors([]); setTestResult(undefined) }}>Cancel</Button>
                                    </Stack>
                                </>
                            }
                        </Box>
                    </>
                }
            </DialogContent>

            <DialogActions sx={{ justifyContent: 'space-between', px: 2 }}>
                <Stack direction='row' spacing={1}>
                    <input ref={importFileRef} type='file' accept='.json' style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) openImport(f) }} />
                    <Tooltip title='Export connections to JSON'>
                        <span>
                            <Button size='small' startIcon={<Download />} disabled={configs.length === 0}
                                onClick={() => { setExportSelected(new Set(configs.map(c => c.name))); setExportWithCredentials(false); setExportOpen(true) }}>
                                Export
                            </Button>
                        </span>
                    </Tooltip>
                    <Tooltip title='Import connections from JSON'>
                        <Button size='small' startIcon={<Upload />} onClick={() => importFileRef.current?.click()}>Import</Button>
                    </Tooltip>
                </Stack>
                <Button onClick={onClose} disabled={saving}>Close</Button>
            </DialogActions>
        </Dialog>

        {/* Export — seleccion de conexiones y decision sobre las credenciales */}
        <Dialog open={exportOpen} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '480px' } }}>
            <DialogTitle>Export connections</DialogTitle>
            <DialogContent sx={{ pt: '16px !important' }}>
                <Stack spacing={1}>
                    <FormControlLabel
                        label='Select all'
                        control={<Checkbox
                            checked={exportSelected.size === configs.length && configs.length > 0}
                            indeterminate={exportSelected.size > 0 && exportSelected.size < configs.length}
                            onChange={(_e, checked) => setExportSelected(checked ? new Set(configs.map(c => c.name)) : new Set())} />} />
                    <Box sx={{ maxHeight: 220, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 1, px: 1 }}>
                        {configs.map(config => (
                            <FormControlLabel key={config.name} label={config.name} sx={{ display: 'block' }}
                                control={<Checkbox checked={exportSelected.has(config.name)}
                                    onChange={(_e, checked) => setExportSelected(prev => {
                                        const next = new Set(prev)
                                        if (checked) next.add(config.name)
                                        else next.delete(config.name)
                                        return next
                                    })} />} />
                        ))}
                    </Box>
                    <FormControlLabel
                        label='Include credentials'
                        control={<Checkbox checked={exportWithCredentials} onChange={(_e, checked) => setExportWithCredentials(checked)} />} />
                    {exportWithCredentials
                        ? <Alert severity='warning'>
                            Passwords, tokens and header values will be written to the file in clear text. Treat it as a secret.
                          </Alert>
                        : <Alert severity='info'>
                            Credentials are left empty. Whoever imports the file will have to type them again.
                          </Alert>
                    }
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button variant='contained' disabled={exportSelected.size === 0} onClick={doExport}>Export</Button>
                <Button onClick={() => setExportOpen(false)}>Cancel</Button>
            </DialogActions>
        </Dialog>

        {/* Import — seleccion de lo que trae el fichero */}
        <Dialog open={importData !== undefined} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '480px' } }}>
            <DialogTitle>Import connections</DialogTitle>
            <DialogContent sx={{ pt: '16px !important' }}>
                <Stack spacing={1}>
                    {importData?.configs.length === 0
                        ? <Typography variant='body2' color='text.secondary'>The file has no connections.</Typography>
                        : <>
                            <FormControlLabel
                                label='Select all'
                                control={<Checkbox
                                    checked={importSelected.size === (importData?.configs.length ?? 0) && (importData?.configs.length ?? 0) > 0}
                                    indeterminate={importSelected.size > 0 && importSelected.size < (importData?.configs.length ?? 0)}
                                    onChange={(_e, checked) => setImportSelected(checked ? new Set(importData?.configs.map(c => c.name) ?? []) : new Set())} />} />
                            <Box sx={{ maxHeight: 220, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 1, px: 1 }}>
                                {importData?.configs.map(config => (
                                    <FormControlLabel key={config.name} sx={{ display: 'block' }}
                                        label={<>
                                            {config.name}
                                            {configs.some(c => c.name === config.name) &&
                                                <Chip size='small' label='replaces' color='warning' variant='outlined' sx={{ ml: 1 }} />}
                                        </>}
                                        control={<Checkbox checked={importSelected.has(config.name)}
                                            onChange={(_e, checked) => setImportSelected(prev => {
                                                const next = new Set(prev)
                                                if (checked) next.add(config.name)
                                                else next.delete(config.name)
                                                return next
                                            })} />} />
                                ))}
                            </Box>
                            {importReplacing > 0 &&
                                <Alert severity='warning'>
                                    {importReplacing} existing connection(s) will be replaced.
                                </Alert>
                            }
                            {importData?.credentialsIncluded === false &&
                                <Alert severity='info'>
                                    The file carries no credentials: you will have to type them after importing.
                                </Alert>
                            }
                        </>
                    }
                    {errors.length > 0 && <Alert severity='warning'>{errors.map((e, i) => <div key={i}>{e}</div>)}</Alert>}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button variant='contained' disabled={importSelected.size === 0 || saving} onClick={doImport}>Import</Button>
                <Button onClick={() => { setImportData(undefined); setErrors([]) }}>Cancel</Button>
            </DialogActions>
        </Dialog>
    </>
}

export default HttpPullPushConfigDialog
