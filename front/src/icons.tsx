import { SvgIcon, SvgIconProps } from '@mui/material'

/*
    Los iconos que usa SOLO el front del core, y que no caen dentro de un modulo con su propio fichero de
    iconos (magnify, metrics y menus tienen el suyo).

    El barrel de kwirth (`common-front/src/kwirthicons.ts`) tiene dos trabajos: ser la lista de iconos
    COMUNES y, sobre todo, ser la API que el core publica a las extensiones en
    `window.__kwirth__.MUI.icons`. Un icono que ninguna extension pide no tiene por que estar ahi: aqui no
    se gana descarga —el front del core lo bundlea igual— sino que no se ensancha ese contrato.

    Para añadir otro: copia el `d` de `@mui/icons-material/<Nombre>.js` — todos sus paths si tiene varios.

    Los paths son de Material Icons (Apache-2.0).
*/

export const AccountCircle = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 4c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6m0 14c-2.03 0-4.43-.82-6.14-2.88C7.55 15.8 9.68 15 12 15s4.45.8 6.14 2.12C16.43 19.18 14.03 20 12 20" /></SvgIcon>
)

export const Star = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></SvgIcon>
)

export const ViewModule = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M14.67 5v6.5H9.33V5zm1 6.5H21V5h-5.33zm-1 7.5v-6.5H9.33V19zm1-6.5V19H21v-6.5zm-7.34 0H3V19h5.33zm0-1V5H3v6.5z" /></SvgIcon>
)

export const Extension = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7s2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11" /></SvgIcon>
)

export const Factory = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M22 10v12H2V10l7-3v2l5-2v3zm-4.8-1.5L18 2h3l.8 6.5zM11 18h2v-4h-2zm-4 0h2v-4H7zm10-4h-2v4h2z" /></SvgIcon>
)

export const Fullscreen = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M7 14H5v5h5v-2H7zm-2-4h2V7h3V5H5zm12 7h-3v2h5v-5h-2zM14 5v2h3v3h2V5z" /></SvgIcon>
)
