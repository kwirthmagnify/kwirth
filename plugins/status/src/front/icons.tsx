import React from 'react'
import { SvgIcon, SvgIconProps } from '@mui/material'

/*
    El icono PROPIO de este plugin.

    No va al barrel de common-front: ese es la lista de iconos COMUNES y, sobre todo, el contrato que el
    core publica a todas las extensiones en 'window.__kwirth__.MUI.icons'. Un icono que solo usa un plugin
    no tiene por qué ensanchar ese contrato — aquí cuesta unos cientos de bytes y cero dependencias.

    ⚠️ Los atributos de trazo van en el <g>, NO en el <SvgIcon>. MUI aplica por CSS
    '.MuiSvgIcon-root { fill: currentColor }', y el CSS gana a un atributo de presentación: puesto arriba,
    el icono sale RELLENO y se ve como una mancha.
*/

/**
 * Una pantalla con un latido dentro: el estado de Kwirth mirado desde fuera.
 *
 * Se dibuja con trazo y no con relleno a propósito — el marco tiene que leerse como un contorno, y a
 * 20 px una silueta maciza no distingue el pulso del borde.
 */
export const StatusIcon = (props: SvgIconProps) => (
    <SvgIcon {...props} viewBox='0 0 24 24'>
        <g fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
            <rect x='2.6' y='4.6' width='18.8' height='14.8' rx='2.2' />
            <path d='M6 12h2.6l1.5-3.4 2.6 6.8 1.5-3.4H18' />
        </g>
    </SvgIcon>
)
