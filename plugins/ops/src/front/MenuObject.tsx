import React from 'react'
import { Divider, Menu, MenuItem, MenuList } from '@mui/material'
import { IScopedObject } from './OpsData'

enum EMenuObjectOption {
    DESCRIBE,
    RESTARTCONTAINER,
    RESTARTPOD,
    RESTARTNS,
    DELETEPOD,
    VIEWLOG,
    VIEWMETRICS
}

interface IMenuObjectProps {
    onClose: () => void
    onOptionSelected: (opt: EMenuObjectOption, scopedObject: IScopedObject) => void
    anchorParent: Element
    scopedObject: IScopedObject
}

const MenuObject: React.FC<IMenuObjectProps> = (props: IMenuObjectProps) => (
    <Menu anchorEl={props.anchorParent} open={Boolean(props.anchorParent)} onClose={props.onClose}>
        <MenuList dense sx={{ width: '180px' }}>
            <MenuItem key='describe' onClick={() => props.onOptionSelected(EMenuObjectOption.DESCRIBE, props.scopedObject)}>&nbsp;Object info</MenuItem>
            <Divider />
            <MenuItem key='log' onClick={() => props.onOptionSelected(EMenuObjectOption.VIEWLOG, props.scopedObject)}>&nbsp;View container log</MenuItem>
            <MenuItem key='metrics' onClick={() => props.onOptionSelected(EMenuObjectOption.VIEWMETRICS, props.scopedObject)}>&nbsp;View container metrics</MenuItem>
            <Divider />
            <MenuItem key='restartcontainer' onClick={() => props.onOptionSelected(EMenuObjectOption.RESTARTCONTAINER, props.scopedObject)}>&nbsp;Restart container</MenuItem>
            <MenuItem key='restartpod' onClick={() => props.onOptionSelected(EMenuObjectOption.RESTARTPOD, props.scopedObject)}>&nbsp;Restart pod</MenuItem>
            <MenuItem key='restartns' onClick={() => props.onOptionSelected(EMenuObjectOption.RESTARTNS, props.scopedObject)}>&nbsp;Restart namespace</MenuItem>
        </MenuList>
    </Menu>
)

export { MenuObject, EMenuObjectOption }
