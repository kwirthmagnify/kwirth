import React, { useState, ChangeEvent, useRef } from 'react'
import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, FormLabel, Radio, RadioGroup, Stack, Switch, Tab, Tabs, TextField, Typography } from '@mui/material'
import { ISetupProps } from '../IChannel'
import { Subject } from '@mui/icons-material'
import { ILogInstanceConfig, ILogConfig, ELogSortOrderEnum, LogInstanceConfig, LogConfig } from './LogConfig'
import { DateTimePicker, LocalizationProvider, renderTimeViewClock } from '@mui/x-date-pickers'
import { AdapterMoment } from '@mui/x-date-pickers/AdapterMoment'
import moment from 'moment'

const LogIcon = <Subject />

const LogSetup: React.FC<ISetupProps> = (props:ISetupProps) => {
    let logInstanceConfig:ILogInstanceConfig = props.setupConfig?.channelInstanceConfig || new LogInstanceConfig()
    let logConfig:ILogConfig = props.setupConfig?.channelConfig || new LogConfig()

    const [selectedTab, setSelectedTab] = useState(logConfig.startDiagnostics? 'sd':'log')
    const [maxMessages, setMaxMessages] = useState(logConfig.maxMessages)
    const [maxPerPodMessages, setMaxPerPodMessages] = useState(logConfig.maxPerPodMessages)
    const [follow, setFollow] = useState(logConfig.follow)
    const [sortOrder, setSortOrder] = useState(logConfig.sortOrder)
    const [previous, setPrevious] = useState(logInstanceConfig.previous)
    const [timestamp, setTimestamp] = useState(logInstanceConfig.timestamp)
    const [fromStart, setFromStart] = useState(logInstanceConfig.fromStart)
    const startTimeRef = useRef<any>(null)
    const defaultRef = useRef<HTMLInputElement|null>(null)

    const ok = () => {
        logConfig.follow = follow
        logConfig.maxMessages = maxMessages
        logConfig.maxPerPodMessages = maxPerPodMessages
        logConfig.sortOrder = sortOrder
        logConfig.startDiagnostics = (selectedTab === 'sd')
        logInstanceConfig.previous  = previous
        logInstanceConfig.timestamp = timestamp
        logInstanceConfig.fromStart = fromStart
        logInstanceConfig.startTime = new Date(startTimeRef.current?.value).getTime()
        props.onChannelSetupClosed(props.channel,
        {
            channelId: props.channel.channelId,
            channelConfig: logConfig,
            channelInstanceConfig: logInstanceConfig
        }, true, defaultRef.current?.checked || false)
    }

    const cancel = () => {
        props.onChannelSetupClosed(props.channel, 
        {
            channelId: props.channel.channelId,
            channelConfig: undefined,
            channelInstanceConfig:undefined
        }, false, false)
    }

    const onChangeMaxMessages = (event:ChangeEvent<HTMLInputElement>) => {
        setMaxMessages(+event.target.value)
    }

    const onChangeMaxPerPodMessages = (event:ChangeEvent<HTMLInputElement>) => {
        setMaxPerPodMessages(+event.target.value)
    }

    const onChangePrevious = (event:ChangeEvent<HTMLInputElement>) => {
        setPrevious(event.target.checked)
    }

    const onChangeFromStart = (event:ChangeEvent<HTMLInputElement>) => {
        setFromStart(event.target.checked)
    }

    const onChangeTimestamp = (event:ChangeEvent<HTMLInputElement>) => {
        setTimestamp(event.target.checked)
    }

    const onChangeFollow = (event:ChangeEvent<HTMLInputElement>) => {
        setFollow(event.target.checked)
    }

    const TextFieldForwardRef = React.forwardRef(function MyCustomTextField(props, ref) {
        return <TextField {...props} variant='standard' sx={{ml:'60px', '& .MuiInputBase-root': {border: 'none'}, '& .MuiInputLabel-root': { color: fromStart?'light-gray':'black' } }}/>
    })

    return (
        <Dialog open={true}>
            <DialogTitle>Configure log stream</DialogTitle>
            <DialogContent sx={{height:'350px'}}>
                <Stack  spacing={2} sx={{ display: 'flex', flexDirection: 'column', width: '50vh' }}>
                        <TextField value={maxMessages} onChange={onChangeMaxMessages} variant='standard'label='Max messages' SelectProps={{native: true}} type='number' fullWidth />

                    <Tabs value={selectedTab} onChange={(_: React.SyntheticEvent, newValue: string) => { setSelectedTab(newValue)}}>
                        <Tab key='log' label='Logging' value='log' sx={{width:'50%'}}/>
                        <Tab key='sd' label='Start Diagnostics' value='sd' sx={{width:'50%'}}/>
                    </Tabs>
                    <div hidden={selectedTab!=='sd'}>
                        <Stack spacing={2}>
                            <TextField value={maxPerPodMessages} onChange={onChangeMaxPerPodMessages} variant='standard'label='Max per Pod messages' SelectProps={{native: true}} type='number' fullWidth />
                            <Stack spacing={1}>
                                <FormLabel >Message sort order:</FormLabel>
                                <RadioGroup defaultValue={'none'} value={sortOrder} onChange={(event) => setSortOrder(event.target.value as ELogSortOrderEnum)}>
                                    <Stack spacing={-1}>
                                        <Typography><Radio value='none'/>Show messages as they arrive</Typography>
                                        <Typography><Radio value='pod' />Keep together messages from the same pod</Typography>
                                        <Typography><Radio value='time'/>Use message time for sorting</Typography>
                                    </Stack>
                                </RadioGroup>
                            </Stack>
                        </Stack>
                    </div>
                    <div hidden={selectedTab!=='log'}>
                        <Stack direction='column'>
                            <Stack direction='row' alignItems={'baseline'}>
                                <Switch checked={fromStart} onChange={onChangeFromStart}/>
                                <Typography>Get messages from container start time</Typography>
                            </Stack>
                                <LocalizationProvider dateAdapter={AdapterMoment}>
                                    <DateTimePicker
                                        enableAccessibleFieldDOMStructure={false}
                                        defaultValue={moment(Date.now()-30*60*1000)}
                                        viewRenderers={{ hours: renderTimeViewClock, minutes: renderTimeViewClock, seconds: renderTimeViewClock }}
                                        slots={{ textField: TextFieldForwardRef }}
                                        inputRef={startTimeRef}
                                        disabled={fromStart}
                                        label="Start time"
                                    />
                                </LocalizationProvider>
                        </Stack>

                        <Stack direction='row' alignItems={'baseline'}>
                            <Switch checked={previous} onChange={onChangePrevious}/>
                            <Typography>Get messages of previous container</Typography>
                        </Stack>
                        <Stack direction='row' alignItems={'baseline'}>
                            <Switch checked={timestamp} onChange={onChangeTimestamp}/>
                            <Typography>Add timestamp to messages</Typography>
                        </Stack>
                        <Stack direction='row' alignItems={'baseline'}>
                            <Switch checked={follow} onChange={onChangeFollow}/>
                            <Typography>Follow new messages</Typography>
                        </Stack>
                    </div>
                </Stack>
            </DialogContent>
            <DialogActions>
                <FormControlLabel control={<Checkbox slotProps={{ input: { ref: defaultRef } }}/>} label='Set as default' sx={{width:'100%', ml:'8px'}}/>
                <Button onClick={ok}>OK</Button>
                <Button onClick={cancel}>CANCEL</Button>
            </DialogActions>
        </Dialog>
    )
}

export { LogSetup, LogIcon }