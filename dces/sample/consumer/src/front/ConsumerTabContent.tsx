import React from 'react'
import { Box, Button, Paper, Stack, Typography } from '@mui/material'
import { IContentProps } from '@kwirthmagnify/kwirth-common-front'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType } from '@kwirthmagnify/kwirth-common'
import { EConsumerCommand } from '../common/ConsumerTypes'
import { IConsumerData } from './ConsumerChannel'
import { readFrontDce } from './ConsumerFront'

/*
    The stub's screen: what each end read from the sample DCE, side by side.

    What it is for: pressing 'Read again' has to make the counters GROW. A counter that always says 1 and
    2 would mean each reading builds its own object, which is exactly what a DCE exists to prevent.
*/

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

    And the detail ALWAYS carries the action: saying just "not started" leaves whoever reads it not
    knowing that what is missing is pressing Start.
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

interface IReadingLike {
    dceId?: string
    ticks?: number[]
    greeting?: string
    error?: string
}

interface ISideProps {
    title: string
    detail: string
    reading?: IReadingLike
    extra?: string
}

const Side: React.FC<ISideProps> = ({ title, detail, reading, extra }) => (
    <Paper variant='outlined' sx={{ p: 2, flex: 1, minWidth: 260 }}>
        <Typography variant='subtitle2'>{title}</Typography>
        <Typography variant='caption' color='text.secondary' display='block' sx={{ mb: 1 }}>{detail}</Typography>
        {!reading && <Typography variant='body2' color='text.secondary'>No reading yet.</Typography>}
        {reading?.error &&
            <Typography variant='body2' color='error' aria-label={`${title} error`}>{reading.error}</Typography>}
        {reading && !reading.error && <>
            <Typography variant='h6' sx={{ fontVariantNumeric: 'tabular-nums' }} aria-label={`${title} ticks`}>
                {(reading.ticks ?? []).join(' → ')}
            </Typography>
            <Typography variant='caption' color='text.secondary' display='block'>id: {reading.dceId}</Typography>
            <Typography variant='caption' color='text.secondary' display='block'>{reading.greeting}</Typography>
            {extra && <Typography variant='caption' color='text.secondary' display='block'>{extra}</Typography>}
        </>}
    </Paper>
)

export const ConsumerTabContent: React.FC<IContentProps> = (props) => {
    const data: IConsumerData = props.channelObject.data
    const [, force] = React.useState(0)
    const repaint = () => force(n => n + 1)

    const readAgain = () => {
        // The front end reads its own instance...
        data.front = readFrontDce()
        repaint()
        // ...and asks the back end for its own. The accessKey travels in the command or the core
        // discards it before it reaches the plugin.
        props.channelObject.webSocket?.send(JSON.stringify({
            msgtype: 'consumermessage',
            channel: 'dce-consumer',
            action: EInstanceMessageAction.COMMAND,
            flow: EInstanceMessageFlow.REQUEST,
            type: EInstanceMessageType.DATA,
            accessKey: props.channelObject.accessString!,
            instance: props.channelObject.instanceId,
            command: EConsumerCommand.READ
        }))
    }

    if (!data.started) {
        return <EmptyState title='DCE consumer not started'
            detail='Start the channel (tab settings ⚙ → Start) to read the sample DCE.' />
    }

    return (
        <Stack spacing={2} sx={{ p: 2 }}>
            <Box>
                <Typography variant='subtitle2'>What the sample DCE says, on each end</Typography>
                <Typography variant='caption' color='text.secondary'>
                    Two consecutive calls to next(). Press Read again and they have to GROW: a fresh object on
                    every reading would always say 1 → 2, which is what a DCE exists to prevent.
                </Typography>
            </Box>
            <Stack direction='row' spacing={2} useFlexGap flexWrap='wrap'>
                <Side title='Back end' detail='one instance in the Kwirth process, shared by every extension there'
                    reading={data.back} extra={data.back?.boots === undefined ? undefined : `factory runs on this Kwirth: ${data.back.boots}`} />
                <Side title='Front end' detail='one instance in this page, shared by every extension in it'
                    reading={data.front} extra={data.front?.createdAt === undefined ? undefined : `created at ${new Date(data.front.createdAt).toLocaleTimeString()}`} />
            </Stack>
            <Box>
                <Button variant='outlined' size='small' onClick={readAgain}>Read again</Button>
            </Box>
            {data.signals.length > 0 &&
                <Box>{data.signals.map((s, i) => <Typography key={i} variant='caption' color='error' display='block'>{s}</Typography>)}</Box>}
        </Stack>
    )
}
