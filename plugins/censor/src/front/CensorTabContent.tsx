import React, { useEffect, useRef, useState } from 'react'
import { Box, Button, Card, CardContent, CardHeader, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, IconButton, InputLabel, List, ListItem, ListItemButton, ListItemText, Menu, MenuItem, Select, Stack, Switch, Tab, Tabs, TextField, Tooltip, Typography } from '@mui/material'
import { Add as AddIcon, ArrowDownward, ArrowUpward, Delete as DeleteIcon, DeleteOutline as DeleteOutlineIcon, DeleteSweep, MoreVert as MoreVertIcon, SwapVert } from '@mui/icons-material'
import { cleanANSI, IContentProps, MiniGauge } from '@kwirthmagnify/kwirth-common-front'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType } from '@kwirthmagnify/kwirth-common'
import { AiConfigLlm, AiConfigProvider } from '@kwirthmagnify/kwirth-common-ai/front'
import { ILlm, ILlmProvider } from '@kwirthmagnify/kwirth-common-ai'
import { ICensorData } from './CensorData'
import { ECensorCommand, ICensorInstanceConfig } from './CensorConfig'
import { ICensorUiState } from './CensorData'

const _defaultUi = (): ICensorUiState => ({
    tab: 0, regexSort: 'none',
    autoScrolls: { regex: true, received: true, business: true, llmInput: true, llmOutput: true, warning: true, llmError: true }
})
import { CensorImportExport } from './CensorImportExport'
import { CensorSessionStart } from './CensorSessionStart'
import { MsgBoxButtons, MsgBoxYesNo } from './utils'

