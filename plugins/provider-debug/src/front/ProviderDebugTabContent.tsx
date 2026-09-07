import React, { useEffect, useRef, useState } from 'react'
import { Accordion, AccordionDetails, AccordionSummary, Box, Card, CardContent, CardHeader, Chip, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import { IContentProps } from '@kwirthmagnify/kwirth-common-front'
import { Check, ContentCopy, DeleteSweep, ExpandMore, Info } from '@mui/icons-material'
import { IProviderDebugData } from './ProviderDebugData'
import { IProviderDebugConfig } from './ProviderDebugConfig'
import { JsonBlock } from './JsonBlock'
import { IProviderDebugEvent, IProviderDebugInstanceConfig } from '../common/ProviderDebugTypes'

export const ProviderDebugTabContent: React.FC<IContentProps> = (props: IContentProps) => {
    const data: IProviderDebugData = props.channelObject.data
    const config: IProviderDebugConfig = props.channelObject.config
    const instanceConfig: IProviderDebugInstanceConfig = props.channelObject.instanceConfig
    const boxRef = useRef<HTMLDivElement | null>(null)
    const [boxTop, setBoxTop] = useState(0)
    // El canal solo repinta cuando llega un mensaje del back; limpiar es una acción local, así que
    // necesita su propio disparador de render.
    const [, forceRender] = useState(0)
    const [copied, setCopied] = useState<IProviderDebugEvent | null>(null)

    useEffect(() => {
        if (boxRef.current) setBoxTop(boxRef.current.getBoundingClientRect().top)
    })

    const clear = () => {
        data.events = []
        data.signals = []
        forceRender(n => n + 1)
    }

    /**
     * La API asíncrona del portapapeles se rechaza en bastantes contextos (permiso denegado, iframe,
     * origen no seguro), así que hay un plan B con textarea + execCommand, que no pide permisos.
     * Devuelve si se pudo copiar, para no pintar el tick de "copiado" cuando no se copió nada.
     */
    const writeClipboard = async (text: string): Promise<boolean> => {
        try {
            await navigator.clipboard.writeText(text)
            return true
        }
        catch {
            try {
                const area = document.createElement('textarea')
                area.value = text
                area.style.position = 'fixed'
                area.style.opacity = '0'
                document.body.appendChild(area)
                area.select()
                const ok = document.execCommand('copy')
                document.body.removeChild(area)
                return ok
            }
            catch {
                return false
            }
        }
    }

    // Se marca el evento por referencia y no por índice: el buffer es circular y los índices bailan
    // con cada evento nuevo, así que el tick de "copiado" acabaría señalando a otra fila.
    const copy = (event: IProviderDebugEvent) => {
        writeClipboard(JSON.stringify(event.event, null, 2)).then(ok => {
            if (!ok) return
            setCopied(event)
            setTimeout(() => setCopied(current => current === event ? null : current), 1500)
        })
    }

    // Resumen de una línea para la cabecera del acordeón, sin tener que desplegarlo.
    const summaryOf = (event: unknown): string => {
        if (event === null) return 'null'
        if (Array.isArray(event)) return `array · ${event.length} items`
        if (typeof event === 'object') {
            const keys = Object.keys(event as Record<string, unknown>)
            return keys.length === 0 ? '{}' : keys.join(', ')
        }
        return String(event)
    }

    const formatProviders = () => {
        if (data.providers.length === 0) return <Typography variant='body2' color='text.secondary'>No providers running.</Typography>
        return (
            <Stack direction='row' spacing={1} flexWrap='wrap' useFlexGap>
                {data.providers.map(p => <Chip key={p.id} label={p.id} size='small' variant={p.id === instanceConfig.providerId ? 'filled' : 'outlined'} />)}
            </Stack>
        )
    }

    const formatEvent = (event: IProviderDebugEvent, index: number) => (
        <Accordion key={index} disableGutters slotProps={{ transition: { unmountOnExit: true } }}>
            <AccordionSummary expandIcon={<ExpandMore />}>
                <Stack direction='row' spacing={1.5} alignItems='center' sx={{ minWidth: 0, width: '100%' }}>
                    <Typography variant='caption' color='text.secondary' sx={{ fontFamily: 'monospace' }}>{new Date(event.ts).toISOString()}</Typography>
                    <Chip label={event.providerId} size='small' variant='outlined' sx={{ fontSize: '0.65rem', height: 18 }} />
                    <Typography variant='caption' color='text.secondary' noWrap>{summaryOf(event.event)}</Typography>
                    <Tooltip title={copied === event ? 'Copied' : 'Copy event JSON'}>
                        {/* dentro del summary, así que hay que frenar el click o el acordeón se pliega */}
                        <IconButton size='small' aria-label='Copy event JSON' sx={{ ml: 'auto' }} onClick={(e) => { e.stopPropagation(); copy(event) }}>
                            {copied === event ? <Check fontSize='small' color='success' /> : <ContentCopy fontSize='small' />}
                        </IconButton>
                    </Tooltip>
                </Stack>
            </AccordionSummary>
            <AccordionDetails>
                <JsonBlock value={event.event} />
            </AccordionDetails>
        </Accordion>
    )

    if (!data.started) {
        return <Box sx={{ p: 2 }}><Typography color='text.secondary'>Provider Debug not started. Start the channel (tab settings ⚙ → Start) to subscribe to a provider and watch its raw events.</Typography></Box>
    }

    return (
        <Card sx={{ flex: 1, width: '98%', alignSelf: 'center', m: 1 }}>
            <CardHeader title={
                <Stack direction='row' alignItems='center' sx={{ width: '100%' }}>
                    <Typography mr={4}><b>Provider:</b> {instanceConfig.providerId || '(none)'}</Typography>
                    <Typography mr={4}><b>Events:</b> {data.events.length} / {config.maxEvents}</Typography>
                    <Typography mr={4}><Info fontSize='small' sx={{ mb: 0.25 }} /><b>&nbsp;Status:</b> {data.paused ? 'paused' : data.started ? 'started' : 'stopped'}</Typography>
                    <Tooltip title='Clear captured events'>
                        <span style={{ marginLeft: 'auto' }}>
                            <IconButton size='small' aria-label='Clear captured events' onClick={clear} disabled={data.events.length === 0 && data.signals.length === 0}>
                                <DeleteSweep fontSize='small' />
                            </IconButton>
                        </span>
                    </Tooltip>
                </Stack>
            } />
            <CardContent>
                <Stack direction='column' spacing={1} sx={{ mb: 1 }}>
                    <Typography variant='caption' color='text.secondary'>Running providers</Typography>
                    {formatProviders()}
                    {data.signals.map((s, index) => <Typography key={index} variant='caption' color='text.secondary'>*** {s} ***</Typography>)}
                </Stack>
                <Box ref={boxRef} sx={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', width: '100%', flexGrow: 1, height: `calc(100vh - ${boxTop}px - 35px)` }}>
                    <Box sx={{ flex: 1, overflowY: 'auto', ml: 1, mr: 1 }}>
                        {data.events.map((e, index) => formatEvent(e, index))}
                    </Box>
                </Box>
            </CardContent>
        </Card>
    )
}
