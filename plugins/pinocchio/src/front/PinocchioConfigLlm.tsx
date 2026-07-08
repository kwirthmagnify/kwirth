import React, { useState } from 'react'
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, IconButton, InputAdornment, InputLabel, List, ListItemButton, MenuItem, Select, Stack, TextField, Typography } from '@mui/material'
import { IConfigLlm, IConfigProvider, IPinocchioConfig } from './PinocchioConfig'
import { objectClone } from './utils'
import { useKeyboard } from '@kwirthmagnify/kwirth-common-front'
import { Visibility, VisibilityOff } from '@mui/icons-material'

interface IPinocchioLlmConfigProps {
    onClose: (pc: IPinocchioConfig | undefined) => void
    providers: IConfigProvider[]
    pinocchioConfig: IPinocchioConfig
}

const PinocchioConfigLlm: React.FC<IPinocchioLlmConfigProps> = (props: IPinocchioLlmConfigProps) => {
    const [config, setConfig] = useState(objectClone(props.pinocchioConfig) as IPinocchioConfig)

    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

    const [showPassword, setShowPassword] = useState(false)
    const [id, setId] = useState('')
    const [provider, setProvider] = useState('google')
    const [model, setModel] = useState('')
    const [temperature, setTemperature] = useState(0)
    const [useProviderKey, setUseProviderKey] = useState(true)
    const [key, setKey] = useState('')

    useKeyboard(() => props.onClose(undefined))

    const onLlmSelected = (index: number) => {
        const l = config.llms[index]
        if (l) {
            setId(l.id)
            setProvider(l.provider)
            setModel(l.model)
            setTemperature(l.temperature)
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
        setTemperature(0)
        setUseProviderKey(false)
        setKey('')
    }

    const onAdd = () => {
        const llm: IConfigLlm = {
            id,
            provider,
            model,
            temperature,
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
        <Dialog open={true} PaperProps={{ sx: { width: '80vw', maxWidth: '800px', height: '55vh' } }}>
            <DialogTitle>LLM Config</DialogTitle>
            <DialogContent sx={{ display: 'flex', height: '100%' }}>

                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', maxWidth: '40%' }}>
                    <Box sx={{ flex: 1, overflowY: 'auto', overflowX:'hidden' }}>
                        <List sx={{ flexGrow: 1, mr: 2, width: '100%' }}>
                            {
                                config.llms.map((llm, index) =>
                                    <ListItemButton key={index} selected={selectedIndex === index} onClick={() => onLlmSelected(index)}>
                                        <Stack direction={'column'}>
                                            <Typography sx={{ fontWeight: selectedIndex === index ? 'bold' : 'normal' }}>{llm.id}</Typography>
                                            <Typography color={'darkgray'} variant='caption'>{llm.provider}</Typography>
                                        </Stack>
                                    </ListItemButton>
                                )
                            }
                        </List>
                    </Box>
                </Box>

                <Box sx={{ flex: 1, display: 'flex', alignItems: 'start', p: 2 }}>
                    <Stack spacing={2} sx={{ width: '100%' }}>
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

                            <TextField value={temperature} onChange={(e) => setTemperature(+e.target.value)} label='Model temperature' variant='standard' type='number' fullWidth/>

                            <Stack direction={'row'} alignItems={'center'}>
                                <Typography flex={1}>Use provider API Key (or enter a specific one)</Typography>
                                <Checkbox checked={useProviderKey} onChange={(e) => setUseProviderKey(e.target.checked)} />
                            </Stack>

                            <TextField value={key} onChange={(e) => setKey(e.target.value)} disabled={useProviderKey} label='API Key' placeholder='Enter API Key' variant='standard' fullWidth
                                type={showPassword ? 'text' : 'password'}
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                                                {showPassword ? <VisibilityOff /> : <Visibility />}
                                            </IconButton>
                                        </InputAdornment>
                                    )
                                }}
                            />
                        </Stack>

                        <Stack direction={'row'} spacing={1}>
                            <Button variant='outlined' size='small' onClick={onNew}>New</Button>
                            <Typography flex={1} />
                            <Button variant='outlined' color='error' onClick={onRemove} disabled={selectedIndex === null}>remove</Button>
                            <Button variant='contained' onClick={onAdd} disabled={!id || !model}>{selectedIndex !== null ? 'update' : 'add'}</Button>
                        </Stack>
                    </Stack>
                </Box>
            </DialogContent>

            <DialogActions>
                <Button variant='outlined' onClick={() => props.onClose(config)}>ok</Button>
                <Button variant='outlined' onClick={() => props.onClose(undefined)}>cancel</Button>
            </DialogActions>
        </Dialog>
    </>)
}

export { PinocchioConfigLlm }
