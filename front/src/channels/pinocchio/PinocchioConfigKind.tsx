import React, { useState } from 'react'
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, List, ListItemButton, MenuItem, Select, Stack, TextareaAutosize, TextField, Typography } from '@mui/material'
import { IConfigKind, IPinocchioConfig } from './PinocchioConfig'
import { objectClone } from '../magnify/Tools'

interface IPinocchioLlmConfigProps {
    onClose:(pc:IPinocchioConfig|undefined) => void
    pinocchioConfig: IPinocchioConfig
}

const PinocchioConfigKind: React.FC<IPinocchioLlmConfigProps> = (props:IPinocchioLlmConfigProps) => {
    const [msgBox, setMsgBox] = useState(<></>)
    const [config, setConfig] = useState(objectClone(props.pinocchioConfig) as IPinocchioConfig)
    const [kind, setKind] = useState('Pod')
    const [system, setSystem] = useState('')
    const [prompt, setPrompt] = useState('')
    const [action, setAction] = useState<'inform'|'cancel'|'repair'>('inform')
    const [llm, setLlm] = useState('')

    const onKindSelected = (selectedKind:string) => {
        let k = config.kinds.find(kind => kind.kind === selectedKind)
        if (k) {
            setKind(k.kind)
            setSystem(k.system)
            setPrompt(k.prompt)
            setAction(k.action)
        }
    }
    const onAdd = () => {
        let k:IConfigKind={
            kind,
            system,
            prompt,
            action,
            llm
        }
        config.kinds.push(k)
        setConfig( { ...config })
    }
    const onRemove = () => {
        config.kinds = config.kinds.filter(k => k.kind!==kind)
        setConfig( { ...config })
    }

    return (<>
        <Dialog open={true} PaperProps={{ sx: { width: '80vw', maxWidth: '1200px', height: '60vh' }}}>
            <DialogTitle>LLM Config</DialogTitle>
            <DialogContent style={{ display:'flex', height:'100%'}}>
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', maxWidth: 'calc(30% - 8px)'}}>
                    <Box sx={{ flex: 1, overflowY: 'auto' }}>
                        <div style={{ flex:0.9, overflowY: 'auto', overflowX:'hidden'}} >
                            <List sx={{flexGrow:1, mr:2, width:'50vh', overflowY:'auto' }}>
                                {
                                    config.kinds.map( (k, index) =>
                                         <ListItemButton key={index} onClick={() => onKindSelected(k.kind)}>
                                            <Stack direction={'column'}>
                                                <Typography>{k.kind}</Typography>
                                                <Typography color={'darkgray'} fontSize={12}>{`${k.llm}`}</Typography>
                                            </Stack>
                                        </ListItemButton>
                                    )
                                }
                            </List>                            
                        </div>
                    </Box>
                </Box>

                <Box sx={{ flex: 1, display: 'flex', alignItems: 'start', padding: '16px'}} >
                    <Stack spacing={1} style={{width:'100%'}}>
                        <Stack direction={'row'}>
                            <Select value={kind} onChange={(e) => setKind(e.target.value)} variant='standard' sx={{width:'100%', mr:1}}>
                                { ['Pod', 'Service','Ingress','HTTPRoute'].map( (value) => {
                                    return <MenuItem key={value} value={value} disabled={config.kinds.some(k => k.kind===value)}>{value}</MenuItem>
                                })}
                            </Select>
                            <Select value={action} onChange={(e) => setAction(e.target.value)} variant='standard' sx={{width:'100%', mr:1}}>
                                { ['inform', 'cancel','repair'].map( (value) => {
                                    return <MenuItem key={value} value={value}>{value}</MenuItem>
                                })}
                            </Select>
                            <Select value={llm} onChange={(e) => setLlm(e.target.value)} variant='standard' sx={{width:'100%'}}>
                                { config.llms.map( (llm) => {
                                    return <MenuItem key={llm.id} value={llm.id}>{llm.id}</MenuItem>
                                })}
                            </Select>
                        </Stack>
                        <TextareaAutosize value={system} onChange={(e) => setSystem(e.target.value)} style={{minHeight:'150px'}} placeholder='Enter system text'></TextareaAutosize>
                        <TextareaAutosize value={prompt} onChange={(e) => setPrompt(e.target.value)} style={{minHeight:'150px'}} placeholder='Enter prompt'></TextareaAutosize>
                        <Stack direction={'row'}>
                            <Typography flex={1}/>
                            <Button onClick={onRemove}>remove</Button>
                            <Button onClick={onAdd}>add</Button>
                        </Stack>
                    </Stack>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => props.onClose(config)}>ok</Button>
                <Button onClick={() => props.onClose(undefined)}>cancel</Button>
            </DialogActions>
        </Dialog>
        {msgBox}
    </>)
}

export { PinocchioConfigKind }
