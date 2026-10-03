import React from 'react'
import { SvgIcon, SvgIconProps } from '@mui/material'

/*
    The icon that identifies this plugin.

    The SAME drawing is declared as raw SVG in the `icon` field of package.json.
    If one changes, the other must change too.
*/

export const RallyxSteeringWheel = (props: SvgIconProps) => (
    <SvgIcon {...props}>
        <circle cx='12' cy='12' r='9' fill='none' stroke='currentColor' strokeWidth='2' />
        <circle cx='12' cy='12' r='3' fill='none' stroke='currentColor' strokeWidth='2' />
        <path d='M12 9V3M9 12H3M15 12h6' stroke='currentColor' strokeWidth='2' strokeLinecap='round' />
    </SvgIcon>
)
