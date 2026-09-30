import React from 'react'
import { Box, Button, Chip, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import { IContentProps, getDce, hasDce } from '@kwirthmagnify/kwirth-common-front'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType } from '@kwirthmagnify/kwirth-common'
import { EDnsRecordType, INetToolsFront } from '../common/NetToolsContract'
import { ENetToolsCommand, INetToolsReading, INetToolsRequest } from '../common/NetToolsMessages'
import { INetToolsData } from './NetToolsChannel'

/*
    The screen: a host name, three questions, and the answers newest first.

    Everything is resolved and reached by the BACK end, and that is the point of the plugin: what it
    shows is what KWIRTH sees from inside the cluster, not what this browser sees. Typing
    `kwirth-postgres.default.svc.cluster.local` here answers a question the operator's laptop cannot.
*/

const RECORD_TYPES: EDnsRecordType[] = [
    EDnsRecordType.A, EDnsRecordType.AAAA, EDnsRecordType.CNAME, EDnsRecordType.MX,
    EDnsRecordType.NS, EDnsRecordType.PTR, EDnsRecordType.SOA, EDnsRecordType.SRV, EDnsRecordType.TXT
]

interface IEmptyStateProps {
    title: string
    detail: string
}

/*
    The empty state, centred both ways.

    ⚠️ The height is MEASURED, not inherited. The container the core gives a tab's content has no defined
    height, so a 'height: 100%' resolves to nothing and the message stays stuck at the top instead of
    centred. Where the box starts is measured and it is given the rest of the viewport — the same
    pattern the other channels use.
*/
const EmptyState: React.FC<IEmptyStateProps> = ({ title, detail }) => {
    const ref = React.useRef<HTMLDivElement | null>(null)
    const [top, setTop] = React.useState(0)
    React.useEffect(() => {
        if (ref.current) setTop(ref.current.getBoundingClientRect().top)
    })
    return (
        <Stack ref={ref} alignItems='center' justifyContent='center' spacing={1}
            sx={{ flex: 1, width: '100%', minHeight: `calc(100vh - ${top}px - 8px)`, px: 4, textAlign: 'center' }}>
            <Typography variant='h6' color='text.secondary'>{title}</Typography>
            <Typography variant='body2' color='text.secondary'>{detail}</Typography>
        </Stack>
    )
}

/** The headline of one answer: what was asked, of what, and how it went. */
const headline = (reading: INetToolsReading): string => {
    if (reading.dns) return `${reading.command} ${reading.dns.type} · ${reading.dns.name}`
    if (reading.reverse) return `${reading.command} · ${reading.reverse.address}`
    if (reading.ping) return `${reading.command} · ${reading.ping.target}:${reading.ping.port}`
    return String(reading.command)
}

/**
 * The lines to paint. An empty list is NOT an error and is not painted as one: the name resolved and
 * has no record of that type, which is a different thing from not resolving.
 */
const lines = (reading: INetToolsReading): string[] => {
    if (reading.dns) return reading.dns.records
    if (reading.reverse) return reading.reverse.hostnames
    if (reading.ping) return reading.ping.attempts.map(attempt =>
        `#${attempt.seq} ${attempt.ok ? `${attempt.timeMs} ms` : (attempt.error ?? 'failed')}`)
    return []
}

/** The one-line verdict under the headline. */
const summary = (reading: INetToolsReading): string => {
    if (reading.dns) return `${reading.dns.records.length} record(s) in ${reading.dns.timeMs} ms`
    if (reading.reverse) return `${reading.reverse.hostnames.length} name(s) in ${reading.reverse.timeMs} ms`
    if (reading.ping) {
        const ping = reading.ping
        const times = ping.received > 0 ? ` · min ${ping.minMs} / avg ${ping.avgMs} / max ${ping.maxMs} ms` : ''
        return `${ping.received}/${ping.sent} answered · ${ping.lossPercent}% loss${times}${ping.address ? ` · ${ping.address}` : ''}`
    }
    return ''
}

/** The failure carried INSIDE the result: a name that does not resolve, a port that refuses. */
const resultError = (reading: INetToolsReading): string | undefined =>
    reading.dns?.error ?? reading.reverse?.error ?? reading.ping?.error

const Reading: React.FC<{ reading: INetToolsReading }> = ({ reading }) => {
    const failure = resultError(reading)
    const painted = lines(reading)
    return (
        <Paper variant='outlined' sx={{ p: 1.5 }}>
            <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 0.5 }}>
                <Typography variant='subtitle2' sx={{ flex: 1 }} aria-label='reading headline'>{headline(reading)}</Typography>
                {reading.dceId && <Chip size='small' variant='outlined' label={`dce: ${reading.dceId}`} />}
            </Stack>

            {/* The DCE missing, or a command that made no sense. Nothing else to paint. */}
            {reading.error && <Typography variant='body2' color='error' aria-label='reading error'>{reading.error}</Typography>}

            {!reading.error && <>
                <Typography variant='caption' color='text.secondary' display='block' aria-label='reading summary'>{summary(reading)}</Typography>
                {failure && <Typography variant='body2' color='error' aria-label='reading failure'>{failure}</Typography>}
                {!failure && painted.length === 0 &&
                    <Typography variant='body2' color='text.secondary'>No records of this type. The name resolves — it just has none.</Typography>}
                {painted.map((line, index) =>
                    <Typography key={index} variant='body2' sx={{ fontFamily: 'monospace' }} aria-label='reading line'>{line}</Typography>)}
            </>}
        </Paper>
    )
}

