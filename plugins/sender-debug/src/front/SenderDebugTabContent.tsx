import React, { useEffect, useRef, useState } from 'react'
import { Box, Button, Card, CardContent, CardHeader, Checkbox, Chip, FormControl, FormControlLabel, IconButton, InputLabel, MenuItem, Paper, Select, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType, ISenderMessage, isConfigFieldEnabled } from '@kwirthmagnify/kwirth-common'
import { ChannelNotStarted, ENotifyLevel, IContentProps, JsonBlock } from '@kwirthmagnify/kwirth-common-front'
import { Check, Close, ContentCopy, DeleteSweep, Error as ErrorIcon, ExpandLess, ExpandMore, Refresh, Schedule, Send, Visibility, VisibilityOff } from '@kwirthmagnify/kwirth-common-front/icons'
import { ESenderDebugAbandoned, ESenderDebugCommand, ESenderDebugKind, ESenderDebugLevel, ISenderDebugConfigRequest, ISenderDebugSendRequest } from '../common/SenderDebugTypes'
import { ISenderDebugConfig } from './SenderDebugConfig'
import { ISenderDebugData, ISenderDebugHistoryEntry, ISenderDebugOriginForm } from './SenderDebugData'

/** A sentence shown where JSON would go (no request, a void answer, an error): the same box, without colour. */
const PLAIN = { m: 0, fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' } as const

/** The origin fields as the form shows them, in order: the key in ISenderDebugOriginForm and its label. */
const ORIGIN_FIELDS: Array<{ key: keyof ISenderDebugOriginForm, label: string }> = [
    { key: 'source', label: 'Source' },
    { key: 'cluster', label: 'Cluster' },
    { key: 'namespace', label: 'Namespace' },
    { key: 'pod', label: 'Pod' },
    { key: 'container', label: 'Container' },
    { key: 'service', label: 'Service' }
]

export const SenderDebugTabContent: React.FC<IContentProps> = (props: IContentProps) => {
    const data: ISenderDebugData = props.channelObject.data
    const config: ISenderDebugConfig = props.channelObject.config
    const form = data.form
    const boxRef = useRef<HTMLDivElement | null>(null)
    const [boxTop, setBoxTop] = useState(0)
    // The card's content is the scroll container: what the form and the history need beyond the screen scrolls here.
    const contentRef = useRef<HTMLDivElement | null>(null)
    const [contentTop, setContentTop] = useState(0)
    // The channel repaints when a message arrives from the back end; typing in the form, clearing or
    // expanding a row are local actions and need their own render trigger.
    const [, forceRender] = useState(0)
    // Expansion by REFERENCE to the entry, not by index: the history grows from the top and the
    // indices shift with every send, so an expanded row would end up being a different one.
    const [expanded, setExpanded] = useState<Set<ISenderDebugHistoryEntry>>(new Set())
    // The row whose Copy was just pressed: its button shows a tick for a moment.
    const [copied, setCopied] = useState<ISenderDebugHistoryEntry | undefined>(undefined)
    // The folded fields of the chosen configuration, and which of its secret values are revealed.
    const [configOpen, setConfigOpen] = useState(false)
    const [revealed, setRevealed] = useState<Set<string>>(new Set())

    useEffect(() => {
        if (boxRef.current) setBoxTop(boxRef.current.getBoundingClientRect().top)
        if (contentRef.current) setContentTop(contentRef.current.getBoundingClientRect().top)
    })

    /*
        The chosen configuration in view: asked for whenever the choice changes — also when it comes preselected from
        the setup and the instance has just started. An answer for a previous choice is dropped by the channel.
    */
    useEffect(() => {
        if (!props.channelObject.instanceId || form.senderId === '' || form.configName === '') return
        if (data.configView?.senderId === form.senderId && data.configView.configName === form.configName) return
        const request: ISenderDebugConfigRequest = { senderId: form.senderId, configName: form.configName }
        sendCommand(ESenderDebugCommand.CONFIG, request)
    }, [props.channelObject.instanceId, form.senderId, form.configName])

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
        setConfigName(form.configName)
    }

    // The view belongs to the previous choice: it goes, and the effect above asks for the new one.
    const setConfigName = (configName: string) => {
        form.configName = configName
        data.configView = undefined
        setRevealed(new Set())
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
            origin: { ...originOf(form.origin), timestamp: Date.now() }
        }
    }

    /** The typed origin as it travels: an empty field is not sent, so the destination does not label by ''. */
    const originOf = (origin: ISenderDebugOriginForm): Partial<ISenderDebugOriginForm> => {
        const out: Partial<ISenderDebugOriginForm> = {}
        for (const { key } of ORIGIN_FIELDS) {
            const value = origin[key].trim()
            if (value !== '') out[key] = value
        }
        return out
    }

    /** false when the command could not even leave: no instance, or the socket is not open */
    const sendCommand = (command: ESenderDebugCommand, payload?: ISenderDebugSendRequest | ISenderDebugConfigRequest): boolean => {
        if (!props.channelObject.instanceId) return false
        /*
            A closed socket swallows send() without a word: while Kwirth restarts and the core reconnects (about
            10 s), whatever is written here is lost, and the row would wait forever for an answer.
        */
        const webSocket = props.channelObject.webSocket
        if (!webSocket || webSocket.readyState !== WebSocket.OPEN) return false
        /*
            The accessKey goes in EVERY command: the core discards them before they reach the plugin when
            they do not carry it, and from the front end that is indistinguishable from a back end that
            does not answer.
        */
        webSocket.send(JSON.stringify({
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
        return true
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
        const entry: ISenderDebugHistoryEntry = { request }
        data.history.unshift(entry)
        while (data.history.length > config.maxHistory) data.history.pop()
        if (!sendCommand(form.batch ? ESenderDebugCommand.SENDBATCH : ESenderDebugCommand.SEND, request)) {
            // it stays in the history — what was attempted is still worth seeing — but flagged as never sent
            entry.abandoned = ESenderDebugAbandoned.NOT_SENT
            props.channelObject.notify?.(props.channelObject.channelId, ENotifyLevel.WARNING, 'Not sent: this tab is not connected to Kwirth right now. It reconnects by itself; send again in a few seconds.')
        }
        refresh()
    }

    const clear = () => {
        data.history = []
        setExpanded(new Set())
        refresh()
    }

    const toggle = (entry: ISenderDebugHistoryEntry) => setExpanded(prev => {
        const next = new Set(prev)
        if (next.has(entry)) next.delete(entry)
        else next.add(entry)
        return next
    })

    /*
        sendBatch() is optional on a sender. Without it a batch is still sent — one send() per message, exactly what the
        core does for any plugin that hands that sender a batch — so batch stays available, and this says which path it takes.
    */
    const batchChipLabel = (): string => {
        if (!selected) return 'sendBatch'
        return selected.supportsBatch ? 'sendBatch: native' : 'sendBatch: emulated'
    }

    const batchTooltip = (): string => {
        if (!selected) return 'Pick a sender to see how it takes a batch.'
        if (selected.supportsBatch) return 'This sender implements sendBatch(): a batch reaches it as one call.'
        return 'This sender has no sendBatch(): a batch is delivered one send() at a time, the same as the core does for any plugin.'
    }

    const senderLabel = (id: string): string => {
        const sender = data.senders.find(s => s.id === id)
        return sender?.displayName ? `${id} — ${sender.displayName}` : id
    }

    /** What is visible on a row.s status line, without expanding it. */
    const summaryOf = (entry: ISenderDebugHistoryEntry): string => {
        if (!entry.result) {
            switch (entry.abandoned) {
                case ESenderDebugAbandoned.STOPPED: return 'no answer — the channel was stopped'
                case ESenderDebugAbandoned.LOST: return 'no answer — the connection to Kwirth dropped (restarted?)'
                case ESenderDebugAbandoned.NOT_SENT: return 'not sent — this tab was not connected to Kwirth'
                default: return 'sending…'
            }
        }
        if (!entry.result.ok) return entry.result.error ?? 'failed'
        return entry.result.result ? 'delivered, with a result' : 'delivered'
    }

    /** What the sender answered, in JSON. A notification sender returns nothing, and that is said. */
    const answerOf = (entry: ISenderDebugHistoryEntry): string => {
        if (!entry.result) {
            switch (entry.abandoned) {
                case ESenderDebugAbandoned.STOPPED: return 'No answer: the channel was stopped before the sender replied.'
                case ESenderDebugAbandoned.LOST: return 'No answer: the connection to Kwirth dropped before the sender replied — most likely Kwirth restarted. Whether it was delivered is unknown. The tab reconnects by itself; send again once it is back.'
                case ESenderDebugAbandoned.NOT_SENT: return 'Not sent: this tab was not connected to Kwirth when SEND was pressed, so nothing reached the sender. The tab reconnects by itself; send again once it is back.'
                default: return 'Waiting for the sender…'
            }
        }
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
    // What a row's Copy puts on the clipboard: exactly what the expanded row shows, both halves.
    const sentOf = (entry: ISenderDebugHistoryEntry): string =>
        entry.request ? JSON.stringify(entry.request.message, null, 2) : 'Not available: this answer arrived without its request.'
    const copy = async (entry: ISenderDebugHistoryEntry) => {
        try {
            await navigator.clipboard.writeText(`Sent\n${sentOf(entry)}\n\nAnswered\n${answerOf(entry)}\n`)
            setCopied(entry)
            setTimeout(() => setCopied(c => c === entry ? undefined : c), 1500)
        }
        catch (err) {
            console.error('sender-debug: could not copy to the clipboard', err)
        }
    }

    /*
        A folded block of the form: always there, the chevron on the RIGHT, and the whole header opens it. Disabled (and
        closed) while it has nothing to show — the Configuration block until a configuration is picked.
    */
    const foldable = (title: string, open: boolean, onToggle: () => void, disabled: boolean, content: React.ReactNode) => (
        <Box sx={{ borderTop: 1, borderColor: 'divider', mt: 0.5 }}>
            <Stack direction='row' onClick={() => { if (!disabled) onToggle() }} aria-label={title} role='button' aria-expanded={open && !disabled}
                sx={{ alignItems: 'center', pt: 0.5, cursor: disabled ? 'default' : 'pointer' }}>
                <Typography variant='body2' sx={{ flex: 1, color: disabled ? 'text.disabled' : undefined }}>{title}</Typography>
                <IconButton size='small' disabled={disabled} aria-label={open ? `Collapse ${title}` : `Expand ${title}`} onClick={(e) => { e.stopPropagation(); onToggle() }}>
                    {open && !disabled ? <ExpandLess fontSize='small' /> : <ExpandMore fontSize='small' />}
                </IconButton>
            </Stack>
            {open && !disabled && <Box sx={{ pt: 0.5 }}>{content}</Box>}
        </Box>
    )

    /**
     * A titled card of the form: what goes together is drawn together. 'grow' makes it take the rest of its column, so
     * the two columns end at the same line.
     */
    const section = (title: string, content: React.ReactNode, grow = false) => (
        <Paper variant='outlined' sx={{ p: 1.5, minWidth: 0, ...(grow ? { flex: 1, display: 'flex', flexDirection: 'column' } : {}) }}>
            <Typography variant='overline' sx={{ display: 'block', lineHeight: 1.5, mb: 1, color: 'text.secondary' }}>{title}</Typography>
            {grow ? <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{content}</Box> : content}
        </Paper>
    )

    const isSecret = (type: string | undefined, secret: boolean | undefined): boolean => type === 'password' || secret === true

    const toggleSecret = (name: string) => setRevealed(prev => {
        const next = new Set(prev)
        if (next.has(name)) next.delete(name)
        else next.add(name)
        return next
    })

    /** A configuration value as text: objects as JSON, absent as empty. */
    const textOf = (value: unknown): string => {
        if (value === undefined || value === null) return ''
        if (typeof value === 'object') return JSON.stringify(value)
        return String(value)
    }

    /**
     * The chosen configuration: every field the sender declares, its type, and what this configuration holds. Secrets
     * are the real value, masked behind the eye (CLAUDE.md). A field without a value shows its default, in italics.
     */
    const configPanel = (): React.ReactNode => {
        const view = data.configView
        if (!view) return <Typography variant='caption' sx={{ color: 'text.secondary' }}>Reading the configuration…</Typography>
        if (view.error) return <Typography variant='caption' sx={{ color: 'error.main' }}>{view.error}</Typography>
        if (view.fields.length === 0) return <Typography variant='caption' sx={{ color: 'text.secondary' }}>This sender declares no configuration fields.</Typography>
        return (
            <Stack spacing={0.5}>
                {view.fields.map(f => {
                    const value = view.values[f.name]
                    const secret = isSecret(f.type, f.secret)
                    const shown = revealed.has(f.name)
                    const text = textOf(value)
                    // a field another one says does not apply here (enabledWhen) is greyed, and not required, as in the core's form
                    const applies = isConfigFieldEnabled(f, view.fields, view.values)
                    return (
                        <Stack key={f.name} direction='row' spacing={1} sx={{ alignItems: 'center', minHeight: 28, opacity: applies ? 1 : 0.45 }}>
                            <Typography variant='body2' noWrap sx={{ width: 220, flexShrink: 0 }}>{f.label}{f.required && applies ? ' *' : ''}</Typography>
                            <Typography variant='caption' noWrap sx={{ width: 80, flexShrink: 0, color: 'text.secondary', fontFamily: 'monospace' }}>{f.type ?? 'text'}</Typography>
                            {value === undefined || value === ''
                                ? <Typography variant='body2' sx={{ flex: 1, color: 'text.secondary', fontStyle: 'italic' }}>{f.default !== undefined ? `default: ${textOf(f.default)}` : '(empty)'}</Typography>
                                : <Typography variant='body2' sx={{ flex: 1, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                    {secret && !shown ? text.replace(/[^\n]/g, '•') : text}
                                </Typography>}
                            {/* the eye is there for every secret field, disabled while there is nothing to reveal */}
                            <Box sx={{ width: 32, flexShrink: 0 }}>
                                {secret &&
                                    <IconButton size='small' disabled={text === ''} aria-label={shown ? `Hide ${f.label}` : `Show ${f.label}`} onClick={() => toggleSecret(f.name)}>
                                        {shown ? <VisibilityOff fontSize='small' /> : <Visibility fontSize='small' />}
                                    </IconButton>
                                }
                            </Box>
                        </Stack>
                    )
                })}
            </Stack>
        )
    }

    /** Where the message says it comes from. An empty field is not sent; the timestamp is the send's own moment. */
    const originPanel = (): React.ReactNode => (
        <Stack spacing={0.5}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
                {ORIGIN_FIELDS.map(({ key, label }) =>
                    <TextField key={key} value={form.origin[key]} onChange={(e) => { form.origin[key] = e.target.value; refresh() }} size='small' label={label}
                        slotProps={{ inputLabel: { shrink: true } }} />
                )}
            </Box>
            <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                Empty fields are not sent. The timestamp is the moment of the send.
            </Typography>
        </Stack>
    )

    const formatEntry = (entry: ISenderDebugHistoryEntry, index: number) => {
        const open = expanded.has(entry)
        const result = entry.result
        const senderId = result?.senderId ?? entry.request?.senderId ?? '?'
        const configName = result?.configName ?? entry.request?.configName ?? '?'
        const batch = result?.batch ?? Boolean(entry.request?.count)
        const count = result?.count ?? entry.request?.count ?? 1
        return (
            <Paper key={index} variant='outlined' sx={{ mb: 0.5 }}>
                <Stack
                    direction='row'
                    spacing={1.5}
                    onClick={() => toggle(entry)}
                    sx={{
                        alignItems: 'center',
                        minWidth: 0,
                        px: 1,
                        py: 0.5,
                        cursor: 'pointer'
                    }}>
                    <IconButton size='small' aria-label={open ? 'Collapse send' : 'Expand send'} onClick={(e) => { e.stopPropagation(); toggle(entry) }}>
                        {open ? <ExpandLess fontSize='small' /> : <ExpandMore fontSize='small' />}
                    </IconButton>
                    {/* en vuelo todavía no hay veredicto: ni tick ni error, que serían mentira */}
                    {!result && <Schedule fontSize='small' color='disabled' />}
                    {result?.ok === true && <Check fontSize='small' color='success' />}
                    {result?.ok === false && <ErrorIcon fontSize='small' color='error' />}
                    <Typography
                        variant='caption'
                        sx={{
                            color: 'text.secondary',
                            fontFamily: 'monospace'
                        }}>{new Date(result?.ts ?? Date.now()).toISOString()}</Typography>
                    <Chip label={`${senderId} / ${configName}`} size='small' variant='outlined' sx={{ fontSize: '0.65rem', height: 18 }} />
                    {batch &&
                        <Chip label={result?.emulated ? `batch ${count} (emulated)` : `batch ${count}`} size='small' variant='outlined' color={result?.emulated ? 'warning' : 'info'} sx={{ fontSize: '0.65rem', height: 18 }} />
                    }
                    <Typography
                        variant='caption'
                        noWrap
                        sx={{
                            color: 'text.secondary',
                            flex: 1
                        }}>{summaryOf(entry)}</Typography>
                    <Typography variant='caption' sx={{
                        color: 'text.secondary'
                    }}>{result ? `${result.elapsed} ms` : ''}</Typography>
                    <Tooltip title={copied === entry ? 'Copied' : 'Copy what was sent and answered'}>
                        <IconButton size='small' aria-label='Copy send' onClick={(e) => { e.stopPropagation(); copy(entry) }}>
                            {copied === entry ? <Check fontSize='small' color='success' /> : <ContentCopy fontSize='small' />}
                        </IconButton>
                    </Tooltip>
                </Stack>
                {open &&
                    <Box sx={{ px: 2, pb: 1 }}>
                        <Typography variant='caption' sx={{
                            color: 'text.secondary'
                        }}>Sent</Typography>
                        {/* JSON coloured by type when there is an object; the plain sentences (no request, void, an error) stay plain */}
                        <Box sx={{ mb: 1 }}>
                            {entry.request
                                ? <JsonBlock value={entry.request.message} />
                                : <Box component='pre' sx={PLAIN}>{sentOf(entry)}</Box>}
                        </Box>
                        <Typography variant='caption' sx={{
                            color: 'text.secondary'
                        }}>Answered</Typography>
                        {result?.ok && result.result
                            ? <JsonBlock value={result.result} />
                            : <Box component='pre' sx={PLAIN}>{answerOf(entry)}</Box>}
                    </Box>
                }
            </Paper>
        );
    }

    /*
        Channel not started: the shared ChannelNotStarted (icon and name, what starting gives, and a Start button), the
        same as other plugins. The container only centres it: both things are needed to take up the height —
        'flex: 1' when the parent is flex, and the measured minHeight when it is not.
    */
    if (!data.started) {
        return (
            <Stack
                ref={boxRef}
                sx={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: 1,
                    width: '100%',
                    minHeight: `calc(100vh - ${boxTop}px - 8px)`,
                    px: 4
                }}>
                <ChannelNotStarted icon={<Send color='primary' />} name='Sender Debug' hint='Sender Debug not started. Start the channel to pick a sender, compose a message and see what the sender answers.' channelObject={props.channelObject} />
            </Stack>
        );
    }

    return (
        <Card sx={{ flex: 1, width: '98%', alignSelf: 'center', m: 1 }}>
            <CardHeader title={
                <Stack
                    direction='row'
                    spacing={2}
                    sx={{
                        alignItems: 'center',
                        width: '100%'
                    }}>
                    <Typography><b>Senders:</b> {data.senders.length}</Typography>
                    <Typography><b>Sends:</b> {data.history.length}</Typography>
                    {inFlight() > 0 &&
                        <Chip label={`${inFlight()} in flight`} size='small' color='info' variant='outlined' />
                    }
                    <Stack
                        direction='row'
                        spacing={0.5}
                        sx={{
                            alignItems: 'center',
                            ml: 'auto'
                        }}>
                        <Tooltip title='Reload the sender catalogue'>
                            <IconButton size='small' aria-label='Reload senders' onClick={() => sendCommand(ESenderDebugCommand.LIST)}><Refresh fontSize='small' /></IconButton>
                        </Tooltip>
                        <Tooltip title='Clear the send history'>
                            <span>
                                <IconButton size='small' aria-label='Clear history' onClick={clear} disabled={data.history.length === 0}><DeleteSweep fontSize='small' /></IconButton>
                            </span>
                        </Tooltip>
                    </Stack>
                </Stack>
            } />
            {/*
                The content scrolls as a whole when it does not fit: with Configuration or Origin open the form grows,
                the history keeps its minimum, and the rest is reached by scrolling here instead of falling off the tab.
            */}
            <CardContent ref={contentRef} sx={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', height: `calc(100vh - ${contentTop}px - 16px)` }}>
                <Stack direction='column' spacing={1.5} sx={{ flexShrink: 0 }}>
                    {/* two columns — WHO it goes to (destination, origin) and WHAT is sent (message) — stacked on a narrow screen */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 2fr) minmax(0, 3fr)' }, gap: 1.5, alignItems: 'stretch' }}>
                    <Stack spacing={1.5} sx={{ minWidth: 0 }}>
                    {section('Destination', <Stack spacing={1}>
                        <FormControl size='small' fullWidth>
                            <InputLabel id='sender-debug-sender-label' shrink>Sender</InputLabel>
                            <Select labelId='sender-debug-sender-label' label='Sender' notched value={form.senderId} onChange={(e) => setSender(e.target.value)} displayEmpty inputProps={{ 'aria-label': 'Sender' }}>
                                <MenuItem value=''><Typography variant='body2' sx={{
                                    color: 'text.secondary'
                                }}>(pick a sender)</Typography></MenuItem>
                                {data.senders.map(s => (
                                    <MenuItem key={s.id} value={s.id}>
                                        <Stack direction='row' spacing={1} sx={{
                                            alignItems: 'center'
                                        }}>
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
                        </FormControl>
                        {/* always there, disabled while there is no sender: never conditional */}
                        <FormControl size='small' fullWidth disabled={!selected || configNames.length === 0}>
                            <InputLabel id='sender-debug-config-label' shrink>Configuration</InputLabel>
                            <Select labelId='sender-debug-config-label' label='Configuration' notched value={form.configName} onChange={(e) => setConfigName(e.target.value)} displayEmpty inputProps={{ 'aria-label': 'Configuration' }}>
                                <MenuItem value=''><Typography variant='body2' sx={{
                                    color: 'text.secondary'
                                }}>(pick a configuration)</Typography></MenuItem>
                                {configNames.map(name => <MenuItem key={name} value={name}>{name}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <Stack
                            direction='row'
                            spacing={1}
                            sx={{
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                minHeight: 24
                            }}>
                            {/* always there: how a batch would travel through THIS sender is known before sending, not after */}
                            <Tooltip title={batchTooltip()}>
                                {/* the span: a disabled element fires no events, and the tooltip needs them */}
                                <span>
                                    <Chip label={batchChipLabel()} size='small' variant='outlined' disabled={!selected}
                                        color={!selected ? 'default' : selected.supportsBatch ? 'info' : 'warning'} />
                                </span>
                            </Tooltip>
                            {selected && !selected.instantiated &&
                                <Typography variant='caption' sx={{
                                    color: 'text.secondary'
                                }}>Not started yet — the first send starts it, same as any plugin would.</Typography>
                            }
                            {selected && selected.kind === ESenderDebugKind.FILTER &&
                                <Typography variant='caption' sx={{
                                    color: 'warning.main'
                                }}>This is a filter: it does not deliver anywhere, it chains.</Typography>
                            }
                        </Stack>
                        {foldable('Configuration fields', configOpen, () => setConfigOpen(!configOpen), form.configName === '', configPanel())}
                    </Stack>)}

                    {section('Origin', originPanel(), true)}
                    </Stack>

                    <Stack spacing={1.5} sx={{ minWidth: 0 }}>
                    {section('Message', <Stack spacing={1.5} sx={{ flex: 1, minHeight: 0 }}>
                        <Stack direction='row' spacing={1}>
                            <TextField value={form.subject} onChange={(e) => { form.subject = e.target.value; refresh() }} size='small' label='Subject'
                                slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
                            <FormControl size='small' sx={{ width: 130, flexShrink: 0 }}>
                                <InputLabel id='sender-debug-level-label' shrink>Level</InputLabel>
                                <Select labelId='sender-debug-level-label' label='Level' notched value={form.level} onChange={(e) => { form.level = e.target.value as ESenderDebugLevel; refresh() }} inputProps={{ 'aria-label': 'Level' }}>
                                    <MenuItem value={ESenderDebugLevel.DEBUG}>debug</MenuItem>
                                    <MenuItem value={ESenderDebugLevel.INFO}>info</MenuItem>
                                    <MenuItem value={ESenderDebugLevel.WARNING}>warning</MenuItem>
                                    <MenuItem value={ESenderDebugLevel.ERROR}>error</MenuItem>
                                </Select>
                            </FormControl>
                        </Stack>
                        <TextField value={form.to} onChange={(e) => { form.to = e.target.value; refresh() }} size='small' label='To' placeholder='comma separated — what a recipient means is up to the sender'
                            slotProps={{ inputLabel: { shrink: true } }} fullWidth />
                        <TextField value={form.body} onChange={(e) => { form.body = e.target.value; refresh() }} size='small' label='Body' multiline minRows={2} maxRows={4}
                            slotProps={{ inputLabel: { shrink: true } }} fullWidth />
                        {/* Metadata takes whatever room the column leaves (the cards end level), and scrolls inside past it */}
                        <TextField value={form.metadata} onChange={(e) => { form.metadata = e.target.value; refresh() }} size='small' label='Metadata (JSON)' placeholder='{} — a free JSON object, empty means none' multiline minRows={1}
                            slotProps={{ inputLabel: { shrink: true } }} error={invalidMetadata()} helperText={invalidMetadata() ? 'Not a valid JSON object' : ' '} fullWidth
                            sx={{
                                flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
                                '& .MuiInputBase-root': { flex: 1, alignItems: 'flex-start', minHeight: 0 },
                                '& textarea': { height: '100% !important', overflow: 'auto !important', fontFamily: 'monospace' }
                            }} />
                    </Stack>, true)}

                    {/* how it is sent, the warning, and SEND — under the message it sends */}
                    {section('Send', <Stack direction='row' spacing={2} sx={{
                        alignItems: 'center'
                    }}>
                        <FormControlLabel sx={{ ml: 0, flexShrink: 0 }}
                            control={<Checkbox size='small' checked={form.batch} onChange={(e) => { form.batch = e.target.checked; refresh() }} slotProps={{
                                input: { 'aria-label': 'Batch' }
                            }} />}
                            label={<Typography variant='body2'>{selected && !selected.supportsBatch ? 'Batch (emulated)' : 'Batch (sendBatch)'}</Typography>}
                        />
                        {/* always visible, disabled outside batch mode: never conditional */}
                        <TextField value={form.count} onChange={(e) => { form.count = +e.target.value; refresh() }} type='number' size='small' label='Messages (1 to 100)' disabled={!form.batch}
                            error={invalidCount()} slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 150, flexShrink: 0 }} />
                        <Typography
                            variant='caption'
                            sx={{
                                color: 'warning.main',
                                flex: 1
                            }}>
                            This sends for real: a mail leaves, a ticket is created, a chat room gets a message.
                        </Typography>
                        <Button variant='contained' startIcon={<Send />} onClick={send} disabled={!canSend()} sx={{ flexShrink: 0 }}>SEND</Button>
                    </Stack>)}
                    </Stack>
                    </Box>

                    {data.senders.length === 0 &&
                        <Stack direction='row' spacing={1} sx={{
                            alignItems: 'center'
                        }}>
                            <Close fontSize='small' color='disabled' />
                            <Typography variant='body2' sx={{
                                color: 'text.secondary'
                            }}>No senders installed on this Kwirth. Install one from the sender manager, give it a configuration, and reload the catalogue.</Typography>
                        </Stack>
                    }
                </Stack>

                {/* the history takes whatever the form leaves, never less than 240 px: below that, the content scrolls */}
                <Box sx={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', width: '100%', flex: '1 0 240px', mt: 1 }}>
                    <Box sx={{ flex: 1, overflowY: 'auto', ml: 1, mr: 1 }}>
                        {data.history.map((entry, index) => formatEntry(entry, index))}
                    </Box>
                </Box>
            </CardContent>
        </Card>
    );
}
