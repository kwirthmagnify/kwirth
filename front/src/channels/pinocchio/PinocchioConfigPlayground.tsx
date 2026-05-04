import React, { useState } from 'react'
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, List, ListItemButton, MenuItem, Select, SelectChangeEvent, Stack, TextareaAutosize, TextField, Typography } from '@mui/material'
import { EPinocchioCommand, IConfigTrigger, IPinocchioConfig, IPinocchioMessage, IPlaygroundRequest, kindsAvailable } from './PinocchioConfig'
import { objectClone } from '../magnify/Tools'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType } from '@kwirthmagnify/kwirth-common'
import { useKeyboard } from '../../tools/useKeyboard'

interface IPinocchioLlmConfigProps {
    onClose: () => void
    pinocchioConfig: IPinocchioConfig
    providersAvailable: string[]
    toolsAvailable: string[]
    accessString: string
    webSocket: WebSocket
    instanceId: string
}

const PinocchioPlayground: React.FC<IPinocchioLlmConfigProps> = (props: IPinocchioLlmConfigProps) => {
    const [config, setConfig] = useState(objectClone(props.pinocchioConfig) as IPinocchioConfig)

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

    useKeyboard()
    
    const onLaunch = () => {
        let msg:IPinocchioMessage = {
            channel: 'pinocchio',
            msgtype: 'pinocchiomessage',
            id: '1',
            accessKey: props.accessString!,
            instance: props.instanceId,
            command: EPinocchioCommand.PLAYGROUND,
            action: EInstanceMessageAction.COMMAND,
            flow: EInstanceMessageFlow.REQUEST,
            type: EInstanceMessageType.DATA,
            data: {
                id: 'playground',
                enabled: true,
                action: 'inform',
                trigger,
                llm,
                steps,
                kind,
                spaces: spaces.split(','),
                tools,
                promptType,
                system,
                prompt
            } satisfies IConfigTrigger
        }
        props.webSocket?.send(JSON.stringify(msg))
    }

    const onChangeTools = (event: SelectChangeEvent<typeof tools>) => {
        let selectedTools  = event.target.value as string[]
        setTools(selectedTools)
    }

    return (
        <Dialog open={true} PaperProps={{ sx: { width: '80vw', maxWidth: '1200px', height: '75vh' } }}>
            <DialogTitle>Playground</DialogTitle>
            <DialogContent style={{ display: 'flex', height: '100%' }}>
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'start', padding: '8px' }} >
                    <Stack spacing={1} style={{ width: '100%' }}>
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
                                        <FormControl variant='standard' sx={{ width: '100%', mr:1}}>
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
                                        <FormControl variant='standard' sx={{ width: '100%'}}>
                                            <InputLabel>Prompt type</InputLabel>
                                            <Select value={promptType} onChange={(e) => setPromptType(e.target.value as any)} variant='standard' sx={{ width: '100%' }} label='Action'>
                                                <MenuItem value={'artifact'}  disabled={trigger==='business'}>artifact</MenuItem>
                                                <MenuItem value={'jinja'}>jinja</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </Stack>
                                </Stack>
                            </FormControl>
                        </Stack>

                        <Stack direction={'row'} width={'100%'} spacing={1}>
                            <TextareaAutosize value={system} onChange={(e) => setSystem(e.target.value)} style={{ minHeight: '150px', width:'100%' }} placeholder='Enter system text'/>
                            <TextareaAutosize value={prompt} onChange={(e) => setPrompt(e.target.value)} style={{ minHeight: '150px', width:'100%' }} placeholder='Enter prompt' disabled={promptType==='artifact'}/>
                        </Stack>

                        <TextareaAutosize value={prompt} onChange={(e) => setPrompt(e.target.value)} style={{ minHeight: '150px', width:'100%' }} placeholder='Results'/>

                        <Stack direction={'row'} spacing={1} justifyContent={'end'}>
                            <Button variant='outlined' onClick={onLaunch} color='primary'>Launch</Button>
                        </Stack>
                    </Stack>
                </Box>
            </DialogContent>

            <DialogActions>
                <Button onClick={() => props.onClose()}>Close</Button>
            </DialogActions>
        </Dialog>
    )
}

export { PinocchioPlayground }