import React, { useEffect, useRef, useState } from 'react'
import { Box, Button, Card, CardContent, CardHeader, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, IconButton, InputLabel, List, ListItem, ListItemButton, ListItemText, Menu, MenuItem, Select, Stack, Switch, Tab, Tabs, TextField, Tooltip, Typography } from '@mui/material'
import { Add as AddIcon, Delete as DeleteIcon, DeleteOutline as DeleteOutlineIcon, MoreVert as MoreVertIcon } from '@mui/icons-material'
import { cleanANSI, IContentProps } from '@kwirthmagnify/kwirth-common-front'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType } from '@kwirthmagnify/kwirth-common'
import { AiConfigLlm, AiConfigProvider } from '@kwirthmagnify/kwirth-common-ai/front'
import { ILlm, ILlmProvider } from '@kwirthmagnify/kwirth-common-ai'
import { ICensorData } from './CensorData'
import { ECensorCommand, ICensorInstanceConfig } from './CensorConfig'
import { CensorImportExport } from './CensorImportExport'
import { CensorSessionStart } from './CensorSessionStart'
import { MsgBoxButtons, MsgBoxYesNo } from './utils'

const CensorTabContent: React.FC<IContentProps> = (props: IContentProps) => {
    const data: ICensorData = props.channelObject.data
    const contentRef = useRef<HTMLDivElement>(null)
    const [contentTop, setContentTop] = useState(0)
    const [, forceUpdate] = useState(0)
    const [tab, setTab] = useState(0)
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
    const [businessAutoScroll, setBusinessAutoScroll] = useState(true)
    const [regexAutoScroll, setRegexAutoScroll] = useState(true)
    const [receivedAutoScroll, setReceivedAutoScroll] = useState(true)
    const [llmInputAutoScroll, setLlmInputAutoScroll] = useState(true)
    const [llmOutputAutoScroll, setLlmOutputAutoScroll] = useState(true)
    const [warningAutoScroll, setWarningAutoScroll] = useState(true)
    const [selectedConfigIndex, setSelectedConfigIndex] = useState<number | null>(null)
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)

    useEffect(() => {
        if (contentRef.current) setContentTop(contentRef.current.getBoundingClientRect().top)
    })

    useEffect(() => {
        if (!contentRef.current || tab === 6) return
        const autoScrollMap: Record<number, boolean> = { 0: regexAutoScroll, 1: receivedAutoScroll, 2: businessAutoScroll, 3: llmInputAutoScroll, 4: llmOutputAutoScroll, 5: warningAutoScroll }
        if (!autoScrollMap[tab]) return
        contentRef.current.scrollTo({ top: contentRef.current.scrollHeight, behavior: 'auto' })
    }, [data.regexes.length, data.receivedLines.length, data.llmInputLines.length, data.llmOutputLines.length, data.llmWarningLines.length, data.businessLines.length, tab, regexAutoScroll, receivedAutoScroll, llmInputAutoScroll, llmOutputAutoScroll, warningAutoScroll, businessAutoScroll])

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
    }

    const onConfigSave = () => {
        const cfg = currentConfig()
        const active = selectedConfigIndex !== null ? (data.configs[selectedConfigIndex]?.active ?? false) : false
        sendCommand(ECensorCommand.CONFIGSAVE, { ...cfg, active })
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
        sendCommand(ECensorCommand.CONFIGSAVE, { ...cfg, active: !(cfg.active ?? false) })
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
                    <Typography><b>Filters:</b> {data.regexes.length}</Typography>
                    <Typography><b>Processed:</b> {data.processedCount}</Typography>
                    <Typography><b>To LLM:</b> {data.llmCount}</Typography>
                    <Typography flex={1}><b>Tokens:</b> {data.tokensIn.toLocaleString()} in / {data.tokensOut.toLocaleString()} out</Typography>
                    {data.connectedSessionId &&
                        <Chip label={data.connectedSessionDescription ?? 'Session'} size='small' color='success' sx={{ maxWidth: 160 }} />
                    }
                    <Button onClick={() => sendCommand(data.analyzing ? ECensorCommand.ANALYZESTOP : ECensorCommand.ANALYZESTART)}
                        color={data.analyzing ? 'error' : 'success'} variant='outlined' size='small'>
                        {data.analyzing ? 'Stop' : 'Start'}
                    </Button>
                    <IconButton size='small' onClick={(e) => setMenuAnchor(e.currentTarget)}>
                        <MoreVertIcon fontSize='small' />
                    </IconButton>
                    <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
                        <MenuItem onClick={() => { setMenuAnchor(null); openConfig() }}>Config</MenuItem>
                        <MenuItem onClick={() => { setMenuAnchor(null); setShowSessionStart(true) }} disabled={!!data.connectedSessionId}>Launch</MenuItem>
                        <MenuItem onClick={deleteSession} disabled={!data.connectedSessionId}>Delete session</MenuItem>
                    </Menu>
                </Stack>
            } />
            <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, p: 0, '&:last-child': { pb: 0 } }}>
                <Tabs value={tab} onChange={(_, v) => setTab(v)} variant='scrollable' scrollButtons='auto'
                    sx={{ borderBottom: 1, borderColor: 'divider', px: 1, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}>
                    <Tab label={`Regex (${data.regexes.length})`} />
                    <Tab label={`Received (${data.receivedLines.length})`} />
                    <Tab label={`Business (${data.businessLines.length})`} />
                    <Tab label={`LLM Input (${data.llmInputLines.length})`} />
                    <Tab label={`LLM Responses (${data.llmOutputLines.length})`} />
                    <Tab label={`Warnings (${data.llmWarningLines.length})`} />
                    <Tab label={`Objects (${data.assets.length})`} />
                </Tabs>
                {(tab === 0 || tab === 1 || tab === 2 || tab === 3 || tab === 4) && (
                    <Box sx={{ display: 'flex', alignItems: 'center', px: 0.5, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
                        <Box sx={{ flex: 1 }} />
                        <FormControlLabel
                            control={<Switch size='small'
                                checked={tab === 0 ? regexAutoScroll : tab === 1 ? receivedAutoScroll : tab === 2 ? businessAutoScroll : tab === 3 ? llmInputAutoScroll : llmOutputAutoScroll}
                                onChange={e => { if (tab === 0) setRegexAutoScroll(e.target.checked); else if (tab === 1) setReceivedAutoScroll(e.target.checked); else if (tab === 2) setBusinessAutoScroll(e.target.checked); else if (tab === 3) setLlmInputAutoScroll(e.target.checked); else setLlmOutputAutoScroll(e.target.checked) }} />}
                            label={<Typography variant='caption'>Autoscroll</Typography>}
                            sx={{ ml: 0.5, mr: 0 }} />
                    </Box>
                )}
                {tab === 5 && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, px: 0.5, py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
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
                        <FormControlLabel
                            control={<Switch size='small' checked={warningAutoScroll} onChange={e => setWarningAutoScroll(e.target.checked)} />}
                            label={<Typography variant='caption'>Autoscroll</Typography>}
                            sx={{ ml: 0.5, mr: 0 }} />
                    </Box>
                )}

                <Box ref={contentRef} sx={{ overflowY: 'auto', height: panelHeight }}>

                    {/* Tab 0 — Regex list */}
                    {tab === 0 && (
                        data.regexes.length === 0
                            ? <Typography variant='caption' color='text.secondary' sx={{ p: 1, display: 'block' }}>
                                No filters yet. Waiting for first {batchSize} lines...
                            </Typography>
                            : <List dense disablePadding>
                                {data.regexes.map((regex, i) => (
                                    <Tooltip key={i} title={regex.explanation || '(no explanation)'} placement='bottom-start' arrow>
                                        <ListItem disableGutters sx={{ px: 0.5 }}>
                                            <IconButton size='small' sx={{ mr: 0.5 }} onClick={() => {
                                                data.regexes.splice(i, 1)
                                                forceUpdate(n => n + 1)
                                                sendCommand(ECensorCommand.REGEXDELETE, regex.pattern)
                                            }}>
                                                <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                                            </IconButton>
                                            <ListItemText primary={regex.pattern}
                                                primaryTypographyProps={{ variant: 'caption', fontFamily: 'monospace', fontSize: '10px', sx: { wordBreak: 'break-all' } }} />
                                        </ListItem>
                                    </Tooltip>
                                ))}
                            </List>
                    )}

                    {/* Tab 1 — All received lines */}
                    {tab === 1 && data.receivedLines.map((line, i) => (
                        <Box key={i} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, '&:hover': { bgcolor: 'action.hover' }, px: 0.5, borderRadius: 0.5 }}>
                            <Typography variant='caption' color='text.disabled' sx={{ minWidth: '160px', fontFamily: 'monospace', flexShrink: 0 }}>
                                {line.pod}/{line.container}
                            </Typography>
                            <Typography variant='caption' sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                {cleanANSI(line.text)}
                            </Typography>
                        </Box>
                    ))}

                    {/* Tab 2 — Business events */}
                    {tab === 2 && data.businessLines.map((line, i) => (
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

                    {/* Tab 3 — Lines sent to LLM */}
                    {tab === 3 && data.llmInputLines.map((line, i) => (
                        <Typography key={i} variant='caption' sx={{ fontFamily: 'monospace', display: 'block', px: 0.5, wordBreak: 'break-all', '&:hover': { bgcolor: 'action.hover' } }}>
                            {line}
                        </Typography>
                    ))}

                    {/* Tab 4 — LLM responses */}
                    {tab === 4 && data.llmOutputLines.map((out, i) => (
                        <Box key={i} sx={{ mb: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {out}
                        </Box>
                    ))}

                    {/* Tab 6 — Objects being analyzed */}
                    {tab === 6 && (
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

                    {/* Tab 5 — LLM warnings */}
                    {tab === 5 && <>
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
