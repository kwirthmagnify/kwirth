import React from 'react'
import { Menu, MenuItem, MenuList } from '@mui/material'

interface IMenuOrderProps {
    anchorParent: Element
    onClose: () => void
    onAction: (action:'provider'|'llm'|'trigger') => void
}

const MenuConfig: React.FC<IMenuOrderProps> = (props:IMenuOrderProps) => {
    return (
        <Menu anchorEl={props.anchorParent} open={true} onClose={props.onClose}>
            <MenuList dense sx={{ width: '180px' }}>
                <MenuItem onClick={() => props.onAction('provider')}>Provider</MenuItem>
                <MenuItem onClick={() => props.onAction('llm')}>LLM</MenuItem>
                <MenuItem onClick={() => props.onAction('trigger')}>Trigger</MenuItem>
            </MenuList>
        </Menu>
    )
}

export { MenuConfig }