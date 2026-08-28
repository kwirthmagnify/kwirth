import React from 'react'
import { Box, Divider, Menu, MenuItem, MenuList } from '@mui/material'
import { Check as CheckIcon } from '@mui/icons-material'

interface IMenuOrderProps {
    anchorParent: Element
    onClose: () => void
    onReorder: (source: 'vuln' | 'audit' | 'exposed', order: 'a' | 'd') => void
    orderSource: 'vuln' | 'audit' | 'exposed'
    orderType: 'a' | 'd'
}

const MenuOrder: React.FC<IMenuOrderProps> = (props: IMenuOrderProps) => (
    <Menu anchorEl={props.anchorParent} open={true} onClose={props.onClose}>
        <MenuList dense sx={{ minWidth: 180 }}>
            <MenuItem onClick={() => props.onReorder(props.orderSource, 'a')}>{props.orderType === 'a' ? <CheckIcon /> : <Box sx={{ width: 24 }} />}Ascending</MenuItem>
            <MenuItem onClick={() => props.onReorder(props.orderSource, 'd')}>{props.orderType === 'd' ? <CheckIcon /> : <Box sx={{ width: 24 }} />}Descending</MenuItem>
            <Divider />
            <MenuItem onClick={() => props.onReorder('vuln', props.orderType)}>{props.orderSource === 'vuln' ? <CheckIcon /> : <Box sx={{ width: 24 }} />}Vulnerabilities</MenuItem>
            <MenuItem onClick={() => props.onReorder('audit', props.orderType)}>{props.orderSource === 'audit' ? <CheckIcon /> : <Box sx={{ width: 24 }} />}Config audit</MenuItem>
            <MenuItem onClick={() => props.onReorder('exposed', props.orderType)}>{props.orderSource === 'exposed' ? <CheckIcon /> : <Box sx={{ width: 24 }} />}Exposed secrets</MenuItem>
        </MenuList>
    </Menu>
)

export { MenuOrder }
