import React, { useState } from 'react'
import { Box, Collapse, ListItemIcon, ListItemText, Menu, MenuItem, MenuList } from '@mui/material'
import { IConfigProvider, IPinocchioConfig } from './PinocchioConfig'
import { Bolt, ExpandLess, ExpandMore, ImportExport, Key, Memory, SmartToy } from '@mui/icons-material'

// Collapsible menu group (Kwirth pattern, same as Excubitor/Agora): clickable header + indented sub-items.
const MenuGroup: React.FC<{ label: string; icon: React.ReactNode; open: boolean; onToggle: () => void; children: React.ReactNode }> = ({ label, icon, open, onToggle, children }) => (
    <>
        <MenuItem onClick={onToggle}>
            <ListItemIcon>{icon}</ListItemIcon>
            <Box component='span' sx={{ flex: 1 }}>{label}</Box>
            {open ? <ExpandLess fontSize='small' /> : <ExpandMore fontSize='small' />}
        </MenuItem>
        <Collapse in={open} unmountOnExit>
            <Box sx={{ '& .MuiMenuItem-root': { pl: 4 } }}>{children}</Box>
        </Collapse>
    </>
)

interface IMenuOrderProps {
    providers:IConfigProvider[]
    anchorParent: Element
    pinocchioConfig:IPinocchioConfig
    onClose: () => void
    onAction: (action:'provider'|'llm'|'trigger'|'importexport') => void
}

const MenuConfig: React.FC<IMenuOrderProps> = (props:IMenuOrderProps) => {
    const [aiOpen, setAiOpen] = useState(false)   // collapsible 'AI' group (providers/models), collapsed by default
    return (
        <Menu anchorEl={props.anchorParent} open={true} onClose={props.onClose}>
            <MenuList dense sx={{ width: '200px' }}>
                <MenuGroup label='AI' icon={<SmartToy fontSize='small' />} open={aiOpen} onToggle={() => setAiOpen(o => !o)}>
                    <MenuItem onClick={() => props.onAction('provider')}>
                        <ListItemIcon><Key fontSize='small' /></ListItemIcon>
                        <ListItemText>AI providers</ListItemText>
                    </MenuItem>
                    <MenuItem onClick={() => props.onAction('llm')} disabled={props.providers.length===0}>
                        <ListItemIcon><Memory fontSize='small' /></ListItemIcon>
                        <ListItemText>AI models</ListItemText>
                    </MenuItem>
                </MenuGroup>
                <MenuItem onClick={() => props.onAction('trigger')} disabled={props.pinocchioConfig.llms.length===0}>
                    <ListItemIcon><Bolt fontSize='small' /></ListItemIcon>
                    <ListItemText>Trigger</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => props.onAction('importexport')}>
                    <ListItemIcon><ImportExport fontSize='small' /></ListItemIcon>
                    <ListItemText>Import / Export</ListItemText>
                </MenuItem>
            </MenuList>
        </Menu>
    )
}

export { MenuConfig }
