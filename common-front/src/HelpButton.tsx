import React from 'react'
import { IconButton, Tooltip } from '@mui/material'
import HelpOutline from '@mui/icons-material/HelpOutline'

// A reusable help button for configuration dialogs: it opens the guide (docsify) in a NEW tab at a
// specific section, deep-linked through hash routing (e.g. …/#/admin/06-sla-settings). `section` may
// carry a heading anchor (…?id=slug). Meant for a dialog's title bar.
// Project rule: when a dialog has a help section, it carries this button (see the dialog-help-button note).

// ⚠️ THERE USED TO BE a `DEFAULT_DOCS_URL = 'http://localhost:4000'` here, left over from when guides
// were served by hand. It rewarded the bad pattern: if you passed no base, the button did not fail — it
// went to a local port that exists in no cluster. Because of that, agora spent months with the wrong URL
// and nobody noticed. With no base there is no button: better it does not appear at all than appear and
// lead nowhere.
//
// To build the base, use `docsUrl(clusterUrl, type, id)` from this same package.

export interface IHelpButtonProps {
    docsUrl?: string    // base de la guía; derívala con docsUrl(clusterUrl, …). Sin ella no se pinta nada
    section: string     // ruta de la sección, sin barra inicial (p.ej. 'admin/06-sla-settings')
}

const HelpButton: React.FC<IHelpButtonProps> = ({ docsUrl, section }) => {
    const open = (): void => {
        const base = (docsUrl ?? '').replace(/\/+$/, '')
        // A browser popup (a separate window, not a tab): the size features are what force the popup.
        // Size: 48% width × 64% height of the CURRENT screen. Centred on its own monitor (multi-monitor)
        // through availLeft/availTop (the origin of the monitor the window is on). left/top are only
        // honoured when it really is a popup.
        const scr = window.screen as Screen & { availLeft?: number; availTop?: number }
        const sw = scr.availWidth
        const sh = scr.availHeight
        const width = Math.round(sw * 0.48)
        const height = Math.round(sh * 0.64)
        const originX = scr.availLeft ?? window.screenX ?? 0
        const originY = scr.availTop ?? window.screenY ?? 0
        const left = Math.round(originX + (sw - width) / 2)
        const top = Math.round(originY + (sh - height) / 2)
        const features = `popup=yes,width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
        // A stable name → successive clicks reuse the same window (it navigates to the new section).
        const w = window.open(`${base}/#/${section}`, 'kwirth-guide', features)
        if (w) { w.opener = null; w.focus() }   // opener=null = seguridad (equiv. noopener, que aquí forzaría pestaña)
    }
    if (!docsUrl) return null
    return (
        <Tooltip arrow title='Open the guide for this section'>
            <IconButton size='small' aria-label='help' onClick={open}><HelpOutline fontSize='small' /></IconButton>
        </Tooltip>
    )
}

export { HelpButton }
