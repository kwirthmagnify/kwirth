import React, { useState } from 'react'
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItemButton, MenuItem, Select, Stack, TextareaAutosize, Typography } from '@mui/material'
import { IConfigKind, IPinocchioConfig } from './PinocchioConfig'
import { objectClone } from '../magnify/Tools'

interface IPinocchioLlmConfigProps {
    onClose: (pc: IPinocchioConfig | undefined) => void
    pinocchioConfig: IPinocchioConfig
}

const PinocchioConfigKind: React.FC<IPinocchioLlmConfigProps> = (props: IPinocchioLlmConfigProps) => {
    const [config, setConfig] = useState(objectClone(props.pinocchioConfig) as IPinocchioConfig)

    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

    const [kind, setKind] = useState('Pod')
    const [enabled, setEnabled] = useState(true)
    const [system, setSystem] = useState('')
    const [prompt, setPrompt] = useState('')
    const [action, setAction] = useState<'inform' | 'cancel' | 'repair'>('inform')
    const [llm, setLlm] = useState('')

    const onKindSelected = (selectedKind: IConfigKind, index: number) => {
        setKind(selectedKind.kind)
        setEnabled(selectedKind.enabled)
        setSystem(selectedKind.system)
        setPrompt(selectedKind.prompt)
        setAction(selectedKind.action)
        setLlm(selectedKind.llm)
        setSelectedIndex(index)
    }

    const onNew = () => {
        setSelectedIndex(null)
        setKind('Pod')
        setEnabled(true)
        setSystem('')
        setPrompt('')
        setAction('inform')
    }

    const onAdd = () => {
        const k: IConfigKind = { kind, enabled, system, prompt, action, llm }
        let newKinds = [...config.kinds]

        if (selectedIndex !== null) 
            newKinds[selectedIndex] = k
        else
            newKinds.push(k)
        setConfig({ ...config, kinds: newKinds })
        onNew()
    }

    const onRemove = () => {
        if (selectedIndex === null) return

        const newKinds = config.kinds.filter((_, i) => i !== selectedIndex)
        setConfig({ ...config, kinds: newKinds })
        onNew()
    }

    return (
        <Dialog open={true} PaperProps={{ sx: { width: '80vw', maxWidth: '1200px', height: '65vh' } }}>
            <DialogTitle>LLM Config</DialogTitle>
            <DialogContent style={{ display: 'flex', height: '100%' }}>
                
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', maxWidth: '30%' }}>
                    <Box sx={{ flex: 1, overflowY: 'auto', overflowX:'hidden' }}>
                        <List sx={{ flexGrow: 1, mr: 2, width: '100%' }}>
                            {config.kinds.map((k, index) => (
                                <ListItemButton key={index} selected={selectedIndex === index} onClick={() => onKindSelected(k, index)}>
                                    <Stack direction={'column'}>
                                        <Typography sx={{ fontWeight: selectedIndex === index ? 'bold' : 'normal' }}>
                                            {k.kind}
                                        </Typography>
                                        <Typography color={'darkgray'} fontSize={12}>{k.llm}</Typography>
                                    </Stack>
                                </ListItemButton>
                            ))}
                        </List>
                    </Box>
                </Box>

                <Box sx={{ flex: 1, display: 'flex', alignItems: 'start', padding: '16px' }} >
                    <Stack spacing={1} style={{ width: '100%' }}>
                        <Stack direction={'row'}>
                            <Select value={kind} onChange={(e) => setKind(e.target.value)} variant='standard' sx={{ width: '100%', mr: 1 }}>
                                {['Pod', 'Service', 'Ingress', 'HTTPRoute'].map((value) => (
                                    <MenuItem key={value} value={value}>{value}</MenuItem>
                                ))}
                            </Select>
                            <Select value={action} onChange={(e) => setAction(e.target.value as any)} variant='standard' sx={{ width: '100%', mr: 1 }}>
                                {['inform', 'cancel', 'repair'].map((value) => (
                                    <MenuItem key={value} value={value}>{value}</MenuItem>
                                ))}
                            </Select>
                            <Select value={llm} onChange={(e) => setLlm(e.target.value)} variant='standard' sx={{ width: '100%' }}>
                                {config.llms.map((llmItem) => (
                                    <MenuItem key={llmItem.id} value={llmItem.id}>{llmItem.id}</MenuItem>
                                ))}
                            </Select>
                        </Stack>
                        
                        <Stack direction={'row'} alignItems={'center'}>
                            <Typography flex={1}>Enabled (store the Kind but don't use it)</Typography>
                            <Checkbox checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                        </Stack>

                        <TextareaAutosize value={system} onChange={(e) => setSystem(e.target.value)} style={{ minHeight: '130px', padding: '8px' }} placeholder='Enter system text' />
                        <TextareaAutosize value={prompt} onChange={(e) => setPrompt(e.target.value)} style={{ minHeight: '130px', padding: '8px' }} placeholder='Enter prompt' />

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

export { PinocchioConfigKind }