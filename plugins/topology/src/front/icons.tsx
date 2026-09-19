import React from 'react'
import { SvgIcon, SvgIconProps } from '@mui/material'

/*
    Los iconos que usa SOLO Topology (los tres de la botonera de la camara).

    El barrel de kwirth es para los COMUNES: viaja en el bundle del front, que descarga todo el mundo, asi
    que un icono de un unico plugin se lo cobra a quien no lo usa. `SvgIcon` sale de `@mui/material`, que el
    build ya resuelve contra el global del core, de modo que esto no añade dependencias ni bundlea MUI.

    ⚠️ ZoomIn y ZoomOut llevan DOS paths (la lupa y el signo): con uno solo el icono sale a medias.

    Para añadir otro: copia el `d` de `@mui/icons-material/<Nombre>.js` — TODOS sus paths. No importes
    `@mui/icons-material` aqui: el build lo redirige al barrel del core.

    Los paths son de Material Icons (Apache-2.0).
*/

export const CenterFocusStrong = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4m-7 7H3v4c0 1.1.9 2 2 2h4v-2H5zM5 5h4V3H5c-1.1 0-2 .9-2 2v4h2zm14-2h-4v2h4v4h2V5c0-1.1-.9-2-2-2m0 16h-4v2h4c1.1 0 2-.9 2-2v-4h-2z" /></SvgIcon>
)

export const ZoomIn = (props: SvgIconProps) => (
    <SvgIcon {...props}>
        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14" />
        <path d="M12 10h-2v2H9v-2H7V9h2V7h1v2h2z" />
    </SvgIcon>
)

export const ZoomOut = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14M7 9h5v1H7z" /></SvgIcon>
)
