import React, { useEffect, useRef, useState } from 'react'
import { Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Select, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import { ISetupProps } from '@kwirthmagnify/kwirth-common-front'
import { DataObjectOutlined } from '@mui/icons-material'
import { IProviderDebugConfig, ProviderDebugConfig, ProviderDebugInstanceConfig } from './ProviderDebugConfig'
import { IProviderDebugData } from './ProviderDebugData'
import { EProviderDebugProviderState, IProviderDebugCatalogueEntry, IProviderDebugInstanceConfig, IProviderDebugProviderOption, IProviderDebugSubscriptionField, IProviderDebugSubscriptionHelp } from '../common/ProviderDebugTypes'

export const ProviderDebugIcon = <DataObjectOutlined />

/**
 * Las tres vistas del productor elegido. Nunca comparar contra literales sueltos.
 *
 * OVERVIEW es la que se abre al elegir uno: primero se lee QUÉ entrega y CÓMO se pide, y solo después
 * se escribe el payload — en formulario si el productor describe sus campos, o a mano si no.
 */
enum ESetupTab {
    OVERVIEW = 'overview',
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
    const [tab, setTab] = useState<ESetupTab>(ESetupTab.OVERVIEW)
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
                help: e.subscriptionHelp,
                pluvider: e.pluvider,
                description: e.description
            }))
            : (data?.providers ?? []).map(p => ({ id: p.id, state: EProviderDebugProviderState.UNKNOWN, help: p.help, pluvider: p.pluvider, description: p.description }))

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

    /*
        El ejemplo se escribe en el MISMO sitio que edita el formulario (subscriptionData), así que
        rellena las dos vistas de una vez: no hay dos estados que sincronizar. Y se lleva al usuario a
        donde va a seguir trabajando — al formulario si el productor describe sus campos, y al JSON si
        no, que es lo único que le queda.
    */
    const useExample = (): void => {
        if (!help) return
        setSubscriptionData(JSON.stringify(help.example, null, 2))
        setTab(fields.length > 0 ? ESetupTab.FORM : ESetupTab.JSON)
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
            {/* El dialogo tiene alto FIJO, asi que se reparte por flex: el selector y 'Max events' ocupan
                lo suyo (flexShrink 0, para que su texto de ayuda no se coma nadie) y el cuadro de
                Subscription se queda con TODO lo que sobra. El 'minHeight: 0' de cada nivel es lo que
                permite que el scroll acabe dentro del cuadro y no estirando el dialogo. */}
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Stack direction='column' spacing={2} sx={{ m: 1, flex: 1, minHeight: 0 }}>
                    <Stack direction='column' spacing={0.5} sx={{ flexShrink: 0 }}>
                        <Typography variant='caption' color='text.secondary'>Provider</Typography>
                        {/* Elegir otro productor vuelve a Overview: lo que se estuviera mirando (unos campos,
                            un JSON) era de OTRO, y lo primero con el nuevo es leer qué entrega. */}
                        <Select value={providerId} onChange={(e) => { setProviderId(e.target.value); setTab(ESetupTab.OVERVIEW) }} displayEmpty size='small' variant='standard' inputProps={{ 'aria-label': 'Provider' }}>
                            <MenuItem value=''><Typography variant='body2' color='text.secondary'>(none — just list the running providers)</Typography></MenuItem>
                            {options().map(o => (
                                <MenuItem key={o.id} value={o.id}>
                                    <Stack direction='row' spacing={1} alignItems='center'>
                                        <Typography variant='body2'>{o.id}</Typography>
                                        {/* Un pluvider viene de un plugin, no es una extension aparte: se marca para que
                                            se vea de donde sale, y se acompaña de lo que dice producir. */}
                                        {o.pluvider &&
                                            <Chip label='plugin' size='small' variant='outlined' color='info' sx={{ fontSize: '0.65rem', height: 18 }} />
                                        }
                                        {o.description &&
                                            <Typography variant='caption' color='text.secondary' noWrap>{o.description}</Typography>
                                        }
                                        {o.state === EProviderDebugProviderState.NOT_RUNNING &&
                                            <Chip label='not running' size='small' variant='outlined' color='warning' sx={{ fontSize: '0.65rem', height: 18 }} />
                                        }
                                    </Stack>
                                </MenuItem>
                            ))}
                        </Select>
                        <Typography variant='caption' color='text.secondary'>
                            {/* Las dos clases de productor no arrancan por el mismo motivo, y decir solo lo
                                del provider deja pensando que a un pluvider hay que requerirlo desde algun sitio. */}
                            {catalogueLoaded
                                ? 'A provider only runs when some channel requires it. The ones marked as plugin are pluviders: they run because their plugin is installed and hosted here, so nobody has to require them. Only the ones not marked as "not running" can be subscribed to.'
                                : 'Could not read the provider catalogue from the core — showing only what this channel already knows.'
                            }
                        </Typography>
                    </Stack>

                    {/*
                        Todo lo que depende del productor elegido va aqui dentro, encuadrado y con su id
                        por titulo: ni la descripcion ni estos campos son del dialogo — los declara el
                        productor, y cambian por completo al elegir otro.

                        Los Tab tienen que ser hijos DIRECTOS de Tabs: MUI los clona para inyectarles el
                        onChange, y envolver uno (en un Tooltip, por ejemplo) lo deja sordo — se podia
                        salir de Form pero no volver.
                    */}
                    {/* El 'mt' separa del bloque de arriba: el titulo del cuadro flota SOBRE el borde
                        (top negativo), asi que sin ese margen queda pegado al texto anterior. */}
                    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, pt: 2, mt: 1.5, position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                        <Typography variant='caption' color='text.secondary'
                            sx={{ position: 'absolute', top: -9, left: 10, px: 0.5, bgcolor: 'background.paper' }}>
                            {providerId ? `Subscription — declared by '${providerId}'` : 'Subscription'}
                        </Typography>

                        <Stack direction='column' spacing={1} sx={{ flex: 1, minHeight: 0 }}>
                            <Stack direction='row' alignItems='center' justifyContent='space-between'>
                                {/* Sin productor elegido no hay nada que describir ni payload que escribir:
                                    las tres quedan deshabilitadas y la vista se queda en Overview, que es
                                    la que dice que hay que elegir uno. */}
                                <Tabs value={!providerId ? ESetupTab.OVERVIEW : (fields.length === 0 && tab === ESetupTab.FORM ? ESetupTab.JSON : tab)} onChange={(_e, v) => setTab(v)} sx={{ minHeight: 32, '& .MuiTab-root': { minHeight: 32, py: 0 } }}>
                                    <Tab label='Overview' value={ESetupTab.OVERVIEW} disabled={!providerId} />
                                    <Tab label='Form' value={ESetupTab.FORM} disabled={!providerId || fields.length === 0} />
                                    <Tab label='JSON' value={ESetupTab.JSON} disabled={!providerId} />
                                </Tabs>
                                {tab === ESetupTab.OVERVIEW &&
                                    <Button size='small' onClick={useExample} disabled={!help}>USE EXAMPLE</Button>
                                }
                            </Stack>

                            {(tab === ESetupTab.OVERVIEW || !providerId) &&
                                <Stack direction='column' spacing={1} sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                                    {renderHelp()}
                                    {providerId && fields.length === 0 &&
                                        <Typography variant='caption' color='text.secondary'>
                                            {`'${providerId}' does not describe its payload field by field, so there is no form to fill — write the JSON yourself.`}
                                        </Typography>
                                    }
                                </Stack>
                            }

                            {providerId && tab === ESetupTab.FORM && fields.length > 0 &&
                                <Stack direction='column' spacing={1.5} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pt: 0.5 }}>{fields.map(f => renderField(f))}</Stack>
                            }

                            {providerId && (tab === ESetupTab.JSON || (tab === ESetupTab.FORM && fields.length === 0)) &&
                                /* Sin maxRows: el editor crece con el cuadro, que es lo que da sitio a un
                                   payload largo sin obligar a desplazarse dentro de cuatro lineas. */
                                <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                                    <TextField value={subscriptionData} onChange={(e) => setSubscriptionData(e.target.value)} variant='standard' label='Subscription payload (JSON)' placeholder='{}' multiline minRows={4} error={invalidJson()} helperText={invalidJson() ? 'Not valid JSON' : 'Empty means {} — note most providers deliver nothing without a payload'} fullWidth />
                                </Box>
                            }
                        </Stack>
                    </Box>

                    <TextField value={maxEvents} onChange={(e) => setMaxEvents(+e.target.value)} type='number' variant='standard' label='Max events' fullWidth sx={{ flexShrink: 0 }} />
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
