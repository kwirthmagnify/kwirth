import React, { useState } from 'react'
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, List, ListItemButton, MenuItem, Select, Stack, TextareaAutosize, TextField, Typography } from '@mui/material'
import { IConfigKind, IConfigLlm, IPinocchioConfig } from './PinocchioConfig'
import { objectClone } from '../magnify/Tools'

interface IPinocchioLlmConfigProps {
    onClose:(pc:IPinocchioConfig|undefined) => void
    pinocchioConfig: IPinocchioConfig
}

const PinocchioConfigLlm: React.FC<IPinocchioLlmConfigProps> = (props:IPinocchioLlmConfigProps) => {
    const [msgBox, setMsgBox] = useState(<></>)
    const [config, setConfig] = useState(objectClone(props.pinocchioConfig) as IPinocchioConfig)
    const [id, setId] = useState('')
    const [provider, setProvider] = useState('Google')
    const [model, setModel] = useState('')
    const [key, setKey] = useState('')

    const onKindSelected = (selectedLlm:string) => {
        let l = config.llms.find(llm => llm.id === selectedLlm)
        if (l) {
            setId(l.id)
            setProvider(l.provider)
            setModel(l.model)
            setKey(l.key)
        }
    }
    const onAdd = () => {
        let l:IConfigLlm = {
            id,
            provider,
            model,
            key
        }
        config.llms.push(l)
        setConfig( { ...config })
    }
    const onRemove = () => {
        config.llms = config.llms.filter(l => l.id!==id)
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
                                    config.llms.map( (l, index) =>
                                         <ListItemButton key={index} onClick={() => onKindSelected(l.id)}>
                                            <Stack direction={'column'}>
                                                <Typography>{l.id}</Typography>
                                                <Typography color={'darkgray'} fontSize={12}>{`${l.id}`}</Typography>
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
                            <TextField value={id} onChange={(e) => setId(e.target.value)} placeholder='Enter LLM id'/>
                            <Select value={provider} onChange={(e) => setProvider(e.target.value)} variant='standard' sx={{width:'100%', mr:1}}>
                                { config.providers.map( (prov) => {
                                    return <MenuItem key={prov.name} value={prov.name}>{prov.name}</MenuItem>
                                })}
                            </Select>
                            <TextField value={key} onChange={(e) => setKey(e.target.value)} placeholder='Enter API Key'/>
                        </Stack>
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

export { PinocchioConfigLlm }
