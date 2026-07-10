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
        window.open(`${base}/#/${section}`, '_blank', 'noopener,noreferrer')
    }
    return (
        <Tooltip arrow title='Open the guide for this section'>
            <IconButton size='small' aria-label='help' onClick={open}><HelpOutline fontSize='small' /></IconButton>
        </Tooltip>
    )
}

export { HelpButton }
