import React, { useEffect, useRef, useState } from 'react'
import { Box, Button, Card, CardContent, CardHeader, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, FormControlLabel, IconButton, InputLabel, List, ListItem, ListItemButton, ListItemText, MenuItem, Select, Stack, Switch, Tab, Tabs, TextField, Tooltip, Typography } from '@mui/material'
import { Add as AddIcon, Delete as DeleteIcon, DeleteOutline as DeleteOutlineIcon } from '@mui/icons-material'
import { cleanANSI, IContentProps } from '@kwirthmagnify/kwirth-common-front'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType } from '@kwirthmagnify/kwirth-common'
import { AiConfigLlm, AiConfigProvider } from '@kwirthmagnify/kwirth-common-ai/front'
import { ILlm, ILlmProvider } from '@kwirthmagnify/kwirth-common-ai'
import { ICensorData } from './CensorData'
import { ECensorCommand, ICensorInstanceConfig } from './CensorConfig'
import { CensorImportExport } from './CensorImportExport'
import { MsgBoxButtons, MsgBoxYesNo } from './utils'

const CensorTabContent: React.FC<IContentProps> = (props: IContentProps) => {
    const data: ICensorData = props.channelObject.data
    const contentRef = useRef<HTMLDivElement>(null)
    const [contentTop, setContentTop] = useState(0)
    const [, forceUpdate] = useState(0)
    const [tab, setTab] = useState(0)
    const [showConfig, setShowConfig] = useState(false)
    const [configName, setConfigName] = useState('')
    const [configVersion, setConfigVersion] = useState('1')
    const [llmId, setLlmId] = useState('')
    const [system, setSystem] = useState('')
    const [batchSize, setBatchSize] = useState(50)
    const [temperature, setTemperature] = useState(0.2)
    const [exampleJson, setExampleJson] = useState('{"patterns":["example regex"]}')
    const [exampleJsonError, setExampleJsonError] = useState('')
    const [showConfigLlm, setShowConfigLlm] = useState(false)
    const [showConfigProvider, setShowConfigProvider] = useState(false)
    const [showImportExport, setShowImportExport] = useState(false)
    const [msgBox, setMsgBox] = useState(<></>)
    const [activeTagFilters, setActiveTagFilters] = useState<string[]>([])
    const [tagFilterAnd, setTagFilterAnd] = useState(false)
    const [warningAutoScroll, setWarningAutoScroll] = useState(true)
    const [selectedConfigIndex, setSelectedConfigIndex] = useState<number | null>(null)

    useEffect(() => {
        if (contentRef.current) setContentTop(contentRef.current.getBoundingClientRect().top)
    })

    useEffect(() => {
        if (!contentRef.current || tab === 0) return
        if (tab === 4 && !warningAutoScroll) return
        contentRef.current.scrollTo({ top: contentRef.current.scrollHeight, behavior: 'auto' })
    }, [data.receivedLines.length, data.llmInputLines.length, data.llmOutputLines.length, data.llmWarningLines.length, tab, warningAutoScroll])

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
    }, [data.instanceConfig])

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

    const currentConfig = (): ICensorInstanceConfig => ({ name: configName, version: configVersion, llmId, system, batchSize, temperature, exampleJson })

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

    const panelHeight = `calc(100vh - ${contentTop}px - 16px)`

    return <>
        {data.started &&
        <Card sx={{ display: 'flex', flexDirection: 'column', flex: 1, width: '98%', alignSelf: 'center', mt: 1, minHeight: 0 }}>
            <CardHeader title={
                <Stack direction='row' alignItems='center'>
                    <Typography mr={3}><b>Filters:</b> {data.regexes.length}</Typography>
                    <Typography mr={3}><b>Processed:</b> {data.processedCount}</Typography>
                    <Typography mr={3} flex={1}><b>To LLM:</b> {data.llmCount}</Typography>
                    <Button onClick={openConfig}>Config</Button>
                    <Button onClick={() => sendCommand(data.analyzing ? ECensorCommand.ANALYZESTOP : ECensorCommand.ANALYZESTART)}
                        color={data.analyzing ? 'error' : 'success'} variant='outlined' size='small' sx={{ ml: 1 }}>
                        {data.analyzing ? 'Stop' : 'Start'}
                    </Button>
                </Stack>
            } />
            <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, p: 0, '&:last-child': { pb: 0 } }}>
                <Tabs value={tab} onChange={(_, v) => setTab(v)} variant='scrollable' scrollButtons='auto'
                    sx={{ borderBottom: 1, borderColor: 'divider', px: 1, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}>
                    <Tab label={`Regex (${data.regexes.length})`} />
                    <Tab label={`Received (${data.receivedLines.length})`} />
                    <Tab label={`LLM Input (${data.llmInputLines.length})`} />
                    <Tab label={`LLM Responses (${data.llmOutputLines.length})`} />
                    <Tab label={`Warnings (${data.llmWarningLines.length})`} />
                    <Tab label={`Objects (${data.assets.length})`} />
                </Tabs>
                {tab === 4 && (
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

                    {/* Tab 2 — Lines sent to LLM */}
                    {tab === 2 && data.llmInputLines.map((line, i) => (
                        <Typography key={i} variant='caption' sx={{ fontFamily: 'monospace', display: 'block', px: 0.5, wordBreak: 'break-all', '&:hover': { bgcolor: 'action.hover' } }}>
                            {line}
                        </Typography>
                    ))}

                    {/* Tab 3 — LLM responses */}
                    {tab === 3 && data.llmOutputLines.map((out, i) => (
                        <Box key={i} sx={{ mb: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {out}
                        </Box>
                    ))}

                    {/* Tab 5 — Objects being analyzed */}
                    {tab === 5 && (
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

                    {/* Tab 4 — LLM warnings */}
                    {tab === 4 && <>
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
            <Dialog open={true} PaperProps={{ sx: { width: '80vw', maxWidth: '900px', height: '65vh' } }}>
                <DialogTitle>Censor config</DialogTitle>
                <DialogContent style={{ display: 'flex', height: '100%', overflow: 'hidden', padding: '8px 16px' }}>

                    {/* Left panel — config list */}
                    <Box sx={{ flex: '0 0 200px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', pr: 1 }}>
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
        {msgBox}
    </>
}

export { CensorTabContent }
