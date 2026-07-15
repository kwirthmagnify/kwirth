import React from 'react'
import { DialogTitle, Box } from '@mui/material'
import { HelpButton } from './HelpButton'

// DialogTitle con botón de ayuda a la derecha (regla de proyecto: si el dialog tiene sección de guía,
// llevar HelpButton que la abra). `section` = ruta docsify (p.ej. 'admin/06-sla-settings');
// `docsUrl` = base de la guía. Mantiene el título a la izquierda, tamaño fijo.
export interface IDialogTitleHelpProps {
    section: string
    docsUrl?: string
    children: React.ReactNode
}

const DialogTitleHelp: React.FC<IDialogTitleHelpProps> = ({ section, docsUrl, children }) => (
    <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box component='span'>{children}</Box>
        <HelpButton section={section} docsUrl={docsUrl} />
    </DialogTitle>
)

export { DialogTitleHelp }
