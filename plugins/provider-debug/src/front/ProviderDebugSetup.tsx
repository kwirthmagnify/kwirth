import React, { useEffect, useRef, useState } from 'react'
import { Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Select, Stack, Tab, Tabs, TextField, Tooltip, Typography } from '@mui/material'
import { ISetupProps } from '@kwirthmagnify/kwirth-common-front'
import { DataObjectOutlined } from '@mui/icons-material'
import { IProviderDebugConfig, ProviderDebugConfig, ProviderDebugInstanceConfig } from './ProviderDebugConfig'
import { IProviderDebugData } from './ProviderDebugData'
import { EProviderDebugProviderState, IProviderDebugCatalogueEntry, IProviderDebugInstanceConfig, IProviderDebugProviderOption, IProviderDebugSubscriptionField, IProviderDebugSubscriptionHelp } from '../common/ProviderDebugTypes'

export const ProviderDebugIcon = <DataObjectOutlined />

/** Cómo se está editando el payload. Nunca comparar contra literales sueltos. */
enum EPayloadMode {
    FORM = 'form',
    JSON = 'json'
}

export const ProviderDebugSetup: React.FC<ISetupProps> = (props: ISetupProps) => {
    const instanceConfig: IProviderDebugInstanceConfig = props.setupConfig?.channelInstanceConfig || new ProviderDebugInstanceConfig()
    const config: IProviderDebugConfig = props.setupConfig?.channelConfig || new ProviderDebugConfig()
    const data: IProviderDebugData | undefined = props.channelObject.data

    const [providerId, setProviderId] = useState(instanceConfig.providerId)
    const [subscriptionData, setSubscriptionData] = useState(instanceConfig.subscriptionData)
    const [maxEvents, setMaxEvents] = useState(config.maxEvents)
    const [catalogue, setCatalogue] = useState<IProviderDebugCatalogueEntry[]>([])
    const [catalogueLoaded, setCatalogueLoaded] = useState(false)
    const [mode, setMode] = useState<EPayloadMode>(EPayloadMode.FORM)
    const defaultRef = useRef<HTMLInputElement | null>(null)

    // GET /core/providers es la vista COMPLETA del core: instalados + los de core (events, metrics),
    // cada uno con si está vivo y con la ayuda que publica. Está disponible sin arrancar nada, así
    // que el desplegable sale poblado y marcado desde el primer momento.
    useEffect(() => {
        const url = props.channelObject.clusterUrl
        if (!url) return
        const token = props.channelObject.accessString
        fetch(`${url}/core/providers`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
            .then(r => r.json())
            .then((list: IProviderDebugCatalogueEntry[]) => {
                setCatalogue(Array.isArray(list) ? list.filter(p => p && p.id) : [])
                setCatalogueLoaded(true)
            })
            .catch(() => { })
    }, [])

    const options = (): IProviderDebugProviderOption[] => {
        // Si el endpoint no responde queda el catálogo que el canal manda por websocket, que solo
        // contiene providers vivos y solo existe tras haber arrancado la instancia una vez.
        const source: IProviderDebugProviderOption[] = catalogueLoaded
            ? catalogue.map(e => ({
                id: e.id,
                state: e.running ? EProviderDebugProviderState.RUNNING : EProviderDebugProviderState.NOT_RUNNING,
                help: e.subscriptionHelp
            }))
            : (data?.providers ?? []).map(p => ({ id: p.id, state: EProviderDebugProviderState.UNKNOWN, help: p.help }))

        // el provider ya configurado se mantiene aunque haya desaparecido del catálogo
        if (providerId && !source.some(o => o.id === providerId)) source.push({ id: providerId, state: EProviderDebugProviderState.UNKNOWN })
        return source.sort((a, b) => a.id.localeCompare(b.id))
    }

    const help: IProviderDebugSubscriptionHelp | undefined = options().find(o => o.id === providerId)?.help
    const fields: IProviderDebugSubscriptionField[] = help?.fields ?? []

    const invalidJson = (): boolean => {
        if (!subscriptionData || subscriptionData.trim() === '') return false
        try {
            JSON.parse(subscriptionData)
            return false
        }
        catch {
            return true
        }
    }

    // El JSON es la única fuente de verdad; el formulario solo lo lee y lo reescribe. Así se puede
    // saltar de una vista a otra sin sincronizar dos estados que se contradigan.
    const payload = (): Record<string, unknown> => {
        if (!subscriptionData || subscriptionData.trim() === '') return {}
        try {
            const parsed = JSON.parse(subscriptionData)
            return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed as Record<string, unknown> : {}
        }
        catch {
            return {}
        }
    }

    const setField = (name: string, value: unknown): void => {
        const obj = payload()
        if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) delete obj[name]
        else obj[name] = value
        setSubscriptionData(Object.keys(obj).length === 0 ? '' : JSON.stringify(obj, null, 2))
    }

    const useExample = (): void => {
        if (help) setSubscriptionData(JSON.stringify(help.example, null, 2))
    }

    const renderField = (field: IProviderDebugSubscriptionField) => {
        const current = payload()[field.name]
        const label = field.required ? `${field.name} *` : field.name
        switch (field.type) {
            case 'boolean':
                return (
                    <FormControlLabel key={field.name}
                        control={<Checkbox checked={current === true} onChange={(e) => setField(field.name, e.target.checked ? true : undefined)} />}
                        label={<Stack direction='column'><Typography variant='body2'>{label}</Typography><Typography variant='caption' color='text.secondary'>{field.description}</Typography></Stack>}
                    />
                )
            case 'number':
                return <TextField key={field.name} value={current ?? ''} onChange={(e) => setField(field.name, e.target.value === '' ? undefined : Number(e.target.value))} type='number' variant='standard' label={label} helperText={field.description} fullWidth />
            case 'string[]':
                return <TextField key={field.name} value={Array.isArray(current) ? (current as unknown[]).join(', ') : ''} onChange={(e) => setField(field.name, e.target.value.split(',').map(s => s.trim()).filter(Boolean))} variant='standard' label={label} helperText={`${field.description} — comma separated`} fullWidth />
            default:
                return <TextField key={field.name} value={typeof current === 'string' ? current : ''} onChange={(e) => setField(field.name, e.target.value)} variant='standard' label={label} helperText={field.description} fullWidth />
        }
    }

    const renderHelp = () => {
        if (!providerId) return <Typography variant='caption' color='text.secondary'>Pick a provider to see how to subscribe to it.</Typography>
        if (!help) {
            return (
                <Typography variant='caption' color='text.secondary'>
                    {`'${providerId}' does not publish subscription help (getSubscriptionHelp is optional). Check its README for the payload it expects.`}
                </Typography>
            )
        }
        return <Typography variant='caption' color='text.secondary' sx={{ whiteSpace: 'pre-wrap' }}>{help.usage}</Typography>
    }

    const ok = () => {
        config.maxEvents = maxEvents
        instanceConfig.providerId = providerId
        instanceConfig.subscriptionData = subscriptionData
        props.onChannelSetupClosed(props.channel, {
            channelId: props.channel.channelId,
            channelConfig: config,
            channelInstanceConfig: instanceConfig
        }, true, defaultRef.current?.checked || false)
    }

    const cancel = () => {
        props.onChannelSetupClosed(props.channel, {
            channelId: props.channel.channelId,
            channelConfig: undefined,
            channelInstanceConfig: undefined
        }, false, false)
    }

    return (
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '46vw', maxWidth: '46vw', height: '76vh', maxHeight: '76vh' } }}>
            <DialogTitle>Configure Provider Debug channel</DialogTitle>
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{ m: 1 }}>
                    <Stack direction='column' spacing={0.5}>
                        <Typography variant='caption' color='text.secondary'>Provider</Typography>
                        <Select value={providerId} onChange={(e) => setProviderId(e.target.value)} displayEmpty size='small' variant='standard' inputProps={{ 'aria-label': 'Provider' }}>
                            <MenuItem value=''><Typography variant='body2' color='text.secondary'>(none — just list the running providers)</Typography></MenuItem>
                            {options().map(o => (
                                <MenuItem key={o.id} value={o.id}>
                                    <Stack direction='row' spacing={1} alignItems='center'>
                                        <Typography variant='body2'>{o.id}</Typography>
                                        {o.state === EProviderDebugProviderState.NOT_RUNNING &&
                                            <Chip label='not running' size='small' variant='outlined' color='warning' sx={{ fontSize: '0.65rem', height: 18 }} />
                                        }
                                    </Stack>
                                </MenuItem>
                            ))}
                        </Select>
                        <Typography variant='caption' color='text.secondary'>
                            {catalogueLoaded
                                ? 'A provider only runs when some channel requires it. Only the ones marked as running can be subscribed to.'
                                : 'Could not read the provider catalogue from the core — showing only what this channel already knows.'
                            }
                        </Typography>
                    </Stack>

                    <Box sx={{ borderLeft: 3, borderColor: 'divider', pl: 1.5 }}>
                        {renderHelp()}
                    </Box>

                    <Stack direction='column' spacing={1}>
                        <Stack direction='row' alignItems='center' justifyContent='space-between'>
                            <Tabs value={fields.length > 0 ? mode : EPayloadMode.JSON} onChange={(_e, v) => setMode(v)} sx={{ minHeight: 32, '& .MuiTab-root': { minHeight: 32, py: 0 } }}>
                                <Tooltip title={fields.length > 0 ? '' : 'This provider does not describe its payload field by field'}>
                                    <span><Tab label='Form' value={EPayloadMode.FORM} disabled={fields.length === 0} /></span>
                                </Tooltip>
                                <Tab label='JSON' value={EPayloadMode.JSON} />
                            </Tabs>
                            <Button size='small' onClick={useExample} disabled={!help}>USE EXAMPLE</Button>
                        </Stack>

                        {fields.length > 0 && mode === EPayloadMode.FORM
                            ? <Stack direction='column' spacing={1.5}>{fields.map(f => renderField(f))}</Stack>
                            : <TextField value={subscriptionData} onChange={(e) => setSubscriptionData(e.target.value)} variant='standard' label='Subscription payload (JSON)' placeholder='{}' multiline minRows={4} maxRows={4} error={invalidJson()} helperText={invalidJson() ? 'Not valid JSON' : 'Empty means {} — note most providers deliver nothing without a payload'} fullWidth />
                        }
                    </Stack>

                    <TextField value={maxEvents} onChange={(e) => setMaxEvents(+e.target.value)} type='number' variant='standard' label='Max events' fullWidth />
                </Stack>
            </DialogContent>
            <DialogActions>
                <FormControlLabel control={<Checkbox slotProps={{ input: { ref: defaultRef } }} />} label='Set as default' sx={{ width: '100%', ml: '8px' }} />
                <Button variant='outlined' onClick={ok} disabled={invalidJson()}>OK</Button>
                <Button variant='outlined' onClick={cancel}>CANCEL</Button>
            </DialogActions>
        </Dialog>
    )
}