const formatPerfValue = (v: number) => v >= 10000 ? `${(v / 1000).toFixed(0)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)

const REFRESH_INTERVAL_MS = 250

const CensorTabContent: React.FC<IContentProps> = (props: IContentProps) => {
    const data: ICensorData = props.channelObject.data
    const contentRef = useRef<HTMLDivElement>(null)
    const [contentTop, setContentTop] = useState(0)
    const [, forceUpdate] = useState(0)
    useEffect(() => {
        const id = setInterval(() => forceUpdate(v => v + 1), REFRESH_INTERVAL_MS)
        return () => clearInterval(id)
    }, [])
    const prevContentTopRef = useRef(0)
    const peakProcessedRef = useRef(10)
    const peakTkInRef = useRef(100)
    const peakTkOutRef = useRef(100)
    const peakLlmLinesRef = useRef(10)

    // Restore UI state from channelObject.data so it survives tab switches
    const _ui = data.uiState
    const [tab, setTabState] = useState(_ui?.tab ?? 0)
    const setTab = (v: number) => { setTabState(v); data.uiState = { ...(data.uiState ?? _defaultUi()), tab: v } }
    const perfSamplesRef = useRef<{ ts: number, count: number, tokensIn: number, tokensOut: number, llmLines: number }[]>([])
    const [msgsPerSec, setMsgsPerSec] = useState(0)
    const [msgsPerMin, setMsgsPerMin] = useState(0)
    const [tokensInPerSec, setTokensInPerSec] = useState(0)
    const [tokensInPerMin, setTokensInPerMin] = useState(0)
    const [tokensOutPerSec, setTokensOutPerSec] = useState(0)
    const [tokensOutPerMin, setTokensOutPerMin] = useState(0)
    const [llmLinesPerSec, setLlmLinesPerSec] = useState(0)
    const [llmLinesPerMin, setLlmLinesPerMin] = useState(0)
    useEffect(() => {
        const now = Date.now()
        const samples = perfSamplesRef.current
        samples.push({ ts: now, count: data.processedCount, tokensIn: data.tokensIn, tokensOut: data.tokensOut, llmLines: data.llmLinesCount })
        if (samples.length > 120) samples.splice(0, samples.length - 120)
        const calcRate = (windowMs: number, scaleToMin: boolean, field: 'count' | 'tokensIn' | 'tokensOut' | 'llmLines') => {
            const w = samples.filter(s => now - s.ts < windowMs)
            if (w.length < 2) return 0
            const dt = (w[w.length - 1].ts - w[0].ts) / 1000
            if (dt === 0) return 0
            const rate = (w[w.length - 1][field] - w[0][field]) / dt
            return Math.round(scaleToMin ? rate * 60 : rate)
        }
        setMsgsPerSec(calcRate(10000, false, 'count'))
        setMsgsPerMin(calcRate(60000, true, 'count'))
        setTokensInPerSec(calcRate(10000, false, 'tokensIn'))
        setTokensInPerMin(calcRate(60000, true, 'tokensIn'))
        setTokensOutPerSec(calcRate(10000, false, 'tokensOut'))
        setTokensOutPerMin(calcRate(60000, true, 'tokensOut'))
        setLlmLinesPerSec(calcRate(10000, false, 'llmLines'))
        setLlmLinesPerMin(calcRate(60000, true, 'llmLines'))
    }, [data.processedCount, data.tokensIn, data.tokensOut, data.llmLinesCount])
    const [showConfig, setShowConfig] = useState(false)
    const [showSessionStart, setShowSessionStart] = useState(false)
    const [configName, setConfigName] = useState('')
    const [configVersion, setConfigVersion] = useState('1')
    const [llmId, setLlmId] = useState('')
    const [system, setSystem] = useState('')
    const [batchSize, setBatchSize] = useState(50)
    const [temperature, setTemperature] = useState(0.2)
    const [exampleJson, setExampleJson] = useState('{"patterns":["example regex"]}')
    const [exampleJsonError, setExampleJsonError] = useState('')
    const [space, setSpace] = useState('')
    const [type, setType] = useState('')
    const [addTimestamp, setAddTimestamp] = useState(false)
    const [businessPath, setBusinessPath] = useState('')
    const [senderId, setSenderId] = useState('')
    const [senderConfigName, setSenderConfigName] = useState('')
    const [senderEntries, setSenderEntries] = useState<Array<{ senderId: string; configName: string }>>([])
    const [showConfigLlm, setShowConfigLlm] = useState(false)
    const [showConfigProvider, setShowConfigProvider] = useState(false)
    const [showImportExport, setShowImportExport] = useState(false)
    const [msgBox, setMsgBox] = useState(<></>)
    const [activeTagFilters, setActiveTagFilters] = useState<string[]>([])
    const [tagFilterAnd, setTagFilterAnd] = useState(false)
    const [businessAutoScroll, setBusinessAutoScrollState] = useState(_ui?.autoScrolls?.business ?? true)
    const [regexAutoScroll, setRegexAutoScrollState] = useState(_ui?.autoScrolls?.regex ?? true)
    const [regexSort, setRegexSortState] = useState<'asc' | 'desc' | 'none'>(_ui?.regexSort ?? 'none')
    const [receivedAutoScroll, setReceivedAutoScrollState] = useState(_ui?.autoScrolls?.received ?? true)
    const [llmInputAutoScroll, setLlmInputAutoScrollState] = useState(_ui?.autoScrolls?.llmInput ?? true)
    const [llmOutputAutoScroll, setLlmOutputAutoScrollState] = useState(_ui?.autoScrolls?.llmOutput ?? true)
    const [warningAutoScroll, setWarningAutoScrollState] = useState(_ui?.autoScrolls?.warning ?? true)
    const [llmErrorAutoScroll, setLlmErrorAutoScrollState] = useState(_ui?.autoScrolls?.llmError ?? true)

    const _saveAs = (key: keyof ICensorUiState['autoScrolls'], val: boolean) => {
        const cur = data.uiState ?? _defaultUi()
        data.uiState = { ...cur, autoScrolls: { ...cur.autoScrolls, [key]: val } }
    }
    const setBusinessAutoScroll  = (v: boolean) => { setBusinessAutoScrollState(v);  _saveAs('business', v) }
    const setRegexAutoScroll     = (v: boolean) => { setRegexAutoScrollState(v);     _saveAs('regex', v) }
    const setReceivedAutoScroll  = (v: boolean) => { setReceivedAutoScrollState(v);  _saveAs('received', v) }
    const setLlmInputAutoScroll  = (v: boolean) => { setLlmInputAutoScrollState(v);  _saveAs('llmInput', v) }
    const setLlmOutputAutoScroll = (v: boolean) => { setLlmOutputAutoScrollState(v); _saveAs('llmOutput', v) }
    const setWarningAutoScroll   = (v: boolean) => { setWarningAutoScrollState(v);   _saveAs('warning', v) }
    const setLlmErrorAutoScroll  = (v: boolean) => { setLlmErrorAutoScrollState(v);  _saveAs('llmError', v) }
    const setRegexSort = (fn: (s: 'asc'|'desc'|'none') => 'asc'|'desc'|'none') => {
        setRegexSortState(prev => { const v = fn(prev); data.uiState = { ...(data.uiState ?? _defaultUi()), regexSort: v }; return v })
    }
    const [selectedConfigIndex, setSelectedConfigIndex] = useState<number | null>(null)
    const [configActive, setConfigActive] = useState(false)
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)

    useEffect(() => {
        if (contentRef.current) {
            const top = contentRef.current.getBoundingClientRect().top
            if (top !== prevContentTopRef.current) { prevContentTopRef.current = top; setContentTop(top) }
        }
    })

    useEffect(() => {
        if (!contentRef.current) return
        const shouldScroll =
            (tab === 1 && regexAutoScroll) ||
            (tab === 2 && receivedAutoScroll) ||
            (tab === 3 && businessAutoScroll) ||
            (tab === 5 && llmInputAutoScroll) ||
            (tab === 6 && llmOutputAutoScroll) ||
            (tab === 7 && warningAutoScroll) ||
            (tab === 8 && llmErrorAutoScroll)
        if (!shouldScroll) return
        contentRef.current.scrollTop = contentRef.current.scrollHeight
    }, [data.regexes.length, data.receivedLines.length, data.llmInputLines.length, data.llmOutputLines.length, data.llmWarningLines.length, data.llmErrorLines.length, data.businessLines.length, tab, regexAutoScroll, receivedAutoScroll, llmInputAutoScroll, llmOutputAutoScroll, warningAutoScroll, llmErrorAutoScroll, businessAutoScroll])

    useEffect(() => {
        if (showConfig) return
        setConfigName(data.instanceConfig.name ?? '')
        setConfigVersion(data.instanceConfig.version ?? '1')
        setLlmId(data.instanceConfig.llmId ?? '')
        setSystem(data.instanceConfig.system ?? '')
        setBatchSize(data.instanceConfig.batchSize ?? 50)
        setTemperature(data.instanceConfig.temperature ?? 0.2)
        setExampleJson(data.instanceConfig.exampleJson ?? '{"patterns":["example regex"]}')
        setExampleJsonError('')
        setSpace(data.instanceConfig.space ?? '')
        setType(data.instanceConfig.type ?? '')
        setAddTimestamp(data.instanceConfig.addTimestamp ?? false)
        setBusinessPath(data.instanceConfig.businessPath ?? '')
        setSenderId(data.instanceConfig.senderId ?? '')
        setSenderConfigName(data.instanceConfig.senderConfigName ?? '')
    }, [data.instanceConfig])

    useEffect(() => {
        if (!showConfig) return
        const url = props.channelObject.clusterUrl
        const token = props.channelObject.accessString
        if (!url || !token) return
        fetch(`${url}/senders`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then((data: Array<{ id: string; configNames: string[] }>) => {
                const entries: Array<{ senderId: string; configName: string }> = []
                for (const s of data) {
                    for (const cn of s.configNames ?? []) entries.push({ senderId: s.id, configName: cn })
                }
                setSenderEntries(entries)
            })
            .catch(() => {})
    }, [showConfig])

    useEffect(() => {
        if (!showConfig || selectedConfigIndex !== null) return
        const activeIdx = data.configs.findIndex(c => c.active)
        if (activeIdx >= 0) {
            setSelectedConfigIndex(activeIdx)
            loadConfig(data.configs[activeIdx])
        }
    }, [data.configs.length, showConfig])

    const sendCommand = (command: ECensorCommand, payload?: unknown) => {
        if (!props.channelObject.instanceId) return
        props.channelObject.webSocket?.send(JSON.stringify({
            msgtype: 'censormessage',
            channel: 'censor',
            action: EInstanceMessageAction.COMMAND,
            flow: EInstanceMessageFlow.REQUEST,
            type: EInstanceMessageType.DATA,
            accessKey: props.channelObject.accessString!,
            instance: props.channelObject.instanceId,
            command,
            ...(payload !== undefined ? { data: payload } : {})
        }))
    }

    const openConfig = () => {
        sendCommand(ECensorCommand.CONFIGGET)
        setSelectedConfigIndex(null)
        setShowConfig(true)
    }

    const currentConfig = (): ICensorInstanceConfig => ({ name: configName, version: configVersion, llmId, system, batchSize, temperature, exampleJson, space, type, addTimestamp, businessPath, senderId, senderConfigName })

    const saveConfig = () => {
        const cfg = currentConfig()
        data.instanceConfig = cfg
        sendCommand(ECensorCommand.CONFIGSET, cfg)
        setShowConfig(false)
    }

    const loadConfig = (cfg: ICensorInstanceConfig) => {
        setConfigName(cfg.name)
        setConfigVersion(cfg.version)
        setLlmId(cfg.llmId ?? '')
        setSystem(cfg.system ?? '')
        setBatchSize(cfg.batchSize ?? 50)
        setTemperature(cfg.temperature ?? 0.2)
        setExampleJson(cfg.exampleJson ?? '{"patterns":["example regex"]}')
        setExampleJsonError('')
        setSpace(cfg.space ?? '')
        setType(cfg.type ?? '')
        setAddTimestamp(cfg.addTimestamp ?? false)
        setBusinessPath(cfg.businessPath ?? '')
        setSenderId(cfg.senderId ?? '')
        setSenderConfigName(cfg.senderConfigName ?? '')
        setConfigActive(cfg.active ?? false)
    }

    const onConfigSelect = (cfg: ICensorInstanceConfig, i: number) => {
        setSelectedConfigIndex(i)
        loadConfig(cfg)
    }

    const onConfigNew = () => {
        setSelectedConfigIndex(null)
        setConfigName('')
        setConfigVersion('1')
        setLlmId('')
        setSystem('')
        setBatchSize(50)
        setTemperature(0.2)
        setExampleJson('{"patterns":["example regex"]}')
        setExampleJsonError('')
        setSpace('')
        setType('')
        setAddTimestamp(false)
        setBusinessPath('')
        setSenderId('')
        setSenderConfigName('')
        setConfigActive(false)
    }

    const onConfigSave = () => {
        const cfg = currentConfig()
        sendCommand(ECensorCommand.CONFIGSAVE, { ...cfg, active: configActive })
    }

    const onConfigDelete = () => {
        if (selectedConfigIndex === null) return
        const cfg = data.configs[selectedConfigIndex]
        setMsgBox(MsgBoxYesNo('Delete config', `Delete "${cfg.name} v${cfg.version}"?`, setMsgBox, (a: MsgBoxButtons) => {
            if (a !== MsgBoxButtons.Yes) return
            sendCommand(ECensorCommand.CONFIGDELETE, { name: cfg.name, version: cfg.version })
            setSelectedConfigIndex(null)
        }))
    }

    const onConfigToggleActive = (i: number) => {
        const cfg = data.configs[i]
        const newActive = !(cfg.active ?? false)
        if (selectedConfigIndex === i) setConfigActive(newActive)
        sendCommand(ECensorCommand.CONFIGSAVE, { ...cfg, active: newActive })
    }

    const aiConfigLlmClose = (llms: ILlm[] | undefined) => {
        setShowConfigLlm(false)
        if (llms) sendCommand(ECensorCommand.CONFIGSET, { llmId, system, batchSize, exampleJson, _llms: llms })
    }

    const aiConfigProviderClose = (providers: ILlmProvider[] | undefined) => {
        setShowConfigProvider(false)
        if (providers) sendCommand(ECensorCommand.PROVIDERSSET, providers)
    }

    const importExportClose = (imported?: ICensorInstanceConfig[]) => {
        setShowImportExport(false)
        if (imported) {
            for (const cfg of imported) sendCommand(ECensorCommand.CONFIGSAVE, cfg)
        }
    }


    const onSessionStart = (description: string) => {
        setShowSessionStart(false)
        sendCommand(ECensorCommand.SESSIONSTART, { description })
    }

    const deleteSession = () => {
        setMenuAnchor(null)
        if (!data.connectedSessionId) return
        const url = props.channelObject.clusterUrl
        const token = props.channelObject.accessString
        if (!url || !token) return
        fetch(`${url}/daemons/instances/${data.connectedSessionId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        })
        sendCommand(ECensorCommand.SESSIONDISCONNECT)
    }

    const panelHeight = `calc(100vh - ${contentTop}px - 16px)`

    return <>
        {data.started &&
        <Card sx={{ display: 'flex', flexDirection: 'column', flex: 1, width: '98%', alignSelf: 'center', mt: 1, minHeight: 0 }}>
            <CardHeader title={
                <Stack direction='row' alignItems='center' spacing={1}>
                    <Typography><b>Processed:</b> {data.processedCount}</Typography>
                    <Typography><b>Pending:</b> {data.pendingCount}</Typography>
                    <Typography flex={1} />
                    {data.connectedSessionId &&
                        <Chip label={data.connectedSessionDescription ?? 'Session'} size='small' color='success' sx={{ maxWidth: 160 }} />
                    }
                    { data.instanceConfig.name && (
                        <Stack direction='column' alignItems='flex-end' spacing={0}>
                            <Typography variant='caption' color='text.secondary'>
                                {data.instanceConfig.name} (v{data.instanceConfig.version})
                            </Typography>
                            { (() => {
                                const llm = data.llms.find(l => l.id === data.instanceConfig.llmId)
                                return llm ? (
                                    <Typography variant='caption' color='text.disabled' sx={{ fontSize: '10px' }}>
                                        {llm.provider} / {llm.model}
                                    </Typography>
                                ) : null
                            })() }
                        </Stack>
                    )}
                    <Stack direction='column' alignItems='center' spacing={0} sx={{ width: 64 }}>
                        <Switch
                            size='small'
                            checked={(data.instanceConfig?.mode ?? 'inference') === 'audit'}
                            disabled={data.analyzing}
                            onChange={(e) => {
                                const newMode = e.target.checked ? 'audit' : 'inference'
                                data.instanceConfig.mode = newMode
                                sendCommand(ECensorCommand.CONFIGSET, { ...data.instanceConfig, mode: newMode })
                            }}
                        />
                        <Typography variant='caption' sx={{ fontSize: '0.6rem', lineHeight: 1 }}>
                            {data.instanceConfig?.mode ?? 'inference'}
                        </Typography>
                    </Stack>
                    <Button onClick={() => sendCommand(data.analyzing ? ECensorCommand.ANALYZESTOP : ECensorCommand.ANALYZESTART)}
                        color={data.analyzing ? 'error' : 'success'} variant='outlined' size='small'
                        disabled={!data.analyzing && !data.instanceConfig?.llmId}>
                        {data.analyzing ? 'Stop' : 'Start'}
                    </Button>
                    <IconButton size='small' onClick={(e) => setMenuAnchor(e.currentTarget)}>
                        <MoreVertIcon fontSize='small' />
                    </IconButton>
                    <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
                        <MenuItem onClick={() => { setMenuAnchor(null); openConfig() }}>Config</MenuItem>
                        <MenuItem onClick={() => { setMenuAnchor(null); setShowSessionStart(true) }} disabled={!!data.connectedSessionId || !data.analyzing}>Launch</MenuItem>
                        <MenuItem onClick={deleteSession} disabled={!data.connectedSessionId}>Delete session</MenuItem>
                    </Menu>
                </Stack>
            } />
            <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, p: 0, '&:last-child': { pb: 0 } }}>
                <Tabs value={tab} onChange={(_, v) => setTab(v)} variant='fullWidth'
                    sx={{ borderBottom: 1, borderColor: 'divider', px: 1, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}>
                    <Tab label={`Objects (${data.assets.length})`} />
                    <Tab label={`Regex (${data.regexes.length})`} />
                    <Tab label={`Logstream (${data.receivedLines.length})`} />
                    <Tab label={`Business (${data.businessLines.length})`} />
                    <Tab label='Syslog (0)' />
                    <Tab label={`LLM Input (${data.llmInputLines.length})`} />
                    <Tab label={`LLM Responses (${data.llmOutputLines.length})`} />
                    <Tab label={`Issues (${data.llmWarningLines.length})`} />
                    <Tab label={`LLM Errors (${data.llmErrorLines.length})`} />
                    <Tab label='Performance' />
                </Tabs>
                {(tab === 1 || tab === 2 || tab === 3 || tab === 5 || tab === 6 || tab === 8) && (
                    <Box sx={{ display: 'flex', alignItems: 'center', px: 0.5, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
                        {tab === 1 && (
                            <Tooltip title={regexSort === 'none' ? 'Sort by matches: no order' : regexSort === 'desc' ? 'Sort by matches: descending' : 'Sort by matches: ascending'}>
                                <IconButton size='small' onClick={() => setRegexSort(s => s === 'none' ? 'desc' : s === 'desc' ? 'asc' : 'none')}>
                                    {regexSort === 'none' ? <SwapVert fontSize='small' sx={{ color: 'text.disabled' }} /> : regexSort === 'desc' ? <ArrowDownward fontSize='small' color='primary' /> : <ArrowUpward fontSize='small' color='primary' />}
                                </IconButton>
                            </Tooltip>
                        )}
                        <Box sx={{ flex: 1 }} />
                        {tab !== 1 && (
                            <Tooltip title='Clear'>
                                <IconButton size='small' onClick={() => {
                                    if (tab === 2) { data.receivedLines = []; forceUpdate(n => n + 1) }
                                    else if (tab === 3) { data.businessLines = []; forceUpdate(n => n + 1) }
                                    else if (tab === 5) { data.llmInputLines = []; forceUpdate(n => n + 1) }
                                    else if (tab === 6) { data.llmOutputLines = []; forceUpdate(n => n + 1) }
                                    else if (tab === 8) { data.llmErrorLines = []; forceUpdate(n => n + 1) }
                                }}>
                                    <DeleteSweep fontSize='small' />
                                </IconButton>
                            </Tooltip>
                        )}
                        <FormControlLabel
                            control={<Switch size='small'
                                checked={tab === 1 ? regexAutoScroll : tab === 2 ? receivedAutoScroll : tab === 3 ? businessAutoScroll : tab === 5 ? llmInputAutoScroll : tab === 6 ? llmOutputAutoScroll : llmErrorAutoScroll}
                                onChange={e => { if (tab === 1) setRegexAutoScroll(e.target.checked); else if (tab === 2) setReceivedAutoScroll(e.target.checked); else if (tab === 3) setBusinessAutoScroll(e.target.checked); else if (tab === 5) setLlmInputAutoScroll(e.target.checked); else if (tab === 6) setLlmOutputAutoScroll(e.target.checked); else setLlmErrorAutoScroll(e.target.checked) }} />}
                            label={<Typography variant='caption'>Autoscroll</Typography>}
                            sx={{ ml: 0.5, mr: 0 }} />
                    </Box>
                )}
                {tab === 7 && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, px: 0.5, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
                        {data.allTags.map(tag => (
                            <Chip key={tag} label={tag} size='small'
                                color={activeTagFilters.includes(tag) ? 'primary' : 'default'}
                                variant={activeTagFilters.includes(tag) ? 'filled' : 'outlined'}
                                onClick={() => setActiveTagFilters(prev =>
                                    prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                                )}
                                sx={{ fontSize: '10px', height: 20 }} />
                        ))}
                        {data.allTags.length > 0 && (
                            <FormControlLabel
                                control={<Switch size='small' checked={tagFilterAnd} disabled={activeTagFilters.length < 2} onChange={e => setTagFilterAnd(e.target.checked)} />}
                                label={<Typography variant='caption'>{tagFilterAnd ? 'All' : 'Any'}</Typography>}
                                sx={{ ml: 0.5, mr: 0 }} />
                        )}
                        <Box sx={{ flex: 1 }} />
                        <Tooltip title='Clear'>
                            <IconButton size='small' onClick={() => { data.llmWarningLines = []; forceUpdate(n => n + 1) }}>
                                <DeleteSweep fontSize='small' />
                            </IconButton>
                        </Tooltip>
                        <FormControlLabel
                            control={<Switch size='small' checked={warningAutoScroll} onChange={e => setWarningAutoScroll(e.target.checked)} />}
                            label={<Typography variant='caption'>Autoscroll</Typography>}
                            sx={{ ml: 0, mr: 0 }} />
                    </Box>
                )}

                <Box ref={contentRef} sx={{ overflowY: 'auto', height: panelHeight }}>

                    {/* Tab 0 — Objects being analyzed */}
                    {tab === 0 && (
                        data.assets.length === 0
                            ? <Typography variant='caption' color='text.secondary' sx={{ p: 1, display: 'block' }}>No objects currently being analyzed.</Typography>
                            : <List dense disablePadding>
                                {data.assets.map((asset, i) => (
                                    <ListItem key={i} disableGutters sx={{ px: 0.5 }}>
                                        <ListItemText
                                            primary={`${asset.pod} / ${asset.container}`}
                                            secondary={asset.namespace}
                                            primaryTypographyProps={{ variant: 'caption', fontFamily: 'monospace', fontSize: '11px' }}
                                            secondaryTypographyProps={{ variant: 'caption', fontSize: '10px' }} />
                                    </ListItem>
                                ))}
                            </List>
                    )}

                    {/* Tab 1 — Regex list */}
                    {tab === 1 && (
                        data.regexes.length === 0
                            ? <Typography variant='caption' color='text.secondary' sx={{ p: 1, display: 'block' }}>
                                No filters yet. Waiting for first {batchSize} lines...
                            </Typography>
                            : <List dense disablePadding>
                                {[...data.regexes].sort((a, b) => regexSort === 'desc' ? (b.matches ?? 0) - (a.matches ?? 0) : regexSort === 'asc' ? (a.matches ?? 0) - (b.matches ?? 0) : 0).map((regex, i) => (
                                    <Tooltip key={i} title={regex.explanation || '(no explanation)'} placement='bottom-start' arrow>
                                        <ListItem disableGutters sx={{ px: 0.5 }}>
                                            <IconButton size='small' sx={{ mr: 0.5 }} onClick={() => {
                                                const idx = data.regexes.findIndex(r => r.pattern === regex.pattern)
                                                if (idx >= 0) data.regexes.splice(idx, 1)
                                                forceUpdate(n => n + 1)
                                                sendCommand(ECensorCommand.REGEXDELETE, regex.pattern)
                                            }}>
                                                <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                                            </IconButton>
                                            {(() => {
                                                const totalMatches = data.regexes.reduce((s, r) => s + (r.matches ?? 0), 0)
                                                const pct = totalMatches > 0 ? Math.round(((regex.matches ?? 0) / totalMatches) * 100) : 0
                                                return (<>
                                                    <Chip label={regex.matches ?? 1} size='small' variant='outlined'
                                                        sx={{ height: 16, fontSize: '9px', minWidth: 28, mr: 0.5, '& .MuiChip-label': { px: 0.5 } }} />
                                                    <Chip label={`${pct}%`} size='small' variant='outlined' color='primary'
                                                        sx={{ height: 16, fontSize: '9px', minWidth: 36, mr: 0.5, '& .MuiChip-label': { px: 0.5 } }} />
                                                </>)
                                            })()}
                                            <ListItemText primary={regex.pattern}
                                                primaryTypographyProps={{ variant: 'caption', fontFamily: 'monospace', fontSize: '10px', sx: { wordBreak: 'break-all' } }} />
                                        </ListItem>
                                    </Tooltip>
                                ))}
                            </List>
                    )}

                    {/* Tab 2 — All received lines */}
                    {tab === 2 && data.receivedLines.map((line, i) => (
                        <Box key={i} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, '&:hover': { bgcolor: 'action.hover' }, px: 0.5, borderRadius: 0.5 }}>
                            <Typography variant='caption' color='text.disabled' sx={{ minWidth: '160px', fontFamily: 'monospace', flexShrink: 0 }}>
                                {line.pod}/{line.container}
                            </Typography>
                            <Typography variant='caption' sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                {cleanANSI(line.text)}
                            </Typography>
                        </Box>
                    ))}

                    {/* Tab 3 — Business events */}
                    {tab === 3 && data.businessLines.map((line, i) => (
                        <Box key={i} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, '&:hover': { bgcolor: 'action.hover' }, px: 0.5, borderRadius: 0.5 }}>
                            <Typography variant='caption' color='text.disabled' sx={{ minWidth: '120px', fontFamily: 'monospace', flexShrink: 0 }}>
                                {line.namespace}/{line.pod}
                            </Typography>
                            {data.instanceConfig.addTimestamp && line.timestamp && (
                                <Typography variant='caption' sx={{ minWidth: '80px', fontFamily: 'monospace', flexShrink: 0 }}>
                                    [{line.timestamp.substring(11, 19)}]
                                </Typography>
                            )}
                            <Typography variant='caption' sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                {line.text}
                            </Typography>
                        </Box>
                    ))}

                    {/* Tab 4 — Syslog */}
                    {tab === 4 && (
                        <Typography variant='caption' color='text.secondary' sx={{ p: 1, display: 'block' }}>No syslog data yet.</Typography>
                    )}

                    {/* Tab 5 — Lines sent to LLM */}
                    {tab === 5 && data.llmInputLines.map((line, i) => (
                        <Typography key={i} variant='caption' sx={{ fontFamily: 'monospace', display: 'block', px: 0.5, wordBreak: 'break-all', '&:hover': { bgcolor: 'action.hover' } }}>
                            {line}
                        </Typography>
                    ))}

                    {/* Tab 6 — LLM responses */}
                    {tab === 6 && data.llmOutputLines.map((out, i) => (
                        <Box key={i} sx={{ mb: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {out}
                        </Box>
                    ))}

                    {/* Tab 7 — Issues */}
                    {tab === 7 && <>
                        {data.llmWarningLines
                            .filter(w => {
                                if (activeTagFilters.length === 0) return true
                                return tagFilterAnd
                                    ? activeTagFilters.every(t => w.tags.includes(t))
                                    : activeTagFilters.some(t => w.tags.includes(t))
                            })
                            .map((w, i) => (
                                <Box key={i} sx={{ display: 'flex', flexDirection: 'column', px: 0.5, py: 0.25, borderBottom: 1, borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}>
                                    {w.tags.length > 0 && (
                                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 0.25 }}>
                                            {w.tags.map(t => <Chip key={t} label={t} size='small' variant='outlined' sx={{ fontSize: '10px', height: 18 }} />)}
                                        </Box>
                                    )}
                                    <Typography variant='caption' sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{w.original}</Typography>
                                    <Typography variant='caption' color='text.secondary' sx={{ fontStyle: 'italic' }}>{w.explanation}</Typography>
                                </Box>
                            ))
                        }
                    </>}

                    {/* Tab 8 — LLM Errors */}
                    {tab === 8 && data.llmErrorLines.map((e, i) => (
                        <Box key={i} sx={{ display: 'flex', flexDirection: 'column', px: 0.5, py: 0.5, borderBottom: 1, borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}>
                            <Typography variant='caption' color='text.disabled' sx={{ fontFamily: 'monospace', fontSize: '10px' }}>{e.timestamp}</Typography>
                            <Typography variant='caption' color='error.main' sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{e.text}</Typography>
                            {e.lines && e.lines.length > 0 && (
                                <Box sx={{ mt: 0.5, pl: 1, borderLeft: 2, borderColor: 'error.light' }}>
                                    <Typography variant='caption' color='text.disabled' sx={{ fontSize: '9px', fontWeight: 'bold', display: 'block', mb: 0.25 }}>
                                        INPUT ({e.lines.length} lines)
                                    </Typography>
                                    {e.lines.map((l, j) => (
                                        <Typography key={j} variant='caption' sx={{ fontFamily: 'monospace', fontSize: '10px', display: 'block', wordBreak: 'break-all', color: 'text.secondary' }}>
                                            {l}
                                        </Typography>
                                    ))}
                                </Box>
                            )}
                        </Box>
                    ))}

                    {tab === 9 && (() => {
                        const selectedLlm = data.llms.find(l => l.id === data.instanceConfig?.llmId)
                        const icpm = selectedLlm?.inputCostPerMillion ?? 0
                        const ocpm = selectedLlm?.outputCostPerMillion ?? 0
                        const spent = (icpm > 0 || ocpm > 0) ? (data.tokensIn / 1_000_000 * icpm + data.tokensOut / 1_000_000 * ocpm) : 0
                        const avgTkPerLine = data.llmLinesCount > 0 ? data.tokensIn / data.llmLinesCount : 0
                        const filtered = Math.max(0, data.processedCount - data.llmLinesCount - data.pendingCount)
                        const savedTk = filtered > 0 && avgTkPerLine > 0 ? Math.round(filtered * avgTkPerLine) : 0
                        const savedCost = icpm > 0 && savedTk > 0 ? savedTk / 1_000_000 * icpm : 0
                        const total = spent + savedCost
                        const fmt = (n: number) => n > 0 ? `${n.toFixed(4)} €` : '—'
                        const col = (label: string, val: string | number) => (
                            <Stack direction='row' justifyContent='space-between'>
                                <Typography variant='body2' color='text.secondary'>{label}</Typography>
                                <Typography variant='body2' fontWeight='bold'>{typeof val === 'number' ? val.toLocaleString() : val}</Typography>
                            </Stack>
                        )
                        return (
                        <Stack direction='row' spacing={2} sx={{ p: 1.5, flexWrap: 'wrap' }} useFlexGap>
                            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 190, flex: 1 }}>
                                <Typography variant='subtitle2' fontWeight='bold' gutterBottom>Log</Typography>
                                <Stack spacing={0.5}>
                                    {col('Processed', data.processedCount)}
                                    {col('Sent to LLM', data.llmLinesCount)}
                                    {col('Filtered (regex)', filtered)}
                                    {col('Pending', data.pendingCount)}
                                    {col('Avg line size', data.processedCount > 0 && data.totalBytesProcessed > 0 ? `${Math.round(data.totalBytesProcessed / data.processedCount)} B` : '—')}
                                </Stack>
                            </Box>
                            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 190, flex: 1 }}>
                                <Typography variant='subtitle2' fontWeight='bold' gutterBottom>LLM</Typography>
                                <Stack spacing={0.5}>
                                    {col('Calls', data.llmCount)}
                                    {col('Responses', data.llmCount)}
                                    {col('Avg lines/call', data.llmCount > 0 ? Math.round(data.llmLinesCount / data.llmCount) : '—')}
                                    {col('Tokens in', data.tokensIn)}
                                    {col('Tokens out', data.tokensOut)}
                                    {savedTk > 0 && col('Est. tokens saved', `~${savedTk.toLocaleString()} (${Math.round(savedTk / (data.tokensIn + savedTk) * 100)}%)`)}
                                </Stack>
                                <Stack spacing={0.5} sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                                    {col('Batch size', data.instanceConfig?.batchSize ?? 50)}
                                    {col('Avg tokens/batch', data.llmCount > 0 ? Math.round(data.tokensIn / data.llmCount) : '—')}
                                </Stack>
                            </Box>
                            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 260, flex: 1 }}>
                                <Typography variant='subtitle2' fontWeight='bold' gutterBottom>Performance</Typography>
                                {(() => {
                                    if (msgsPerSec > peakProcessedRef.current) peakProcessedRef.current = msgsPerSec
                                    if (tokensInPerSec > peakTkInRef.current) peakTkInRef.current = tokensInPerSec
                                    if (tokensOutPerSec > peakTkOutRef.current) peakTkOutRef.current = tokensOutPerSec
                                    if (llmLinesPerSec > peakLlmLinesRef.current) peakLlmLinesRef.current = llmLinesPerSec
                                    const elapsedSec = data.startTime ? Math.max(1, (Date.now() - data.startTime) / 1000) : null
                                    const avgProcessed = elapsedSec ? data.processedCount / elapsedSec : 0
                                    const avgLlmLines = elapsedSec ? data.llmLinesCount / elapsedSec : 0
                                    const avgTkIn = elapsedSec ? data.tokensIn / elapsedSec : 0
                                    const avgTkOut = elapsedSec ? data.tokensOut / elapsedSec : 0
                                    return (
                                        <>
                                        <Stack direction='row' spacing={0} sx={{ mb: 2 }}>
                                            <MiniGauge value={msgsPerSec} max={(peakProcessedRef.current * 1.1) || 10} label='Lines/sec' format={formatPerfValue} />
                                            <MiniGauge value={llmLinesPerSec} max={(peakLlmLinesRef.current * 1.1) || 10} label='LLM lines/s' format={formatPerfValue} />
                                            <MiniGauge value={tokensInPerSec} max={(peakTkInRef.current * 1.1) || 10} label='Tok in/sec' format={formatPerfValue} />
                                            <MiniGauge value={tokensOutPerSec} max={(peakTkOutRef.current * 1.1) || 10} label='Tok out/sec' format={formatPerfValue} />
                                        </Stack>
                                        <Stack direction='row' spacing={0} sx={{ mb: 1 }}>
                                            <MiniGauge value={avgProcessed} max={(peakProcessedRef.current * 1.1) || 10} label='Avg l/sec' />
                                            <MiniGauge value={avgLlmLines} max={(peakLlmLinesRef.current * 1.1) || 10} label='Avg LLM/s' />
                                            <MiniGauge value={avgTkIn} max={(peakTkInRef.current * 1.1) || 10} label='Avg tk in' />
                                            <MiniGauge value={avgTkOut} max={(peakTkOutRef.current * 1.1) || 10} label='Avg tk out' />
                                        </Stack>
                                        </>
                                    )
                                })()}
                                <Stack direction='row' spacing={1} sx={{ mb: 0.5 }}>
                                    <Box sx={{ flex: 1 }} />
                                    <Typography variant='caption' color='text.disabled' sx={{ width: 48, textAlign: 'right' }}>/sec</Typography>
                                    <Typography variant='caption' color='text.disabled' sx={{ width: 56, textAlign: 'right' }}>/min</Typography>
                                    <Typography variant='caption' color='text.disabled' sx={{ width: 64, textAlign: 'right' }}>/hour</Typography>
                                </Stack>
                                {[
                                    { label: 'Processed', sec: msgsPerSec, min: msgsPerMin, hour: msgsPerMin * 60 },
                                    { label: 'Sent to LLM', sec: llmLinesPerSec, min: llmLinesPerMin, hour: llmLinesPerMin * 60 },
                                    { label: 'Tokens in', sec: tokensInPerSec, min: tokensInPerMin, hour: tokensInPerMin * 60 },
                                    { label: 'Tokens out', sec: tokensOutPerSec, min: tokensOutPerMin, hour: tokensOutPerMin * 60 },
                                ].map(({ label, sec, min, hour }) => (
                                    <Stack key={label} direction='row' spacing={1} alignItems='center'>
                                        <Typography variant='body2' color='text.secondary' sx={{ flex: 1 }}>{label}</Typography>
                                        <Typography variant='body2' fontWeight='bold' sx={{ width: 48, textAlign: 'right' }}>{sec.toLocaleString()}</Typography>
                                        <Typography variant='body2' fontWeight='bold' sx={{ width: 56, textAlign: 'right' }}>{min.toLocaleString()}</Typography>
                                        <Typography variant='body2' fontWeight='bold' sx={{ width: 64, textAlign: 'right' }}>{hour.toLocaleString()}</Typography>
                                    </Stack>
                                ))}
                            </Box>
                            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 190, flex: 1 }}>
                                <Typography variant='subtitle2' fontWeight='bold' gutterBottom>DataDog</Typography>
                                {(() => {
                                    const INGEST_PER_GB = 0.10
                                    const IDX = { '3d': 1.27, '15d': 1.70, '30d': 2.50 }
                                    const totalBytes = data.totalBytesProcessed
                                    const avgBytes = data.processedCount > 0 && totalBytes > 0 ? totalBytes / data.processedCount : 0
                                    const filteredBytes = avgBytes > 0 ? filtered * avgBytes : 0
                                    const remainBytes = totalBytes - filteredBytes
                                    const fmtSz = (b: number) => b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`
                                    const fmtIng = (b: number) => `$${(b / (1024 ** 3) * INGEST_PER_GB).toFixed(4)}`
                                    const fmtIdx = (n: number, rate: number) => `$${(n / 1_000_000 * rate).toFixed(4)}`
                                    const pct = totalBytes > 0 ? Math.round(filteredBytes / totalBytes * 100) : 0
                                    return (
                                        <Stack spacing={0.5}>
                                            <Typography variant='caption' color='text.secondary' sx={{ fontWeight: 'bold' }}>Ingestion ($0.10/GB)</Typography>
                                            {col('All logs', `${fmtSz(totalBytes)}  ${fmtIng(totalBytes)}`)}
                                            {col('Regex filtered', `${fmtSz(filteredBytes)}  ${fmtIng(filteredBytes)}`)}
                                            {col('Remaining', `${fmtSz(remainBytes)}  ${fmtIng(remainBytes)}`)}
                                            {pct > 0 && col('Ingestion saved', `${pct}%`)}
                                            <Typography variant='caption' color='text.secondary' sx={{ mt: 0.5, fontWeight: 'bold' }}>Indexing (per M events)</Typography>
                                            <Stack direction='row' spacing={0}>
                                                <Box sx={{ flex: 1 }} />
                                                {Object.keys(IDX).map(k => <Typography key={k} variant='caption' color='text.disabled' sx={{ width: 56, textAlign: 'right' }}>{k}</Typography>)}
                                            </Stack>
                                            {[
                                                { label: 'All events', n: data.processedCount },
                                                { label: 'Regex filtered', n: filtered },
                                                { label: 'Remaining', n: data.processedCount - filtered },
                                            ].map(({ label, n }) => (
                                                <Stack key={label} direction='row' alignItems='center'>
                                                    <Typography variant='body2' color='text.secondary' sx={{ flex: 1 }}>{label}</Typography>
                                                    {Object.values(IDX).map((rate, i) => (
                                                        <Typography key={i} variant='body2' fontWeight='bold' sx={{ width: 56, textAlign: 'right' }}>{fmtIdx(n, rate)}</Typography>
                                                    ))}
                                                </Stack>
                                            ))}
                                        </Stack>
                                    )
                                })()}
                            </Box>
                            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 190, flex: 1 }}>
                                <Typography variant='subtitle2' fontWeight='bold' gutterBottom>Cost</Typography>
                                <Stack spacing={0.5}>
                                    {col('Total (w/o filtering)', fmt(total))}
                                    {col('Spent', fmt(spent))}
                                    {col('Saved', fmt(savedCost))}
                                    {savedCost > 0 && col('Savings %', `${Math.round(savedCost / total * 100)}%`)}
                                </Stack>
                                {!selectedLlm?.inputCostPerMillion && (
                                    <Typography variant='caption' color='text.disabled' sx={{ mt: 1, display: 'block' }}>
                                        Set cost/M tokens in LLM config to see costs
                                    </Typography>
                                )}
                            </Box>
                        </Stack>
                        )
                    })()}

                </Box>
            </CardContent>
        </Card>}

        {showConfig && (
            <Dialog open={true} PaperProps={{ sx: { width: '92vw', maxWidth: '1200px', height: '82vh' } }}>
                <DialogTitle>Censor config</DialogTitle>
                <DialogContent style={{ display: 'flex', height: '100%', overflow: 'hidden', padding: '8px 16px' }}>

                    {/* Left panel — config list */}
                    <Box sx={{ flex: '0 0 230px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', pr: 1 }}>
                        <Typography variant='caption' color='text.secondary' sx={{ fontWeight: 'bold', px: 0.5, pt: 0.5 }}>Configs</Typography>
                        <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', border: 1, borderColor: 'divider', borderRadius: 1, mt: 0.5 }}>
                            <List dense sx={{ py: 0 }}>
                                {data.configs.map((cfg, i) => (
                                    <ListItemButton key={i} selected={selectedConfigIndex === i} onClick={() => onConfigSelect(cfg, i)} dense sx={{ py: 0.5 }}>
                                        <Switch size='small' checked={cfg.active ?? false}
                                            onChange={() => onConfigToggleActive(i)} onClick={e => e.stopPropagation()} sx={{ mr: 0.5 }} />
                                        <Stack direction='column' sx={{ minWidth: 0 }}>
                                            <Typography variant='body2' sx={{ fontWeight: selectedConfigIndex === i ? 'bold' : 'normal', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {cfg.name}
                                            </Typography>
                                            <Typography color='textSecondary' fontSize={10}>v{cfg.version}</Typography>
                                        </Stack>
                                    </ListItemButton>
                                ))}
                            </List>
                        </Box>
                        <Stack direction='row' spacing={0.5} sx={{ px: 0.5, pt: 0.5 }}>
                            <Button size='small' startIcon={<AddIcon />} onClick={onConfigNew} sx={{ fontSize: 11 }}>New</Button>
                            <Button size='small' color='error' startIcon={<DeleteIcon />} onClick={onConfigDelete} disabled={selectedConfigIndex === null} sx={{ fontSize: 11 }}>Delete</Button>
                        </Stack>
                    </Box>

                    {/* Right panel — editor */}
                    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', pl: 2, pt: 1 }}>
                        <Stack spacing={1.5} sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <Stack direction='row' spacing={2}>
                                <TextField label='Name' size='small' value={configName} onChange={e => setConfigName(e.target.value)} sx={{ flex: 1 }} />
                                <TextField label='Version' size='small' value={configVersion} onChange={e => setConfigVersion(e.target.value)} sx={{ width: 100 }} />
                            </Stack>
                            <Stack direction='row' spacing={2} alignItems='center'>
                                <FormControl size='small' sx={{ flex: 1 }}>
                                    <InputLabel>LLM</InputLabel>
                                    <Select label='LLM' value={llmId} onChange={e => setLlmId(e.target.value)}>
                                        {data.llms.length === 0 && <MenuItem value='' disabled>No LLMs configured</MenuItem>}
                                        {data.llms.map(llm => (
                                            <MenuItem key={llm.id} value={llm.id}>{llm.id} ({llm.provider}/{llm.model})</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <TextField label='Batch size' size='small' type='number' value={batchSize}
                                    onChange={e => setBatchSize(Math.max(1, +e.target.value))}
                                    sx={{ width: 110 }} inputProps={{ min: 1 }} />
                                <TextField label='Temperature' size='small' type='number' value={temperature}
                                    onChange={e => setTemperature(Math.min(2, Math.max(0, +e.target.value)))}
                                    sx={{ width: 110 }} inputProps={{ min: 0, max: 2, step: 0.1 }} />
                            </Stack>
                            <TextField label='System prompt (optional)' size='small' multiline value={system}
                                onChange={e => setSystem(e.target.value)} fullWidth
                                placeholder='Leave empty to use the default noise-filtering prompt'
                                sx={{ flex: 1, '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start' }, '& textarea': { height: '100% !important', overflow: 'auto !important', boxSizing: 'border-box' } }} />
                            <TextField label='Output example (JSON)' size='small' multiline rows={3} value={exampleJson}
                                onChange={e => {
                                    setExampleJson(e.target.value)
                                    try { JSON.parse(e.target.value); setExampleJsonError('') }
                                    catch (err) { setExampleJsonError(String(err)) }
                                }}
                                error={!!exampleJsonError} helperText={exampleJsonError || 'Must be valid JSON with double quotes'}
                                fullWidth inputProps={{ style: { fontFamily: 'monospace', fontSize: '12px' } }} />
                            <Box>
                                <Typography variant='caption' color='text.secondary' sx={{ fontWeight: 'bold' }}>Business source</Typography>
                                <Stack direction='row' spacing={2} alignItems='center' sx={{ mt: 0.5 }}>
                                    <TextField label='Space' size='small' value={space} onChange={e => setSpace(e.target.value)} sx={{ flex: 1 }} placeholder='Leave empty for any' />
                                    <TextField label='Type' size='small' value={type} onChange={e => setType(e.target.value)} sx={{ flex: 1 }} placeholder='Leave empty for any' />
                                    <TextField label='Path (dot-notation)' size='small' value={businessPath} onChange={e => setBusinessPath(e.target.value)} sx={{ flex: 2 }} placeholder='e.g. data.message (empty = ignore)' />
                                    <FormControlLabel
                                        control={<Switch size='small' checked={addTimestamp} onChange={e => setAddTimestamp(e.target.checked)} />}
                                        label={<Typography variant='caption'>Timestamp</Typography>}
                                        sx={{ ml: 0.5, mr: 0, whiteSpace: 'nowrap' }} />
                                </Stack>
                            </Box>
                            <Box>
                                <Typography variant='caption' color='text.secondary' sx={{ fontWeight: 'bold' }}>Sender</Typography>
                                <Stack direction='row' spacing={2} alignItems='center' sx={{ mt: 0.5 }}>
                                    <FormControl size='small' sx={{ flex: 1 }}>
                                        <InputLabel>Sender config</InputLabel>
                                        <Select label='Sender config' value={senderId && senderConfigName ? `${senderId}::${senderConfigName}` : ''}
                                            onChange={e => {
                                                const val = e.target.value
                                                if (!val) { setSenderId(''); setSenderConfigName('') }
                                                else { const [sid, scn] = val.split('::'); setSenderId(sid); setSenderConfigName(scn) }
                                            }}>
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
                                    </FormControl>
                                </Stack>
                            </Box>
                            <Stack direction='row' spacing={2} alignItems='center'>
                                <Button variant='outlined' size='small' onClick={() => setShowConfigLlm(true)}>LLM config</Button>
                                <Button variant='outlined' size='small' onClick={() => setShowConfigProvider(true)}>Provider config</Button>
                                <Button variant='outlined' size='small' onClick={() => setShowImportExport(true)}>Import/Export</Button>
                                <Box sx={{ flex: 1 }} />
                                <Button variant='contained' size='small'
                                    disabled={!configName || !configVersion || !!exampleJsonError}
                                    onClick={onConfigSave}>
                                    {data.configs.some(c => c.name === configName && c.version === configVersion) ? 'Update' : 'Add'}
                                </Button>
                            </Stack>
                        </Stack>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={saveConfig} variant='contained' disabled={!llmId || !!exampleJsonError}>OK</Button>
                    <Button onClick={() => setShowConfig(false)} color='inherit'>Cancel</Button>
                </DialogActions>
            </Dialog>
        )}

        {showConfigLlm && (
            <AiConfigLlm llms={data.llms} providers={data.providers} onClose={aiConfigLlmClose} />
        )}
        {showConfigProvider && (
            <AiConfigProvider providers={data.providers} providersAvailable={data.providersAvailable} onClose={aiConfigProviderClose} />
        )}
        {showImportExport && (
            <CensorImportExport configs={data.configs} onClose={importExportClose} />
        )}
        {showSessionStart && (
            <CensorSessionStart onConfirm={onSessionStart} onClose={() => setShowSessionStart(false)} />
        )}
        {msgBox}
    </>
}

export { CensorTabContent }
