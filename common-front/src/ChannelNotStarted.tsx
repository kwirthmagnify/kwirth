import React from 'react'
import { Box, Button, Typography } from '@mui/material'
import PlayArrow from '@mui/icons-material/PlayArrow'
import type { IChannelObject } from './index'

/*
    What a tab shows while its channel is not started, the same in every extension: three lines — the icon and the
    name, then that it is not started and what starting it gives ('Agora not started. Start the channel to see the
    rooms.'), and a Start button that does exactly what the tab menu's Start does
    (channelObject.startChannel: the setup dialog first, when the channel has one). Only the content: each
    extension keeps its own container (the one that centres it in its area).

    With a core older than startChannel there is no button, and the hint says where Start is instead: the screen
    never offers a button that does nothing.
*/
export interface IChannelNotStartedProps {
    icon: React.ReactNode            // the extension's icon, as it wants it shown
    name: string                     // 'IRIA Agora'
    hint: string                     // the second line: 'Agora not started. Start the channel to see the rooms.'
    channelObject: IChannelObject    // its startChannel is what the button calls
    startIcon?: React.ReactNode      // the button's icon; absent = Material PlayArrow (IRIA passes its Feather Play)
}

const ChannelNotStarted: React.FC<IChannelNotStartedProps> = ({ icon, name, hint, channelObject, startIcon }) => {
    const start = channelObject.startChannel
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 1.5 }} data-testid='channel-not-started'>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {icon}
                <Typography variant='h6'>{name}</Typography>
            </Box>
            <Typography variant='body2' sx={{ color: 'text.secondary', maxWidth: 480 }}>
                {start ? hint : `${hint} Start it from the tab settings ⚙ → Start.`}
            </Typography>
            {start &&
                <Button variant='contained' size='small' startIcon={startIcon ?? <PlayArrow />} onClick={() => start()}>Start</Button>
            }
        </Box>
    )
}

export { ChannelNotStarted }
