import React from 'react'
import { SvgIcon, SvgIconProps } from '@mui/material'

/*
    The icon that identifies this plugin.

    It lives HERE and not in kwirth's barrel because it is ITS OWN: the barrel is for the common icons,
    and it cannot grow with the icon of every plugin there is — it travels in the front end's bundle,
    which everybody downloads. `SvgIcon` comes from `@mui/material`, which the build already resolves
    against the core's global, so this adds no dependencies.

    ⚠️ The SAME drawing is declared as raw SVG in the package.json's `icon` field. That is the one the
    CORE draws (managers, marketplace) through `resolveExtensionIcon`, which sanitises it with an allow
    list; this is the one the plugin itself uses. Change one and you have to change the other.

    The path is Material Icons' (Apache-2.0).
*/

export const Newspaper = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="m22 3-1.67 1.67L18.67 3 17 4.67 15.33 3l-1.66 1.67L12 3l-1.67 1.67L8.67 3 7 4.67 5.33 3 3.67 4.67 2 3v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2zM11 19H4v-6h7zm9 0h-7v-2h7zm0-4h-7v-2h7zm0-4H4V8h16z" /></SvgIcon>
)
