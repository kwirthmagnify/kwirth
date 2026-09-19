import { SvgIcon, SvgIconProps } from '@mui/material'

/*
    Los iconos que usa SOLO Magnify.

    El barrel de kwirth (`common-front/src/kwirthicons.ts`) es la lista de iconos COMUNES, y ademas es la
    que el core publica a las extensiones en `window.__kwirth__.MUI.icons`. Un icono que usa un unico canal
    no pinta en esa API: aqui la razon no es tanto el peso (Magnify viaja en el bundle del core de todas
    formas) como no ensanchar el contrato con cosas que nadie mas va a pedir.

    `SvgIcon` sale de `@mui/material`, que el front del core ya tiene; el ahorro es el envoltorio de
    `@mui/icons-material`, que se cambia por un `path`.

    Para añadir otro: copia el `d` de `@mui/icons-material/<Nombre>.js` — todos sus paths si tiene varios.

    Los paths son de Material Icons (Apache-2.0).
*/

export const West = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="m9 19 1.41-1.41L5.83 13H22v-2H5.83l4.59-4.59L9 5l-7 7z" /></SvgIcon>
)

export const PinDrop = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M18 8c0-3.31-2.69-6-6-6S6 4.69 6 8c0 4.5 6 11 6 11s6-6.5 6-11m-8 0c0-1.1.9-2 2-2s2 .9 2 2-.89 2-2 2c-1.1 0-2-.9-2-2M5 20v2h14v-2z" /></SvgIcon>
)

export const HorizontalRule = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M4 11h16v2H4z" /></SvgIcon>
)

export const ManageSearch = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M7 9H2V7h5zm0 3H2v2h5zm13.59 7-3.83-3.83c-.8.52-1.74.83-2.76.83-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5c0 1.02-.31 1.96-.83 2.75L22 17.59zM17 11c0-1.65-1.35-3-3-3s-3 1.35-3 3 1.35 3 3 3 3-1.35 3-3M2 19h10v-2H2z" /></SvgIcon>
)

export const Iso = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2M5.5 7.5h2v-2H9v2h2V9H9v2H7.5V9h-2zM19 19H5L19 5zm-2-2v-1.5h-5V17z" /></SvgIcon>
)

export const HomeRepairService = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M18 16h-2v-1H8v1H6v-1H2v5h20v-5h-4zm2-8h-3V6c0-1.1-.9-2-2-2H9c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v4h4v-2h2v2h8v-2h2v2h4v-4c0-1.1-.9-2-2-2m-5 0H9V6h6z" /></SvgIcon>
)

export const CloudOff = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4c-1.48 0-2.85.43-4.01 1.17l1.46 1.46C10.21 6.23 11.08 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19c1.66 0 3 1.34 3 3 0 1.13-.64 2.11-1.56 2.62l1.45 1.45C23.16 18.16 24 16.68 24 15c0-2.64-2.05-4.78-4.65-4.96M3 5.27l2.75 2.74C2.56 8.15 0 10.77 0 14c0 3.31 2.69 6 6 6h11.73l2 2L21 20.73 4.27 4zM7.73 10l8 8H6c-2.21 0-4-1.79-4-4s1.79-4 4-4z" /></SvgIcon>
)

export const List = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M3 13h2v-2H3zm0 4h2v-2H3zm0-8h2V7H3zm4 4h14v-2H7zm0 4h14v-2H7zM7 7v2h14V7z" /></SvgIcon>
)

export const EditOff = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="m12.126 8.125 1.937-1.937 3.747 3.747-1.937 1.938zM20.71 5.63l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75L20.71 7a1 1 0 0 0 0-1.37M2 5l6.63 6.63L3 17.25V21h3.75l5.63-5.62L18 21l2-2L4 3z" /></SvgIcon>
)
