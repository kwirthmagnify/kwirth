import React from 'react'
import { SvgIcon, SvgIconProps } from '@mui/material'

/*
    The channel's icon: a globe with a probe line across it.

    ⚠️ It has to be an SvgIcon and not a character in a <span>: the channel selector builds each option
    out of the icon plus the channel's name, and an icon that carries TEXT becomes the option's
    accessible name — a channel once showed up in the list as '◎', with its id nowhere, and nothing
    looked broken. An SVG contributes no text, so the name is the name.
*/
export const NetToolsIcon = (props: SvgIconProps) => (
    <SvgIcon {...props} viewBox='0 0 24 24'>
        <g fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round'>
            <circle cx='12' cy='12' r='9' />
            <path d='M3 12h18' />
            <path d='M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z' />
        </g>
    </SvgIcon>
)
