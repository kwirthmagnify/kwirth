import React, { useState } from 'react'
import { IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Divider } from '@mui/material'
import { Close, Fullscreen, FullscreenExit, HorizontalRule, PinDrop, Place, MoreVert, West, East } from '@mui/icons-material'

interface IWindowTitleButtonsProps {
    id: string
    atTop: boolean
    isMaximized: boolean
    onMinimize: () => void
    onTop: () => void
    onMaximize: () => void
    onClose: () => void
    onSnap?: (position: 'left' | 'right') => void
}

const WindowTitleButtons: React.FC<IWindowTitleButtonsProps> = ({ id, atTop, isMaximized, onMinimize, onTop, onMaximize, onClose, onSnap }) => {
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)

    const closeMenu = () => setMenuAnchor(null)

    return (
        <>
            <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)}>
                <MoreVert fontSize="small" />
            </IconButton>
            <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
                <MenuItem onClick={() => { onTop(); closeMenu() }}>
                    <ListItemIcon>{atTop ? <PinDrop fontSize="small" sx={{ color: 'info.main' }} /> : <Place fontSize="small" />}</ListItemIcon>
                    <ListItemText>{atTop ? 'Unpin from top' : 'Pin to top'}</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => { onMaximize(); closeMenu() }}>
                    <ListItemIcon>{isMaximized ? <FullscreenExit fontSize="small" /> : <Fullscreen fontSize="small" />}</ListItemIcon>
                    <ListItemText>{isMaximized ? 'Restore' : 'Maximize'}</ListItemText>
                </MenuItem>
                {onSnap && <Divider />}
                {onSnap && (
                    <MenuItem onClick={() => { onSnap('left'); closeMenu() }}>
                        <ListItemIcon><West fontSize="small" /></ListItemIcon>
                        <ListItemText>Snap left</ListItemText>
                    </MenuItem>
                )}
                {onSnap && (
                    <MenuItem onClick={() => { onSnap('right'); closeMenu() }}>
                        <ListItemIcon><East fontSize="small" /></ListItemIcon>
                        <ListItemText>Snap right</ListItemText>
                    </MenuItem>
                )}
            </Menu>
            <IconButton size="small" onClick={onMinimize}>
                <HorizontalRule fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={onClose} sx={{ '&:hover': { color: 'error.main' } }}>
                <Close fontSize="small" />
            </IconButton>
        </>
    )
}

export { WindowTitleButtons }
