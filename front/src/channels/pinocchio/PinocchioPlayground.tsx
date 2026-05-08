import React, { useRef, useState } from 'react'
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, FormControlLabel, InputLabel, MenuItem, Select, SelectChangeEvent, Stack, Switch, TextareaAutosize, TextField, Tooltip, Typography } from '@mui/material'
import { ScienceOutlined, Upload, Bolt, FileDownload, CheckCircleOutline } from '@mui/icons-material'
import { EPinocchioCommand, IAnalysis, IConfigTrigger, IConfigTriggerVersion, IMessage, IPinocchioConfig, IPinocchioMessage } from './PinocchioConfig'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType } from '@kwirthmagnify/kwirth-common'
import { useKeyboard } from '../../tools/useKeyboard'

interface IProps {
    pinocchioConfig: IPinocchioConfig
    toolsAvailable: { name: string, description: string }[]
    accessString: string
    instanceId: string
    webSocket: WebSocket
    clusterUrl: string
    content: (IAnalysis | IMessage)[]
    onClose: (newTrigger?: IConfigTrigger) => void
}

const PinocchioPlayground: React.FC<IProps> = (props) => {
    const initialLengthRef = useRef(props.content.length)

    const [llm, setLlm] = useState('')
    const [steps, setSteps] = useState(5)
    const [tools, setTools] = useState<string[]>([])
    const [autoTools, setAutoTools] = useState(false)
    const [toolFilter, setToolFilter] = useState('')
    const [system, setSystem] = useState('')
    const [prompt, setPrompt] = useState('')

    const [configApplied, setConfigApplied] = useState(false)
    const [firing, setFiring] = useState(false)

    const [exportId, setExportId] = useState('')
    const [showExport, setShowExport] = useState(false)
    const [importTriggerId, setImportTriggerId] = useState('')

    useKeyboard()

    const newContent = props.content.slice(initialLengthRef.current)

    const markDirty = () => setConfigApplied(false)

    const handleImportTrigger = (triggerId: string) => {
        setImportTriggerId(triggerId)
        const t = props.pinocchioConfig.triggers.find(tr => tr.id === triggerId)
        if (!t) return
        const v = t.versions.find(v => v.enabled) ?? t.versions[0]
        if (!v) return
        setLlm(v.llm)
        setSteps(v.steps)
        setTools(v.tools)
        setAutoTools(v.autoTools ?? false)
        setSystem(v.system)
        setPrompt(v.prompt)
        markDirty()
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
            prompt: '',
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
                body: JSON.stringify({ space: 'launch', type: 'immediate', data: prompt })
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
        props.onClose(trigger)
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

                {/* ── top bar ── */}
                <Stack direction='row' alignItems='center' spacing={2}>
                    <FormControl variant='standard' sx={{ minWidth: 220 }}>
                        <InputLabel shrink>Import from trigger</InputLabel>
                        <Select value={importTriggerId} onChange={e => handleImportTrigger(e.target.value)} displayEmpty>
                            <MenuItem value=''><em>— select trigger —</em></MenuItem>
                            {props.pinocchioConfig.triggers.map(t => (
                                <MenuItem key={t.id} value={t.id}>{t.id}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <Box flex={1} />
                    {showExport
                        ? <Stack direction='row' alignItems='center' spacing={1}>
                            <TextField
                                size='small'
                                label='Trigger ID'
                                value={exportId}
                                onChange={e => setExportId(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleExport() }}
                                autoFocus
                                sx={{ width: 180 }}
                            />
                            <Button size='small' variant='contained' onClick={handleExport} disabled={!exportId.trim()}>Create</Button>
                            <Button size='small' onClick={() => setShowExport(false)}>Cancel</Button>
                        </Stack>
                        : <Tooltip title='Export current config as a new trigger (spaces: launch.immediate)'>
                            <Button size='small' startIcon={<FileDownload />} onClick={() => setShowExport(true)}>
                                Export as Trigger
                            </Button>
                        </Tooltip>
                    }
                </Stack>

                <Divider />

                {/* ── config ── */}
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
                        <Typography variant='caption' color='text.secondary'>System</Typography>
                        <TextareaAutosize
                            value={system}
                            onChange={e => { setSystem(e.target.value); markDirty() }}
                            minRows={5}
                            maxRows={5}
                            style={{ width: '100%', resize: 'none', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 13, overflowY: 'auto' }}
                            placeholder='Enter system prompt…'
                        />
                    </Box>
                </Stack>

                {/* ── tools + apply ── */}
                <Stack direction='row' alignItems='flex-end' spacing={1}>
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

                <Divider />

                {/* ── prompt + fire ── */}
                <Box sx={{ flex: '0 0 auto' }}>
                    <Typography variant='caption' color='text.secondary'>Prompt / Event data</Typography>
                    <TextareaAutosize
                        value={prompt}
                        onChange={e => setPrompt(e.target.value)}
                        minRows={3}
                        style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 13 }}
                        placeholder='Enter the event data or prompt to send to the LLM…'
                    />
                    <Stack direction='row' justifyContent='flex-end' sx={{ mt: 0.5 }}>
                        <Tooltip title={!configApplied ? 'Apply config first' : 'Send business event launch.immediate to the backend'}>
                            <span>
                                <Button
                                    variant='contained'
                                    size='small'
                                    startIcon={<Bolt />}
                                    onClick={handleFire}
                                    disabled={!configApplied || !prompt.trim() || firing}
                                >
                                    {firing ? 'Firing…' : 'Fire'}
                                </Button>
                            </span>
                        </Tooltip>
                    </Stack>
                </Box>

                <Divider />

                {/* ── results ── */}
                <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: 'action.hover', borderRadius: 1, p: 1, minHeight: 80 }}>
                    <Typography variant='caption' color='text.secondary'>Results</Typography>
                    {newContent.length === 0
                        ? <Typography variant='body2' color='text.disabled' sx={{ ml: 1 }}>No results yet — apply config then fire.</Typography>
                        : newContent.map((item, i) => renderItem(item, i))
                    }
                </Box>

            </DialogContent>

            <DialogActions>
                <Button onClick={() => props.onClose()}>Close</Button>
            </DialogActions>
        </Dialog>
    )
}

export { PinocchioPlayground }
