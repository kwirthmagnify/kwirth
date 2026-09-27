import React, { useEffect, useRef, useState } from 'react'
import { Box, Button, Card, CardContent, CardHeader, Checkbox, Chip, FormControl, FormControlLabel, FormHelperText, IconButton, InputLabel, MenuItem, Paper, Select, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType, ISenderMessage } from '@kwirthmagnify/kwirth-common'
import { IContentProps } from '@kwirthmagnify/kwirth-common-front'
import { Check, Close, DeleteSweep, Error as ErrorIcon, ExpandLess, ExpandMore, Refresh, Schedule, Send } from '@kwirthmagnify/kwirth-common-front/icons'
import { ESenderDebugCommand, ESenderDebugKind, ESenderDebugLevel, ISenderDebugSendRequest } from '../common/SenderDebugTypes'
import { ISenderDebugConfig } from './SenderDebugConfig'
import { ISenderDebugData, ISenderDebugHistoryEntry } from './SenderDebugData'

/** Origin stamped on everything that leaves here, so the destination knows where it came from. */
const ORIGIN_SOURCE = 'sender-debug'

export const SenderDebugTabContent: React.FC<IContentProps> = (props: IContentProps) => {
    const data: ISenderDebugData = props.channelObject.data
    const config: ISenderDebugConfig = props.channelObject.config
    const form = data.form
    const boxRef = useRef<HTMLDivElement | null>(null)
    const [boxTop, setBoxTop] = useState(0)
    // The channel repaints when a message arrives from the back end; typing in the form, clearing or
    // expanding a row are local actions and need their own render trigger.
    const [, forceRender] = useState(0)
    // Expansion by REFERENCE to the entry, not by index: the history grows from the top and the
    // indices shift with every send, so an expanded row would end up being a different one.
    const [expanded, setExpanded] = useState<Set<ISenderDebugHistoryEntry>>(new Set())

    useEffect(() => {
        if (boxRef.current) setBoxTop(boxRef.current.getBoundingClientRect().top)
    })

    const refresh = () => forceRender(n => n + 1)

    /** sends fired that have not answered yet (and that were not left hanging by a Stop) */
    const inFlight = (): number => data.history.filter(e => !e.result && !e.abandoned).length

    const selected = data.senders.find(s => s.id === form.senderId)
    const configNames = selected?.configNames ?? []

    const setSender = (senderId: string) => {
        form.senderId = senderId
        // The chosen configuration belonged to ANOTHER sender: if the new one carries a single config it
        // is selected on its own, and if it carries several it is cleared — leaving the previous one in
        // place would be offering something that does not exist.
        const names = data.senders.find(s => s.id === senderId)?.configNames ?? []
        form.configName = names.length === 1 ? names[0] : ''
        refresh()
    }

    const invalidMetadata = (): boolean => {
        if (form.metadata.trim() === '') return false
        try {
            const parsed = JSON.parse(form.metadata)
            return parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)
        }
        catch {
            return true
        }
    }

    const invalidCount = (): boolean => form.batch && (!Number.isFinite(form.count) || form.count < 1 || form.count > 100)

    const canSend = (): boolean =>
        Boolean(props.channelObject.instanceId) &&
        form.senderId !== '' &&
        form.configName !== '' &&
        form.body.trim() !== '' &&
        !invalidMetadata() &&
        !invalidCount()

    /** Recipients are typed separated by commas; what each one means is decided by the sender. */
    const recipients = (): string | string[] | undefined => {
        const list = form.to.split(',').map(s => s.trim()).filter(Boolean)
        if (list.length === 0) return undefined
        return list.length === 1 ? list[0] : list
    }

    const buildMessage = (): ISenderMessage => {
        const metadata = form.metadata.trim() === '' ? undefined : JSON.parse(form.metadata) as Record<string, unknown>
        return {
            ...(form.subject.trim() === '' ? {} : { subject: form.subject }),
            body: form.body,
            ...(recipients() === undefined ? {} : { to: recipients() }),
            // The plugin.s enum is an exact mirror of the union of literals of ISenderMessage.level; the
            // cast is for that reason, and not because anything at all could arrive here.
            level: form.level as ISenderMessage['level'],
            ...(metadata ? { metadata } : {}),
            origin: { source: ORIGIN_SOURCE, timestamp: Date.now() }
        }
    }

    const sendCommand = (command: ESenderDebugCommand, payload?: ISenderDebugSendRequest) => {
        if (!props.channelObject.instanceId) return
        /*
            The accessKey goes in EVERY command: the core discards them before they reach the plugin when
            they do not carry it, and from the front end that is indistinguishable from a back end that
            does not answer.
        */
        props.channelObject.webSocket?.send(JSON.stringify({
            msgtype: 'senderdebugmessage',
            channel: 'sender-debug',
            action: EInstanceMessageAction.COMMAND,
            flow: EInstanceMessageFlow.REQUEST,
            type: EInstanceMessageType.DATA,
            accessKey: props.channelObject.accessString!,
            instance: props.channelObject.instanceId,
            command,
            ...(payload ? { data: payload } : {})
        }))
    }

    const send = () => {
        if (!canSend()) return
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const request: ISenderDebugSendRequest = {
            id,
            senderId: form.senderId,
            configName: form.configName,
            message: buildMessage(),
            ...(form.batch ? { count: form.count } : {})
        }
        /*
            The row is created HERE, with its request and no response: the send shows in the history as
            soon as it leaves, and not when the sender answers — which with a slow destination can take a
            while. The response is completed by processChannelMessage, looking it up by this id.
        */
        data.history.unshift({ request })
        while (data.history.length > config.maxHistory) data.history.pop()
        sendCommand(form.batch ? ESenderDebugCommand.SENDBATCH : ESenderDebugCommand.SEND, request)
        refresh()
    }

    const clear = () => {
        data.history = []
        data.signals = []
        setExpanded(new Set())
        refresh()
    }

    const toggle = (entry: ISenderDebugHistoryEntry) => setExpanded(prev => {
        const next = new Set(prev)
        if (next.has(entry)) next.delete(entry)
        else next.add(entry)
        return next
    })

    const senderLabel = (id: string): string => {
        const sender = data.senders.find(s => s.id === id)
        return sender?.displayName ? `${id} — ${sender.displayName}` : id
    }

    /** What is visible on a row.s status line, without expanding it. */
    const summaryOf = (entry: ISenderDebugHistoryEntry): string => {
        if (!entry.result) return entry.abandoned ? 'no answer — the channel was stopped' : 'sending…'
        if (!entry.result.ok) return entry.result.error ?? 'failed'
        return entry.result.result ? 'delivered, with a result' : 'delivered'
    }

    /** What the sender answered, in JSON. A notification sender returns nothing, and that is said. */
    const answerOf = (entry: ISenderDebugHistoryEntry): string => {
        if (!entry.result) return entry.abandoned ? 'No answer: the channel was stopped before the sender replied.' : 'Waiting for the sender…'
        if (!entry.result.ok) return entry.result.error ?? 'Failed, with no error text.'
        if (!entry.result.result) return 'Nothing. The sender returned void, which is what a pure notification sender does.'
        return JSON.stringify(entry.result.result, null, 2)
    }

    /*
        The row ALWAYS expands, and the first thing it shows is the message that was sent. On a test bench
        that is worth as much as the response: knowing what the destination answered is of no use if one
        has to reconstruct from memory what it was sent. That is why the request lives in the history
        alongside the response — and why there used to be rows with the expander switched off, those of
        the senders that return nothing, which are most of them.
    */
    const formatEntry = (entry: ISenderDebugHistoryEntry, index: number) => {
        const open = expanded.has(entry)
        const result = entry.result
        const senderId = result?.senderId ?? entry.request?.senderId ?? '?'
        const configName = result?.configName ?? entry.request?.configName ?? '?'
        const batch = result?.batch ?? Boolean(entry.request?.count)
        const count = result?.count ?? entry.request?.count ?? 1
        return (
            <Paper key={index} variant='outlined' sx={{ mb: 0.5 }}>
                <Stack direction='row' spacing={1.5} alignItems='center' sx={{ minWidth: 0, px: 1, py: 0.5, cursor: 'pointer' }} onClick={() => toggle(entry)}>
                    <IconButton size='small' aria-label={open ? 'Collapse send' : 'Expand send'} onClick={(e) => { e.stopPropagation(); toggle(entry) }}>
                        {open ? <ExpandLess fontSize='small' /> : <ExpandMore fontSize='small' />}
                    </IconButton>
                    {/* en vuelo todavía no hay veredicto: ni tick ni error, que serían mentira */}
                    {!result && <Schedule fontSize='small' color='disabled' />}
                    {result?.ok === true && <Check fontSize='small' color='success' />}
                    {result?.ok === false && <ErrorIcon fontSize='small' color='error' />}
                    <Typography variant='caption' color='text.secondary' sx={{ fontFamily: 'monospace' }}>{new Date(result?.ts ?? Date.now()).toISOString()}</Typography>
                    <Chip label={`${senderId} / ${configName}`} size='small' variant='outlined' sx={{ fontSize: '0.65rem', height: 18 }} />
                    {batch &&
                        <Chip label={result?.emulated ? `batch ${count} (emulated)` : `batch ${count}`} size='small' variant='outlined' color={result?.emulated ? 'warning' : 'info'} sx={{ fontSize: '0.65rem', height: 18 }} />
                    }
                    <Typography variant='caption' color='text.secondary' noWrap sx={{ flex: 1 }}>{summaryOf(entry)}</Typography>
                    <Typography variant='caption' color='text.secondary'>{result ? `${result.elapsed} ms` : ''}</Typography>
                </Stack>
                {open &&
                    <Box sx={{ px: 2, pb: 1 }}>
                        <Typography variant='caption' color='text.secondary'>Sent</Typography>
                        <Box component='pre' sx={{ m: 0, mb: 1, fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {entry.request ? JSON.stringify(entry.request.message, null, 2) : 'Not available: this answer arrived without its request.'}
                        </Box>
                        <Typography variant='caption' color='text.secondary'>Answered</Typography>
                        <Box component='pre' sx={{ m: 0, fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {answerOf(entry)}
                        </Box>
                    </Box>
                }
            </Paper>
        )
    }

    /*
        Channel not started: a centred empty state, the same pattern as provider-debug. Both things are
        needed to take up the height — 'flex: 1' when the parent is flex, and the measured minHeight when
        it is not.
    */
    if (!data.started) {
        return (
            <Stack ref={boxRef} alignItems='center' justifyContent='center' spacing={1} sx={{ flex: 1, width: '100%', minHeight: `calc(100vh - ${boxTop}px - 8px)`, px: 4, textAlign: 'center' }}>
                <Typography variant='h6' color='text.secondary'>Sender Debug not started</Typography>
                <Typography variant='body2' color='text.secondary' sx={{ maxWidth: 480 }}>Start the channel (tab settings ⚙ → Start) to pick a sender, compose a message and see what the sender answers.</Typography>
            </Stack>
        )
    }

    return (
        <Card sx={{ flex: 1, width: '98%', alignSelf: 'center', m: 1 }}>
            <CardHeader title={
                <Stack direction='row' alignItems='center' spacing={2} sx={{ width: '100%' }}>
                    <Typography><b>Senders:</b> {data.senders.length}</Typography>
                    <Typography><b>Sends:</b> {data.history.length}</Typography>
                    {inFlight() > 0 &&
                        <Chip label={`${inFlight()} in flight`} size='small' color='info' variant='outlined' />
                    }
                    <Stack direction='row' alignItems='center' spacing={0.5} sx={{ ml: 'auto' }}>
                        <Tooltip title='Reload the sender catalogue'>
                            <IconButton size='small' aria-label='Reload senders' onClick={() => sendCommand(ESenderDebugCommand.LIST)}><Refresh fontSize='small' /></IconButton>
                        </Tooltip>
                        <Tooltip title='Clear the send history'>
                            <span>
                                <IconButton size='small' aria-label='Clear history' onClick={clear} disabled={data.history.length === 0 && data.signals.length === 0}><DeleteSweep fontSize='small' /></IconButton>
                            </span>
                        </Tooltip>
                    </Stack>
                </Stack>
            } />
            <CardContent>
                <Stack direction='column' spacing={1.5}>
                    <Stack direction='row' spacing={2} alignItems='flex-end'>
                        <Stack direction='column' spacing={0.5} sx={{ minWidth: 260 }}>
                            <Typography variant='caption' color='text.secondary'>Sender</Typography>
                            <Select value={form.senderId} onChange={(e) => setSender(e.target.value)} displayEmpty size='small' variant='standard' inputProps={{ 'aria-label': 'Sender' }}>
                                <MenuItem value=''><Typography variant='body2' color='text.secondary'>(pick a sender)</Typography></MenuItem>
                                {data.senders.map(s => (
                                    <MenuItem key={s.id} value={s.id}>
                                        <Stack direction='row' spacing={1} alignItems='center'>
                                            <Typography variant='body2'>{senderLabel(s.id)}</Typography>
                                            {s.kind === ESenderDebugKind.FILTER &&
                                                <Chip label='filter' size='small' variant='outlined' color='warning' sx={{ fontSize: '0.65rem', height: 18 }} />
                                            }
                                            {!s.instantiated &&
                                                <Chip label='not started yet' size='small' variant='outlined' sx={{ fontSize: '0.65rem', height: 18 }} />
                                            }
                                            {s.configNames.length === 0 &&
                                                <Chip label='no configs' size='small' variant='outlined' color='error' sx={{ fontSize: '0.65rem', height: 18 }} />
                                            }
                                        </Stack>
                                    </MenuItem>
                                ))}
                            </Select>
                        </Stack>
                        <Stack direction='column' spacing={0.5} sx={{ minWidth: 220 }}>
                            <Typography variant='caption' color='text.secondary'>Configuration</Typography>
                            {/* siempre presente y deshabilitada mientras no haya sender: nunca en condicional */}
                            <Select value={form.configName} onChange={(e) => { form.configName = e.target.value; refresh() }} displayEmpty size='small' variant='standard' disabled={!selected || configNames.length === 0} inputProps={{ 'aria-label': 'Configuration' }}>
                                <MenuItem value=''><Typography variant='body2' color='text.secondary'>(pick a configuration)</Typography></MenuItem>
                                {configNames.map(name => <MenuItem key={name} value={name}>{name}</MenuItem>)}
                            </Select>
                        </Stack>
                        <Stack direction='row' spacing={1} alignItems='center' sx={{ pb: 0.5 }}>
                            {selected?.supportsBatch &&
                                <Chip label='sendBatch' size='small' variant='outlined' color='info' />
                            }
                            {selected && !selected.instantiated &&
                                <Typography variant='caption' color='text.secondary'>Not started yet — the first send starts it, same as any plugin would.</Typography>
                            }
                            {selected && selected.kind === ESenderDebugKind.FILTER &&
                                <Typography variant='caption' color='warning.main'>This is a filter: it does not deliver anywhere, it chains.</Typography>
                            }
                        </Stack>
                    </Stack>

                    {/*
                        Los tres van con el label SIEMPRE arriba (shrink) y los tres reservan su linea de
                        ayuda, aunque este vacia: si uno deja el label dentro del campo y otro lo sube, las
                        lineas de los campos dejan de coincidir y la fila sale escalonada. El Select va
                        envuelto en su FormControl por lo mismo — suelto no tiene label ni sitio para la
                        ayuda, y su subrayado cae por su cuenta.
                    */}
                    <Stack direction='row' spacing={2} alignItems='flex-start'>
                        <TextField value={form.subject} onChange={(e) => { form.subject = e.target.value; refresh() }} variant='standard' label='Subject'
                            slotProps={{ inputLabel: { shrink: true } }} helperText=' ' sx={{ flex: 1 }} />
                        <FormControl variant='standard' sx={{ minWidth: 120 }}>
                            <InputLabel id='sender-debug-level-label' shrink>Level</InputLabel>
                            <Select labelId='sender-debug-level-label' value={form.level} onChange={(e) => { form.level = e.target.value as ESenderDebugLevel; refresh() }} inputProps={{ 'aria-label': 'Level' }}>
                                <MenuItem value={ESenderDebugLevel.DEBUG}>debug</MenuItem>
                                <MenuItem value={ESenderDebugLevel.INFO}>info</MenuItem>
                                <MenuItem value={ESenderDebugLevel.WARNING}>warning</MenuItem>
                                <MenuItem value={ESenderDebugLevel.ERROR}>error</MenuItem>
                            </Select>
                            <FormHelperText> </FormHelperText>
                        </FormControl>
                        <TextField value={form.to} onChange={(e) => { form.to = e.target.value; refresh() }} variant='standard' label='To' placeholder='comma separated'
                            slotProps={{ inputLabel: { shrink: true } }} helperText='What a recipient means is up to the sender' sx={{ flex: 1 }} />
                    </Stack>

                    <TextField value={form.body} onChange={(e) => { form.body = e.target.value; refresh() }} variant='standard' label='Body' multiline minRows={2} maxRows={6} fullWidth />

                    <TextField value={form.metadata} onChange={(e) => { form.metadata = e.target.value; refresh() }} variant='standard' label='Metadata (JSON)' placeholder='{}' multiline minRows={1} maxRows={5}
                        error={invalidMetadata()} helperText={invalidMetadata() ? 'Not a valid JSON object' : 'Free JSON object, empty means none'} fullWidth />

                    <Stack direction='row' spacing={2} alignItems='center'>
                        <FormControlLabel
                            control={<Checkbox checked={form.batch} onChange={(e) => { form.batch = e.target.checked; refresh() }} inputProps={{ 'aria-label': 'Batch' }} />}
                            label={<Typography variant='body2'>Batch (sendBatch)</Typography>}
                        />
                        {/* siempre visible y deshabilitado fuera del lote: nunca render condicional */}
                        <TextField value={form.count} onChange={(e) => { form.count = +e.target.value; refresh() }} type='number' variant='standard' label='Messages' disabled={!form.batch}
                            error={invalidCount()} helperText={invalidCount() ? '1 to 100' : ' '} sx={{ width: 110 }} />
                        <Typography variant='caption' color='warning.main' sx={{ flex: 1 }}>
                            This sends for real: a mail leaves, a ticket is created, a chat room gets a message.
                        </Typography>
                        <Button variant='contained' startIcon={<Send />} onClick={send} disabled={!canSend()}>SEND</Button>
                    </Stack>

                    {data.signals.map((s, index) => <Typography key={index} variant='caption' color='text.secondary'>*** {s} ***</Typography>)}

                    {data.senders.length === 0 &&
                        <Stack direction='row' spacing={1} alignItems='center'>
                            <Close fontSize='small' color='disabled' />
                            <Typography variant='body2' color='text.secondary'>No senders installed on this Kwirth. Install one from the sender manager, give it a configuration, and reload the catalogue.</Typography>
                        </Stack>
                    }
                </Stack>

                <Box ref={boxRef} sx={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', width: '100%', flexGrow: 1, mt: 1, height: `calc(100vh - ${boxTop}px - 35px)` }}>
                    <Box sx={{ flex: 1, overflowY: 'auto', ml: 1, mr: 1 }}>
                        {data.history.map((entry, index) => formatEntry(entry, index))}
                    </Box>
                </Box>
            </CardContent>
        </Card>
    )
}
