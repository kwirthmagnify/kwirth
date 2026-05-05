import React from 'react'
import { Menu, MenuItem, MenuList } from '@mui/material'
import { IConfigProvider, IPinocchioConfig } from './PinocchioConfig'

interface IMenuOrderProps {
    providers:IConfigProvider[]
    anchorParent: Element
    pinocchioConfig:IPinocchioConfig
    onClose: () => void
    onAction: (action:'provider'|'llm'|'trigger') => void
}

const MenuConfig: React.FC<IMenuOrderProps> = (props:IMenuOrderProps) => {
    return (
        <Menu anchorEl={props.anchorParent} open={true} onClose={props.onClose}>
            <MenuList dense sx={{ width: '180px' }}>
                <MenuItem onClick={() => props.onAction('provider')}>Provider</MenuItem>
                <MenuItem onClick={() => props.onAction('llm')} disabled={props.providers.length===0}>LLM</MenuItem>
                <MenuItem onClick={() => props.onAction('trigger')} disabled={props.pinocchioConfig.llms.length===0}>Trigger</MenuItem>
            </MenuList>
        </Menu>
    )
}

export { MenuConfig }