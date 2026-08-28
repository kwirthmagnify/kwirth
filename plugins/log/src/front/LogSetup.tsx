import React, { useState, ChangeEvent, useRef } from 'react'
import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, FormLabel, Radio, RadioGroup, Stack, Switch, Tab, Tabs, TextField, Typography } from '@mui/material'
import { ISetupProps } from '@kwirthmagnify/kwirth-common-front'
import Subject from '@mui/icons-material/Subject'
import { ILogConfig, LogInstanceConfig, LogConfig } from './LogConfig'
import { ELogSortOrder, ILogInstanceConfig } from './LogTypes'

const LogIcon = <Subject />

const LogSetup: React.FC<ISetupProps> = (props: ISetupProps) => {
    let logInstanceConfig: ILogInstanceConfig = props.setupConfig?.channelInstanceConfig || new LogInstanceConfig()
    let logConfig: ILogConfig = props.setupConfig?.channelConfig || new LogConfig()

    const [selectedTab, setSelectedTab] = useState(logConfig.startDiagnostics ? 'sd' : 'log')
    const [maxMessages, setMaxMessages] = useState(logConfig.maxMessages)
    const [showNames, setShowNames] = useState(logConfig.showNames)
    const [maxPerPodMessages, setMaxPerPodMessages] = useState(logConfig.maxPerPodMessages)
    const [follow, setFollow] = useState(logConfig.follow)
    const [sortOrder, setSortOrder] = useState(logConfig.sortOrder)
    const [previous, setPrevious] = useState(logInstanceConfig.previous)
    const [timestamp, setTimestamp] = useState(logInstanceConfig.timestamp)
    const [fromStart, setFromStart] = useState(logInstanceConfig.fromStart)
    const [fromNowOn, setFromNowOn] = useState(logConfig.fromNowOn)
    const startTimeRef = useRef<any>(null)
    const defaultRef = useRef<HTMLInputElement | null>(null)

    const ok = () => {
        logConfig.follow = follow
        logConfig.showNames = showNames
        logConfig.maxMessages = maxMessages
        logConfig.maxPerPodMessages = maxPerPodMessages
        logConfig.sortOrder = sortOrder
        logConfig.fromNowOn = fromNowOn
        logConfig.startDiagnostics = (selectedTab === 'sd')
        logInstanceConfig.previous = previous
        logInstanceConfig.timestamp = timestamp
        logInstanceConfig.fromStart = fromStart || (selectedTab === 'sd')
        logInstanceConfig.startTime = fromNowOn ? Date.now() : new Date(startTimeRef.current?.value).getTime()
        props.onChannelSetupClosed(props.channel, {
            channelId: props.channel.channelId,
            channelConfig: logConfig,
            channelInstanceConfig: logInstanceConfig
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
        <Dialog open={true}>
            <DialogTitle>Configure log stream</DialogTitle>
            <DialogContent sx={{ height: '400px', overflow: 'hidden' }}>
                <Stack spacing={2} sx={{ display: 'flex', flexDirection: 'column', width: '50vh', pt: 1 }}>
                    <Stack direction='row' alignItems='baseline' gap={2}>
                        <TextField value={maxMessages} onChange={(e: ChangeEvent<HTMLInputElement>) => setMaxMessages(+e.target.value)} variant='standard' label='Max messages' type='number' sx={{ width: '50%' }} />
                        <FormControlLabel control={<Checkbox checked={showNames} onChange={(e) => setShowNames(e.target.checked)} />} label='Show names' sx={{ width: '50%' }} />
                    </Stack>
                    <Tabs value={selectedTab} onChange={(_: React.SyntheticEvent, v: string) => setSelectedTab(v)}>
                        <Tab key='log' label='Log Stream' value='log' sx={{ width: '50%' }} />
                        <Tab key='sd' label='Start Diagnostics' value='sd' sx={{ width: '50%' }} />
                    </Tabs>
                    <div hidden={selectedTab !== 'sd'}>
                        <Stack spacing={2}>
                            <TextField value={maxPerPodMessages} onChange={(e: ChangeEvent<HTMLInputElement>) => setMaxPerPodMessages(+e.target.value)} variant='standard' label='Max per Pod messages' type='number' fullWidth />
                            <Stack spacing={1}>
                                <FormLabel>Message sort order:</FormLabel>
                                <RadioGroup defaultValue='none' value={sortOrder} onChange={(e) => setSortOrder(e.target.value as ELogSortOrder)}>
                                    <Stack spacing={-1}>
                                        <Typography><Radio value='none' />Show messages as they arrive</Typography>
                                        <Typography><Radio value='pod' />Keep together messages from the same pod</Typography>
                                        <Typography><Radio value='time' />Use message time for sorting</Typography>
                                    </Stack>
                                </RadioGroup>
                            </Stack>
                        </Stack>
                    </div>
                    <div hidden={selectedTab !== 'log'}>
                        <Stack direction='column'>
                            <Stack direction='row' alignItems='baseline'>
                                <Switch checked={fromNowOn} onChange={(e) => { setFromNowOn(e.target.checked); if (e.target.checked) setFromStart(false) }} />
                                <Typography>Get messages from now on</Typography>
                            </Stack>
                            <Stack direction='row' alignItems='baseline'>
                                <Switch checked={fromStart && !fromNowOn} onChange={(e) => { setFromStart(e.target.checked); if (e.target.checked) setFromNowOn(false) }} disabled={fromNowOn} />
                                <Typography>Get messages from container start time</Typography>
                            </Stack>
                            <TextField
                                type='datetime-local'
                                inputRef={startTimeRef}
                                disabled={fromStart || fromNowOn}
                                label='Start time'
                                variant='standard'
                                defaultValue={new Date(Date.now() - 30 * 60 * 1000).toISOString().slice(0, 16)}
                                sx={{ ml: '60px' }}
                                slotProps={{ inputLabel: { shrink: true } }}
                            />
                        </Stack>
                        <Stack direction='row' alignItems='baseline'>
                            <Switch checked={previous} onChange={(e: ChangeEvent<HTMLInputElement>) => setPrevious(e.target.checked)} />
                            <Typography>Get messages of previous container</Typography>
                        </Stack>
                        <Stack direction='row' alignItems='baseline'>
                            <Switch checked={timestamp} onChange={(e: ChangeEvent<HTMLInputElement>) => setTimestamp(e.target.checked)} />
                            <Typography>Add timestamp to messages</Typography>
                        </Stack>
                        <Stack direction='row' alignItems='baseline'>
                            <Switch checked={follow} onChange={(e: ChangeEvent<HTMLInputElement>) => setFollow(e.target.checked)} />
                            <Typography>Follow new messages</Typography>
                        </Stack>
                    </div>
                </Stack>
            </DialogContent>
            <DialogActions>
                <FormControlLabel control={<Checkbox slotProps={{ input: { ref: defaultRef } }} />} label='Set as default' sx={{ width: '100%', ml: '8px' }} />
                <Button variant='outlined' onClick={ok}>OK</Button>
                <Button variant='outlined' onClick={cancel}>CANCEL</Button>
            </DialogActions>
        </Dialog>
    )
}

export { LogSetup, LogIcon }
