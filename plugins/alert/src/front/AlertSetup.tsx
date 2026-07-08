import React, { useState, ChangeEvent, useEffect, useRef } from 'react'
import { Autocomplete, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, InputLabel, MenuItem, Select, SelectChangeEvent, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { ISetupProps } from '@kwirthmagnify/kwirth-common-front'
import { IAlertConfig, AlertInstanceConfig, AlertConfig } from './AlertConfig'
import { Warning, InfoOutlined } from '@mui/icons-material'
import { EAlertSeverity, IAlertInstanceConfig, IAlertMetricRule, TAlertMetricOperator, TAlertTriggerMode } from './AlertTypes'

// TextToolTip inlined from core FrontTools
const TextToolTip: React.FC<{ name: string; help: React.ReactElement }> = ({ name, help }) => (
    <Box display="flex" alignItems="center" mt={2}>
        <Typography variant="body1">{name}&nbsp;</Typography>
        <Tooltip title={help}><InfoOutlined fontSize="inherit" /></Tooltip>
    </Box>
)

interface ISenderEntry { senderId: string; configName: string }

export const AlertIcon = <Warning />

const OPERATORS: TAlertMetricOperator[] = ['<', '<=', '>', '>=', '==', '!=']

const AlertSetup: React.FC<ISetupProps> = (props: ISetupProps) => {
    let alertInstanceConfig: IAlertInstanceConfig = props.setupConfig?.channelInstanceConfig || new AlertInstanceConfig()
    let alertConfig: IAlertConfig = props.setupConfig?.channelConfig || new AlertConfig()

    const [info, setInfo] = useState('')
    const [warning, setWarning] = useState('')
    const [error, setError] = useState('')
    const [regexInfo, setRegexInfo] = useState<string[]>(alertInstanceConfig.regexInfo)
    const [regexWarning, setRegexWarning] = useState<string[]>(alertInstanceConfig.regexWarning)
    const [regexError, setRegexError] = useState<string[]>(alertInstanceConfig.regexError)
    const [maxAlerts, setMaxAlerts] = useState<number>(alertConfig.maxAlerts)
    const defaultRef = useRef<HTMLInputElement | null>(null)

    const allMetricsList = props.channelObject?.metricsList
    const [senderEntries, setSenderEntries] = useState<ISenderEntry[]>([])
    const [selectedSenderId, setSelectedSenderId] = useState<string>(alertInstanceConfig.senderId ?? '')
    const [selectedConfigName, setSelectedConfigName] = useState<string>(alertInstanceConfig.senderConfigName ?? '')
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
                for (const s of data) for (const cn of s.configNames ?? []) entries.push({ senderId: s.id, configName: cn })
                setSenderEntries(entries)
            }).catch(() => {})
    }, [])

    const ok = () => {
        alertConfig.maxAlerts = maxAlerts
        alertInstanceConfig.regexInfo = regexInfo
        alertInstanceConfig.regexWarning = regexWarning
        alertInstanceConfig.regexError = regexError
        alertInstanceConfig.metricRules = metricRules
        alertInstanceConfig.senderId = selectedSenderId
        alertInstanceConfig.senderConfigName = selectedConfigName
        props.onChannelSetupClosed(props.channel, { channelId: props.channel.channelId, channelConfig: alertConfig, channelInstanceConfig: alertInstanceConfig }, true, defaultRef.current?.checked || false)
    }

    const cancel = () => props.onChannelSetupClosed(props.channel, { channelId: props.channel.channelId, channelConfig: undefined, channelInstanceConfig: undefined }, false, false)

    const canOk = regexInfo.length > 0 || regexWarning.length > 0 || regexError.length > 0 || metricRules.length > 0

    const regexHelp = <>
        Regular expressions that must match a log message to trigger an alert.<br />
        Examples: <b>^ERROR</b> (starts with ERROR), <b>\[WARN\]</b> (contains [WARN])
    </>

    return (
        <Dialog open maxWidth='md' fullWidth>
            <DialogTitle>Create alert</DialogTitle>
            <DialogContent sx={{ overflowX: 'hidden' }}>
                <Stack direction='column' spacing={1} sx={{ m: 1 }}>
                    <Typography variant='subtitle2' sx={{ fontWeight: 'bold', mt: 1, mb: -1 }}>Log pattern alerts</Typography>
                    <Stack direction='row' spacing={1} sx={{ width: '100%' }}>
                        {[
                            { label: 'Info', val: info, set: setInfo, regex: regexInfo, setRegex: setRegexInfo },
                            { label: 'Warning', val: warning, set: setWarning, regex: regexWarning, setRegex: setRegexWarning },
                            { label: 'Error', val: error, set: setError, regex: regexError, setRegex: setRegexError },
                        ].map(({ label, val, set, regex, setRegex }) => (
                            <Stack key={label} direction='column' sx={{ flex: 1, minWidth: 0 }}>
                                <TextToolTip name={label} help={regexHelp} />
                                <Stack direction='row' alignItems='baseline'>
                                    <TextField value={val} onChange={(e: ChangeEvent<HTMLInputElement>) => set(e.target.value)} variant='standard' sx={{ flex: 1, minWidth: 0 }} />
                                    <Button variant='outlined' onClick={() => { if (val) { setRegex([...regex, val]); set('') } }} size='small'>Add</Button>
                                </Stack>
                                <Stack mt={1}>{regex.map((r, i) => <Box key={i}><Chip label={r} variant='outlined' onDelete={() => setRegex(regex.filter(x => x !== r))} size='small' /></Box>)}</Stack>
                            </Stack>
                        ))}
                    </Stack>

                    <Typography variant='subtitle2' sx={{ fontWeight: 'bold', mt: 1, mb: -0.5 }}>Metric alerts (Kubernetes only)</Typography>
                    <Stack direction='row' spacing={1} alignItems='flex-end' flexWrap='wrap' sx={{ width: '100%' }}>
                        <Autocomplete options={metricOptions} value={newMetric} onChange={(_, v) => setNewMetric(v)} renderInput={(p) => <TextField {...p} variant='standard' label='Metric' />} sx={{ flex: 1, minWidth: '200px' }} size='small' noOptionsText='No metrics available' />
                        <FormControl variant='standard' sx={{ width: '70px' }}>
                            <InputLabel>Operator</InputLabel>
                            <Select value={newOperator} onChange={(e: SelectChangeEvent) => setNewOperator(e.target.value as TAlertMetricOperator)}>
                                {OPERATORS.map(op => <MenuItem key={op} value={op}>{op}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <TextField value={newThreshold} onChange={e => setNewThreshold(e.target.value)} variant='standard' label='Value' type='number' sx={{ width: '80px' }} />
                        <FormControl variant='standard' sx={{ width: '100px' }}>
                            <InputLabel>Severity</InputLabel>
                            <Select value={newRuleSeverity} onChange={(e: SelectChangeEvent) => setNewRuleSeverity(e.target.value as EAlertSeverity)}>
                                <MenuItem value={EAlertSeverity.INFO}>Info</MenuItem>
                                <MenuItem value={EAlertSeverity.WARNING}>Warning</MenuItem>
                                <MenuItem value={EAlertSeverity.ERROR}>Error</MenuItem>
                            </Select>
                        </FormControl>
                        <FormControl variant='standard' sx={{ width: '120px' }}>
                            <InputLabel>Mode</InputLabel>
                            <Select value={newRuleMode} onChange={(e: SelectChangeEvent) => setNewRuleMode(e.target.value as TAlertTriggerMode)}>
                                <MenuItem value='leading-edge'>Leading edge</MenuItem>
                                <MenuItem value='cooldown'>Cooldown</MenuItem>
                                <MenuItem value='continuous'>Continuous</MenuItem>
                            </Select>
                        </FormControl>
                        {newRuleMode === 'cooldown' && <TextField value={newRuleCooldown} onChange={e => setNewRuleCooldown(e.target.value)} variant='standard' label='Cooldown (s)' type='number' sx={{ width: '100px' }} />}
                        <Button variant='outlined' onClick={() => { if (!newMetric || isNaN(+newThreshold)) return; setMetricRules([...metricRules, { metric: newMetric, operator: newOperator, value: +newThreshold, severity: newRuleSeverity, mode: newRuleMode, cooldown: +newRuleCooldown }]); setNewMetric(null); setNewThreshold('0') }} disabled={!newMetric} size='small'>Add</Button>
                    </Stack>
                    <Stack direction='row' flexWrap='wrap' gap={1}>
                        {metricRules.map((rule, i) => <Chip key={i} label={`${rule.metric} ${rule.operator} ${rule.value} [${rule.severity}] ${rule.mode === 'cooldown' ? `${rule.cooldown}s` : rule.mode === 'continuous' ? 'cont' : 'edge'}`} variant='outlined' size='small'
                            onClick={() => {
                                setNewMetric(rule.metric)
                                setNewOperator(rule.operator)
                                setNewThreshold(String(rule.value))
                                setNewRuleSeverity(rule.severity)
                                setNewRuleMode(rule.mode)
                                setNewRuleCooldown(String(rule.cooldown ?? 60))
                                setMetricRules(metricRules.filter((_, j) => j !== i))
                            }}
                            onDelete={() => setMetricRules(metricRules.filter((_, j) => j !== i))} />)}
                    </Stack>

                    <Typography variant='subtitle2' sx={{ fontWeight: 'bold', mt: 4, mb: -0.5 }}>General</Typography>
                    <Stack direction='row' spacing={2} alignItems='flex-end' sx={{ width: '100%' }}>
                        <TextField value={maxAlerts} onChange={(e: ChangeEvent<HTMLInputElement>) => setMaxAlerts(+e.target.value)} variant='standard' label='Max alerts' type='number' sx={{ width: '100px', flexShrink: 0 }} />
                        <FormControl variant='standard' sx={{ flex: 1, minWidth: 0 }}>
                            <InputLabel shrink>Sender</InputLabel>
                            <Select value={selectedSenderId} onChange={(e: SelectChangeEvent) => { setSelectedSenderId(e.target.value); setSelectedConfigName('') }} displayEmpty>
                                <MenuItem value=''><Typography variant='body2' color='text.secondary'>(none)</Typography></MenuItem>
                                {Array.from(new Set(senderEntries.map(e => e.senderId))).map(sid => (
                                    <MenuItem key={sid} value={sid}>{sid}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <FormControl variant='standard' sx={{ flex: 1, minWidth: 0 }} disabled={!selectedSenderId}>
                            <InputLabel shrink>Config</InputLabel>
                            <Select value={selectedConfigName} onChange={(e: SelectChangeEvent) => setSelectedConfigName(e.target.value)} displayEmpty>
                                <MenuItem value=''><Typography variant='body2' color='text.secondary'>(none)</Typography></MenuItem>
                                {senderEntries.filter(e => e.senderId === selectedSenderId).map(e => (
                                    <MenuItem key={e.configName} value={e.configName}>{e.configName}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions>
                <FormControlLabel control={<Checkbox slotProps={{ input: { ref: defaultRef } }} />} label='Set as default' sx={{ width: '100%', ml: '8px' }} />
                <Button variant='outlined' onClick={ok} disabled={!canOk}>OK</Button>
                <Button variant='outlined' onClick={cancel}>CANCEL</Button>
            </DialogActions>
        </Dialog>
    )
}

export { AlertSetup }
