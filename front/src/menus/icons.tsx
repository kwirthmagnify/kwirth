import { SvgIcon, SvgIconProps } from '@mui/material'

/*
    Los iconos que usan SOLO los menus del core (MenuTab y MenuDrawer).

    El barrel de kwirth (`common-front/src/kwirthicons.ts`) es la lista de iconos COMUNES, y ademas es la
    que el core publica a las extensiones en `window.__kwirth__.MUI.icons`. Estos seis no los pide nadie
    mas, asi que no tienen por que estar en esa API.

    ⚠️ Son iconos de MENU, al lado de texto y junto a otros de 24x24 (`Delete`, `Check`, `FactCheck`…).
    Por eso siguen siendo SVG y no caracteres tipograficos (‹ › « »): un glifo tiene ancho de letra, no
    caja de 24, desalinea el texto de su fila respecto a las demas, cambia de dibujo segun la fuente —y
    aqui los temas instalables cambian la fuente— y lo leeria el lector de pantalla como texto.

    `Save` y `SaveAs` NO estan aqui a proposito: son comunes y se quedan en el barrel.

    ⚠️ KeyboardDoubleArrowLeft/Right llevan DOS paths (una punta de flecha cada uno): con uno solo sale
    media flecha.

    Los paths son de Material Icons (Apache-2.0).
*/

export const KeyboardArrowLeft = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M15.41 16.59 10.83 12l4.58-4.59L14 6l-6 6 6 6z" /></SvgIcon>
)

export const KeyboardArrowRight = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z" /></SvgIcon>
)

export const KeyboardDoubleArrowLeft = (props: SvgIconProps) => (
    <SvgIcon {...props}>
        <path d="M17.59 18 19 16.59 14.42 12 19 7.41 17.59 6l-6 6z" />
        <path d="m11 18 1.41-1.41L7.83 12l4.58-4.59L11 6l-6 6z" />
    </SvgIcon>
)

export const KeyboardDoubleArrowRight = (props: SvgIconProps) => (
    <SvgIcon {...props}>
        <path d="M6.41 6 5 7.41 9.58 12 5 16.59 6.41 18l6-6z" />
        <path d="m13 6-1.41 1.41L16.17 12l-4.58 4.59L13 18l6-6z" />
    </SvgIcon>
)

export const CreateNewFolder = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M20 6h-8l-2-2H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2m-1 8h-3v3h-2v-3h-3v-2h3V9h2v3h3z" /></SvgIcon>
)

export const FolderZip = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2m-2 6h-2v2h2v2h-2v2h-2v-2h2v-2h-2v-2h2v-2h-2V8h2v2h2z" /></SvgIcon>
)