export const NetToolsTabContent: React.FC<IContentProps> = (props) => {
    const data: INetToolsData = props.channelObject.data
    const [, force] = React.useState(0)
    const [latencyOpen, setLatencyOpen] = React.useState(false)
    const repaint = () => force(value => value + 1)

    /*
        The DCE's front end, or nothing.

        The chart and the icon come from it already built — this plugin owns neither an SVG path nor a
        line of recharts. `hasDce()` rather than a try: a consumer that can carry on without it says so
        by asking, and the button is disabled instead of throwing when somebody presses it.
    */
    const nettools: INetToolsFront | undefined = hasDce('nettools') ? getDce<INetToolsFront>('nettools') : undefined
    const LatencyDialog = nettools?.LatencyDialog

    const ask = (command: ENetToolsCommand): void => {
        const request: INetToolsRequest = { command, target: data.target, recordType: data.type, port: data.port, count: 3 }
        data.waiting = true
        repaint()
        // The accessKey travels in the command or the core discards it before it reaches the plugin,
        // and the only symptom is a request that never comes back.
        props.channelObject.webSocket?.send(JSON.stringify({
            msgtype: 'nettoolsmessage',
            channel: 'nettools',
            action: EInstanceMessageAction.COMMAND,
            flow: EInstanceMessageFlow.REQUEST,
            type: EInstanceMessageType.DATA,
            accessKey: props.channelObject.accessString!,
            instance: props.channelObject.instanceId,
            ...request
        }))
    }

    if (!data.started) {
        return <EmptyState title='Net tools not started'
            detail='Start the channel (tab settings ⚙ → Start) to resolve names and check ports from inside the cluster.' />
    }

    // The target is the only thing every question needs; the port only matters to one of them.
    const noTarget = data.target.trim().length === 0

    return (
        <Stack spacing={2} sx={{ p: 2 }}>
            <Box>
                <Typography variant='subtitle2'>DNS and reachability, as Kwirth sees them</Typography>
                <Typography variant='caption' color='text.secondary'>
                    Everything here is answered by the Kwirth process, not by this browser: a name such as
                    kwirth-postgres.default.svc.cluster.local only means something from inside the cluster.
                </Typography>
            </Box>

            <Stack direction='row' spacing={1} useFlexGap flexWrap='wrap' alignItems='center'>
                <TextField size='small' label='Host or IP' value={data.target} sx={{ minWidth: 280 }}
                    onChange={event => { data.target = event.target.value; repaint() }} />
                <TextField size='small' select label='Record' value={data.type} sx={{ minWidth: 110 }}
                    onChange={event => { data.type = event.target.value as EDnsRecordType; repaint() }}>
                    {RECORD_TYPES.map(type => <MenuItem key={type} value={type}>{type}</MenuItem>)}
                </TextField>
                <TextField size='small' type='number' label='Port' value={data.port} sx={{ width: 110 }}
                    inputProps={{ min: 1, max: 65535 }}
                    onChange={event => { data.port = Number(event.target.value); repaint() }} />
            </Stack>

            <Stack direction='row' spacing={1} useFlexGap flexWrap='wrap'>
                <Button variant='contained' size='small' disabled={noTarget || data.waiting}
                    onClick={() => ask(ENetToolsCommand.RESOLVE)}>Resolve</Button>
                <Button variant='outlined' size='small' disabled={noTarget || data.waiting}
                    onClick={() => ask(ENetToolsCommand.REVERSE)}>Reverse</Button>
                <Button variant='outlined' size='small' disabled={noTarget || data.waiting}
                    onClick={() => ask(ENetToolsCommand.CHECK)}>Check port</Button>
                {/*
                    The chart is the DCE's, not this plugin's: what opens is a component that came out of
                    the registry, drawing a history every consumer on the page writes into.
                */}
                <Button variant='text' size='small' disabled={!nettools} onClick={() => setLatencyOpen(true)}>Latency</Button>
            </Stack>

            {data.readings.length === 0 &&
                <Typography variant='body2' color='text.secondary'>Nothing asked yet.</Typography>}

            <Stack spacing={1}>
                {data.readings.map((reading, index) => <Reading key={index} reading={reading} />)}
            </Stack>

            {data.signals.length > 0 &&
                <Box>{data.signals.map((signal, index) =>
                    <Typography key={index} variant='caption' color='error' display='block'>{signal}</Typography>)}</Box>}

            {LatencyDialog && <LatencyDialog open={latencyOpen} onClose={() => setLatencyOpen(false)} />}
        </Stack>
    )
}
