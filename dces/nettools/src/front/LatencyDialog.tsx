import React from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography, useTheme } from '@mui/material'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { IDnsSample, ILatencyDialogProps } from '../common/NetToolsFront'
import { ISampleStore } from './samples'
import { NetToolsIcon } from './icons'

/*
    The DNS round trips the shared history has collected, as a chart.

    It is ONE series — the round trip in milliseconds, over time — so there is no legend: the title
    names what is drawn, and the tooltip says which lookup each point was. Colours come from kwirth's
    own theme rather than from a palette of our own, so light and dark are the product's and not a
    guess, and so this dialog looks like the rest of kwirth wherever it is opened from.

    It reads the store through `subscribe`, not through a prop: a consumer resolving a name while the
    dialog is open has to reach the line. A shared object that cannot be listened to is a snapshot.
*/

const timeOf = (at: number): string => new Date(at).toLocaleTimeString()

/** What is drawn: the sample plus its place in the sequence. */
interface IPlotted extends IDnsSample {
    seq: number
}

/*
    The x axis is the SEQUENCE of lookups, not the clock.

    It was a time axis first, and it read badly in both directions: seven lookups inside two seconds all
    got the same `9:23:55` tick — four identical labels — while a lookup made ten minutes later would
    have squashed everything before it against the left edge. These are hand-made measurements at
    irregular moments, not a signal sampled at a rate, so numbering them is the honest encoding. The
    exact time is in the tooltip, where nothing is lost.
*/
const plot = (samples: IDnsSample[]): IPlotted[] => samples.map((sample, index) => ({ ...sample, seq: index + 1 }))

/** min / avg / max over what is drawn. The headline numbers a latency chart is actually read for. */
const summarize = (samples: IDnsSample[]): { min: number, avg: number, max: number } | undefined => {
    if (samples.length === 0) return undefined
    const times = samples.map(sample => sample.timeMs)
    const round1 = (value: number): number => Math.round(value * 10) / 10
    return {
        min: round1(Math.min(...times)),
        avg: round1(times.reduce((total, time) => total + time, 0) / times.length),
        max: round1(Math.max(...times))
    }
}

interface ITooltipProps {
    active?: boolean
    payload?: { payload: IPlotted }[]
}

