import React from 'react'
import { Box } from '@mui/material'
import * as MuiIcons from '@kwirthmagnify/kwirth-common-front/icons'
import { sanitizeSvg } from '../../tools/sanitizeSvg'

/*
    The icon an extension declares in its package.json, which admits TWO shapes:

      · the name of an icon from the curated set ('Newspaper', 'Science'…), which is how it used to be
      · a raw SVG, so that an extension can bring ITS icon

    The second exists because the curated set is served by the common package: a plugin wanting an icon
    of its own forced adding an export to kwirthicons, publishing common-front and rebuilding the core.
    For a third-party plugin that is flatly impossible.

    ⚠️ The SVG is SANITIZED with a whitelist before painting it (see sanitizeSvg): it comes from the
    package.json of an extension that may have been installed from somebody else's marketplace, and an
    SVG admits <script> and on* handlers.
*/
const resolveExtensionIcon = (iconName: string | undefined, fallback: React.ReactNode): React.ReactNode => {
    const svg = sanitizeSvg(iconName)
    if (svg) return <Box component='span' sx={{ display: 'flex', width: 24, height: 24 }} dangerouslySetInnerHTML={{ __html: svg }} />
    const IconComponent = iconName ? (MuiIcons as Record<string, React.ElementType>)[iconName] : undefined
    return IconComponent ? <IconComponent /> : fallback
}

export { resolveExtensionIcon }
