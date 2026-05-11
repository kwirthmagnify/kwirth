import React from 'react'
import { ListItemIcon, ListItemText, Menu, MenuItem, MenuList } from '@mui/material'
import { IConfigProvider, IPinocchioConfig } from './PinocchioConfig'
import { Hub, Memory, Bolt, ImportExport } from '@mui/icons-material'

interface IMenuOrderProps {
    providers:IConfigProvider[]
    anchorParent: Element
    pinocchioConfig:IPinocchioConfig
    onClose: () => void
    onAction: (action:'provider'|'llm'|'trigger'|'importexport') => void
}

const MenuConfig: React.FC<IMenuOrderProps> = (props:IMenuOrderProps) => {
    return (
        <Menu anchorEl={props.anchorParent} open={true} onClose={props.onClose}>
            <MenuList dense sx={{ width: '200px' }}>
                <MenuItem onClick={() => props.onAction('provider')}>
                    <ListItemIcon><Hub fontSize='small' /></ListItemIcon>
                    <ListItemText>Provider</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => props.onAction('llm')} disabled={props.providers.length===0}>
                    <ListItemIcon><Memory fontSize='small' /></ListItemIcon>
                    <ListItemText>LLM</ListItemText>
                </MenuItem>
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
