import React from 'react'
import { Collapse, Menu, MenuItem, MenuList, Typography } from '@mui/material'
import { Check, Pause, PlayArrow, RemoveCircleRounded,  Stop, ExpandLess, ExpandMore, DriveFileRenameOutline, KeyboardArrowLeft, KeyboardArrowRight, KeyboardDoubleArrowLeft, KeyboardDoubleArrowRight, PlayCircle, Info, FactCheck, Fullscreen } from '@mui/icons-material'
import { ITabObject } from '../model/ITabObject'
import { BackChannelData } from '@kwirthmagnify/kwirth-common'

enum MenuTabOption {
    TabInfo,
    TabRename,
    TabSetDefault,
    TabMoveLeft,
    TabMoveRight,
    TabMoveFirst,
    TabMoveLast,
    TabRemove,
    TabRestoreParameters,
    FullScreen,
    ChannelStart,
    ChannelPause,
    ChannelStop
}

interface IMenuTabProps {
    onClose:() => void
    optionSelected: (opt:MenuTabOption) => void
    anchorMenuTab: Element
    tabs: ITabObject[]
    selectedTab?: ITabObject
    selectedTabIndex: number
    backChannels: BackChannelData[]
}

const MenuTab: React.FC<IMenuTabProps> = (props:IMenuTabProps) => {
    const [subMenuTabOpen, setSubmenuTabOpen] = React.useState(false)

    const pauseable = props.backChannels.find(c => c.id === props.selectedTab?.channel.channelId)

    return <Menu anchorEl={props.anchorMenuTab} open={Boolean(props.anchorMenuTab)} onClose={props.onClose}>
        <MenuList dense sx={{width:'40vh'}}>
            <MenuItem key='subtab' onClick={() => setSubmenuTabOpen(!subMenuTabOpen)} sx={{ml:3}}>Tab<Typography sx={{flexGrow:1}}></Typography>{subMenuTabOpen ? <ExpandLess/> : <ExpandMore/>}</MenuItem>
            <Collapse in={subMenuTabOpen} timeout="auto" unmountOnExit sx={{ml:5}}>
                <MenuItem key='tabi' onClick={() => props.optionSelected(MenuTabOption.TabInfo)} disabled={props.selectedTabIndex<0}><Info/>&nbsp;Information</MenuItem>
                <MenuItem key='tabr' onClick={() => props.optionSelected(MenuTabOption.TabRename)} disabled={props.selectedTabIndex<0}><DriveFileRenameOutline/>&nbsp;Rename</MenuItem>
                <MenuItem key='tabd' onClick={() => props.optionSelected(MenuTabOption.TabSetDefault)} disabled={props.selectedTabIndex<0} sx={{ml: props.selectedTab?.defaultTab?0:3}}> {props.selectedTab?.defaultTab && <Check/>} Set default tab for workspace</MenuItem>
                <MenuItem key='tabml' onClick={() => props.optionSelected(MenuTabOption.TabMoveLeft)} disabled={props.selectedTabIndex===0}><KeyboardArrowLeft/>Move to left</MenuItem>
                <MenuItem key='tabmr' onClick={() => props.optionSelected(MenuTabOption.TabMoveRight)} disabled={props.selectedTabIndex===props.tabs.length-1}><KeyboardArrowRight/>Move to right</MenuItem>
                <MenuItem key='tabms' onClick={() => props.optionSelected(MenuTabOption.TabMoveFirst)} disabled={props.selectedTabIndex===0}><KeyboardDoubleArrowLeft/>&nbsp;Move to start</MenuItem>
                <MenuItem key='tabme' onClick={() => props.optionSelected(MenuTabOption.TabMoveLast)} disabled={props.selectedTabIndex===props.tabs.length-1}><KeyboardDoubleArrowRight/>&nbsp;Move to end</MenuItem>
                <MenuItem key='tabrm' onClick={() => props.optionSelected(MenuTabOption.TabRemove)}><RemoveCircleRounded/>&nbsp;Remove</MenuItem>
                <MenuItem key='restoreparms' onClick={() => props.optionSelected(MenuTabOption.TabRestoreParameters)}><FactCheck/>&nbsp;Restore tab parameters</MenuItem>
                <MenuItem key='fullscreen' onClick={() => props.optionSelected(MenuTabOption.FullScreen)}><Fullscreen/>&nbsp;Full screen (Ctrl+Alt+F11)</MenuItem>
            </Collapse>
            
            <MenuItem key='channelstart' onClick={() => props.optionSelected(MenuTabOption.ChannelStart)} disabled={props.selectedTab?.channelStarted}><PlayCircle/>&nbsp;Start</MenuItem>
            <MenuItem key='channelpause' onClick={() => props.optionSelected(MenuTabOption.ChannelPause)} disabled={!props.selectedTab?.channelStarted || !pauseable}>{props.selectedTab?.channelPaused?<><PlayArrow/>Resume</>:<><Pause/>Pause</>}</MenuItem>
            <MenuItem key='channelstop' onClick={() => props.optionSelected(MenuTabOption.ChannelStop)} disabled={!props.selectedTab?.channelStarted}><Stop/>&nbsp;Stop</MenuItem>

        </MenuList>
    </Menu>
}

export { MenuTab, MenuTabOption }