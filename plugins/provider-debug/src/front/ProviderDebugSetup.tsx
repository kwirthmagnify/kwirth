import React, { useEffect, useRef, useState } from 'react'
import { Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Select, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import { ISetupProps } from '@kwirthmagnify/kwirth-common-front'
import { DataObjectOutlined } from '@mui/icons-material'
import { IProviderDebugConfig, ProviderDebugConfig, ProviderDebugInstanceConfig } from './ProviderDebugConfig'
import { IProviderDebugData } from './ProviderDebugData'
import { EProviderDebugProviderState, IProviderDebugCatalogueEntry, IProviderDebugInstanceConfig, IProviderDebugProviderOption, IProviderDebugSubscriptionField, IProviderDebugSubscriptionHelp } from '../common/ProviderDebugTypes'

export const ProviderDebugIcon = <DataObjectOutlined />

/**
 * The three views of the chosen producer. Never compare against loose literals.
 *
 * OVERVIEW is the one that opens on choosing one: first you read WHAT it delivers and HOW to ask for
 * it, and only then do you write the payload — in a form when the producer describes its fields, or
 * by hand when it does not.
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

    // GET /core/providers is the core's COMPLETE view: installed ones plus the core's own (events,
    // metrics), each with whether it is alive and with the help it publishes. It is available without
    // starting anything, so the dropdown comes out populated and flagged from the very first moment.
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
        // If the endpoint does not answer, what is left is the catalogue the channel sends over the
        // websocket, which only holds live providers and only exists after the instance has been
        // started once.
        const source: IProviderDebugProviderOption[] = catalogueLoaded
            ? catalogue.map(e => ({
                id: e.id,
                state: e.running ? EProviderDebugProviderState.RUNNING : EProviderDebugProviderState.NOT_RUNNING,
                help: e.subscriptionHelp,
                pluvider: e.pluvider,
                description: e.description
            }))
            : (data?.providers ?? []).map(p => ({ id: p.id, state: EProviderDebugProviderState.UNKNOWN, help: p.help, pluvider: p.pluvider, description: p.description }))

        // the already configured provider is kept even if it has vanished from the catalogue
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

    // The JSON is the single source of truth; the form only reads and rewrites it. That way one can
    // jump from one view to another without synchronising two states that contradict each other.
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
        The example is written to the SAME place the form edits (subscriptionData), so it fills both views
        at once: there are no two states to keep in sync. And it takes the user where they are going to go
        on working — to the form when the producer describes its fields, and to the JSON when it does not,
        which is the only thing left to them.
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
                                /* No maxRows: the editor grows with the box, which is what makes room for a
                                   long payload without forcing you to scroll inside four lines. */
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
