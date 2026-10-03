import React from 'react'
import { SvgIcon, SvgIconProps } from '@mui/material'

/*
    El icono que identifica a este plugin.

    Vive AQUI y no en el barrel de kwirth porque es SUYO: el barrel es para los
    iconos comunes, y no puede crecer con el icono de cada plugin que exista.

    El MISMO dibujo esta declarado como SVG en crudo en el campo `icon` del
    package.json. Si se cambia uno, hay que cambiar el otro.
*/

export const PacmanGhost = (props: SvgIconProps) => (
    <SvgIcon {...props}>
        <path d="M20.32 8.56A9 9 0 1 0 20.32 15.44L12 12Z" />
    </SvgIcon>
)
