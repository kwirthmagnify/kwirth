import React, { useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, IconButton, InputLabel, List, ListItemButton, MenuItem, Select, SelectChangeEvent, Stack, Switch, TextField, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import CloneIcon from '@mui/icons-material/ContentCopy'
import { EK8sEvent, IConfigTrigger, IConfigTriggerVersion, IPinocchioConfig, k8sEventsAvailable, kindsAvailable } from './PinocchioConfig'
import { objectClone, MsgBoxButtons, MsgBoxOkWarning, MsgBoxYesNo } from './utils'
import { useKeyboard } from '@kwirthmagnify/kwirth-common-front'
import { ToolSelector as _ToolSelector } from '@kwirthmagnify/kwirth-common-ai/front'
const ToolSelector = typeof _ToolSelector === 'function' ? _ToolSelector : () => null

interface IPinocchioLlmConfigProps {
    onClose: (pc: IPinocchioConfig | undefined) => void
    pinocchioConfig: IPinocchioConfig
    toolsAvailable: { name: string, description: string }[]
}

const PinocchioConfigTrigger: React.FC<IPinocchioLlmConfigProps> = (props: IPinocchioLlmConfigProps) => {
    const [config, setConfig] = useState(objectClone(props.pinocchioConfig) as IPinocchioConfig)

    const [selectedTriggerIndex, setSelectedTriggerIndex] = useState<number | null>(null)
    const [newTriggerId, setNewTriggerId] = useState('')
    const [triggerId, setTriggerId] = useState('')
    const [triggerType, setTriggerType] = useState('artifact')
    const [triggerKind, setTriggerKind] = useState('')
    const [triggerK8sEvent, setTriggerK8sEvent] = useState<EK8sEvent | ''>('')

    const [selectedVersionIndex, setSelectedVersionIndex] = useState<number | null>(null)

    const [msgBox, setMsgBox] = useState(<></>)

    // version editor fields
    const [versionId, setVersionId] = useState('')
    const [description, setDescription] = useState('')
    const [enabled, setEnabled] = useState(true)
    const [system, setSystem] = useState('')
    const [promptType, setPromptType] = useState('jinja')
    const [prompt, setPrompt] = useState('')
    const [action, setAction] = useState<'inform' | 'cancel' | 'repair'>('inform')
    const [llm, setLlm] = useState('')
    const [steps, setSteps] = useState(1)
    const [tools, setTools] = useState<string[]>([])
    const [autoTools, setAutoTools] = useState(false)
    const [spaces, setSpaces] = useState('')

    useKeyboard(() => props.onClose(undefined))

    const selectedTrigger = selectedTriggerIndex !== null ? config.triggers[selectedTriggerIndex] : null

    const clearVersionEditor = () => {
        setVersionId('')
        setDescription('')
        setEnabled(true)
        setSystem('')
        setPromptType('jinja')
        setPrompt('')
        setAction('inform')
        setLlm('')
        setSteps(1)
        setTools([])
        setAutoTools(false)
        setSpaces('')
    }

    const onTriggerSelect = (index: number) => {
        setSelectedTriggerIndex(index)
        setTriggerId(config.triggers[index].id)
        setTriggerType(config.triggers[index].trigger)
        setTriggerKind(config.triggers[index].kind ?? '')
        setTriggerK8sEvent(config.triggers[index].k8sEvent ?? '')
        setSelectedVersionIndex(null)
        clearVersionEditor()
    }

    const onTriggerIdChange = (newId: string) => {
        if (selectedTriggerIndex === null) return
        setTriggerId(newId)
        const newTriggers = [...(config.triggers ?? [])]
        newTriggers[selectedTriggerIndex] = { ...newTriggers[selectedTriggerIndex], id: newId }
        setConfig(c => ({ ...c, triggers: newTriggers }))
    }

    const onTriggerTypeChange = (newType: string) => {
        if (selectedTriggerIndex === null) return
        setTriggerType(newType)
        const newTriggers = [...(config.triggers ?? [])]
        newTriggers[selectedTriggerIndex] = { ...newTriggers[selectedTriggerIndex], trigger: newType }
        setConfig(c => ({ ...c, triggers: newTriggers }))
    }

    const onTriggerKindChange = (newKind: string) => {
        if (selectedTriggerIndex === null) return
        setTriggerKind(newKind)
        const newTriggers = [...(config.triggers ?? [])]
        newTriggers[selectedTriggerIndex] = { ...newTriggers[selectedTriggerIndex], kind: newKind }
        setConfig(c => ({ ...c, triggers: newTriggers }))
    }

    const onTriggerK8sEventChange = (newEvent: EK8sEvent | '') => {
        if (selectedTriggerIndex === null) return
        setTriggerK8sEvent(newEvent)
        const newTriggers = [...(config.triggers ?? [])]
        newTriggers[selectedTriggerIndex] = { ...newTriggers[selectedTriggerIndex], k8sEvent: newEvent || undefined }
        setConfig(c => ({ ...c, triggers: newTriggers }))
    }

    const onTriggerAdd = () => {
        const id = newTriggerId.trim() || `trigger-${(config.triggers ?? []).length + 1}`
        const t: IConfigTrigger = { id, trigger: 'artifact', versions: [] }
        const newTriggers = [...(config.triggers ?? []), t]
        setConfig({ ...config, triggers: newTriggers })
        setSelectedTriggerIndex(newTriggers.length - 1)
        setSelectedVersionIndex(null)
        clearVersionEditor()
        setNewTriggerId('')
    }

    const uniqueId = (base: string, existing: string[]): string => {
        let id = base + '-copy'
        while (existing.includes(id)) id += '-copy'
        return id
    }

    const onTriggerClone = (idx?: number) => {
        const i = idx ?? selectedTriggerIndex
        if (i === null || i === undefined) return
        const source = config.triggers[i]
        const id = uniqueId(source.id, config.triggers.map(t => t.id))
        const cloned: IConfigTrigger = { ...objectClone(source), id }
        const newTriggers = [...config.triggers, cloned]
        setConfig(c => ({ ...c, triggers: newTriggers }))
        setSelectedTriggerIndex(newTriggers.length - 1)
        setSelectedVersionIndex(null)
        clearVersionEditor()
    }

    const onVersionClone = () => {
        if (selectedTriggerIndex === null || selectedVersionIndex === null) return
        const versions = config.triggers[selectedTriggerIndex].versions ?? []
        const source = versions[selectedVersionIndex]
        const id = uniqueId(source.id, versions.map(v => v.id))
        const cloned: IConfigTriggerVersion = { ...objectClone(source), id, enabled: false }
        const newTriggers = [...config.triggers]
        newTriggers[selectedTriggerIndex] = {
            ...newTriggers[selectedTriggerIndex],
            versions: [...versions, cloned]
        }
        setConfig(c => ({ ...c, triggers: newTriggers }))
    }

    const onTriggerDelete = (idx?: number) => {
        const i = idx ?? selectedTriggerIndex
        if (i === null || i === undefined) return
        const t = config.triggers[i]
        setMsgBox(MsgBoxYesNo('Delete trigger', `Delete trigger "${t.id}"?`, setMsgBox, (a: MsgBoxButtons) => {
            if (a !== MsgBoxButtons.Yes) return
            const newTriggers = (config.triggers ?? []).filter((_, j) => j !== i)
            setConfig(c => ({ ...c, triggers: newTriggers }))
            setSelectedTriggerIndex(null)
            setSelectedVersionIndex(null)
            clearVersionEditor()
        }))
    }

    const onVersionSelect = (v: IConfigTriggerVersion, index: number) => {
        setSelectedVersionIndex(index)
        setVersionId(v.id)
        setDescription(v.description ?? '')
        setEnabled(v.enabled)
        setSystem(v.system)
        setPromptType(v.promptType)
        setPrompt(v.prompt)
        setAction(v.action)
        setLlm(v.llm)
        setSteps(v.steps)
        setTools(v.tools)
        setAutoTools(v.autoTools ?? false)
        setSpaces(v.spaces?.join(',') ?? '')
    }

    const onNewVersion = () => {
        setSelectedVersionIndex(null)
        clearVersionEditor()
    }

    const onVersionSave = () => {
        if (selectedTriggerIndex === null) return
        const existingVersions = config.triggers[selectedTriggerIndex].versions ?? []
        const duplicate = existingVersions.some((v, i) => v.id === versionId.trim() && i !== selectedVersionIndex)
        if (duplicate) {
            setMsgBox(MsgBoxOkWarning('Duplicate version', `A version with id "${versionId.trim()}" already exists.`, setMsgBox))
            return
        }
        const v: IConfigTriggerVersion = { id: versionId.trim(), description, enabled, system, promptType, prompt, action, llm, steps, tools, autoTools, spaces: spaces.split(',').filter(Boolean) }
        const newTriggers = [...(config.triggers ?? [])]
        let versions = [...existingVersions]
        if (enabled)
            versions = versions.map((ver, i) => i === selectedVersionIndex ? ver : { ...ver, enabled: false })
        if (selectedVersionIndex !== null)
            versions[selectedVersionIndex] = v
        else
            versions.push(v)
        newTriggers[selectedTriggerIndex] = { ...newTriggers[selectedTriggerIndex], versions }
        setConfig({ ...config, triggers: newTriggers })
        onNewVersion()
    }

    const onVersionDelete = () => {
        if (selectedTriggerIndex === null || selectedVersionIndex === null) return
        const v = config.triggers[selectedTriggerIndex].versions[selectedVersionIndex]
        setMsgBox(MsgBoxYesNo('Delete version', `Delete version "${v.id}"?`, setMsgBox, (a: MsgBoxButtons) => {
            if (a !== MsgBoxButtons.Yes) return
            const newTriggers = [...(config.triggers ?? [])]
            const versions = (newTriggers[selectedTriggerIndex!].versions ?? []).filter((_, i) => i !== selectedVersionIndex)
            newTriggers[selectedTriggerIndex!] = { ...newTriggers[selectedTriggerIndex!], versions }
            setConfig(c => ({ ...c, triggers: newTriggers }))
            onNewVersion()
        }))
    }

    const onVersionToggle = (vIndex: number) => {
        if (selectedTriggerIndex === null) return
        const newTriggers = [...(config.triggers ?? [])]
        const versions = [...(newTriggers[selectedTriggerIndex].versions ?? [])]
        const enabling = !versions[vIndex].enabled
        newTriggers[selectedTriggerIndex] = {
            ...newTriggers[selectedTriggerIndex],
            versions: versions.map((v, i) => ({ ...v, enabled: enabling ? i === vIndex : i === vIndex ? false : v.enabled }))
        }
        setConfig({ ...config, triggers: newTriggers })
        if (vIndex === selectedVersionIndex) setEnabled(enabling)
    }

    const onChangeTools = (event: SelectChangeEvent<typeof tools>) => {
        setTools(event.target.value as string[])
    }

    return (<>
        <Dialog open={true} PaperProps={{ sx: { width: '90vw', maxWidth: '1500px', height: '82vh' } }}>
            <DialogTitle>Trigger Config</DialogTitle>
            <DialogContent sx={{ display: 'flex', height: '100%', overflow: 'hidden', py: 1, px: 2 }}>

                {/* ── Left panel ── */}
                <Box sx={{ flex: '0 0 260px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', pr: 1 }}>

                    {/* Triggers */}
                    <Typography variant='caption' color='text.secondary' sx={{ fontWeight: 'bold', px: 0.5, pt: 0.5 }}>Triggers</Typography>
                    <Box sx={{ flex: '0 0 auto', maxHeight: '40%', overflowY: 'auto', overflowX: 'hidden' }}>
                        <List dense sx={{ py: 0 }}>
                            {(config.triggers ?? []).map((t, index) => (
                                <ListItemButton key={index} selected={selectedTriggerIndex === index} onClick={() => onTriggerSelect(index)} dense sx={{ pr: 0.5 }}>
                                    <Stack direction='column' sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography variant='body2' sx={{ fontWeight: selectedTriggerIndex === index ? 'bold' : 'normal' }}>{t.id}</Typography>
                                        <Typography color='textSecondary' variant='caption'>{t.trigger}{t.kind ? ` · ${t.kind}` : ''}</Typography>
                                    </Stack>
                                    <IconButton size='small' onClick={e => { e.stopPropagation(); onTriggerClone(index) }} sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}><CloneIcon sx={{ fontSize: 14 }} /></IconButton>
                                    <IconButton size='small' color='error' onClick={e => { e.stopPropagation(); onTriggerDelete(index) }} sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}><DeleteIcon sx={{ fontSize: 14 }} /></IconButton>
                                </ListItemButton>
                            ))}
                        </List>
                    </Box>
                    <Stack direction='row' spacing={0.5} alignItems='center' sx={{ px: 0.5, pt: 0.5, pb: 0.5 }}>
                        <TextField
                            size='small'
                            value={newTriggerId}
                            onChange={e => setNewTriggerId(e.target.value)}
                            placeholder='Trigger id'
                            variant='outlined'
                            fullWidth
                            inputProps={{ style: { fontSize: 12, padding: '4px 6px' } }}
                            onKeyDown={e => { if (e.key === 'Enter') onTriggerAdd() }}
                        />
                        <IconButton size='small' onClick={onTriggerAdd}><AddIcon fontSize='small' /></IconButton>
                    </Stack>

                    <Divider sx={{ my: 0.5 }} />

                    {/* Versions */}
                    <Typography variant='caption' color='text.secondary' sx={{ fontWeight: 'bold', px: 0.5 }}>
                        Versions{selectedTrigger ? ` — ${selectedTrigger.id}` : ''}
                    </Typography>
                    <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                        <List dense sx={{ py: 0 }}>
                            {(selectedTrigger?.versions ?? []).map((v, index) => (
                                <ListItemButton key={index} selected={selectedVersionIndex === index} onClick={() => onVersionSelect(v, index)} dense sx={{ py: 0.5 }}>
                                    <Switch size='small' checked={v.enabled} onChange={() => onVersionToggle(index)} onClick={e => e.stopPropagation()} sx={{ mr: 0.5 }} />
                                    <Stack direction='column'>
                                        <Typography variant='body2' sx={{ fontWeight: selectedVersionIndex === index ? 'bold' : 'normal' }}>{v.id}</Typography>
                                        {v.description && <Typography variant='caption' color='text.secondary' sx={{ lineHeight: 1.2 }}>{v.description}</Typography>}
                                    </Stack>
                                </ListItemButton>
                            ))}
                        </List>
                    </Box>
                </Box>

                {/* ── Right panel: version editor ── */}
                <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: '8px 8px 8px 16px', minHeight: 0 }}>
                    <Stack spacing={1} sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <Stack direction='row' spacing={1}>
                            <Box sx={{ flex: 1, display: 'flex', gap: 1 }}>
                                <TextField value={triggerId} onChange={e => onTriggerIdChange(e.target.value)} placeholder='Trigger id' label='Trigger ID' variant='standard' fullWidth disabled={selectedTriggerIndex === null} />
                                <FormControl variant='standard' fullWidth disabled={selectedTriggerIndex === null}>
                                    <InputLabel>Trigger type</InputLabel>
                                    <Select value={triggerType} onChange={e => onTriggerTypeChange(e.target.value)} variant='standard'>
                                        <MenuItem value='artifact'>artifact</MenuItem>
                                        <MenuItem value='business'>business</MenuItem>
                                    </Select>
                                </FormControl>
                            </Box>
                            <Box sx={{ flex: 1, display: 'flex', gap: 1 }}>
                                {triggerType === 'artifact' && (
                                    <FormControl variant='standard' fullWidth disabled={selectedTriggerIndex === null}>
                                        <InputLabel>Kind</InputLabel>
                                        <Select value={triggerKind} onChange={e => onTriggerKindChange(e.target.value)} variant='standard'>
                                            {kindsAvailable.map(k => <MenuItem key={k} value={k}>{k}</MenuItem>)}
                                        </Select>
                                    </FormControl>
                                )}
                                {triggerType === 'artifact' && (
                                    <FormControl variant='standard' fullWidth disabled={selectedTriggerIndex === null}>
                                        <InputLabel>K8s Event</InputLabel>
                                        <Select value={triggerK8sEvent} onChange={e => onTriggerK8sEventChange(e.target.value as EK8sEvent | '')} variant='standard'>
                                            <MenuItem value=''><em>Any</em></MenuItem>
                                            {k8sEventsAvailable.map(ev => <MenuItem key={ev} value={ev}>{ev}</MenuItem>)}
                                        </Select>
                                    </FormControl>
                                )}
                                {triggerType === 'business' && (
                                    <TextField value={spaces} onChange={e => setSpaces(e.target.value)} placeholder='space.type,...' label='Spaces' variant='standard' fullWidth disabled={selectedTriggerIndex === null} />
                                )}
                                <TextField value={versionId} onChange={e => setVersionId(e.target.value)} placeholder='Version id' label='Version ID' variant='standard' fullWidth disabled={selectedTriggerIndex === null} />
                            </Box>
                        </Stack>
                        <TextField value={description} onChange={e => setDescription(e.target.value)} placeholder='Short description' label='Description' variant='standard' fullWidth disabled={selectedTriggerIndex === null} />
                        <Stack direction={'row'} alignItems='flex-end' spacing={1}>
                            <FormControl variant='standard' sx={{ minWidth: 100 }}>
                                <InputLabel>Action</InputLabel>
                                <Select value={action} onChange={e => setAction(e.target.value as any)} variant='standard' disabled={selectedTriggerIndex === null}>
                                    {['inform', 'cancel', 'repair'].map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
                                </Select>
                            </FormControl>
                            <FormControl variant='standard' sx={{ minWidth: 120 }}>
                                <InputLabel>LLM</InputLabel>
                                <Select value={llm} onChange={e => setLlm(e.target.value)} variant='standard' disabled={selectedTriggerIndex === null}>
                                    {config.llms.map(l => <MenuItem key={l.id} value={l.id}>{l.id}</MenuItem>)}
                                </Select>
                            </FormControl>
                            <TextField value={steps} onChange={e => setSteps(+e.target.value)} variant='standard' type='number' sx={{ width: 60 }} label='Steps' disabled={selectedTriggerIndex === null} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <ToolSelector
                                    tools={props.toolsAvailable}
                                    selected={tools}
                                    autoTools={autoTools}
                                    disabled={selectedTriggerIndex === null}
                                    onChange={(sel, auto) => { setTools(sel); setAutoTools(auto) }}
                                />
                            </Box>
                        </Stack>

                        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, gap: 1 }}>
                            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                <Typography variant='caption' color='text.secondary'>System</Typography>
                                <textarea value={system} onChange={e => setSystem(e.target.value)} style={{ flex: 1, resize: 'none', boxSizing: 'border-box', padding: '6px', fontFamily: 'monospace', fontSize: 12, minHeight: 0 }} placeholder='System prompt' disabled={selectedTriggerIndex === null} />
                            </Box>
                            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 0.5, flexShrink: 0 }}>
                                    <Typography variant='caption' color='text.secondary'>Prompt</Typography>
                                    <FormControl variant='standard' sx={{ minWidth: 100 }}>
                                        <Select value={promptType} onChange={e => setPromptType(e.target.value)} variant='standard' disabled={selectedTriggerIndex === null} sx={{ fontSize: 12 }}>
                                            <MenuItem value='artifact'>artifact</MenuItem>
                                            <MenuItem value='jinja'>jinja</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Stack>
                                <textarea value={prompt} onChange={e => setPrompt(e.target.value)} style={{ flex: 1, resize: 'none', boxSizing: 'border-box', padding: '6px', fontFamily: 'monospace', fontSize: 12, minHeight: 0 }} placeholder='Prompt' disabled={selectedTriggerIndex === null || promptType === 'artifact'} />
                            </Box>
                        </Box>

                        <Stack direction={'row'} spacing={1}>
                            <Button variant='outlined' onClick={onNewVersion} disabled={selectedTriggerIndex === null}>New</Button>
                            <Button variant='outlined' startIcon={<CloneIcon fontSize='small' />} onClick={onVersionClone} disabled={selectedVersionIndex === null}>Clone</Button>
                            <Typography flex={1} />
                            <Button variant='text' color='error' onClick={onVersionDelete} disabled={selectedVersionIndex === null}>Remove</Button>
                            <Button variant='contained' onClick={onVersionSave} disabled={selectedTriggerIndex === null || !versionId.trim()}>{selectedVersionIndex !== null ? 'Update' : 'Add'}</Button>
                        </Stack>
                    </Stack>
                </Box>
            </DialogContent>

            <DialogActions>
                <Button variant='outlined' onClick={() => props.onClose(config)}>OK</Button>
                <Button variant='outlined' onClick={() => props.onClose(undefined)}>Cancel</Button>
            </DialogActions>
        </Dialog>
        {msgBox}
    </>)
}

export { PinocchioConfigTrigger }
