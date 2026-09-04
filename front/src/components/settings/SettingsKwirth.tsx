import React, { useState, useEffect, useContext } from 'react'
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, FormControlLabel, IconButton, InputAdornment, Stack, Tab, Tabs, TextField, Tooltip, Typography } from '@mui/material'
import { Add, Delete, Refresh, Visibility, VisibilityOff } from '@kwirthmagnify/kwirth-common-front/icons'
import { DialogTitleHelp } from '@kwirthmagnify/kwirth-common-front'
import { IKwirthSettings, IMarketplace, EMarketplaceAuthType } from '@kwirthmagnify/kwirth-common'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addGetAuthorization, addPutAuthorization } from '../../tools/AuthorizationManagement'

// Enum semantico como id de tab (regla: nunca numeros)
enum ESettingsKwirthTab {
    GENERAL = 'general',
    MARKETPLACES = 'marketplaces'
}

// Fila editable: IMarketplace mas la contraseña en claro mientras se edita. Solo se envia si el usuario
// la escribe; si la deja vacia y ya habia una guardada, el back conserva la existente.
interface IMarketplaceRow extends IMarketplace {
    password?: string
    revealed?: boolean
    testing?: boolean
    testResult?: string
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

    const addRow = () => {
        setMarketplaces(prev => [...prev, {
            id: `marketplace-${Date.now()}`,
            url: '',
            label: '',
            enabled: true,
            auth: { type: EMarketplaceAuthType.NONE }
        }])
    }

    // Comprueba solo que el manifest se lee. Las credenciales NO se pueden validar aqui: solo entran en
    // juego al descargar un paquete, asi que una contraseña mal puesta no se detecta hasta instalar.
    const testRow = async (index: number) => {
        const row = marketplaces[index]
        patchRow(index, { testing: true, testResult: undefined })
        try {
            const response = await fetch(row.url)
            if (!response.ok) {
                patchRow(index, { testing: false, testResult: `Manifest returned ${response.status}` })
                return
            }
            const body = await response.json()
            patchRow(index, {
                testing: false,
                testResult: Array.isArray(body) ? `Manifest OK, ${body.length} entries` : 'Manifest is not a list of extensions'
            })
        }
        catch {
            patchRow(index, { testing: false, testResult: 'Could not reach the manifest' })
        }
    }

    const rowsValid = () => marketplaces.every(m =>
        /^https?:\/\/.+/i.test(m.url) &&
        m.label.trim() !== '' &&
        (m.auth?.type !== EMarketplaceAuthType.BASIC || (m.auth.username ?? '').trim() !== '')
    )

    const ok = async () => {
        setError('')
        try {
            const cleaned = marketplaces.map(m => ({
                id: m.id,
                url: m.url.trim(),
                label: m.label.trim(),
                enabled: m.enabled,
                ...(m.auth ? { auth: { type: m.auth.type, ...(m.auth.username ? { username: m.auth.username.trim() } : {}) } } : {}),
                ...(m.password ? { password: m.password } : {})
            }))
            const payload = JSON.stringify({ metricsInterval, marketplaces: cleaned })
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
        const basic = m.auth?.type === EMarketplaceAuthType.BASIC
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
                        control={<Checkbox checked={basic} onChange={e => patchRow(index, { auth: { type: e.target.checked ? EMarketplaceAuthType.BASIC : EMarketplaceAuthType.NONE, username: m.auth?.username, hasPassword: m.auth?.hasPassword } })} />}
                        label='Package registry needs credentials' />
                    <TextField value={m.auth?.username ?? ''} onChange={e => patchRow(index, { auth: { type: m.auth?.type ?? EMarketplaceAuthType.BASIC, username: e.target.value, hasPassword: m.auth?.hasPassword } })}
                        variant='standard' label='User' sx={{ width: '20%' }} disabled={!basic} />
                    <TextField value={m.password ?? ''} onChange={e => patchRow(index, { password: e.target.value })}
                        variant='standard' label={m.auth?.hasPassword && !m.password ? 'Password (already set)' : 'Password'}
                        type={m.revealed ? 'text' : 'password'} sx={{ width: '25%' }} disabled={!basic}
                        slotProps={{ input: { endAdornment: (
                            <InputAdornment position='end'>
                                <IconButton size='small' onClick={() => patchRow(index, { revealed: !m.revealed })} disabled={!basic}>
                                    { m.revealed ? <VisibilityOff fontSize='small' /> : <Visibility fontSize='small' /> }
                                </IconButton>
                            </InputAdornment>) } }} />
                </Stack>
                { m.testing && <Stack direction='row' spacing={1} alignItems='center' sx={{ mt: 1 }}><CircularProgress size={14} /><Typography variant='caption'>Reading manifest…</Typography></Stack> }
                { m.testResult && <Typography variant='caption' color={m.testResult.startsWith('Manifest OK') ? 'success.main' : 'error.main'}>{m.testResult}</Typography> }
            </Box>
        )
    }

    return (<>
        <Dialog open={true} fullWidth maxWidth='md' disableRestoreFocus={true}>
            <DialogTitleHelp section='guide/admin/02-initial-config?id=kwirth-settings' docsUrl={backendUrl + '/core/docs/core/kwirth'}>Kwirth settings</DialogTitleHelp>
            <DialogContent sx={{ height: 460, overflowY: 'auto' }}>
                <Tabs value={tab} onChange={(_e, v) => setTab(v as ESettingsKwirthTab)}>
                    <Tab label='General' value={ESettingsKwirthTab.GENERAL} />
                    <Tab label='Marketplaces' value={ESettingsKwirthTab.MARKETPLACES} />
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
