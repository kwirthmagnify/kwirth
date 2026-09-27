import React from 'react'
import { SvgIcon, SvgIconProps } from '@mui/material'

/*
    The icon ONLY Fileman uses.

    Kwirth's barrel is for the COMMON ones: it travels in the front end's bundle, which everybody
    downloads, so an icon belonging to a single plugin charges it to whoever does not use it. `SvgIcon`
    comes from `@mui/material`, which the build already resolves against the core's global, so this adds
    no dependencies and does not bundle MUI.

    To add another: copy the `d` from `@mui/icons-material/<Name>.js` — all of its paths if it has several.
    Do not import `@mui/icons-material` here: the build redirects it to the core's barrel.

    The paths are Material Icons' (Apache-2.0).
*/

export const HexagonOutlined = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M17.2 3H6.8l-5.2 9 5.2 9h10.4l5.2-9zm-1.15 16h-8.1l-4.04-7 4.04-7h8.09l4.04 7z" /></SvgIcon>
)
