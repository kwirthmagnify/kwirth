import React, { useState } from 'react'
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, List, ListItemButton, MenuItem, Select, Stack, TextField, Typography } from '@mui/material'
import { IConfigLlm, IConfigProvider, IPinocchioConfig } from './PinocchioConfig'
import { objectClone } from '../magnify/Tools'

interface IPinocchioLlmConfigProps {
    onClose: (pc: IPinocchioConfig | undefined) => void
    providers: IConfigProvider[]
    pinocchioConfig: IPinocchioConfig
}

const PinocchioConfigLlm: React.FC<IPinocchioLlmConfigProps> = (props: IPinocchioLlmConfigProps) => {
    const [config, setConfig] = useState(objectClone(props.pinocchioConfig) as IPinocchioConfig)
    
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

    const [id, setId] = useState('')
    const [provider, setProvider] = useState('google')
    const [model, setModel] = useState('')
    const [useProviderKey, setUseProviderKey] = useState(true)
    const [key, setKey] = useState('')

    const onLlmSelected = (index: number) => {
        const l = config.llms[index]
        if (l) {
            setId(l.id)
            setProvider(l.provider)
            setModel(l.model)
            setUseProviderKey(l.useProviderKey)
            setKey(l.key)
            setSelectedIndex(index)
        }
    }

    const onNew = () => {
        setSelectedIndex(null)
        setId('')
        setProvider('')
        setModel('')
        setUseProviderKey(false)
        setKey('')
    }

    const onAdd = () => {
        const llm: IConfigLlm = {
            id,
            provider,
            model,
            useProviderKey,
            key
        }

        let newLlms = [...config.llms]

        if (selectedIndex !== null) 
            newLlms[selectedIndex] = llm
        else
            newLlms.push(llm)

        setConfig({ ...config, llms: newLlms })
        onNew()
    }

    const onRemove = () => {
        if (selectedIndex === null) return
        
        const newLlms = config.llms.filter((_, i) => i !== selectedIndex)
        setConfig({ ...config, llms: newLlms })
        onNew()
    }

    return (<>
        <Dialog open={true} PaperProps={{ sx: { width: '80vw', maxWidth: '800px', height: '50vh' } }}>
            <DialogTitle>LLM Config</DialogTitle>
            <DialogContent style={{ display: 'flex', height: '100%' }}>
                
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', maxWidth: '40%' }}>
                    <Box sx={{ flex: 1, overflowY: 'auto', overflowX:'hidden' }}>
                        <List sx={{ flexGrow: 1, mr: 2, width: '100%' }}>
                            {
                                config.llms.map((llm, index) =>
                                    <ListItemButton key={index} selected={selectedIndex === index} onClick={() => onLlmSelected(index)}>
                                        <Stack direction={'column'}>
                                            <Typography sx={{ fontWeight: selectedIndex === index ? 'bold' : 'normal' }}>{llm.id}</Typography>
                                            <Typography color={'darkgray'} fontSize={12}>{llm.provider}</Typography>
                                        </Stack>
                                    </ListItemButton>
                                )
                            }
                        </List>
                    </Box>
                </Box>

                <Box sx={{ flex: 1, display: 'flex', alignItems: 'start', padding: '16px' }} >
                    <Stack spacing={2} style={{ width: '100%' }}>
                        <Stack direction={'column'} spacing={1}>
                            <TextField value={id} onChange={(e) => setId(e.target.value)} placeholder='Enter LLM id' label='LLM ID' variant='standard' fullWidth/>                            
                            <FormControl variant='standard' sx={{ width: '100%'}}>
                                <InputLabel>Provider</InputLabel>
                                <Select value={provider} onChange={(e) => { setProvider(e.target.value); setModel('')}} variant='standard' fullWidth>
                                    {props.providers.map((prov) => (
                                        <MenuItem key={prov.name} value={prov.name} disabled={props.providers.find(p=> p.name===prov.name)?.models.length===0}>{prov.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <FormControl variant='standard' sx={{ width: '100%'}}>
                                <InputLabel>Model</InputLabel>
                                <Select value={model} onChange={(e) => setModel(e.target.value)} variant='standard' fullWidth displayEmpty>
                                    {props.providers.find(p => p.name === provider)?.models.map((model, index) => (
                                        <MenuItem key={index} value={model.id}>{model.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <Stack direction={'row'} alignItems={'center'}>
                                <Typography flex={1}>Use provider API Key (or enter a specific one)</Typography>
                                <Checkbox checked={useProviderKey} onChange={(e) => setUseProviderKey(e.target.checked)} />
                            </Stack>

                            <TextField value={key} onChange={(e) => setKey(e.target.value)} disabled={useProviderKey} label='API Key' type='password' placeholder='Enter API Key' variant='standard' fullWidth/>
                        </Stack>

                        <Stack direction={'row'} spacing={1}>
                            <Button variant='outlined' size='small' onClick={onNew}>New</Button>
                            <Typography flex={1} />
                            <Button color='error' onClick={onRemove} disabled={selectedIndex === null}>remove</Button>
                            <Button variant='contained' onClick={onAdd} disabled={!id || !model}>{selectedIndex !== null ? 'update' : 'add'}</Button>
                        </Stack>
                    </Stack>
                </Box>
            </DialogContent>

            <DialogActions>
                <Button onClick={() => props.onClose(config)}>ok</Button>
                <Button onClick={() => props.onClose(undefined)}>cancel</Button>
            </DialogActions>
        </Dialog>
    </>)
}

export { PinocchioConfigLlm }