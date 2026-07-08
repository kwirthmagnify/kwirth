import React, { useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, IconButton, InputAdornment, InputLabel, List, ListItemButton, MenuItem, Select, Stack, TextField, Typography } from '@mui/material'
import { IConfigProvider } from './PinocchioConfig'
import { objectClone } from './utils'
import { useKeyboard } from '@kwirthmagnify/kwirth-common-front'
import { Visibility, VisibilityOff } from '@mui/icons-material'

interface IPinocchioConfigProviderProps {
    providersAvailable: string[]
    providers: IConfigProvider[]
    onClose: (providers: IConfigProvider[] | undefined) => void
}

const PinocchioConfigProvider: React.FC<IPinocchioConfigProviderProps> = (props: IPinocchioConfigProviderProps) => {
    const [providers, setProviders] = useState<IConfigProvider[]>(objectClone(props.providers))

    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

    const [showPassword, setShowPassword] = useState(false)
    const [providerName, setProviderName] = useState('')
    const [providerKey, setProviderKey] = useState(props.providersAvailable[0])

    useKeyboard(() => props.onClose(undefined))

    const onProviderSelected = (p: IConfigProvider, index: number) => {
        setProviderName(p.name)
        setProviderKey(p.key)
        setSelectedIndex(index)
    }

    const onNew = () => {
        setSelectedIndex(null)
        setProviderName('')
        setProviderKey('')
    }

    const onAdd = () => {
        if (!providerName.trim()) return

        let newProviders = [...providers]

        if (selectedIndex !== null) {
            newProviders[selectedIndex] = {
                ...newProviders[selectedIndex],
                name: providerName,
                key: providerKey
            }
        } else {
            const newProvider: IConfigProvider = {
                name: providerName,
                key: providerKey,
                models: []
            }
            newProviders.push(newProvider)
        }

        setProviders(newProviders)
        onNew()
    }

    const onRemove = () => {
        if (selectedIndex === null) return
        const newProviders = providers.filter((_, i) => i !== selectedIndex)
        setProviders(newProviders)
        onNew()
    }

    return (
        <Dialog open={true} PaperProps={{ sx: { width: '80vw', maxWidth: '900px', height: '45vh' } }}>
            <DialogTitle>Manage Providers</DialogTitle>
            <DialogContent sx={{ display: 'flex', height: '100%' }}>

                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', maxWidth: '30%' }}>
                    <Box sx={{ flex: 1, overflowY: 'auto' }}>
                        <List sx={{ mr: 1 }}>
                            {providers.map((p, index) => (
                                <ListItemButton
                                    key={index}
                                    selected={selectedIndex === index}
                                    onClick={() => onProviderSelected(p, index)}
                                >
                                    <Stack direction={'column'}>
                                        <Typography sx={{ fontWeight: selectedIndex === index ? 'bold' : 'normal' }}>
                                            {p.name}
                                        </Typography>
                                        <Typography color={'darkgray'} variant='caption'>
                                            {p.models?.length || 0} models loaded
                                        </Typography>
                                    </Stack>
                                </ListItemButton>
                            ))}
                        </List>
                    </Box>
                </Box>

                <Box sx={{ flex: 1, display: 'flex', alignItems: 'start', p: 3 }}>
                    <Stack spacing={3} sx={{ width: '100%' }}>

                        <FormControl variant='standard' sx={{ width: '100%'}}>
                            <InputLabel>Provider</InputLabel>
                            <Select value={providerName} onChange={(e) => { setProviderName(e.target.value)}} variant='standard' fullWidth>
                                {props.providersAvailable.map((name) => (
                                    <MenuItem key={name} value={name} disabled={props.providersAvailable.length===0}>{name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <TextField
                            label='API Key / Token'
                            type={showPassword ? 'text' : 'password'}
                            variant='standard'
                            fullWidth
                            value={providerKey}
                            onChange={(e) => setProviderKey(e.target.value)}
                            helperText="This key can be afterwards linked to specific uses."
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

                        <Box sx={{ flexGrow: 1 }} />

                        <Stack direction={'row'} spacing={1}>
                            <Button variant='outlined' onClick={onNew}>New</Button>
                            <Typography flex={1} />
                            <Button variant='text' color='error' onClick={onRemove} disabled={selectedIndex === null}>Remove</Button>
                            <Button variant='contained' onClick={onAdd} disabled={!providerName}>
                                {selectedIndex !== null ? 'Update' : 'Add'}
                            </Button>
                        </Stack>
                    </Stack>
                </Box>
            </DialogContent>

            <DialogActions sx={{ p: 2 }}>
                <Button variant='outlined' onClick={() => props.onClose(providers)} color="primary" variant="contained">Save</Button>
                <Button variant='outlined' onClick={() => props.onClose(undefined)} color="inherit">Cancel</Button>
            </DialogActions>
        </Dialog>
    )
}

export { PinocchioConfigProvider }
