import { SvgIcon, SvgIconProps } from '@mui/material'

/*
    Los iconos que usa SOLO el canal Metrics (el menu de tipos de grafico).

    El barrel de kwirth (`common-front/src/kwirthicons.ts`) es la lista de iconos COMUNES, y ademas es la
    que el core publica a las extensiones en `window.__kwirth__.MUI.icons`. Un icono que usa un unico menu
    no pinta en esa API.

    ⚠️ Ojo con los nombres: `AreaChart` y `PieChart` son TAMBIEN componentes de **recharts**, y ahi si se
    usan en varios sitios (`Chart.tsx`, `Homepage.tsx`). Son cosas distintas con el mismo nombre: aqui son
    los ICONOS del menu. Si algun dia un fichero necesita el icono y el grafico a la vez, hay que renombrar
    uno de los dos en el import.

    Para añadir otro: copia el `d` de `@mui/icons-material/<Nombre>.js` — todos sus paths si tiene varios.

    Los paths son de Material Icons (Apache-2.0).
*/

export const AreaChart = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M3 13v7h18v-1.5l-9-7L8 17zm0-6 4 3 5-7 5 4h4v8.97l-9.4-7.31-3.98 5.48L3 10.44z" /></SvgIcon>
)

export const PieChart = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M11 2v20c-5.07-.5-9-4.79-9-10s3.93-9.5 9-10m2.03 0v8.99H22c-.47-4.74-4.24-8.52-8.97-8.99m0 11.01V22c4.74-.47 8.5-4.25 8.97-8.99z" /></SvgIcon>
)

export const LegendToggle = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M20 15H4v-2h16zm0 2H4v2h16zm-5-6 5-3.55V5l-5 3.55L10 5 4 8.66V11l5.92-3.61z" /></SvgIcon>
)

export const ThirtyFps = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M2 5v3h6v2.5H3v3h5V16H2v3h6c1.66 0 3-1.34 3-3v-1.9c0-1.16-.94-2.1-2.1-2.1 1.16 0 2.1-.94 2.1-2.1V8c0-1.66-1.34-3-3-3zm17 3v8h-4V8zm0-3h-4c-1.66 0-3 1.34-3 3v8c0 1.66 1.34 3 3 3h4c1.66 0 3-1.34 3-3V8c0-1.66-1.34-3-3-3" /></SvgIcon>
)
