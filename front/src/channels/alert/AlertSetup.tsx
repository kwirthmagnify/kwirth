import React, { useState, ChangeEvent, useEffect, useRef } from 'react'
import { Autocomplete, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, InputLabel, MenuItem, Select, SelectChangeEvent, Stack, TextField, Typography } from '@mui/material'
import { ISetupProps } from '../IChannel'
import { IAlertConfig, AlertInstanceConfig, AlertConfig } from './AlertConfig'
import { Warning } from '@mui/icons-material'
import { TextToolTip } from '../../tools/FrontTools'
import { EAlertSeverity, IAlertInstanceConfig, IAlertMetricRule, TAlertMetricOperator, TAlertTriggerMode } from './AlertTypes'

interface ISenderEntry {
    senderId: string
    configName: string
}

const AlertIcon = <Warning />

const OPERATORS: TAlertMetricOperator[] = ['<', '<=', '>', '>=', '==', '!=']

const AlertSetup: React.FC<ISetupProps> = (props:ISetupProps) => {
    let alertInstanceConfig:IAlertInstanceConfig = props.setupConfig?.channelInstanceConfig || new AlertInstanceConfig()
    let alertConfig:IAlertConfig = props.setupConfig?.channelConfig || new AlertConfig()

    const [info, setInfo] = useState('')
    const [warning, setWarning] = useState('')
    const [error, setError] = useState('')
    const [regexInfo, setRegexInfo] = useState<string[]>(alertInstanceConfig.regexInfo)
    const [regexWarning, setRegexWarning] = useState<string[]>(alertInstanceConfig.regexWarning)
    const [regexError, setRegexError] = useState<string[]>(alertInstanceConfig.regexError)
    const [maxAlerts, setMaxAlerts] = useState<number>(alertConfig.maxAlerts)
    const defaultRef = useRef<HTMLInputElement|null>(null)

    const allMetricsList = props.channelObject?.metricsList
    const [senderEntries, setSenderEntries] = useState<ISenderEntry[]>([])
    const [selectedSender, setSelectedSender] = useState<string>(
        alertInstanceConfig.senderId && alertInstanceConfig.senderConfigName
            ? `${alertInstanceConfig.senderId}::${alertInstanceConfig.senderConfigName}`
            : ''
    )

    const [metricRules, setMetricRules] = useState<IAlertMetricRule[]>(alertInstanceConfig.metricRules ?? [])
    const [newMetric, setNewMetric] = useState<string | null>(null)
    const [newOperator, setNewOperator] = useState<TAlertMetricOperator>('>')
    const [newThreshold, setNewThreshold] = useState<string>('0')
    const [newRuleSeverity, setNewRuleSeverity] = useState<EAlertSeverity>(EAlertSeverity.WARNING)
    const [newRuleMode, setNewRuleMode] = useState<TAlertTriggerMode>('leading-edge')
    const [newRuleCooldown, setNewRuleCooldown] = useState<string>('60')

    const metricOptions = allMetricsList ? Array.from(allMetricsList.keys()).sort() : []

    useEffect(() => {
        const url = props.channelObject.clusterUrl
        const token = props.channelObject.accessString
        if (!url || !token) return
        fetch(`${url}/senders`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then((data: Array<{ id: string; configNames: string[] }>) => {
                const entries: ISenderEntry[] = []
                for (const s of data) {
                    for (const cn of s.configNames ?? []) {
                        entries.push({ senderId: s.id, configName: cn })
                    }
                }
                setSenderEntries(entries)
            })
            .catch(() => {})
    }, [])

    const ok = () => {
        alertConfig.maxAlerts = maxAlerts
        alertInstanceConfig.regexInfo = regexInfo
        alertInstanceConfig.regexWarning = regexWarning
        alertInstanceConfig.regexError = regexError
        alertInstanceConfig.metricRules = metricRules
        if (selectedSender) {
            const [sid, cn] = selectedSender.split('::')
            alertInstanceConfig.senderId = sid
            alertInstanceConfig.senderConfigName = cn
        } else {
            alertInstanceConfig.senderId = ''
            alertInstanceConfig.senderConfigName = ''
        }
        props.onChannelSetupClosed(props.channel,
        {
            channelId: props.channel.channelId,
            channelConfig: alertConfig,
            channelInstanceConfig: alertInstanceConfig
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

    const onChangeRegexInfo = (event:ChangeEvent<HTMLInputElement>) => setInfo(event.target.value)
    const addInfo = () => { if (info !== '') { setRegexInfo([...regexInfo, info]); setInfo('') } }
    const deleteChipInfo = (e:string) => setRegexInfo(regexInfo.filter(ri => ri !== e))

    const onChangeRegexWarning = (event:ChangeEvent<HTMLInputElement>) => setWarning(event.target.value)
    const addWarning = () => { if (warning !== '') { setRegexWarning([...regexWarning, warning]); setWarning('') } }
    const deleteChipWarning = (e:string) => setRegexWarning(regexWarning.filter(ri => ri !== e))

    const onChangeRegexError = (event:ChangeEvent<HTMLInputElement>) => setError(event.target.value)
    const addError = () => { if (error !== '') { setRegexError([...regexError, error]); setError('') } }
    const deleteChipError = (e:string) => setRegexError(regexError.filter(ri => ri !== e))

    const onChangeMaxAlerts = (event:ChangeEvent<HTMLInputElement>) => setMaxAlerts(+event.target.value)

    const addMetricRule = () => {
        if (!newMetric || isNaN(+newThreshold)) return
        setMetricRules([...metricRules, { metric: newMetric, operator: newOperator, value: +newThreshold, severity: newRuleSeverity, mode: newRuleMode, cooldown: +newRuleCooldown }])
        setNewMetric(null)
        setNewThreshold('0')
    }

    const deleteMetricRule = (index: number) => setMetricRules(metricRules.filter((_, i) => i !== index))

    const canOk = regexInfo.length > 0 || regexWarning.length > 0 || regexError.length > 0 || metricRules.length > 0

    const regexHelp = <>
        Please enter here regular expressions (regex) that must<br/>
        match a message in order to be considered an alert of <br/>
        this category. Some examples are:<br/><br/>
        - ^HELLO - Messages that begin with word 'HELLO'<br/>
        - last$ - Messages that end with word 'last'<br/>
        - [ERROR] - Messages that contain the text '[ERROR]'<br/>
        - 5[0-9][0-9] - Messages contain a number between 500 - 599
        </>

    return (<>
        <Dialog open={true} maxWidth={false} sx={{'& .MuiDialog-paper': { width: '65vw', maxWidth: '65vw', height: '75vh', maxHeight: '75vh' }}}>
            <DialogTitle>Create alert</DialogTitle>
            <DialogContent>
                <Stack direction={'column'} spacing={2} sx={{m:1}}>
                    <TextField value={maxAlerts} onChange={onChangeMaxAlerts} variant='standard' label='Max alerts' type='number' sx={{width:'120px'}}/>

                    <Typography variant='subtitle2' sx={{fontWeight:'bold'}}>Log pattern alerts</Typography>
                    <Stack direction={'row'} spacing={1}>
                        <Stack direction={'column'}>
                            <TextToolTip name='Info' help={regexHelp} />
                            <Stack direction={'row'} alignItems={'baseline'}>
                                <TextField value={info} onChange={onChangeRegexInfo} variant='standard'/>
                                <Button onClick={addInfo} size='small'>Add</Button>
                            </Stack>
                            <Stack mt={1}>{
                                regexInfo && regexInfo.map((ri, index) =>
                                    <Box key={index}><Chip label={ri} variant='outlined' onDelete={() => deleteChipInfo(ri)} size='small'/></Box>
                                )
                            }</Stack>
                        </Stack>
                        <Stack direction={'column'}>
                            <TextToolTip name='Warning' help={regexHelp}/>
                            <Stack direction={'row'} alignItems={'baseline'}>
                                <TextField value={warning} onChange={onChangeRegexWarning} variant='standard'/>
                                <Button onClick={addWarning} size='small'>Add</Button>
                            </Stack>
                            <Stack>{
                                regexWarning && regexWarning.map((ri, index) =>
                                    <Box key={index}><Chip label={ri} variant='outlined' size='small' onDelete={() => deleteChipWarning(ri)}/></Box>
                                )
                            }</Stack>
                        </Stack>
                        <Stack direction={'column'}>
                            <TextToolTip name='Error' help={regexHelp}/>
                            <Stack direction={'row'} alignItems={'baseline'}>
                                <TextField value={error} onChange={onChangeRegexError} variant='standard'/>
                                <Button onClick={addError} size='small'>Add</Button>
                            </Stack>
                            <Stack>{
                                regexError && regexError.map((ri, index) =>
                                    <Box key={index}><Chip label={ri} variant='outlined' size='small' onDelete={() => deleteChipError(ri)}/></Box>
                                )
                            }</Stack>
                        </Stack>
                    </Stack>

                    <Typography variant='subtitle2' sx={{fontWeight:'bold'}}>Metric alerts (Kubernetes only)</Typography>
                    <Stack direction={'row'} spacing={1} alignItems={'flex-end'} flexWrap={'wrap'}>
                        <Autocomplete
                            options={metricOptions}
                            value={newMetric}
                            onChange={(_, value) => setNewMetric(value)}
                            renderInput={(params) => <TextField {...params} variant='standard' label='Metric'/>}
                            sx={{width:'320px'}}
                            size='small'
                            noOptionsText='No metrics available'
                        />
                        <FormControl variant='standard' sx={{width:'70px'}}>
                            <InputLabel>Operator</InputLabel>
                            <Select value={newOperator} onChange={(e:SelectChangeEvent) => setNewOperator(e.target.value as TAlertMetricOperator)}>
                                {OPERATORS.map(op => <MenuItem key={op} value={op}>{op}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <TextField value={newThreshold} onChange={e => setNewThreshold(e.target.value)} variant='standard' label='Value' type='number' sx={{width:'80px'}}/>
                        <FormControl variant='standard' sx={{width:'100px'}}>
                            <InputLabel>Severity</InputLabel>
                            <Select value={newRuleSeverity} onChange={(e:SelectChangeEvent) => setNewRuleSeverity(e.target.value as EAlertSeverity)}>
                                <MenuItem value={EAlertSeverity.INFO}>Info</MenuItem>
                                <MenuItem value={EAlertSeverity.WARNING}>Warning</MenuItem>
                                <MenuItem value={EAlertSeverity.ERROR}>Error</MenuItem>
                            </Select>
                        </FormControl>
                        <FormControl variant='standard' sx={{width:'120px'}}>
                            <InputLabel>Mode</InputLabel>
                            <Select value={newRuleMode} onChange={(e:SelectChangeEvent) => setNewRuleMode(e.target.value as TAlertTriggerMode)}>
                                <MenuItem value='leading-edge'>Leading edge</MenuItem>
                                <MenuItem value='cooldown'>Cooldown</MenuItem>
                                <MenuItem value='continuous'>Continuous</MenuItem>
                            </Select>
                        </FormControl>
                        {newRuleMode === 'cooldown' && (
                            <TextField value={newRuleCooldown} onChange={e => setNewRuleCooldown(e.target.value)} variant='standard' label='Cooldown (s)' type='number' sx={{width:'100px'}}/>
                        )}
                        <Button onClick={addMetricRule} disabled={!newMetric} size='small'>Add</Button>
                    </Stack>
                    <Stack direction={'row'} flexWrap={'wrap'} gap={1}>
                        {metricRules.map((rule, index) =>
                            <Chip key={index}
                                label={`${rule.metric} ${rule.operator} ${rule.value} [${rule.severity}] ${rule.mode === 'cooldown' ? `${rule.cooldown}s` : rule.mode === 'continuous' ? 'cont' : 'edge'}`}
                                variant='outlined' size='small'
                                onDelete={() => deleteMetricRule(index)}
                            />
                        )}
                    </Stack>

                    <Typography variant='subtitle2' sx={{fontWeight:'bold'}}>Sender</Typography>
                    <Select value={selectedSender} onChange={(e: SelectChangeEvent) => setSelectedSender(e.target.value)} displayEmpty size='small' variant='standard'>
                        <MenuItem value=''><Typography variant='body2' color='text.secondary'>(none)</Typography></MenuItem>
                        {senderEntries.map(e => (
                            <MenuItem key={`${e.senderId}::${e.configName}`} value={`${e.senderId}::${e.configName}`}>
                                <Stack direction='row' spacing={1} alignItems='center'>
                                    <Chip label={e.senderId} size='small' variant='outlined' sx={{ fontSize: '0.65rem', height: 18 }} />
                                    <Typography variant='body2'>{e.configName}</Typography>
                                </Stack>
                            </MenuItem>
                        ))}
                    </Select>
                </Stack>
            </DialogContent>
            <DialogActions>
                <FormControlLabel control={<Checkbox slotProps={{ input: { ref: defaultRef } }}/>} label='Set as default' sx={{width:'100%', ml:'8px'}}/>
                <Button onClick={ok} disabled={!canOk}>OK</Button>
                <Button onClick={cancel}>CANCEL</Button>
            </DialogActions>
        </Dialog>
    </>)
}

export { AlertSetup, AlertIcon }
