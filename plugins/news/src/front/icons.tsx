import React from 'react'
import { SvgIcon, SvgIconProps } from '@mui/material'

/*
    El icono que identifica a este plugin.

    Vive AQUI y no en el barrel de kwirth porque es SUYO: el barrel es para los iconos comunes, y no puede
    crecer con el icono de cada plugin que exista — viaja en el bundle del front, que descarga todo el
    mundo. `SvgIcon` sale de `@mui/material`, que el build ya resuelve contra el global del core, asi que
    esto no añade dependencias.

    ⚠️ El MISMO dibujo esta declarado como SVG en crudo en el campo `icon` del package.json. Ese es el que
    pinta el CORE (managers, marketplace) via `resolveExtensionIcon`, que lo sanea con lista blanca; este
    es el que usa el propio plugin. Si se cambia uno, hay que cambiar el otro.

    El path es de Material Icons (Apache-2.0).
*/

export const Newspaper = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="m22 3-1.67 1.67L18.67 3 17 4.67 15.33 3l-1.66 1.67L12 3l-1.67 1.67L8.67 3 7 4.67 5.33 3 3.67 4.67 2 3v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2zM11 19H4v-6h7zm9 0h-7v-2h7zm0-4h-7v-2h7zm0-4H4V8h16z" /></SvgIcon>
)
