import React, { useState } from 'react'
import {
    Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
    FormControl, IconButton, InputAdornment, InputLabel, List, ListItemButton,
    MenuItem, Select, Stack, TextField, Typography
} from '@mui/material'
import { Visibility, VisibilityOff } from '@mui/icons-material'
import { ILlm, ILlmProvider } from './index'

// ── LlmSelector ─────────────────────────────────────────────────────────────

interface ILlmSelectorProps {
    llms: ILlm[]
    value: string
    onChange: (id: string) => void
    label?: string
    size?: 'small' | 'medium'
    fullWidth?: boolean
}

const LlmSelector: React.FC<ILlmSelectorProps> = ({ llms, value, onChange, label = 'LLM', size = 'small', fullWidth = true }) => {
    return (
        <FormControl size={size} fullWidth={fullWidth}>
            <InputLabel>{label}</InputLabel>
            <Select label={label} value={value} onChange={e => onChange(e.target.value)}>
                {llms.map(llm => (
                    <MenuItem key={llm.id} value={llm.id}>{llm.id} ({llm.provider}/{llm.model})</MenuItem>
                ))}
            </Select>
        </FormControl>
    )
}

// ── AiConfigLlm ──────────────────────────────────────────────────────────────

interface IAiConfigLlmProps {
    onClose: (llms: ILlm[] | undefined) => void
    providers: ILlmProvider[]
    llms: ILlm[]
}

