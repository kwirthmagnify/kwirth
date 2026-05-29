import React, { useRef, useState } from 'react'
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, IconButton, InputLabel, Menu, MenuItem, Select, SelectChangeEvent, Stack, Switch, Tab, Tabs, TextareaAutosize, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material'
import { ScienceOutlined, Upload, Bolt, FileDownload, CheckCircleOutline, HistoryOutlined, DeleteOutlined } from '@mui/icons-material'
import { EPinocchioCommand, IAnalysis, IConfigTrigger, IConfigTriggerVersion, IMessage, IPinocchioConfig, IPinocchioMessage, IPlaygroundState, kindsAvailable } from './PinocchioConfig'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType } from '@kwirthmagnify/kwirth-common'
import { useKeyboard } from '@kwirthmagnify/kwirth-common-front'

interface IProps {
    pinocchioConfig: IPinocchioConfig
    toolsAvailable: { name: string, description: string }[]
    accessString: string
    instanceId: string
    webSocket: WebSocket
    clusterUrl: string
    content: (IAnalysis | IMessage)[]
    onClose: (newTrigger?: IConfigTrigger) => void
    onStateChange: (state: IPlaygroundState) => void
}

const PinocchioPlayground: React.FC<IProps> = (props) => {
    const initialLengthRef = useRef(props.content.length)
    const saved = props.pinocchioConfig.playground

    const [tab, setTab] = useState(0)

    const [llm, setLlm] = useState(saved?.llm ?? '')
    const [steps, setSteps] = useState(saved?.steps ?? 5)
    const [tools, setTools] = useState<string[]>(saved?.tools ?? [])
    const [autoTools, setAutoTools] = useState(saved?.autoTools ?? false)
    const [toolFilter, setToolFilter] = useState('')
    const [promptType, setPromptType] = useState<'jinja' | 'artifact'>(saved?.promptType ?? 'jinja')
    const [system, setSystem] = useState(saved?.system ?? '')
    const [prompt, setPrompt] = useState(saved?.prompt ?? '')
    const [eventData, setEventData] = useState(saved?.eventData ?? '')
    const [triggerType, setTriggerType] = useState<'business' | 'artifact'>(saved?.triggerType ?? 'business')
    const [artifactKind, setArtifactKind] = useState(saved?.artifactKind ?? '')
    const [eventSpace, setEventSpace] = useState(saved?.eventSpace ?? 'launch')
    const [eventType, setEventType] = useState(saved?.eventType ?? 'immediate')

    const [systemHistory, setSystemHistory] = useState<string[]>(saved?.systemHistory ?? [])
    const [promptHistory, setPromptHistory] = useState<string[]>(saved?.promptHistory ?? [])
    const [artifactHistory, setArtifactHistory] = useState<string[]>(saved?.artifactHistory ?? [])
    const [businessHistory, setBusinessHistory] = useState<string[]>(saved?.businessHistory ?? [])
    const [spaceTypeHistory, setSpaceTypeHistory] = useState<{ space: string, type: string }[]>(saved?.spaceTypeHistory ?? [])
    const [historyAnchor, setHistoryAnchor] = useState<Element | null>(null)
    const [historyType, setHistoryType] = useState<'system' | 'prompt' | 'artifact' | 'business' | 'spacetype'>('system')

    const [configApplied, setConfigApplied] = useState(false)
    const [firing, setFiring] = useState(false)

    const [importedFromTriggerId, setImportedFromTriggerId] = useState('')
    const [showImportDialog, setShowImportDialog] = useState(false)
    const [pendingImportTriggerId, setPendingImportTriggerId] = useState('')
    const [pendingImportVersionId, setPendingImportVersionId] = useState('')

    const [showExportDialog, setShowExportDialog] = useState(false)
    const [exportMode, setExportMode] = useState<'new' | 'version'>('new')
    const [exportId, setExportId] = useState('')
    const [exportTargetTriggerId, setExportTargetTriggerId] = useState('')
    const [exportVersionId, setExportVersionId] = useState('')

    useKeyboard()

    const newContent = props.content.slice(initialLengthRef.current)

    const pushToHistory = (arr: string[], value: string): string[] => {
        if (!value.trim()) return arr
        const filtered = arr.filter(v => v !== value)
        return [value, ...filtered].slice(0, 25)
    }

    const pushToSpaceTypeHistory = (arr: { space: string, type: string }[], space: string, type: string): { space: string, type: string }[] => {
        if (!space.trim() && !type.trim()) return arr
        const filtered = arr.filter(v => v.space !== space || v.type !== type)
        return [{ space, type }, ...filtered].slice(0, 25)
    }

    const saveAndClose = (newTrigger?: IConfigTrigger) => {
        const newSystemHistory = pushToHistory(systemHistory, system)
        const newPromptHistory = pushToHistory(promptHistory, prompt)
        const newArtifactHistory = triggerType === 'artifact' ? pushToHistory(artifactHistory, eventData) : artifactHistory
        const newBusinessHistory = triggerType === 'business' ? pushToHistory(businessHistory, eventData) : businessHistory
        const newSpaceTypeHistory = triggerType === 'business' ? pushToSpaceTypeHistory(spaceTypeHistory, eventSpace, eventType) : spaceTypeHistory
        setSystemHistory(newSystemHistory)
        setPromptHistory(newPromptHistory)
        setArtifactHistory(newArtifactHistory)
        setBusinessHistory(newBusinessHistory)
        setSpaceTypeHistory(newSpaceTypeHistory)
        props.onStateChange({ llm, steps, tools, autoTools, promptType, system, prompt, eventData, triggerType, artifactKind, eventSpace, eventType, systemHistory: newSystemHistory, promptHistory: newPromptHistory, artifactHistory: newArtifactHistory, businessHistory: newBusinessHistory, spaceTypeHistory: newSpaceTypeHistory })
        props.onClose(newTrigger)
    }

    const openHistory = (e: React.MouseEvent, type: 'system' | 'prompt' | 'artifact' | 'business' | 'spacetype') => {
        setHistoryType(type)
        setHistoryAnchor(e.currentTarget)
    }

    const selectHistory = (value: string) => {
        if (historyType === 'system') setSystem(value)
        else if (historyType === 'prompt') { setPrompt(value); markDirty() }
        else setEventData(value)
        setHistoryAnchor(null)
    }

    const selectSpaceTypeHistory = (entry: { space: string, type: string }) => {
        setEventSpace(entry.space)
        setEventType(entry.type)
        setHistoryAnchor(null)
    }

    const removeFromHistory = (index: number) => {
        if (historyType === 'system') setSystemHistory(h => h.filter((_, i) => i !== index))
        else if (historyType === 'prompt') setPromptHistory(h => h.filter((_, i) => i !== index))
        else if (historyType === 'artifact') setArtifactHistory(h => h.filter((_, i) => i !== index))
        else if (historyType === 'business') setBusinessHistory(h => h.filter((_, i) => i !== index))
        else if (historyType === 'spacetype') setSpaceTypeHistory(h => h.filter((_, i) => i !== index))
    }

    const currentHistory = historyType === 'system' ? systemHistory : historyType === 'prompt' ? promptHistory : historyType === 'artifact' ? artifactHistory : businessHistory

    const markDirty = () => setConfigApplied(false)

    const onImportTriggerChange = (triggerId: string) => {
        setPendingImportTriggerId(triggerId)
        const t = props.pinocchioConfig.triggers.find(tr => tr.id === triggerId)
        const defaultVersion = t?.versions.find(v => v.enabled) ?? t?.versions[0]
        setPendingImportVersionId(defaultVersion?.id ?? '')
    }

    const confirmImportTrigger = () => {
        const t = props.pinocchioConfig.triggers.find(tr => tr.id === pendingImportTriggerId)
        if (t) {
            if (t.trigger === 'artifact' || t.trigger === 'business') setTriggerType(t.trigger)
            if (t.trigger === 'artifact') setArtifactKind(t.kind ?? '')
            const v = t.versions.find(v => v.id === pendingImportVersionId) ?? t.versions[0]
            if (v) {
                setLlm(v.llm)
                setSteps(v.steps)
                setTools(v.tools)
                setAutoTools(v.autoTools ?? false)
                setSystem(v.system)
                setPrompt(v.prompt)
                setPromptType(v.promptType as 'jinja' | 'artifact')
                markDirty()
            }
            setImportedFromTriggerId(pendingImportTriggerId)
        }
        setShowImportDialog(false)
        setPendingImportTriggerId('')
        setPendingImportVersionId('')
    }

    const openExportDialog = () => {
        const hasSource = !!importedFromTriggerId
        setExportMode(hasSource ? 'version' : 'new')
        setExportTargetTriggerId(importedFromTriggerId)
        setExportId('')
        setExportVersionId('')
        setShowExportDialog(true)
    }

    const handleExportConfirm = () => {
        if (exportMode === 'new') {
            const trigger: IConfigTrigger = {
                id: exportId.trim(),
                trigger: triggerType,
                versions: [{
                    id: 'v1',
                    enabled: true,
                    llm, steps, tools, autoTools, system, prompt, promptType,
                    action: 'inform',
                    spaces: ['launch.immediate']
                }]
            }
            setShowExportDialog(false)
            saveAndClose(trigger)
        } else {
            const existing = props.pinocchioConfig.triggers.find(t => t.id === exportTargetTriggerId)
            if (!existing) return
            const updated: IConfigTrigger = {
                ...existing,
                versions: [...existing.versions, {
                    id: exportVersionId.trim(),
                    enabled: false,
                    llm, steps, tools, autoTools, system, prompt, promptType,
                    action: 'inform',
                    spaces: ['launch.immediate']
                }]
            }
            setShowExportDialog(false)
            saveAndClose(updated)
        }
    }

    const handleApply = () => {
        const version: IConfigTriggerVersion = {
            id: 'playground',
            enabled: true,
            llm,
            steps,
            tools: autoTools ? props.toolsAvailable.map(t => t.name) : tools,
            autoTools,
            system,
            prompt,
            promptType,
            action: 'inform',
            spaces: ['launch.immediate']
        }
        const msg: IPinocchioMessage = {
            channel: 'pinocchio',
            msgtype: 'pinocchiomessage',
            id: '1',
            accessKey: props.accessString,
            instance: props.instanceId,
            command: EPinocchioCommand.PLAYGROUNDSET,
            action: EInstanceMessageAction.COMMAND,
            flow: EInstanceMessageFlow.REQUEST,
            type: EInstanceMessageType.DATA,
            data: version
        }
        props.webSocket.send(JSON.stringify(msg))
        setConfigApplied(true)
    }

    const handleFire = async () => {
        setFiring(true)
        try {
            await fetch(`${props.clusterUrl}/business`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${props.accessString}`
                },
                body: JSON.stringify({
                    space: triggerType === 'artifact' ? 'launch' : eventSpace,
                    type: triggerType === 'artifact' ? 'immediate' : eventType,
                    data: eventData,
                    triggerType,
                    kind: artifactKind
                })
            })
        }
        finally {
            setFiring(false)
        }
    }

    const onChangeTools = (e: SelectChangeEvent<string[]>) => {
        setTools(e.target.value as string[])
        markDirty()
    }

    const renderItem = (item: IAnalysis | IMessage, index: number) => {
        if ('findings' in item) return null
        const msg = item as IMessage
        return (
            <Typography key={index} variant='body2' sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', mb: 0.5 }}>
                <span style={{ color: 'gray' }}>{new Date(msg.timestamp).toLocaleTimeString()} </span>
                {msg.text}
            </Typography>
        )
    }

    return (
        <Dialog open={true} PaperProps={{ sx: { width: '90vw', maxWidth: '1300px', height: '85vh' } }}>
            <DialogTitle sx={{ pb: 0 }}>
                <Stack direction='row' alignItems='center' spacing={1}>
                    <ScienceOutlined />
                    <Typography variant='h6'>Playground</Typography>
                </Stack>
                <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mt: 1 }}>
                    <Tab label='LLM' />
                    <Tab label='Call' />
                    <Tab label={`IN (${newContent.filter(item => !('findings' in item || 'report' in item) && (item as IMessage).role !== 'llm').length})`} />
                    <Tab label={`OUT (${newContent.filter(item => 'findings' in item || 'report' in item || (item as IMessage).role === 'llm').length})`} />
                </Tabs>
            </DialogTitle>

            <DialogContent sx={{ display: 'flex', flexDirection: 'column', pt: 2, overflow: 'hidden' }}>

                {/* Tab 0: LLM + Input */}
                {tab === 0 && (
                    <Stack spacing={2} sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', px: 2, pt: 1 }}>
                        <Stack direction='row' spacing={2} alignItems='flex-end' sx={{ flex: '0 0 auto' }}>
                            <FormControl variant='standard' sx={{ minWidth: 160 }}>
                                <InputLabel>LLM</InputLabel>
                                <Select value={llm} onChange={e => { setLlm(e.target.value); markDirty() }}>
                                    {props.pinocchioConfig.llms.map(l => <MenuItem key={l.id} value={l.id}>{l.id}</MenuItem>)}
                                </Select>
                            </FormControl>
                            <TextField label='Max steps' type='number' variant='standard' value={steps} onChange={e => { setSteps(Math.max(1, +e.target.value)); markDirty() }} sx={{ width: 80 }} />
                            <Box sx={{ flex: 1 }} />
                            <ToggleButtonGroup value={triggerType} exclusive size='small' onChange={(_, v) => { if (v) setTriggerType(v) }}>
                                <ToggleButton value='business'>Business</ToggleButton>
                                <ToggleButton value='artifact'>Artifact</ToggleButton>
                            </ToggleButtonGroup>
                            <Box sx={{ width: 310, flexShrink: 0, display: 'flex', alignItems: 'flex-end', gap: 1 }}>
                                {triggerType === 'artifact' ? (
                                    <FormControl variant='standard' fullWidth>
                                        <InputLabel shrink>Artifact Kind</InputLabel>
                                        <Select value={artifactKind} onChange={e => setArtifactKind(e.target.value)}>
                                            {kindsAvailable.map(k => <MenuItem key={k} value={k}>{k}</MenuItem>)}
                                        </Select>
                                    </FormControl>
                                ) : (
                                    <>
                                        <TextField label='Space' variant='standard' size='small' value={eventSpace} onChange={e => setEventSpace(e.target.value)} sx={{ width: 120 }} />
                                        <TextField label='Type' variant='standard' size='small' value={eventType} onChange={e => setEventType(e.target.value)} sx={{ width: 120 }} />
                                        <IconButton size='small' onClick={e => openHistory(e, 'spacetype')} disabled={spaceTypeHistory.length === 0}><HistoryOutlined sx={{ fontSize: 14 }} /></IconButton>
                                    </>
                                )}
                            </Box>
                            <Button size='small' startIcon={<Upload />} onClick={() => setShowImportDialog(true)}>Import from trigger</Button>
                        </Stack>
                        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <Stack direction='row' alignItems='center' spacing={0.5}>
                                <Typography variant='caption' color='text.secondary'>
                                    {triggerType === 'artifact' ? 'Artifact JSON' : 'Event JSON'}
                                </Typography>
                                <IconButton size='small' onClick={e => openHistory(e, triggerType)} disabled={(triggerType === 'artifact' ? artifactHistory : businessHistory).length === 0}>
                                    <HistoryOutlined sx={{ fontSize: 14 }} />
                                </IconButton>
                            </Stack>
                            <textarea value={eventData} onChange={e => setEventData(e.target.value)}
                                style={{ flex: 1, resize: 'none', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 13 }}
                                placeholder='Enter the artifact or JSON payload…' />
                        </Box>
                    </Stack>
                )}

                {/* Tab 1: Call */}
                {tab === 1 && (
                    <Stack spacing={1} sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', px: 2, pt: 1 }}>
                        <Stack direction='row' alignItems='flex-end' spacing={1} sx={{ flex: '0 0 auto' }}>
                            <FormControl variant='standard' sx={{ minWidth: 140 }}>
                                <InputLabel>Prompt type</InputLabel>
                                <Select value={promptType} onChange={e => { setPromptType(e.target.value as 'jinja' | 'artifact'); markDirty() }}>
                                    <MenuItem value='jinja'>jinja</MenuItem>
                                    <MenuItem value='artifact'>artifact</MenuItem>
                                </Select>
                            </FormControl>
                            <FormControlLabel
                                control={<Switch size='small' checked={autoTools} onChange={e => { setAutoTools(e.target.checked); markDirty() }} />}
                                label={<Typography variant='caption'>Auto</Typography>}
                                sx={{ mr: 0, flexShrink: 0 }}
                            />
                            <FormControl variant='standard' disabled={autoTools} sx={{ flex: 1 }}>
                                <InputLabel>Tools</InputLabel>
                                <Select multiple value={tools} onChange={onChangeTools} renderValue={sel => autoTools ? `all (${props.toolsAvailable.length})` : (sel as string[]).join(', ')}>
                                    <MenuItem disableRipple onClickCapture={e => e.stopPropagation()} sx={{ p: 0.5 }}>
                                        <TextField size='small' placeholder='Filter…' value={toolFilter} onChange={e => setToolFilter(e.target.value)} onKeyDown={e => e.stopPropagation()} fullWidth variant='outlined' />
                                    </MenuItem>
                                    {props.toolsAvailable
                                        .filter(t => !toolFilter || t.name.includes(toolFilter) || t.description.toLowerCase().includes(toolFilter.toLowerCase()))
                                        .map(tool => (
                                            <MenuItem key={tool.name} value={tool.name}>
                                                <Checkbox size='small' checked={tools.includes(tool.name)} />
                                                <Box>
                                                    <Typography variant='body2'>{tool.name}</Typography>
                                                    <Typography variant='caption' color='text.secondary'>{tool.description}</Typography>
                                                </Box>
                                            </MenuItem>
                                        ))
                                    }
                                </Select>
                            </FormControl>
                        </Stack>
                        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, gap: '8px' }}>
                            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                <Stack direction='row' alignItems='center' spacing={0.5} sx={{ flexShrink: 0 }}>
                                    <Typography variant='caption' color='text.secondary'>System</Typography>
                                    <IconButton size='small' onClick={e => openHistory(e, 'system')} disabled={systemHistory.length === 0}><HistoryOutlined sx={{ fontSize: 14 }} /></IconButton>
                                </Stack>
                                <textarea value={system} onChange={e => { setSystem(e.target.value); markDirty() }} style={{ flex: 1, resize: 'none', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 13, minHeight: 0 }} placeholder='Enter system prompt…' />
                            </Box>
                            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                <Stack direction='row' alignItems='center' spacing={0.5} sx={{ flexShrink: 0 }}>
                                    <Typography variant='caption' color='text.secondary'>Prompt</Typography>
                                    <IconButton size='small' onClick={e => openHistory(e, 'prompt')} disabled={promptHistory.length === 0}><HistoryOutlined sx={{ fontSize: 14 }} /></IconButton>
                                </Stack>
                                <textarea value={prompt} onChange={e => { setPrompt(e.target.value); markDirty() }} disabled={promptType === 'artifact'} style={{ flex: 1, resize: 'none', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 13, minHeight: 0 }} placeholder='Enter the prompt template…' />
                            </Box>
                        </Box>
                        <Stack direction='row' spacing={1} sx={{ flex: '0 0 auto', pt: 1 }}>
                            <Button size='small' startIcon={<FileDownload />} onClick={openExportDialog}>Export</Button>
                            <Box sx={{ flex: 1 }} />
                            <Tooltip title='Upload LLM, steps, tools and system to backend'>
                                <span>
                                    <Button variant={configApplied ? 'text' : 'outlined'} startIcon={configApplied ? <CheckCircleOutline color='success' /> : <Upload />} onClick={handleApply} disabled={!llm} color={configApplied ? 'success' : 'primary'}>
                                        {configApplied ? 'Config applied' : 'Apply Config'}
                                    </Button>
                                </span>
                            </Tooltip>
                            <Tooltip title={!configApplied ? 'Apply config first' : `Send ${triggerType} event to the backend`}>
                                <span>
                                    <Button variant='contained' startIcon={<Bolt />} onClick={handleFire} disabled={!configApplied || firing}>
                                        {firing ? 'Firing…' : 'Fire'}
                                    </Button>
                                </span>
                            </Tooltip>
                        </Stack>
                    </Stack>
                )}

                {/* Tab 2: IN */}
                {tab === 2 && (
                    <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: 'action.hover', borderRadius: 1, p: 1, mx: 2, mt: 1 }}>
                        {newContent.filter(item => !('findings' in item || 'report' in item) && (item as IMessage).role !== 'llm').length === 0
                            ? <Typography variant='body2' color='text.disabled'>No input yet — fire an event first.</Typography>
                            : newContent.filter(item => !('findings' in item || 'report' in item) && (item as IMessage).role !== 'llm').map((item, i) => renderItem(item, i))
                        }
                    </Box>
                )}

                {/* Tab 3: OUT */}
                {tab === 3 && (
                    <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: 'action.hover', borderRadius: 1, p: 1, mx: 2, mt: 1 }}>
                        {newContent.filter(item => 'findings' in item || 'report' in item || (item as IMessage).role === 'llm').length === 0
                            ? <Typography variant='body2' color='text.disabled'>No results yet — apply config then fire.</Typography>
                            : newContent.filter(item => 'findings' in item || 'report' in item || (item as IMessage).role === 'llm').map((item, i) => {
                                if ((item as IMessage).role === 'llm') {
                                    const msg = item as IMessage
                                    return (
                                        <Typography key={i} variant='body2' sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', mb: 0.5 }}>
                                            <span style={{ color: 'gray' }}>{new Date(msg.timestamp).toLocaleTimeString()} </span>
                                            {msg.text}
                                        </Typography>
                                    )
                                }
                                const a = item as IAnalysis
                                return (
                                    <Box key={i} sx={{ mb: 1, pb: 1, borderBottom: 1, borderColor: 'divider' }}>
                                        {a.text && <Typography variant='caption' color='text.secondary'>{new Date(a.timestamp).toLocaleTimeString()} {a.text}</Typography>}
                                        {(a.findings ?? []).map((f, fi) => (
                                            <Typography key={fi} variant='body2' sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                                                <b>[{f.level}]</b> {f.description}
                                            </Typography>
                                        ))}
                                        {a.report && <Typography variant='body2' color='text.secondary' sx={{ fontStyle: 'italic', fontSize: 12 }}>Report available</Typography>}
                                    </Box>
                                )
                            })
                        }
                    </Box>
                )}

            </DialogContent>

            <DialogActions>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant='contained' onClick={() => saveAndClose()}>Save</Button>
                    <Button onClick={() => props.onClose()}>Cancel</Button>
                </Box>
            </DialogActions>

            <Menu anchorEl={historyAnchor} open={Boolean(historyAnchor)} onClose={() => setHistoryAnchor(null)} PaperProps={{ sx: { maxHeight: 300, overflowY: 'auto' } }}>
                {historyType === 'spacetype'
                    ? spaceTypeHistory.map((entry, i) => (
                        <MenuItem key={i} onClick={() => selectSpaceTypeHistory(entry)} sx={{ display: 'flex', gap: 1 }}>
                            <Typography variant='body2' sx={{ fontFamily: 'monospace', fontSize: 12, flex: 1 }}>
                                {entry.space} · {entry.type}
                            </Typography>
                            <IconButton size='small' onClick={e => { e.stopPropagation(); removeFromHistory(i) }}>
                                <DeleteOutlined sx={{ fontSize: 14 }} />
                            </IconButton>
                        </MenuItem>
                    ))
                    : currentHistory.map((entry, i) => (
                        <MenuItem key={i} onClick={() => selectHistory(entry)} sx={{ maxWidth: 500, display: 'flex', gap: 1 }}>
                            <Typography variant='body2' noWrap sx={{ fontFamily: 'monospace', fontSize: 12, flex: 1 }}>
                                {entry.length > 80 ? entry.slice(0, 80) + '…' : entry}
                            </Typography>
                            <IconButton size='small' onClick={e => { e.stopPropagation(); removeFromHistory(i) }}>
                                <DeleteOutlined sx={{ fontSize: 14 }} />
                            </IconButton>
                        </MenuItem>
                    ))
                }
            </Menu>

            <Dialog open={showExportDialog} onClose={() => setShowExportDialog(false)} PaperProps={{ sx: { width: 420, height: 340 } }}>
                <DialogTitle>Export playground</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1, px: 3, overflow: 'hidden' }}>
                    <ToggleButtonGroup value={exportMode} exclusive size='small' onChange={(_, v) => { if (v) setExportMode(v) }}>
                        <ToggleButton value='new'>New trigger</ToggleButton>
                        <ToggleButton value='version' disabled={props.pinocchioConfig.triggers.length === 0}>Add version</ToggleButton>
                    </ToggleButtonGroup>
                    <Box sx={{ visibility: exportMode === 'new' ? 'visible' : 'hidden', position: exportMode === 'new' ? 'static' : 'absolute' }}>
                        <TextField label='Trigger ID' variant='standard' value={exportId} onChange={e => setExportId(e.target.value)} fullWidth />
                    </Box>
                    <Box sx={{ visibility: exportMode === 'version' ? 'visible' : 'hidden', position: exportMode === 'version' ? 'static' : 'absolute', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <FormControl variant='standard' fullWidth>
                            <InputLabel>Trigger</InputLabel>
                            <Select value={exportTargetTriggerId} onChange={e => { setExportTargetTriggerId(e.target.value); setExportVersionId('') }}>
                                {props.pinocchioConfig.triggers.map(t => (
                                    <MenuItem key={t.id} value={t.id}>{t.id}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        {(() => {
                            const versionExists = !!exportVersionId.trim() && !!props.pinocchioConfig.triggers.find(t => t.id === exportTargetTriggerId)?.versions.some(v => v.id === exportVersionId.trim())
                            return (
                                <TextField
                                    label='Version ID'
                                    variant='standard'
                                    value={exportVersionId}
                                    onChange={e => setExportVersionId(e.target.value)}
                                    fullWidth
                                    error={versionExists}
                                    helperText={versionExists ? 'This version ID already exists in the selected trigger' : ' '}
                                />
                            )
                        })()}
                    </Box>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    {(() => {
                        const versionExists = exportMode === 'version' && !!exportVersionId.trim() && !!props.pinocchioConfig.triggers.find(t => t.id === exportTargetTriggerId)?.versions.some(v => v.id === exportVersionId.trim())
                        const disabled = exportMode === 'new' ? !exportId.trim() : (!exportTargetTriggerId || !exportVersionId.trim() || versionExists)
                        return <Button variant='contained' onClick={handleExportConfirm} disabled={disabled}>Export</Button>
                    })()}
                    <Button onClick={() => setShowExportDialog(false)}>Cancel</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={showImportDialog} onClose={() => { setShowImportDialog(false); setPendingImportTriggerId(''); setPendingImportVersionId('') }} PaperProps={{ sx: { width: 400, height: 340 } }}>
                <DialogTitle>Import from trigger</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1, px: 3, overflow: 'hidden' }}>
                    <Typography variant='body2' color='warning.main'>
                        This will overwrite the current playground configuration (LLM, steps, tools, system and prompt).
                    </Typography>
                    <FormControl variant='standard' fullWidth>
                        <InputLabel shrink>Trigger</InputLabel>
                        <Select value={pendingImportTriggerId} onChange={e => onImportTriggerChange(e.target.value)} displayEmpty>
                            <MenuItem value=''><Typography color='gray'><em>— select a trigger —</em></Typography></MenuItem>
                            {props.pinocchioConfig.triggers.map(t => (
                                <MenuItem key={t.id} value={t.id}>{t.id}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl variant='standard' fullWidth disabled={!pendingImportTriggerId}>
                        <InputLabel shrink>Version</InputLabel>
                        <Select value={pendingImportVersionId} onChange={e => setPendingImportVersionId(e.target.value)}>
                            {(props.pinocchioConfig.triggers.find(t => t.id === pendingImportTriggerId)?.versions ?? []).map(v => (
                                <MenuItem key={v.id} value={v.id}>{v.id}{v.enabled ? ' ✓' : ''}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button variant='contained' onClick={confirmImportTrigger} disabled={!pendingImportTriggerId || !pendingImportVersionId}>Import</Button>
                    <Button onClick={() => { setShowImportDialog(false); setPendingImportTriggerId(''); setPendingImportVersionId('') }}>Cancel</Button>
                </DialogActions>
            </Dialog>
        </Dialog>
    )
}

export { PinocchioPlayground }
