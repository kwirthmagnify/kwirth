import React from 'react'
import { Box } from '@mui/material'
import * as MuiIcons from '@kwirthmagnify/kwirth-common-front/icons'
import { sanitizeSvg } from '../../tools/sanitizeSvg'

/*
    El icono que declara una extension en su package.json, que admite DOS formas:

      · el nombre de un icono del set curado ('Newspaper', 'Science'…), que es como estaba
      · un SVG en crudo, para que una extension pueda traer SU icono

    Lo segundo existe porque el set curado lo sirve el paquete comun: un plugin que quisiera un icono
    propio obligaba a añadir un export a kwirthicons, publicar common-front y reconstruir el core. Para un
    plugin de terceros eso es directamente imposible.

    ⚠️ El SVG se SANEA con lista blanca antes de pintarlo (ver sanitizeSvg): viene del package.json de una
    extension que puede haberse instalado desde un marketplace ajeno, y un SVG admite <script> y
    manejadores on*.
*/
const resolveExtensionIcon = (iconName: string | undefined, fallback: React.ReactNode): React.ReactNode => {
    const svg = sanitizeSvg(iconName)
    if (svg) return <Box component='span' sx={{ display: 'flex', width: 24, height: 24 }} dangerouslySetInnerHTML={{ __html: svg }} />
    const IconComponent = iconName ? (MuiIcons as Record<string, React.ElementType>)[iconName] : undefined
    return IconComponent ? <IconComponent /> : fallback
}

export { resolveExtensionIcon }
