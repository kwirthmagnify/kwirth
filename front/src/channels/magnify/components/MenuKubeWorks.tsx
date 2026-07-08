import { Menu, MenuItem, MenuList } from '@mui/material'
import React from 'react'
import { IconAlpine, IconDebian, IconUbuntu } from '../icons/Icons'
import { ICustomAction } from './UserPreferences'
import { Construction } from '@kwirthmagnify/kwirth-common-front/icons'

interface IMenuWorkProps {
    customActions: ICustomAction[]
    onClose?:() => void
    onWorkSelected: (work:string) => void
    anchorParent: Element
}

const MenuKubeWorks: React.FC<IMenuWorkProps> = (props:IMenuWorkProps) => {
    return <Menu anchorEl={props.anchorParent} open={Boolean(props.anchorParent)} onClose={props.onClose}>
        <MenuList dense sx={{minWidth: 140}}>
            <MenuItem onClick={() => props.onWorkSelected('ubuntu')}><IconUbuntu size='18'/>&nbsp;Ubuntu</MenuItem>
            <MenuItem onClick={() => props.onWorkSelected('alpine')}><IconAlpine size='18'/>&nbsp;Alpine</MenuItem>
            <MenuItem onClick={() => props.onWorkSelected('dnsutils')}><IconDebian size='18'/>&nbsp;DNS Utils</MenuItem>
            <MenuItem onClick={() => props.onWorkSelected('jubuntu')}><IconUbuntu size='18'/>&nbsp;jUbuntu</MenuItem>
            {
                props.customActions && props.customActions.filter(ca => ca.type==='kube').map( (ca, index) => {
                    return <MenuItem key={index} onClick={() => props.onWorkSelected(ca.name)}><Construction sx={{fontSize:'18px'}}/>&nbsp;{ca.name}</MenuItem>
                })
            }
        </MenuList>
    </Menu>
}

export { MenuKubeWorks }