/*
    The tooltip carries the identity of the point.

    With one series there is nothing to tell apart by colour, and there is no number printed on every
    point either — that is what makes the line readable. What a reader needs on hover is WHICH lookup
    took that long, which is the name and the record type, not just the figure.
*/
const SampleTooltip: React.FC<ITooltipProps> = ({ active, payload }) => {
    const theme = useTheme()
    if (!active || !payload || payload.length === 0) return null
    const sample = payload[0].payload
    return (
        <Box sx={{ bgcolor: 'background.paper', border: `1px solid ${theme.palette.divider}`, borderRadius: 1, px: 1.5, py: 1 }}>
            <Typography variant='body2'>#{sample.seq} · {sample.name}</Typography>
            <Typography variant='caption' color='text.secondary' display='block'>
                {sample.type} · {sample.records} record(s) · {timeOf(sample.at)}
            </Typography>
            <Typography variant='body2' sx={{ mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>{sample.timeMs} ms</Typography>
        </Box>
    )
}

interface IHeadlineProps {
    label: string
    value: string
}

const Headline: React.FC<IHeadlineProps> = ({ label, value }) => (
    <Box>
        <Typography variant='caption' color='text.secondary' display='block'>{label}</Typography>
        <Typography variant='h6' sx={{ fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    </Box>
)

/** Built by the factory, which closes over the one store the page shares. */
export const createLatencyDialog = (store: ISampleStore): React.FC<ILatencyDialogProps> => {
    const LatencyDialog: React.FC<ILatencyDialogProps> = ({ open, onClose }) => {
        const theme = useTheme()
        const [samples, setSamples] = React.useState<IDnsSample[]>(() => store.samples())

        // Subscribed while it is mounted, and unsubscribed on the way out: a dialog that is opened and
        // closed twenty times must not leave twenty listeners writing into a component that is gone.
        React.useEffect(() => {
            setSamples(store.samples())
            return store.subscribe(() => setSamples(store.samples()))
        }, [])

        const stats = summarize(samples)

        return (
            <Dialog open={open} onClose={onClose} fullWidth maxWidth='md'>
                <DialogTitle>
                    <Stack direction='row' alignItems='center' spacing={1}>
                        <NetToolsIcon fontSize='small' />
                        <span>DNS round trips</span>
                    </Stack>
                </DialogTitle>

                {/*
                    No fixed height and nothing to scroll: the content is always the same height — the
                    caption, the four headlines, and 300px of either chart or empty state — so the dialog
                    sizes itself once and stays put. A fixed height here was 16px short of the content and
                    the whole thing grew a scrollbar over a chart that fitted perfectly well.
                */}
                <DialogContent sx={{ overflow: 'hidden' }}>
                    <Typography variant='caption' color='text.secondary'>
                        Every lookup any consumer of the nettools DCE has made on this page, measured by the kwirth
                        process. The history is shared: what another tab resolves shows up here too.
                    </Typography>

                    {/* Always drawn, empty or not: appearing and disappearing would resize the dialog. */}
                    <Stack direction='row' spacing={4} sx={{ mt: 1.5, mb: 1 }}>
                        <Headline label='lookups' value={String(samples.length)} />
                        <Headline label='min' value={stats ? `${stats.min} ms` : '—'} />
                        <Headline label='avg' value={stats ? `${stats.avg} ms` : '—'} />
                        <Headline label='max' value={stats ? `${stats.max} ms` : '—'} />
                    </Stack>

                    {samples.length === 0 &&
                        <Stack alignItems='center' justifyContent='center' spacing={1} sx={{ height: 300, textAlign: 'center' }}>
                            <Typography variant='h6' color='text.secondary'>No lookups yet</Typography>
                            <Typography variant='body2' color='text.secondary'>
                                Resolve a name — here or in any other extension that uses this DCE — and it appears on the chart.
                            </Typography>
                        </Stack>}

                    {samples.length > 0 &&
                        <Box sx={{ height: 300 }}>
                            <ResponsiveContainer width='100%' height='100%'>
                                <LineChart data={plot(samples)} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                                    {/* Recessive: the grid orients, it does not compete with the line. */}
                                    <CartesianGrid stroke={theme.palette.divider} strokeDasharray='3 3' vertical={false} />
                                    <XAxis dataKey='seq' tickFormatter={(seq: number) => `#${seq}`} stroke={theme.palette.text.secondary}
                                        tick={{ fontSize: 12 }} tickLine={false} minTickGap={24} />
                                    <YAxis unit=' ms' stroke={theme.palette.text.secondary}
                                        tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={70} />
                                    <Tooltip content={<SampleTooltip />} cursor={{ stroke: theme.palette.text.secondary, strokeWidth: 1 }} />
                                    {/*
                                        `linear` and not `monotone`: a curve through these points would draw latencies
                                        between two lookups that were never measured. They are discrete measurements.

                                        One series, so no legend and no number on every point: the title says what is
                                        drawn and the tooltip says which lookup each point was. Dots only while they
                                        can be aimed at — past thirty samples they turn the line into a caterpillar.
                                    */}
                                    <Line type='linear' dataKey='timeMs' name='round trip'
                                        stroke={theme.palette.primary.main} strokeWidth={2}
                                        dot={samples.length <= 30 ? { r: 4 } : false} activeDot={{ r: 6 }}
                                        isAnimationActive={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </Box>}
                </DialogContent>

                <DialogActions>
                    <Button variant='outlined' onClick={() => store.clear()} disabled={samples.length === 0}>CLEAR</Button>
                    <Button variant='outlined' onClick={onClose}>CLOSE</Button>
                </DialogActions>
            </Dialog>
        )
    }
    return LatencyDialog
}
