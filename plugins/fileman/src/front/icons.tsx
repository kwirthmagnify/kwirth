import React from 'react'
import { SvgIcon, SvgIconProps } from '@mui/material'

/*
    El icono que usa SOLO Fileman.

    El barrel de kwirth es para los COMUNES: viaja en el bundle del front, que descarga todo el mundo, asi
    que un icono de un unico plugin se lo cobra a quien no lo usa. `SvgIcon` sale de `@mui/material`, que el
    build ya resuelve contra el global del core, de modo que esto no añade dependencias ni bundlea MUI.

    Para añadir otro: copia el `d` de `@mui/icons-material/<Nombre>.js` — todos sus paths si tiene varios.
    No importes `@mui/icons-material` aqui: el build lo redirige al barrel del core.

    Los paths son de Material Icons (Apache-2.0).
*/

export const HexagonOutlined = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M17.2 3H6.8l-5.2 9 5.2 9h10.4l5.2-9zm-1.15 16h-8.1l-4.04-7 4.04-7h8.09l4.04 7z" /></SvgIcon>
)
