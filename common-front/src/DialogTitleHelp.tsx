import React from 'react'
import { DialogTitle, DialogTitleProps, Box } from '@mui/material'
import { HelpButton } from './HelpButton'

// DialogTitle con botón de ayuda a la derecha (regla de proyecto: si el dialog tiene sección de guía,
// llevar HelpButton que la abra). `section` = ruta docsify (p.ej. 'admin/06-sla-settings');
// `docsUrl` = base de la guía. Mantiene el título a la izquierda, tamaño fijo.
export interface IDialogTitleHelpProps extends Omit<DialogTitleProps, 'title'> {
    section: string
    docsUrl?: string
    children: React.ReactNode
}

const DialogTitleHelp: React.FC<IDialogTitleHelpProps> = ({ section, docsUrl, children, sx, id, ...rest }) => {
    const generatedId = React.useId()
    const titleId = id ?? generatedId
    const ref = React.useRef<HTMLHeadingElement>(null)

    /*
        MUI reconoce el titulo de un Dialog por identidad del componente, y solo cuando es hijo DIRECTO:
        ahi le inyecta el id al que apunta el 'aria-labelledby' del dialogo. Envuelto en este componente
        deja de reconocerlo, el aria-labelledby se queda apuntando a un id que no existe y el dialogo
        acaba SIN NOMBRE ACCESIBLE — un lector de pantalla lo anuncia sin titulo, y
        getByRole('dialog', { name }) no lo encuentra.

        Se corrige aqui, una vez para todos los dialogos: el titulo se identifica con su propio id y se
        le dice al dialogo que mire ahi. Se detecto porque un e2e que buscaba un dialogo por su nombre
        dejo de verlo al cambiarle el DialogTitle por este componente.
    */
    React.useLayoutEffect(() => {
        const dialog = ref.current?.closest('[role="dialog"]')
        if (dialog) dialog.setAttribute('aria-labelledby', titleId)
    }, [titleId])

    return (
        <DialogTitle {...rest} id={titleId} ref={ref}
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, ...sx }}>
            <Box component='span'>{children}</Box>
            <HelpButton section={section} docsUrl={docsUrl} />
        </DialogTitle>
    )
}

export { DialogTitleHelp }
