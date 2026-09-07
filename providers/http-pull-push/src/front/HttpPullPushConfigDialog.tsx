import React, { useEffect, useState } from 'react'
import {
    Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
    Divider, FormControl, FormControlLabel, IconButton, InputLabel, List, ListItemButton, MenuItem,
    Select, Stack, Switch, TextField, Tooltip, Typography
} from '@mui/material'
import { Add, Delete } from '@mui/icons-material'
import {
    EAuthType, EEmitMode, EHttpMethod, EResponseType, IHttpPullConfig, newHttpPullConfig
} from '../common/HttpPullPush'
import { validateConfigs } from '../common/Validation'
import HeaderEditor from './HeaderEditor'
import SecretField from './SecretField'

interface IHttpPullPushConfigDialogProps {
    onClose: () => void
    backendUrl: string
    accessString: string
}

// El provider es dueño de su configuracion: este dialogo habla con SU router, montado por el core detras
// de validacion de accessKey, y no con el endpoint de config generico del core.
const CONFIG_URL = (backendUrl: string) => `${backendUrl}/core/providerconfig/http-pull-push/configs`

const authHeaders = (accessString: string) => ({
    Authorization: accessString ? `Bearer ${accessString}` : '',
    'Content-Type': 'application/json',
    'X-Kwirth-App': 'true'
})

const METHODS_WITH_BODY = [EHttpMethod.POST, EHttpMethod.PUT, EHttpMethod.PATCH]

