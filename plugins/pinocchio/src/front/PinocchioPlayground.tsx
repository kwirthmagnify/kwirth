import React, { useRef, useState } from 'react'
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, FormControlLabel, IconButton, InputLabel, Menu, MenuItem, Select, SelectChangeEvent, Stack, Switch, TextareaAutosize, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material'
import { ScienceOutlined, Upload, Bolt, FileDownload, CheckCircleOutline, HistoryOutlined, DeleteOutlined } from '@mui/icons-material'
import { EPinocchioCommand, IAnalysis, IConfigTrigger, IConfigTriggerVersion, IMessage, IPinocchioConfig, IPinocchioMessage, IPlaygroundState, kindsAvailable } from './PinocchioConfig'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType } from '@kwirthmagnify/kwirth-common'
import { useKeyboard } from './utils'

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

    const [llm, setLlm] = useState(saved?.llm ?? '')
    const [steps, setSteps] = useState(saved?.steps ?? 5)
    const [tools, setTools] = useState<string[]>(saved?.tools ?? [])
    const [autoTools, setAutoTools] = useState(saved?.autoTools ?? false)
    const [toolFilter, setToolFilter] = useState('')
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

    const [exportId, setExportId] = useState('')
    const [showExport, setShowExport] = useState(false)
    const [showImportDialog, setShowImportDialog] = useState(false)
    const [pendingImportTriggerId, setPendingImportTriggerId] = useState('')

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
        props.onStateChange({ llm, steps, tools, autoTools, system, prompt, eventData, triggerType, artifactKind, eventSpace, eventType, systemHistory: newSystemHistory, promptHistory: newPromptHistory, artifactHistory: newArtifactHistory, businessHistory: newBusinessHistory, spaceTypeHistory: newSpaceTypeHistory })
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

    const confirmImportTrigger = () => {
        const t = props.pinocchioConfig.triggers.find(tr => tr.id === pendingImportTriggerId)
        if (t) {
            if (t.trigger === 'artifact' || t.trigger === 'business') setTriggerType(t.trigger)
            const v = t.versions.find(v => v.enabled) ?? t.versions[0]
            if (v) {
                setLlm(v.llm)
                setSteps(v.steps)
                setTools(v.tools)
                setAutoTools(v.autoTools ?? false)
                setSystem(v.system)
                setPrompt(v.prompt)
                markDirty()
            }
        }
        setShowImportDialog(false)
        setPendingImportTriggerId('')
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
            promptType: 'jinja',
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

    const handleExport = () => {
        if (!exportId.trim()) return
        const trigger: IConfigTrigger = {
            id: exportId.trim(),
            trigger: 'business',
            versions: [{
                id: 'v1',
                enabled: true,
                llm,
                steps,
                tools,
                autoTools,
                system,
                prompt,
                promptType: 'jinja',
                action: 'inform',
                spaces: ['launch.immediate']
            }]
        }
        saveAndClose(trigger)
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
            <DialogTitle>
                <Stack direction='row' alignItems='center' spacing={1}>
                    <ScienceOutlined />
                    <Typography variant='h6' flex={1}>Playground</Typography>
                </Stack>
            </DialogTitle>

            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 1 }}>

                <Stack direction='row' spacing={2} sx={{ flex: '0 0 auto' }}>
                    <Stack spacing={1} sx={{ width: 260, flexShrink: 0 }}>
                        <FormControl variant='standard' fullWidth>
                            <InputLabel>LLM</InputLabel>
                            <Select value={llm} onChange={e => { setLlm(e.target.value); markDirty() }}>
                                {props.pinocchioConfig.llms.map(l => (
                                    <MenuItem key={l.id} value={l.id}>{l.id}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <TextField
                            label='Max steps'
                            type='number'
                            variant='standard'
                            value={steps}
                            onChange={e => { setSteps(Math.max(1, +e.target.value)); markDirty() }}
                            fullWidth
                        />
                    </Stack>

                    <Box flex={1}>
                        <Stack direction='row' alignItems='center' spacing={0.5}>
                            <Typography variant='caption' color='text.secondary'>System</Typography>
                            <IconButton size='small' onClick={e => openHistory(e, 'system')} disabled={systemHistory.length === 0}><HistoryOutlined sx={{ fontSize: 14 }} /></IconButton>
                        </Stack>
                        <Stack direction='row' alignItems='center' spacing={1}>
                            <TextareaAutosize
                                value={system}
                                onChange={e => { setSystem(e.target.value); markDirty() }}
                                minRows={5}
                                maxRows={5}
                                style={{ flex: 1, width: '100%', resize: 'none', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 13, overflowY: 'auto' }}
                                placeholder='Enter system prompt…'
                            />
                            <Stack spacing={1} sx={{ flexShrink: 0 }}>
                                <Button size='small' startIcon={<Upload />} onClick={() => setShowImportDialog(true)}>
                                    Import
                                </Button>
                                {showExport
                                    ? <Stack spacing={0.5}>
                                        <TextField
                                            size='small'
                                            label='Trigger ID'
                                            value={exportId}
                                            onChange={e => setExportId(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleExport() }}
                                            autoFocus
                                            sx={{ width: 140 }}
                                        />
                                        <Stack direction='row' spacing={0.5}>
                                            <Button size='small' variant='contained' onClick={handleExport} disabled={!exportId.trim()}>Create</Button>
                                            <Button size='small' onClick={() => setShowExport(false)}>Cancel</Button>
                                        </Stack>
                                    </Stack>
                                    : <Tooltip title='Export current config as a new trigger (spaces: launch.immediate)'>
                                        <Button size='small' startIcon={<FileDownload />} onClick={() => setShowExport(true)}>
                                            Export
                                        </Button>
                                    </Tooltip>
                                }
                            </Stack>
                        </Stack>
                    </Box>
                </Stack>

                <Divider />

                <Stack direction='row' spacing={1} sx={{ flex: '0 0 auto' }}>
                    <Box flex={1}>
                        <Stack direction='row' alignItems='center' spacing={0.5}>
                            <Typography variant='caption' color='text.secondary'>Prompt</Typography>
                            <IconButton size='small' onClick={e => openHistory(e, 'prompt')} disabled={promptHistory.length === 0}><HistoryOutlined sx={{ fontSize: 14 }} /></IconButton>
                        </Stack>
                        <TextareaAutosize
                            value={prompt}
                            onChange={e => { setPrompt(e.target.value); markDirty() }}
                            minRows={12}
                            maxRows={12}
                            style={{ width: '100%', resize: 'none', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 13, overflowY: 'auto' }}
                            placeholder='Enter the Jinja prompt template…'
                        />
                    </Box>
                    <Box flex={1}>
                        <Stack direction='row' alignItems='center' spacing={0.5}>
                            <Typography variant='caption' color='text.secondary'>Artifact / Event JSON</Typography>
                            <IconButton size='small' onClick={e => openHistory(e, triggerType)} disabled={(triggerType === 'artifact' ? artifactHistory : businessHistory).length === 0}><HistoryOutlined sx={{ fontSize: 14 }} /></IconButton>
                        </Stack>
                        <TextareaAutosize
                            value={eventData}
                            onChange={e => setEventData(e.target.value)}
                            minRows={12}
                            maxRows={12}
                            style={{ width: '100%', resize: 'none', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 13, overflowY: 'auto' }}
                            placeholder='Enter the artifact or JSON payload to send as the business event data…'
                        />
                    </Box>
                </Stack>

                <Stack direction='row' spacing={2}>
                    <Stack direction='row' alignItems='flex-end' spacing={1} sx={{ flex: 1 }}>
                        <FormControlLabel
                            control={<Switch size='small' checked={autoTools} onChange={e => { setAutoTools(e.target.checked); markDirty() }} />}
                            label={<Typography variant='caption'>Auto</Typography>}
                            sx={{ mr: 0, flexShrink: 0 }}
                        />
                        <FormControl variant='standard' disabled={autoTools} sx={{ flex: 1, minWidth: 0 }}>
                            <InputLabel>Tools</InputLabel>
                            <Select multiple value={tools} onChange={onChangeTools} renderValue={sel => autoTools ? `all (${props.toolsAvailable.length})` : (sel as string[]).join(', ')}>
                                <MenuItem disableRipple onClickCapture={e => e.stopPropagation()} sx={{ p: 0.5 }}>
                                    <TextField
                                        size='small'
                                        placeholder='Filter…'
                                        value={toolFilter}
                                        onChange={e => setToolFilter(e.target.value)}
                                        onKeyDown={e => e.stopPropagation()}
                                        fullWidth
                                        variant='outlined'
                                    />
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
                        <Tooltip title='Upload LLM, steps, tools and system to backend'>
                            <span>
                                <Button
                                    variant={configApplied ? 'text' : 'outlined'}
                                    size='small'
                                    startIcon={configApplied ? <CheckCircleOutline color='success' /> : <Upload />}
                                    onClick={handleApply}
                                    disabled={!llm}
                                    color={configApplied ? 'success' : 'primary'}
                                    sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                                >
                                    {configApplied ? 'Config applied' : 'Apply Config'}
                                </Button>
                            </span>
                        </Tooltip>
                    </Stack>
                    <Stack direction='row' alignItems='flex-end' spacing={1} sx={{ flex: 1 }}>
                        <ToggleButtonGroup
                            value={triggerType}
                            exclusive
                            size='small'
                            onChange={(_, v) => { if (v) setTriggerType(v) }}
                            sx={{ flexShrink: 0 }}
                        >
                            <ToggleButton value='business'>Business</ToggleButton>
                            <ToggleButton value='artifact'>Artifact</ToggleButton>
                        </ToggleButtonGroup>
                        {triggerType === 'artifact' ? (
                            <FormControl variant='standard' size='small' sx={{ flex: 1 }}>
                                <InputLabel>Artifact Kind</InputLabel>
                                <Select value={artifactKind} onChange={e => setArtifactKind(e.target.value)}>
                                    {kindsAvailable.map(k => <MenuItem key={k} value={k}>{k}</MenuItem>)}
                                </Select>
                            </FormControl>
                        ) : (
                            <>
                                <TextField
                                    label='Space'
                                    variant='standard'
                                    size='small'
                                    value={eventSpace}
                                    onChange={e => setEventSpace(e.target.value)}
                                    sx={{ flex: 1 }}
                                />
                                <TextField
                                    label='Type'
                                    variant='standard'
                                    size='small'
                                    value={eventType}
                                    onChange={e => setEventType(e.target.value)}
                                    sx={{ flex: 1 }}
                                />
                                <IconButton size='small' onClick={e => openHistory(e, 'spacetype')} disabled={spaceTypeHistory.length === 0} sx={{ alignSelf: 'flex-end', mb: 0.5 }}>
                                    <HistoryOutlined sx={{ fontSize: 14 }} />
                                </IconButton>
                            </>
                        )}
                        <Tooltip title={!configApplied ? 'Apply config first' : `Send ${triggerType} event to the backend`}>
                            <span>
                                <Button
                                    variant='contained'
                                    size='small'
                                    startIcon={<Bolt />}
                                    onClick={handleFire}
                                    disabled={!configApplied || firing}
                                >
                                    {firing ? 'Firing…' : 'Fire'}
                                </Button>
                            </span>
                        </Tooltip>
                    </Stack>
                </Stack>

                <Divider />

                <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: 'action.hover', borderRadius: 1, p: 1, minHeight: 40 }}>
                    <Typography variant='caption' color='text.secondary'>Results</Typography>
                    {newContent.length === 0
                        ? <Typography variant='body2' color='text.disabled' sx={{ ml: 1 }}>No results yet — apply config then fire.</Typography>
                        : newContent.map((item, i) => renderItem(item, i))
                    }
                </Box>

            </DialogContent>

            <DialogActions>
                <Button variant='contained' onClick={() => saveAndClose()}>Save</Button>
                <Button onClick={() => props.onClose()}>Cancel</Button>
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

            <Dialog open={showImportDialog} onClose={() => { setShowImportDialog(false); setPendingImportTriggerId('') }}>
                <DialogTitle>Import from trigger</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1, minWidth: 320 }}>
                    <Typography variant='body2' color='warning.main'>
                        This will overwrite the current playground configuration (LLM, steps, tools, system and prompt).
                    </Typography>
                    <FormControl variant='standard' fullWidth>
                        <Select value={pendingImportTriggerId} onChange={e => setPendingImportTriggerId(e.target.value)} displayEmpty>
                            <MenuItem value=''><Typography color='gray'><em>— select a trigger —</em></Typography></MenuItem>
                            {props.pinocchioConfig.triggers.map(t => (
                                <MenuItem key={t.id} value={t.id}>{t.id}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button variant='contained' onClick={confirmImportTrigger} disabled={!pendingImportTriggerId}>Import</Button>
                    <Button onClick={() => { setShowImportDialog(false); setPendingImportTriggerId('') }}>Cancel</Button>
                </DialogActions>
            </Dialog>
        </Dialog>
    )
}

export { PinocchioPlayground }
