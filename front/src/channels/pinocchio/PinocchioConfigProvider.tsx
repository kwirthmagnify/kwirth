import React, { useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, List, ListItemButton, MenuItem, Select, Stack, TextField, Typography } from '@mui/material'
import { IConfigProvider } from './PinocchioConfig' // Ajusta la ruta según tu proyecto
import { objectClone } from '../magnify/Tools'

interface IPinocchioConfigProviderProps {
    providersAvailable: string[]
    providers: IConfigProvider[]
    onClose: (providers: IConfigProvider[] | undefined) => void
}

const PinocchioConfigProvider: React.FC<IPinocchioConfigProviderProps> = (props: IPinocchioConfigProviderProps) => {
    const [providers, setProviders] = useState<IConfigProvider[]>(objectClone(props.providers))
    
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

    const [name, setName] = useState('')
    const [key, setKey] = useState('')

    const onProviderSelected = (p: IConfigProvider, index: number) => {
        setName(p.name)
        setKey(p.key)
        setSelectedIndex(index)
    }

    const onNew = () => {
        setSelectedIndex(null)
        setName('')
        setKey('')
    }

    const onAdd = () => {
        if (!name.trim()) return

        let newProviders = [...providers]

        if (selectedIndex !== null) {
            // Actualizamos manteniendo los models existentes
            newProviders[selectedIndex] = { 
                ...newProviders[selectedIndex], 
                name, 
                key 
            }
        } else {
            // Nuevo proveedor con lista de modelos vacía por defecto
            const newProvider: IConfigProvider = { 
                name, 
                key, 
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
        <Dialog open={true} PaperProps={{ sx: { width: '80vw', maxWidth: '900px', height: '65vh' } }}>
            <DialogTitle>Manage Providers</DialogTitle>
            <DialogContent style={{ display: 'flex', height: '100%' }}>
                
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', maxWidth: '30%', borderRight: '1px solid #eee' }}>
                    <Box sx={{ flex: 1, overflowY: 'auto' }}>
                        <List sx={{ mr: 2 }}>
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
                                        <Typography color={'darkgray'} fontSize={11}>
                                            {p.models?.length || 0} models loaded
                                        </Typography>
                                    </Stack>
                                </ListItemButton>
                            ))}
                        </List>
                    </Box>
                </Box>

                {/* FORMULARIO DERECHA */}
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'start', padding: '24px' }}>
                    <Stack spacing={3} style={{ width: '100%' }}>
                        
                        <FormControl variant='standard' sx={{ width: '100%'}}>
                            <InputLabel>Provider</InputLabel>
                            <Select value={name} onChange={(e) => { setName(e.target.value)}} variant='standard' fullWidth>
                                {props.providersAvailable.map((name) => (
                                    <MenuItem key={name} value={name} disabled={props.providersAvailable.length===0}>{name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        {/* <TextField 
                            label="Provider Name"
                            variant='standard' 
                            fullWidth
                            value={name} 
                            onChange={(e) => setName(e.target.value)} 
                            helperText='This name must match an AI-SDK provider name'
                        /> */}

                        <TextField 
                            label="API Key / Token"
                            type="password"
                            variant='standard' 
                            fullWidth
                            value={key} 
                            onChange={(e) => setKey(e.target.value)} 
                            helperText="This key can be afterwards linked to specific used."
                        />

                        <Box sx={{ flexGrow: 1 }} />

                        <Stack direction={'row'} spacing={1}>
                            <Button variant='outlined' onClick={onNew}>New</Button>
                            <Typography flex={1} />
                            <Button variant='text' color='error' onClick={onRemove} disabled={selectedIndex === null}>Remove</Button>
                            <Button variant='contained' onClick={onAdd} disabled={!name}>
                                {selectedIndex !== null ? 'Update' : 'Add'}
                            </Button>
                        </Stack>
                    </Stack>
                </Box>
            </DialogContent>

            <DialogActions sx={{ p: 2 }}>
                <Button onClick={() => props.onClose(providers)} color="primary" variant="contained">Save</Button>
                <Button onClick={() => props.onClose(undefined)} color="inherit">Cancel</Button>
            </DialogActions>
        </Dialog>
    )
}

export { PinocchioConfigProvider }