const HttpPullPushConfigDialog: React.FC<IHttpPullPushConfigDialogProps> = ({ onClose, backendUrl, accessString }) => {
    const [configs, setConfigs] = useState<IHttpPullConfig[]>([])
    const [selected, setSelected] = useState(0)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | undefined>()
    const [errors, setErrors] = useState<string[]>([])

    useEffect(() => {
        fetch(CONFIG_URL(backendUrl), { headers: { Authorization: accessString ? `Bearer ${accessString}` : '', 'X-Kwirth-App': 'true' } })
            .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
            .then((data: IHttpPullConfig[]) => setConfigs(Array.isArray(data) ? data : []))
            .catch(err => setError(`Failed to load connections: ${err}`))
            .finally(() => setLoading(false))
    }, [])

    const current: IHttpPullConfig | undefined = configs[selected]

    const patch = (changes: Partial<IHttpPullConfig>) => {
        setConfigs(prev => prev.map((c, i) => i === selected ? { ...c, ...changes } : c))
    }

    const patchAuth = (changes: Partial<IHttpPullConfig['auth']>) => {
        setConfigs(prev => prev.map((c, i) => i === selected ? { ...c, auth: { ...c.auth, ...changes } } : c))
    }

    const addConnection = () => {
        const used = new Set(configs.map(c => c.name))
        let index = configs.length + 1
        while (used.has(`connection-${index}`)) index++
        setConfigs(prev => [...prev, newHttpPullConfig(`connection-${index}`)])
        setSelected(configs.length)
    }

    const removeConnection = (index: number) => {
        setConfigs(prev => prev.filter((_, i) => i !== index))
        if (selected >= index && selected > 0) setSelected(selected - 1)
    }

    const save = async () => {
        const found = validateConfigs(configs)
        setErrors(found)
        if (found.length > 0) return

        setSaving(true)
        setError(undefined)
        try {
            const res = await fetch(CONFIG_URL(backendUrl), {
                method: 'PUT',
                headers: authHeaders(accessString),
                body: JSON.stringify(configs)
            })
            if (!res.ok) {
                const payload = await res.json().catch(() => undefined)
                if (payload?.errors) {
                    setErrors(payload.errors as string[])
                    return
                }
                throw new Error(`HTTP ${res.status}`)
            }
            onClose()
        }
        catch (err) {
            setError(`Failed to save: ${err}`)
        }
        finally {
            setSaving(false)
        }
    }

    const showBody = current !== undefined && METHODS_WITH_BODY.includes(current.method)
    const isHttps = (current?.url ?? '').toLowerCase().startsWith('https://')

    return <Dialog open maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '960px', height: '680px' } }}>
        <DialogTitle>HTTP Pull-Push Provider — Connections</DialogTitle>

        <DialogContent sx={{ pt: '16px !important', overflow: 'hidden' }}>
            {loading
                ? <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
                : <Stack direction='row' spacing={2} sx={{ height: '100%' }}>

                    {/* Maestro: lista de conexiones */}
                    <Stack sx={{ width: 260, flexShrink: 0 }}>
                        <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 1 }}>
                            <Typography variant='subtitle2' sx={{ flex: 1 }}>Connections</Typography>
                            <Tooltip title='Add connection'>
                                <IconButton size='small' onClick={addConnection}>
                                    <Add fontSize='small' />
                                </IconButton>
                            </Tooltip>
                        </Stack>

                        <Box sx={{ flex: 1, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                            {configs.length === 0 &&
                                <Typography variant='body2' color='text.secondary' sx={{ p: 1.5 }}>
                                    No connections yet.
                                </Typography>
                            }
                            <List dense disablePadding>
                                {configs.map((c, i) => (
                                    <ListItemButton key={i} selected={i === selected} onClick={() => setSelected(i)}
                                        sx={{ opacity: c.enabled ? 1 : 0.55 }}>
                                        <Stack sx={{ flex: 1, minWidth: 0 }}>
                                            <Typography variant='body2' noWrap sx={{ fontWeight: 500 }}>{c.name}</Typography>
                                            <Typography variant='caption' color='text.secondary' noWrap>{c.url || '—'}</Typography>
                                        </Stack>
                                        <Chip size='small' label={c.enabled ? 'on' : 'off'}
                                            color={c.enabled ? 'success' : 'default'} sx={{ ml: 1 }} />
                                    </ListItemButton>
                                ))}
                            </List>
                        </Box>
                    </Stack>

                    <Divider orientation='vertical' flexItem />

                    {/* Detalle: la conexion seleccionada */}
                    <Box sx={{ flex: 1, overflowY: 'auto', pr: 1 }}>
                        {current === undefined
                            ? <Typography variant='body2' color='text.secondary'>
                                Select a connection, or add one to get started.
                              </Typography>
                            : <Stack spacing={2}>

                                <Stack direction='row' spacing={2} alignItems='center'>
                                    <TextField size='small' label='Name' value={current.name} sx={{ width: 220 }}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ name: e.target.value })} />
                                    <FormControlLabel label='Enabled' control={
                                        <Switch checked={current.enabled} onChange={(_e, checked) => patch({ enabled: checked })} />
                                    } />
                                    <Box sx={{ flex: 1 }} />
                                    <Tooltip title='Delete connection'>
                                        <IconButton size='small' color='error' onClick={() => removeConnection(selected)}>
                                            <Delete fontSize='small' />
                                        </IconButton>
                                    </Tooltip>
                                </Stack>

                                {!current.enabled &&
                                    <Alert severity='info'>
                                        This connection is stored but not operative: it is not polled and delivers nothing.
                                    </Alert>
                                }

                                <Stack direction='row' spacing={2}>
                                    <FormControl size='small' sx={{ width: 120 }}>
                                        <InputLabel>Method</InputLabel>
                                        <Select label='Method' value={current.method}
                                            onChange={e => patch({ method: e.target.value as EHttpMethod })}>
                                            {Object.values(EHttpMethod).map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                                        </Select>
                                    </FormControl>
                                    <TextField size='small' label='URL' value={current.url} sx={{ flex: 1 }}
                                        placeholder='https://api.example.com/quotes'
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ url: e.target.value })} />
                                </Stack>

                                <Stack direction='row' spacing={2}>
                                    <TextField size='small' label='Interval (s)' type='number' sx={{ width: 130 }}
                                        value={current.intervalSeconds}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ intervalSeconds: parseInt(e.target.value, 10) || 0 })}
                                        slotProps={{ htmlInput: { min: 1 } }} />
                                    <TextField size='small' label='Timeout (ms)' type='number' sx={{ width: 140 }}
                                        value={current.timeoutMs}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ timeoutMs: parseInt(e.target.value, 10) || 0 })}
                                        slotProps={{ htmlInput: { min: 1 } }} />
                                    <TextField size='small' label='Retries' type='number' sx={{ width: 110 }}
                                        value={current.retries}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ retries: parseInt(e.target.value, 10) || 0 })}
                                        slotProps={{ htmlInput: { min: 0 } }} />
                                </Stack>

                                <Stack direction='row' spacing={2} alignItems='center'>
                                    <FormControl size='small' sx={{ width: 160 }}>
                                        <InputLabel>Response</InputLabel>
                                        <Select label='Response' value={current.responseType}
                                            onChange={e => patch({ responseType: e.target.value as EResponseType })}>
                                            <MenuItem value={EResponseType.JSON}>JSON (parsed)</MenuItem>
                                            <MenuItem value={EResponseType.TEXT}>Text (raw)</MenuItem>
                                        </Select>
                                    </FormControl>
                                    <FormControl size='small' sx={{ width: 200 }}>
                                        <InputLabel>Emit</InputLabel>
                                        <Select label='Emit' value={current.emitMode}
                                            onChange={e => patch({ emitMode: e.target.value as EEmitMode })}>
                                            <MenuItem value={EEmitMode.ALWAYS}>Always</MenuItem>
                                            <MenuItem value={EEmitMode.ON_CHANGE}>Only when it changes</MenuItem>
                                        </Select>
                                    </FormControl>
                                    <FormControlLabel label='Accept self-signed certificates' control={
                                        <Switch checked={current.allowInsecureTls} disabled={!isHttps}
                                            onChange={(_e, checked) => patch({ allowInsecureTls: checked })} />
                                    } />
                                </Stack>

                                <Divider />

                                {/* Autenticacion: los campos dependen del modo elegido */}
                                <Stack direction='row' spacing={2} alignItems='center' flexWrap='wrap' useFlexGap>
                                    <FormControl size='small' sx={{ width: 160 }}>
                                        <InputLabel>Auth</InputLabel>
                                        <Select label='Auth' value={current.auth.type}
                                            onChange={e => patchAuth({ type: e.target.value as EAuthType })}>
                                            <MenuItem value={EAuthType.NONE}>None</MenuItem>
                                            <MenuItem value={EAuthType.BASIC}>Basic</MenuItem>
                                            <MenuItem value={EAuthType.BEARER}>Bearer token</MenuItem>
                                            <MenuItem value={EAuthType.HEADER}>Custom header</MenuItem>
                                        </Select>
                                    </FormControl>

                                    {current.auth.type === EAuthType.BASIC && <>
                                        <TextField size='small' label='Username' value={current.auth.username ?? ''} sx={{ width: 200 }}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => patchAuth({ username: e.target.value })} />
                                        <SecretField label='Password' value={current.auth.password ?? ''}
                                            onChange={v => patchAuth({ password: v })} />
                                    </>}

                                    {current.auth.type === EAuthType.BEARER &&
                                        <SecretField label='Token' value={current.auth.token ?? ''} width={360}
                                            onChange={v => patchAuth({ token: v })} />
                                    }

                                    {current.auth.type === EAuthType.HEADER && <>
                                        <TextField size='small' label='Header name' value={current.auth.headerName ?? ''} sx={{ width: 200 }}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => patchAuth({ headerName: e.target.value })} />
                                        <SecretField label='Header value' value={current.auth.headerValue ?? ''}
                                            onChange={v => patchAuth({ headerValue: v })} />
                                    </>}
                                </Stack>

                                <Divider />

                                <HeaderEditor headers={current.headers} onChange={h => patch({ headers: h })} />

                                {showBody &&
                                    <TextField size='small' label='Body' multiline minRows={3} value={current.body ?? ''}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ body: e.target.value })} />
                                }
                            </Stack>
                        }
                    </Box>
                </Stack>
            }
        </DialogContent>

        <Box sx={{ px: 3 }}>
            {error && <Alert severity='error' sx={{ mb: 1 }}>{error}</Alert>}
            {errors.length > 0 &&
                <Alert severity='warning' sx={{ mb: 1 }}>
                    {errors.map((e, i) => <div key={i}>{e}</div>)}
                </Alert>
            }
        </Box>

        <DialogActions>
            <Button onClick={save} variant='contained' disabled={loading || saving}>Save</Button>
            <Button onClick={onClose} disabled={saving}>Cancel</Button>
        </DialogActions>
    </Dialog>
}

export default HttpPullPushConfigDialog
