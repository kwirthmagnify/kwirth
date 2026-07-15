import React from 'react'
import { IconButton, Tooltip } from '@mui/material'
import { HelpOutline } from '@mui/icons-material'

// Botón de ayuda reutilizable para dialogs de configuración: abre la guía (docsify) en un NUEVO tab en
// una sección concreta, deep-link vía hash routing (p.ej. …/#/admin/06-sla-settings). `section` puede
// llevar ancla de heading (…?id=slug). Pensado para la barra de título de un dialog.
// Regla de proyecto: si un dialog tiene sección de ayuda, llevar este botón (ver memoria dialog-help-button).

const DEFAULT_DOCS_URL = 'http://localhost:4000'   // fallback si no hay docsUrl configurado

export interface IHelpButtonProps {
    docsUrl?: string    // base de la guía (p.ej. generalConfig.docsUrl); si falta, DEFAULT_DOCS_URL
    section: string     // ruta de la sección, sin barra inicial (p.ej. 'admin/06-sla-settings')
}

const HelpButton: React.FC<IHelpButtonProps> = ({ docsUrl, section }) => {
    const open = (): void => {
        const base = (docsUrl || DEFAULT_DOCS_URL).replace(/\/+$/, '')
        // Popup del navegador (ventana aparte, no pestaña): las features de tamaño fuerzan el popup.
        // Tamaño: 48% ancho × 64% alto de la pantalla ACTUAL. Centrado en su monitor (multi-monitor) vía
        // availLeft/availTop (origen del monitor donde está la ventana). left/top solo los respeta si es popup real.
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
        // Nombre estable → clics sucesivos reusan la misma ventana (navega a la nueva sección).
        const w = window.open(`${base}/#/${section}`, 'kwirth-guide', features)
        if (w) { w.opener = null; w.focus() }   // opener=null = seguridad (equiv. noopener, que aquí forzaría pestaña)
    }
    return (
        <Tooltip arrow title='Open the guide for this section'>
            <IconButton size='small' aria-label='help' onClick={open}><HelpOutline fontSize='small' /></IconButton>
        </Tooltip>
    )
}

export { HelpButton }
