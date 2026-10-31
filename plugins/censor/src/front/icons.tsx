import React from 'react'
import { SvgIcon, SvgIconProps } from '@mui/material'

/*
    The icon that identifies this plugin: lines of text struck out by an X that lies on top of them. The lines
    are cut where the X crosses them, so that the X reads as being in front of the text and not woven into it.

    It lives HERE and not in the kwirth barrel because it is this plugin's own: the barrel is for the common
    icons and cannot grow with the icon of every plugin. `SvgIcon` comes from `@mui/material`, which the build
    resolves against the core's global, so this adds no dependencies.

    ⚠️ The SAME drawing is declared as raw SVG in the `icon` field of package.json. That one is what the CORE
    paints (managers, marketplace) through `resolveExtensionIcon`, sanitised with an allow list that keeps
    path, stroke and stroke-width; this one is what the plugin itself uses. If one changes, the other must too.
*/

export const CensorStruckText = (props: SvgIconProps) => (
    <SvgIcon {...props} viewBox='0 0 24 24'>
        <path d='M9.1 5h5.8M3 9.5h3.6M3 14h4M17 14h4M9.5 18.5h4.5'
            fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' />
        <path d='M5 4l14 16M19 4L5 20'
            fill='none' stroke='currentColor' strokeWidth={2.4} strokeLinecap='round' />
    </SvgIcon>
)
