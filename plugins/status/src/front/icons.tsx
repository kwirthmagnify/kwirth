import React from 'react'
import { SvgIcon, SvgIconProps } from '@mui/material'

/*
    This plugin's OWN icon.

    It does not go to common-front's barrel: that is the list of COMMON icons and, above all, the contract
    the core publishes to every extension in 'window.__kwirth__.MUI.icons'. An icon only one plugin uses
    has no reason to widen that contract — here it costs a few hundred bytes and zero dependencies.

    ⚠️ The stroke attributes go on the <g>, NOT on the <SvgIcon>. MUI applies
    '.MuiSvgIcon-root { fill: currentColor }' through CSS, and CSS beats a presentation attribute: put up
    there, the icon comes out FILLED and looks like a blob.
*/

/**
 * A screen with a heartbeat inside: Kwirth's state seen from outside.
 *
 * It is drawn with a stroke and not a fill on purpose — the frame has to read as an outline, and at
 * 20 px a solid silhouette does not tell the pulse apart from the border.
 */
export const StatusIcon = (props: SvgIconProps) => (
    <SvgIcon {...props} viewBox='0 0 24 24'>
        <g fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
            <rect x='2.6' y='4.6' width='18.8' height='14.8' rx='2.2' />
            <path d='M6 12h2.6l1.5-3.4 2.6 6.8 1.5-3.4H18' />
        </g>
    </SvgIcon>
)
