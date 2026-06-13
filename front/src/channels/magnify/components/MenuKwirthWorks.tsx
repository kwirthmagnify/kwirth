import { Menu, MenuItem, MenuList } from '@mui/material'
import React from 'react'
import { ICustomAction } from './UserPreferences'
import { Construction } from '../../../tools/KwirthIcons'

interface IMenuWorkProps {
    customActions: ICustomAction[]
    onClose?:() => void
    onWorkSelected: (work:string) => void
    anchorParent: Element
}

const MenuKwirthWorks: React.FC<IMenuWorkProps> = (props:IMenuWorkProps) => {
    return <Menu anchorEl={props.anchorParent} open={Boolean(props.anchorParent)} onClose={props.onClose}>
        <MenuList dense sx={{minWidth: 140}}>
            {
                props.customActions.filter(ca => ca.type==='kwirth').map( (ca, index) => {
                    return <MenuItem key={index} onClick={() => props.onWorkSelected(ca.name)}><Construction sx={{fontSize:'18px'}}/>&nbsp;{ca.name}</MenuItem>
                })
            }
        </MenuList>
    </Menu>
}

export { MenuKwirthWorks }