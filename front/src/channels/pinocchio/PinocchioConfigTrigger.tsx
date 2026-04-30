import React, { useState } from 'react'
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, List, ListItemButton, MenuItem, Select, SelectChangeEvent, Stack, TextareaAutosize, TextField, Typography } from '@mui/material'
import { IConfigTrigger, IPinocchioConfig, kindsAvailable } from './PinocchioConfig'
import { objectClone } from '../magnify/Tools'

interface IPinocchioLlmConfigProps {
    onClose: (pc: IPinocchioConfig | undefined) => void
    pinocchioConfig: IPinocchioConfig
    toolsAvailable: string[]
}

const PinocchioConfigTrigger: React.FC<IPinocchioLlmConfigProps> = (props: IPinocchioLlmConfigProps) => {
    const [config, setConfig] = useState(objectClone(props.pinocchioConfig) as IPinocchioConfig)

    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

    const [id, setId] = useState('')
    const [trigger, setTrigger] = useState('artifact')
    const [kind, setKind] = useState<string|undefined>('Pod')
    const [enabled, setEnabled] = useState(false)
    const [system, setSystem] = useState('')
    const [promptType, setPromptType] = useState('artifact')
    const [prompt, setPrompt] = useState('')
    const [action, setAction] = useState<'inform' | 'cancel' | 'repair'>('inform')
    const [llm, setLlm] = useState('')
    const [steps, setSteps] = useState(1)
    const [tools, setTools] = useState<string[]>([])
    const [spaces, setSpaces] = useState<string>('')

    const onKindSelected = (selectedTrigger: IConfigTrigger, index: number) => {
        setId(selectedTrigger.id)
        setTrigger(selectedTrigger.trigger)
        setKind(selectedTrigger.kind)
        setEnabled(selectedTrigger.enabled)
        setSystem(selectedTrigger.system)
        setPromptType(selectedTrigger.promptType)
        setPrompt(selectedTrigger.prompt)
        setAction(selectedTrigger.action)
        setLlm(selectedTrigger.llm)
        setSteps(selectedTrigger.steps)
        setTools(selectedTrigger.tools)
        setSpaces(selectedTrigger.spaces?.join(','))
        setSelectedIndex(index)
    }

    const onNew = () => {
        setSelectedIndex(null)
        setId('')
        setTrigger('artifact')
        setKind('Pod')
        setEnabled(false)
        setSystem('')
        setPromptType('artifact')
        setPrompt('')
        setAction('inform')
        setSteps(1)
        setTools([])
        setSpaces('')
    }

    const onAdd = () => {
        const t: IConfigTrigger = { id, trigger, kind, enabled, system, promptType, prompt, action, llm, steps, tools, spaces: spaces?.split(',') }
        let newTriggers = [...config.triggers]

        if (selectedIndex !== null) 
            newTriggers[selectedIndex] = t
        else
            newTriggers.push(t)
        setConfig({ ...config, triggers: newTriggers })
        onNew()
    }

    const onRemove = () => {
        if (selectedIndex === null) return

        const newTriggers = config.triggers.filter((_, i) => i !== selectedIndex)
        setConfig({ ...config, triggers: newTriggers })
        onNew()
    }

    const onChangeTools = (event: SelectChangeEvent<typeof tools>) => {
        let selectedTools  = event.target.value as string[]
        setTools(selectedTools)
    }

    return (
        <Dialog open={true} PaperProps={{ sx: { width: '80vw', maxWidth: '1200px', height: '80vh' } }}>
            <DialogTitle>Trigger Config</DialogTitle>
            <DialogContent style={{ display: 'flex', height: '100%' }}>

                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', maxWidth: '30%' }}>
                    <Box sx={{ flex: 1, overflowY: 'auto', overflowX:'hidden' }}>
                        <List sx={{ flexGrow: 1, mr: 2, width: '100%' }}>
                            {config.triggers.map((t, index) => (
                                <ListItemButton key={index} selected={selectedIndex === index} onClick={() => onKindSelected(t, index)}>
                                    <Stack direction={'column'}>
                                        <Typography sx={{ fontWeight: selectedIndex === index ? 'bold' : 'normal' }}>
                                            {t.id}
                                        </Typography>
                                        <Typography color={'darkgray'} fontSize={10}>{t.trigger} {t.llm}</Typography>
                                    </Stack>
                                </ListItemButton>
                            ))}
                        </List>
                    </Box>
                </Box>

                <Box sx={{ flex: 1, display: 'flex', alignItems: 'start', padding: '16px' }} >
                    <Stack spacing={1} style={{ width: '100%' }}>
                        <Stack direction={'row'} alignItems={'baseline'}>
                            <TextField value={id} onChange={(e) => setId(e.target.value)} placeholder='Enter Trigger id' label='Trigger ID' variant='standard' fullWidth/>
                            <Typography minWidth={'24px'}></Typography>
                            <Stack direction={'row'} alignItems={'center'}>
                                <Typography>Enabled</Typography>
                                <Checkbox checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                            </Stack>
                        </Stack>
                        <Stack direction={'row'}>
                            <FormControl variant='standard' sx={{ width: '100%', mr: 1 }}>
                                <InputLabel>Trigger</InputLabel>
                                <Select value={trigger} onChange={(e) => { setTrigger(e.target.value); setPromptType('jinja')}} variant='standard'>
                                    {['artifact', 'business'].map((value) => (
                                        <MenuItem key={value} value={value}>{value}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControl variant='standard' sx={{ width: '100%', mr: 1 }}>
                                <InputLabel>Action</InputLabel>
                                <Select value={action} onChange={(e) => setAction(e.target.value as any)} variant='standard'>
                                    {['inform', 'cancel', 'repair'].map((value) => (
                                        <MenuItem key={value} value={value}>{value}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControl variant='standard' sx={{ width: '100%', mr:1}}>
                                <InputLabel>LLM Id</InputLabel>
                                <Select value={llm} onChange={(e) => setLlm(e.target.value)} variant='standard' sx={{ width: '100%' }}>
                                    {config.llms.map((llmItem) => (
                                        <MenuItem key={llmItem.id} value={llmItem.id}>{llmItem.id}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <TextField value={steps} onChange={(e) => setSteps(+e.target.value)} variant='standard' type='number' sx={{width:'30%', mr:1}} label='Steps'/>
                        </Stack>
                        
                        <Stack direction={'row'}>
                            <FormControl variant='standard' sx={{ width: '100%'}}>
                                <Stack direction={'column'}>
                                    <Stack direction={'row'}>
                                        <FormControl variant='standard' sx={{ width: '100%', mr: 1 }}>
                                            <InputLabel>Kind</InputLabel>
                                            <Select value={kind} onChange={(e) => setKind(e.target.value)} disabled={trigger!=='artifact'} variant='standard'>
                                                {kindsAvailable.map((value) => (
                                                    <MenuItem key={value} value={value}>{value}</MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                        <TextField value={spaces} onChange={(e) => setSpaces(e.target.value)} disabled={trigger==='artifact'} placeholder='Enter comma-separated spaces' label='Spaces' variant='standard' sx={{mr:1}} fullWidth/>
                                        <FormControl variant='standard' sx={{ width: '100%'}}>
                                            <InputLabel>Tools</InputLabel>
                                            <Select onChange={onChangeTools} multiple value={tools} renderValue={(selected) => selected.join(', ')} variant='standard'>
                                                { props.toolsAvailable.map( (tool:string) => {
                                                    return (
                                                        <MenuItem key={tool} value={tool}>
                                                            <Checkbox checked={tools.includes(tool)} />
                                                            <Typography>{tool}</Typography>
                                                        </MenuItem>
                                                    )
                                                })}
                                            </Select>
                                        </FormControl>
                                    </Stack>
                                </Stack>
                            </FormControl>
                        </Stack>

                        <TextareaAutosize value={system} onChange={(e) => setSystem(e.target.value)} style={{ minHeight: '80px', padding: '8px' }} placeholder='Enter system text' />
                        <FormControl variant='standard' sx={{ width: '100%'}}>
                            <InputLabel>Prompt type</InputLabel>
                            <Select value={promptType} onChange={(e) => setPromptType(e.target.value as any)} variant='standard' sx={{ width: '100%' }} label='Action'>
                                <MenuItem value={'artifact'}  disabled={trigger==='business'}>artifact</MenuItem>
                                <MenuItem value={'jinja'}>jinja</MenuItem>
                            </Select>
                        </FormControl>
                        <TextareaAutosize value={prompt} onChange={(e) => setPrompt(e.target.value)} style={{ minHeight: '80px', padding: '8px' }} placeholder='Enter prompt' disabled={promptType==='artifact'}/>

                        <Stack direction={'row'} spacing={1}>
                            <Button variant='outlined' onClick={onNew} color='primary'>New</Button>
                            <Typography flex={1} />
                            <Button variant='text' color='error' onClick={onRemove} disabled={selectedIndex === null}>Remove</Button>
                            <Button variant='contained' onClick={onAdd}>{selectedIndex !== null ? 'Update' : 'Add'}</Button>
                        </Stack>
                    </Stack>
                </Box>
            </DialogContent>

            <DialogActions>
                <Button onClick={() => props.onClose(config)}>OK</Button>
                <Button onClick={() => props.onClose(undefined)}>Cancel</Button>
            </DialogActions>
        </Dialog>
    )
}

export { PinocchioConfigTrigger }