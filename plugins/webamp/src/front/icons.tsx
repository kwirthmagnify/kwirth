import React from 'react'
import { SvgIcon, SvgIconProps } from '@mui/material'

/*
    The icon that identifies this plugin.

    It lives HERE and not in the kwirth icon barrel because it is THIS plugin's
    own: the barrel is for common icons and cannot grow with every plugin.

    The SAME drawing is declared as raw SVG in the `icon` field of package.json.
    If one changes, the other must change too.
*/

export const WebampMusicNote = (props: SvgIconProps) => (
    <SvgIcon {...props}>
        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3z" />
    </SvgIcon>
)
