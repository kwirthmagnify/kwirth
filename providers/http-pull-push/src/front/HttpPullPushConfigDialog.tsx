import React, { useEffect, useState } from 'react'
import {
    Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
    DialogTitle, Divider, FormControl, FormControlLabel, IconButton, InputLabel, MenuItem,
    Select, Stack, Switch, TextField, Tooltip, Typography
} from '@mui/material'
import { Add, ContentCopy, Delete } from '@mui/icons-material'
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

// The provider owns its configuration: this dialog talks to ITS router, mounted by the core behind
// accessKey validation, and not to the core's generic config endpoint.
const CONFIG_URL = (backendUrl: string) => `${backendUrl}/core/providerconfig/http-pull-push/configs`
const TEST_URL = (backendUrl: string) => `${backendUrl}/core/providerconfig/http-pull-push/test`

const METHODS_WITH_BODY = [EHttpMethod.POST, EHttpMethod.PUT, EHttpMethod.PATCH]

const authHeaders = (accessString: string) => ({
    Authorization: accessString ? `Bearer ${accessString}` : '',
    'Content-Type': 'application/json',
    'X-Kwirth-App': 'true'
})

const HttpPullPushConfigDialog: React.FC<IHttpPullPushConfigDialogProps> = ({ onClose, backendUrl, accessString }) => {
    const [configs, setConfigs] = useState<IHttpPullConfig[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [deletingName, setDeletingName] = useState<string | undefined>()
    const [error, setError] = useState<string | undefined>()
    const [errors, setErrors] = useState<string[]>([])

    // Form: 'editingName' with a value = editing that connection; undefined with showForm = a new one.
    const [showForm, setShowForm] = useState(false)
    const [editingName, setEditingName] = useState<string | undefined>()
    const [form, setForm] = useState<IHttpPullConfig>(newHttpPullConfig(''))

    // Connection test, executed on the back end
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<IHttpPullTestResult | undefined>()

    useEffect(() => {
        fetch(CONFIG_URL(backendUrl), { headers: { Authorization: accessString ? `Bearer ${accessString}` : '', 'X-Kwirth-App': 'true' } })
            .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
            .then((data: IHttpPullConfig[]) => setConfigs(Array.isArray(data) ? data : []))
            .catch(err => setError(`Failed to load connections: ${err}`))
            .finally(() => setLoading(false))
    }, [])

    /*
        Persists the complete list. The provider validates, saves (credentials to the Secret, the rest to
        the ConfigMap) and reconciles its pollers hot, so every action takes effect at once.
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
        The BACK END runs the test with the connection exactly as it stands in the form, without saving it.
        It has to be the back end because it is the one with the cluster's network, the certificates and
        the identity the real pull will be made with: a test from the browser would say nothing.
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

    /*
        🔴 Aqui vivian `doExport`, `openImport` y `doImport`, y se fueron con los botones del pie (ver
        el comentario en DialogActions). Lo que importa recordar de ellos:

        · `doImport` FUSIONABA — partia de las conexiones de aqui y encima ponia las del fichero por
          nombre, asi que importar no podia QUITAR ninguna. El bundle REEMPLAZA: lo que queda es
          exactamente lo que traia el fichero.
        · `doExport` estaba BIEN hecho —casilla de credenciales y aviso de texto en claro— y aun asi
          sobraba: era una segunda puerta al mismo almacen, y lo que se arregla aqui no es un peligro
          sino que hubiera dos sitios donde mirar.

        Las conexiones viajan en ☰ Kwirth export, como las de cualquier otra extension.
    */

    const showBody = METHODS_WITH_BODY.includes(form.method)
    const isHttps = (form.url ?? '').toLowerCase().startsWith('https://')

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

            {/*
                Aqui estaban Export e Import. Se fueron porque las conexiones de este provider viajan en
                ☰ Kwirth export, la puerta de TODAS las extensiones, y tener dos obligaba a investigar
                cual exportaba que.

                🔴 Y porque el import de aqui FUSIONABA —reemplazaba las conexiones cuyo nombre ya
                existia y añadia las nuevas, sin quitar nada— mientras que el bundle REEMPLAZA: lo que
                queda tras importar es exactamente lo que traia el fichero. El mismo contenido dejaba el
                sistema en dos estados distintos segun por donde entrara, y nada lo advertia.
            */}
            <DialogActions sx={{ justifyContent: 'flex-end', px: 2 }}>
                <Button onClick={onClose} disabled={saving}>Close</Button>
            </DialogActions>
        </Dialog>

    </>
}

export default HttpPullPushConfigDialog
