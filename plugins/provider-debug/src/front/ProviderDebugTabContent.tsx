import React, { useEffect, useRef, useState } from 'react'
import { Box, Card, CardContent, CardHeader, Chip, IconButton, InputAdornment, Paper, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { IContentProps } from '@kwirthmagnify/kwirth-common-front'
import { ArrowDownward, ArrowUpward, Check, Close, ContentCopy, DeleteSweep, ExpandLess, ExpandMore, Info, Search } from '@mui/icons-material'
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
    const [search, setSearch] = useState('')
    // -1 = todavía no se ha saltado a ninguna coincidencia (solo se muestra el total)
    const [matchPos, setMatchPos] = useState(-1)
    // Expansión CONTROLADA y por referencia al evento, no por índice: el buffer es circular y los
    // índices bailan con cada evento nuevo, así que una tarjeta abierta acabaría siendo otra.
    const [expanded, setExpanded] = useState<Set<IProviderDebugEvent>>(new Set())
    const cardRefs = useRef<Map<IProviderDebugEvent, HTMLElement>>(new Map())
    // El texto de búsqueda de cada evento se serializa UNA vez: con 200 eventos de metrics,
    // re-stringificar en cada tecla y en cada evento entrante costaria megas por render.
    const searchText = useRef<WeakMap<IProviderDebugEvent, string>>(new WeakMap())

    useEffect(() => {
        if (boxRef.current) setBoxTop(boxRef.current.getBoundingClientRect().top)
    })

    const clear = () => {
        data.events = []
        data.signals = []
        setExpanded(new Set())
        cardRefs.current.clear()
        setMatchPos(-1)
        forceRender(n => n + 1)
    }

    const textOf = (event: IProviderDebugEvent): string => {
        const cached = searchText.current.get(event)
        if (cached !== undefined) return cached
        let text: string
        try {
            text = (event.providerId + ' ' + JSON.stringify(event.event)).toLowerCase()
        }
        catch {
            text = event.providerId.toLowerCase()
        }
        searchText.current.set(event, text)
        return text
    }

    const matches = (): IProviderDebugEvent[] => {
        const needle = search.trim().toLowerCase()
        if (needle === '') return []
        return data.events.filter(event => textOf(event).includes(needle))
    }

    const isMatch = (event: IProviderDebugEvent): boolean => {
        const needle = search.trim().toLowerCase()
        return needle !== '' && textOf(event).includes(needle)
    }

    /** Salta a la coincidencia 'pos' (con vuelta al principio), la despliega y la centra. */
    const goToMatch = (pos: number) => {
        const found = matches()
        if (found.length === 0) return
        const next = ((pos % found.length) + found.length) % found.length
        const target = found[next]
        setMatchPos(next)
        setExpanded(prev => new Set(prev).add(target))
        // El scroll va tras el render que despliega la tarjeta, y apunta a la primera coincidencia
        // resaltada, no a la tarjeta: centrar una tarjeta de miles de líneas deja el resultado
        // fuera de pantalla. Sin scroll animado, por lo mismo que el despliegue.
        setTimeout(() => {
            const card = cardRefs.current.get(target)
            const hit = card?.querySelector('[data-pd-hit]')
            ;(hit ?? card)?.scrollIntoView({ block: 'center' })
        }, 0)
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

    const toggle = (event: IProviderDebugEvent) => setExpanded(prev => {
        const next = new Set(prev)
        if (next.has(event)) next.delete(event)
        else next.add(event)
        return next
    })

    /**
     * Desplegable propio en vez de Accordion. Un evento puede traer miles de líneas de JSON y el
     * Collapse de MUI las anima midiendo su altura, lo que deja la tarjeta ilegible mientras crece;
     * además su transición va en estilo inline y no se deja quitar ni con timeout 0 ni con CSS.
     * Renderizando el detalle a mano no hay transición que quitar, y el DOM plegado ni existe.
     */
    const formatEvent = (event: IProviderDebugEvent, index: number, current: IProviderDebugEvent | undefined) => {
        const open = expanded.has(event)
        return (
            <Paper
                key={index}
                variant='outlined'
                ref={(el: HTMLElement | null) => { if (el) cardRefs.current.set(event, el); else cardRefs.current.delete(event) }}
                sx={{ mb: 0.5, ...(current === event ? { outline: 2, outlineColor: 'warning.main', outlineOffset: -2 } : {}) }}
            >
                <Stack direction='row' spacing={1.5} alignItems='center' sx={{ minWidth: 0, px: 1, py: 0.5, cursor: 'pointer' }} onClick={() => toggle(event)}>
                    <IconButton size='small' aria-label={open ? 'Collapse event' : 'Expand event'} onClick={(e) => { e.stopPropagation(); toggle(event) }}>
                        {open ? <ExpandLess fontSize='small' /> : <ExpandMore fontSize='small' />}
                    </IconButton>
                    <Typography variant='caption' color={isMatch(event) ? 'warning.main' : 'text.secondary'} sx={{ fontFamily: 'monospace' }}>{new Date(event.ts).toISOString()}</Typography>
                    <Chip label={event.providerId} size='small' variant='outlined' sx={{ fontSize: '0.65rem', height: 18 }} />
                    <Typography variant='caption' color='text.secondary' noWrap>{summaryOf(event.event)}</Typography>
                    <Tooltip title={copied === event ? 'Copied' : 'Copy event JSON'}>
                        {/* la fila entera despliega, así que hay que frenar el click aquí */}
                        <IconButton size='small' aria-label='Copy event JSON' sx={{ ml: 'auto' }} onClick={(e) => { e.stopPropagation(); copy(event) }}>
                            {copied === event ? <Check fontSize='small' color='success' /> : <ContentCopy fontSize='small' />}
                        </IconButton>
                    </Tooltip>
                </Stack>
                {open && <Box sx={{ px: 2, pb: 1 }}><JsonBlock value={event.event} highlight={search} /></Box>}
            </Paper>
        )
    }

    if (!data.started) {
        return <Box sx={{ p: 2 }}><Typography color='text.secondary'>Provider Debug not started. Start the channel (tab settings ⚙ → Start) to subscribe to a provider and watch its raw events.</Typography></Box>
    }

    // Se resuelven una sola vez por render: 'matches' recorre todo el buffer.
    const found = matches()
    const current = matchPos >= 0 && matchPos < found.length ? found[matchPos] : undefined

    return (
        <Card sx={{ flex: 1, width: '98%', alignSelf: 'center', m: 1 }}>
            <CardHeader title={
                <Stack direction='row' alignItems='center' sx={{ width: '100%' }}>
                    <Typography mr={4}><b>Provider:</b> {instanceConfig.providerId || '(none)'}</Typography>
                    <Typography mr={4}><b>Events:</b> {data.events.length} / {config.maxEvents}</Typography>
                    <Typography mr={4}><Info fontSize='small' sx={{ mb: 0.25 }} /><b>&nbsp;Status:</b> {data.paused ? 'paused' : data.started ? 'started' : 'stopped'}</Typography>
                    <Stack direction='row' alignItems='center' spacing={0.5} sx={{ ml: 'auto' }}>
                        {/* siempre visible: sin búsqueda marca 0/0, así el hueco no baila al escribir */}
                        <Typography variant='caption' color={found.length === 0 && search.trim() !== '' ? 'warning.main' : 'text.secondary'} sx={{ minWidth: 44, textAlign: 'right' }}>
                            {`${matchPos + 1}/${found.length}`}
                        </Typography>
                        <TextField
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setMatchPos(-1) }}
                            onKeyDown={(e) => {
                                if (e.key !== 'Enter') return
                                e.preventDefault()
                                goToMatch(e.shiftKey ? matchPos - 1 : matchPos + 1)
                            }}
                            placeholder='Search events'
                            variant='standard'
                            sx={{ width: 200 }}
                            slotProps={{
                                htmlInput: { 'aria-label': 'Search events' },
                                input: {
                                    startAdornment: <InputAdornment position='start'><Search fontSize='small' /></InputAdornment>,
                                    // siempre presente y deshabilitado: si se renderiza en
                                    // condicional desaparece bajo el propio click que lo pulsa
                                    endAdornment: <InputAdornment position='end'>
                                        <IconButton size='small' aria-label='Clear search' disabled={search === ''} onClick={() => { setSearch(''); setMatchPos(-1) }}><Close fontSize='small' /></IconButton>
                                    </InputAdornment>
                                }
                            }}
                        />
                        <Tooltip title='Previous match (Shift+Enter)'>
                            <span>
                                <IconButton size='small' aria-label='Previous match' disabled={found.length === 0} onClick={() => goToMatch(matchPos - 1)}>
                                    <ArrowUpward fontSize='small' />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title='Next match (Enter)'>
                            <span>
                                <IconButton size='small' aria-label='Next match' disabled={found.length === 0} onClick={() => goToMatch(matchPos + 1)}>
                                    <ArrowDownward fontSize='small' />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title='Clear captured events'>
                            <span>
                                <IconButton size='small' aria-label='Clear captured events' onClick={clear} disabled={data.events.length === 0 && data.signals.length === 0}>
                                    <DeleteSweep fontSize='small' />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Stack>
                </Stack>
            } />
            <CardContent>
                <Stack direction='column' spacing={1} sx={{ mb: 1 }}>
                    {/* etiqueta y chips en la misma línea; los chips siguen envolviendo si no caben */}
                    <Stack direction='row' spacing={1} alignItems='center' flexWrap='wrap' useFlexGap>
                        <Typography variant='caption' color='text.secondary'>Running providers</Typography>
                        {formatProviders()}
                        {/* los dos hitos del arranque, en vez de dos líneas de texto sueltas */}
                        <Stack direction='row' spacing={1} sx={{ ml: 'auto' }}>
                            <Chip label='config' size='small'
                                color={data.configAccepted ? 'success' : 'default'}
                                variant={data.configAccepted ? 'filled' : 'outlined'} />
                            <Chip label='subscribed' size='small'
                                color={data.subscribed ? 'success' : 'default'}
                                variant={data.subscribed ? 'filled' : 'outlined'} />
                        </Stack>
                    </Stack>
                    {data.signals.map((s, index) => <Typography key={index} variant='caption' color='text.secondary'>*** {s} ***</Typography>)}
                </Stack>
                <Box ref={boxRef} sx={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', width: '100%', flexGrow: 1, height: `calc(100vh - ${boxTop}px - 35px)` }}>
                    <Box sx={{ flex: 1, overflowY: 'auto', ml: 1, mr: 1 }}>
                        {data.events.map((e, index) => formatEvent(e, index, current))}
                    </Box>
                </Box>
            </CardContent>
        </Card>
    )
}
