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
    // The channel only repaints when a message arrives from the back end; clearing is a local action,
    // so it needs its own render trigger.
    const [, forceRender] = useState(0)
    const [copied, setCopied] = useState<IProviderDebugEvent | null>(null)
    const [search, setSearch] = useState('')
    // -1 = no match has been jumped to yet (only the total is shown)
    const [matchPos, setMatchPos] = useState(-1)
    // CONTROLLED expansion, and by reference to the event rather than by index: the buffer is circular
    // and the indices shift with every new event, so an expanded card would end up being another one.
    const [expanded, setExpanded] = useState<Set<IProviderDebugEvent>>(new Set())
    const cardRefs = useRef<Map<IProviderDebugEvent, HTMLElement>>(new Map())
    // Each event's search text is serialised ONCE: with 200 metrics events, re-stringifying on every
    // keystroke and on every incoming event would cost megabytes per render.
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

    /** Jumps to match 'pos' (wrapping around), expands it and centres it. */
    const goToMatch = (pos: number) => {
        const found = matches()
        if (found.length === 0) return
        const next = ((pos % found.length) + found.length) % found.length
        const target = found[next]
        setMatchPos(next)
        setExpanded(prev => new Set(prev).add(target))
        // The scroll happens after the render that expands the card, and it targets the first
        // highlighted match, not the card: centring a card of thousands of lines leaves the result off
        // screen. No animated scrolling, for the same reason as the expansion.
        setTimeout(() => {
            const card = cardRefs.current.get(target)
            const hit = card?.querySelector('[data-pd-hit]')
            ;(hit ?? card)?.scrollIntoView({ block: 'center' })
        }, 0)
    }


    /**
     * The asynchronous clipboard API is rejected in quite a few contexts (permission denied, iframe,
     * insecure origin), so there is a plan B with a textarea + execCommand, which asks no permissions.
     * It returns whether the copy succeeded, so the "copied" tick is not drawn when nothing was copied.
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

    // The event is flagged by reference and not by index: the buffer is circular and the indices shift
    // with every new event, so the "copied" tick would end up pointing at a different row.
    const copy = (event: IProviderDebugEvent) => {
        writeClipboard(JSON.stringify(event.event, null, 2)).then(ok => {
            if (!ok) return
            setCopied(event)
            setTimeout(() => setCopied(current => current === event ? null : current), 1500)
        })
    }

    // A one-line summary for the accordion's header, without having to expand it.
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
     * A hand-rolled expander instead of Accordion. An event may carry thousands of lines of JSON, and
     * MUI's Collapse animates them by measuring their height, which leaves the card unreadable while
     * it grows; besides, its transition goes in inline style and cannot be removed with timeout 0 nor
     * with CSS. Rendering the detail by hand means there is no transition to remove, and the collapsed
     * DOM does not even exist.
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

    /*
        Channel not started: an empty state CENTRED vertically, the same pattern as Agora and Iter — the
        headline in h6 and the instruction below in body2.

        Both things are needed to take up the height, because the parent can behave in two ways: 'flex: 1'
        stretches it when the parent is a flex container (which is what the normal render's Card expects),
        and the measured 'minHeight' — the container's real top subtracted from the viewport — holds it up
        when it is not. With the computed height alone the block fell short.

        The boxRef is the same one the event list uses: only one of the two is mounted at a time.
    */
    if (!data.started) {
        return (
            <Stack ref={boxRef} alignItems='center' justifyContent='center' spacing={1} sx={{ flex: 1, width: '100%', minHeight: `calc(100vh - ${boxTop}px - 8px)`, px: 4, textAlign: 'center' }}>
                <Typography variant='h6' color='text.secondary'>Provider Debug not started</Typography>
                <Typography variant='body2' color='text.secondary' sx={{ maxWidth: 480 }}>Start the channel (tab settings ⚙ → Start) to subscribe to a provider and watch its raw events.</Typography>
            </Stack>
        )
    }

    // Resolved once per render: 'matches' walks the whole buffer.
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
                                    // always present and disabled: rendered conditionally it would
                                    // vanish under the very click that presses it
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
