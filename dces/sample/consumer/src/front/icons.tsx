import React from 'react'
import { SvgIcon, SvgIconProps } from '@mui/material'

/*
    The stub's own icon.

    ⚠️ It has to be an SvgIcon and not a character in a <span>: the channel selector builds each option
    out of the icon plus the channel's name, and an icon that carries TEXT becomes the option's
    accessible name — the channel showed up in the list as '◎', with its id nowhere, and nothing looked
    broken. An SVG contributes no text, so the name is the name.
*/
export const ConsumerIcon = (props: SvgIconProps) => (
    <SvgIcon {...props} viewBox='0 0 24 24'>
        <g fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
            <circle cx='12' cy='12' r='3.2' />
            <path d='M12 3v3.6M12 17.4V21M3 12h3.6M17.4 12H21' />
        </g>
    </SvgIcon>
)
