import React, { useEffect, useState } from 'react'
import { Stack, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography, List, ListItemButton, ListItem } from '@mui/material'
import { IOpsData } from '../OpsData'

interface ISelectTerminalProps {
    onSelect: (id?: string) => void
    current: string
    opsData: IOpsData
}

const SelectTerminal: React.FC<ISelectTerminalProps> = (props: ISelectTerminalProps) => {
    const [selectedIndex, setSelectedIndex] = useState(Array.from(props.opsData.terminalManager.terminals.keys()).indexOf(props.current))

    const handleKeyDown = (event: KeyboardEvent) => {
        event.stopPropagation()
        if (event.key === 'ArrowDown') setSelectedIndex(prev => (prev + 1) % props.opsData.terminalManager.terminals.size)
        else if (event.key === 'ArrowUp') setSelectedIndex(prev => (prev - 1 + props.opsData.terminalManager.terminals.size) % props.opsData.terminalManager.terminals.size)
        else if (event.key === 'Enter') {
            let terms = Array.from(props.opsData.terminalManager.terminals.keys())
            props.onSelect(terms[selectedIndex])
        }
    }

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [selectedIndex])

    return (
        <Dialog open={true} onClose={() => props.onSelect(undefined)}>
            <DialogTitle>Select terminal</DialogTitle>
            <DialogContent>
                <Stack direction='column' sx={{ width: '50vh', m: 2 }}>
                    <Typography>Select terminal to switch to:</Typography>
                    <List>
                        {Array.from(props.opsData.terminalManager.terminals.keys()).map((key, index) => (
                            <ListItemButton onClick={() => props.onSelect(key)} key={key} selected={index === selectedIndex}>
                                <ListItem>
                                    <Stack direction='row' sx={{ width: '100%' }}>
                                        <Typography flex={1}>{key}</Typography>
                                        {props.opsData.terminalManager.terminals.get(key)!.index > 0 && <Typography>{'F' + props.opsData.terminalManager.terminals.get(key)!.index}</Typography>}
                                    </Stack>
                                </ListItem>
                            </ListItemButton>
                        ))}
                    </List>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => props.onSelect(undefined)}>CANCEL</Button>
            </DialogActions>
        </Dialog>
    )
}

export { SelectTerminal }
