import React from 'react'
import { SvgIcon, SvgIconProps } from '@mui/material'

/*
    The icon that identifies this plugin: a head in profile, line art, talking — three waves come out of its
    mouth. The head is only its front half — crown, forehead, eye, nose, mouth, chin and the front of the
    neck — with no nape.

    It lives HERE and not in the kwirth barrel because it is this plugin's own: the barrel is for the common
    icons and cannot grow with the icon of every plugin. `SvgIcon` comes from `@mui/material`, which the build
    resolves against the core's global, so this adds no dependencies.

    ⚠️ The SAME drawing is declared as raw SVG in the `icon` field of package.json. That one is what the CORE
    paints (managers, marketplace) through `resolveExtensionIcon`, sanitised with an allow list that keeps
    path, circle, stroke and stroke-width; this one is what the plugin itself uses. If one changes, the other
    must too.
*/

export const MircTalkingHead = (props: SvgIconProps) => (
    <SvgIcon {...props} viewBox='0 0 24 24'>
        <g fill='none' stroke='currentColor' strokeWidth={1.8} strokeLinecap='round' strokeLinejoin='round'>
            <path d='M3 3.6C5.6 2.4 8 3 8.8 5.2C9.2 6.4 9 7.4 9.2 8.2L8.9 9.2L11.6 12.4L9.4 12.9L9.9 13.9L9.2 14.4L9.9 15.1L9.4 15.7L10.3 16.8L8 17.6C7.4 17.9 7.2 18.8 7.2 21' />
            <path d='M15.4 11.8Q16.7 14 15.4 16.2M17.8 10.2Q19.7 14 17.8 17.8M20.2 8.6Q22.7 14 20.2 19.4' strokeWidth={1.6} />
        </g>
        <circle cx='7.2' cy='9.2' r='0.85' fill='currentColor' />
    </SvgIcon>
)