const AiConfigLlm: React.FC<IAiConfigLlmProps> = (props: IAiConfigLlmProps) => {
    const [llms, setLlms] = useState<ILlm[]>(JSON.parse(JSON.stringify(props.llms)))
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
    const [showPassword, setShowPassword] = useState(false)
    const [id, setId] = useState('')
    const [provider, setProvider] = useState('')
    const [model, setModel] = useState('')
    const [temperature, setTemperature] = useState(0)
    const [useProviderKey, setUseProviderKey] = useState(true)
    const [key, setKey] = useState('')

    const onLlmSelected = (index: number) => {
        const l = llms[index]
        if (l) {
            setId(l.id); setProvider(l.provider); setModel(l.model)
            setTemperature(l.temperature); setUseProviderKey(l.useProviderKey); setKey(l.key)
            setSelectedIndex(index)
        }
    }

    const onNew = () => {
        setSelectedIndex(null); setId(''); setProvider(''); setModel('')
        setTemperature(0); setUseProviderKey(false); setKey('')
    }

    const onAdd = () => {
        const llm: ILlm = { id, provider, model, temperature, useProviderKey, key }
        const updated = [...llms]
        if (selectedIndex !== null) updated[selectedIndex] = llm
        else updated.push(llm)
        setLlms(updated)
        onNew()
    }

    const onRemove = () => {
        if (selectedIndex === null) return
        setLlms(llms.filter((_, i) => i !== selectedIndex))
        onNew()
    }

    return (
        <Dialog open={true} onClose={() => props.onClose(undefined)} PaperProps={{ sx: { width: '80vw', maxWidth: '800px', height: '55vh' } }}>
            <DialogTitle>AI — LLM config</DialogTitle>
            <DialogContent style={{ display: 'flex', height: '100%' }}>
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', maxWidth: '40%' }}>
                    <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                        <List sx={{ flexGrow: 1, mr: 2, width: '100%' }}>
                            {llms.map((llm, index) => (
                                <ListItemButton key={index} selected={selectedIndex === index} onClick={() => onLlmSelected(index)}>
                                    <Stack direction='column'>
                                        <Typography sx={{ fontWeight: selectedIndex === index ? 'bold' : 'normal' }}>{llm.id}</Typography>
                                        <Typography color='darkgray' fontSize={12}>{llm.provider}</Typography>
                                    </Stack>
                                </ListItemButton>
                            ))}
                        </List>
                    </Box>
                </Box>
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'start', padding: '16px' }}>
                    <Stack spacing={2} style={{ width: '100%' }}>
                        <Stack direction='column' spacing={1}>
                            <TextField value={id} onChange={e => setId(e.target.value)} placeholder='Enter LLM id' label='LLM ID' variant='standard' fullWidth />
                            <FormControl variant='standard' sx={{ width: '100%' }}>
                                <InputLabel>Provider</InputLabel>
                                <Select value={provider} onChange={e => { setProvider(e.target.value); setModel('') }} variant='standard' fullWidth>
                                    {props.providers.map(p => (
                                        <MenuItem key={p.name} value={p.name} disabled={p.models.length === 0}>{p.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControl variant='standard' sx={{ width: '100%' }}>
                                <InputLabel>Model</InputLabel>
                                <Select value={model} onChange={e => setModel(e.target.value)} variant='standard' fullWidth displayEmpty>
                                    {props.providers.find(p => p.name === provider)?.models.map((m, i) => (
                                        <MenuItem key={i} value={m.id}>{m.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <TextField value={temperature} onChange={e => setTemperature(+e.target.value)} label='Model temperature' variant='standard' type='number' fullWidth />
                            <Stack direction='row' alignItems='center'>
                                <Typography flex={1}>Use provider API Key (or enter a specific one)</Typography>
                                <Checkbox checked={useProviderKey} onChange={e => setUseProviderKey(e.target.checked)} />
                            </Stack>
                            <TextField value={key} onChange={e => setKey(e.target.value)} disabled={useProviderKey} label='API Key' placeholder='Enter API Key' variant='standard' fullWidth
                                type={showPassword ? 'text' : 'password'}
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position='end'>
                                            <IconButton onClick={() => setShowPassword(!showPassword)} edge='end'>
                                                {showPassword ? <VisibilityOff /> : <Visibility />}
                                            </IconButton>
                                        </InputAdornment>
                                    )
                                }}
                            />
                        </Stack>
                        <Stack direction='row' spacing={1}>
                            <Button variant='outlined' size='small' onClick={onNew}>New</Button>
                            <Typography flex={1} />
                            <Button color='error' onClick={onRemove} disabled={selectedIndex === null}>Remove</Button>
                            <Button variant='contained' onClick={onAdd} disabled={!id || !model}>{selectedIndex !== null ? 'Update' : 'Add'}</Button>
                        </Stack>
                    </Stack>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => props.onClose(llms)} variant='contained'>OK</Button>
                <Button onClick={() => props.onClose(undefined)} color='inherit'>Cancel</Button>
            </DialogActions>
        </Dialog>
    )
}

// ── AiConfigProvider ─────────────────────────────────────────────────────────

interface IAiConfigProviderProps {
    providersAvailable: string[]
    providers: ILlmProvider[]
    onClose: (providers: ILlmProvider[] | undefined) => void
}

const AiConfigProvider: React.FC<IAiConfigProviderProps> = (props: IAiConfigProviderProps) => {
    const [providers, setProviders] = useState<ILlmProvider[]>(JSON.parse(JSON.stringify(props.providers)))
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
    const [showPassword, setShowPassword] = useState(false)
    const [providerName, setProviderName] = useState('')
    const [providerKey, setProviderKey] = useState(props.providersAvailable[0] ?? '')

    const onProviderSelected = (p: ILlmProvider, index: number) => {
        setProviderName(p.name); setProviderKey(p.key); setSelectedIndex(index)
    }

    const onNew = () => { setSelectedIndex(null); setProviderName(''); setProviderKey('') }

    const onAdd = () => {
        if (!providerName.trim()) return
        const updated = [...providers]
        if (selectedIndex !== null) updated[selectedIndex] = { ...updated[selectedIndex], name: providerName, key: providerKey }
        else updated.push({ name: providerName, key: providerKey, models: [] })
        setProviders(updated)
        onNew()
    }

    const onRemove = () => {
        if (selectedIndex === null) return
        setProviders(providers.filter((_, i) => i !== selectedIndex))
        onNew()
    }

    return (
        <Dialog open={true} onClose={() => props.onClose(undefined)} PaperProps={{ sx: { width: '80vw', maxWidth: '900px', height: '45vh' } }}>
            <DialogTitle>AI — Provider config</DialogTitle>
            <DialogContent style={{ display: 'flex', height: '100%' }}>
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', maxWidth: '30%' }}>
                    <Box sx={{ flex: 1, overflowY: 'auto' }}>
                        <List sx={{ mr: 1 }}>
                            {providers.map((p, index) => (
                                <ListItemButton key={index} selected={selectedIndex === index} onClick={() => onProviderSelected(p, index)}>
                                    <Stack direction='column'>
                                        <Typography sx={{ fontWeight: selectedIndex === index ? 'bold' : 'normal' }}>{p.name}</Typography>
                                        <Typography color='darkgray' fontSize={11}>{p.models?.length || 0} models loaded</Typography>
                                    </Stack>
                                </ListItemButton>
                            ))}
                        </List>
                    </Box>
                </Box>
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'start', padding: '24px' }}>
                    <Stack spacing={3} style={{ width: '100%' }}>
                        <FormControl variant='standard' sx={{ width: '100%' }}>
                            <InputLabel>Provider</InputLabel>
                            <Select value={providerName} onChange={e => setProviderName(e.target.value)} variant='standard' fullWidth>
                                {props.providersAvailable.map(name => (
                                    <MenuItem key={name} value={name}>{name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <TextField label='API Key / Token' type={showPassword ? 'text' : 'password'} variant='standard' fullWidth
                            value={providerKey} onChange={e => setProviderKey(e.target.value)}
                            helperText='This key can be afterwards linked to specific uses.'
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position='end'>
                                        <IconButton onClick={() => setShowPassword(!showPassword)} edge='end'>
                                            {showPassword ? <VisibilityOff /> : <Visibility />}
                                        </IconButton>
                                    </InputAdornment>
                                )
                            }}
                        />
                        <Box sx={{ flexGrow: 1 }} />
                        <Stack direction='row' spacing={1}>
                            <Button variant='outlined' onClick={onNew}>New</Button>
                            <Typography flex={1} />
                            <Button variant='text' color='error' onClick={onRemove} disabled={selectedIndex === null}>Remove</Button>
                            <Button variant='contained' onClick={onAdd} disabled={!providerName}>{selectedIndex !== null ? 'Update' : 'Add'}</Button>
                        </Stack>
                    </Stack>
                </Box>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
                <Button onClick={() => props.onClose(providers)} color='primary' variant='contained'>Save</Button>
                <Button onClick={() => props.onClose(undefined)} color='inherit'>Cancel</Button>
            </DialogActions>
        </Dialog>
    )
}

export { LlmSelector, AiConfigLlm, AiConfigProvider }
