import React from 'react'
import { Box, Chip, Tooltip } from '@mui/material'
import { CloudQueue, Https, Terminal } from '@kwirthmagnify/kwirth-common-front/icons'

// Indicador de procedencia en las tarjetas del catalogo: que marketplace sirve esa extension.
// No es decorativo. Con la precedencia por id, un marketplace privado puede publicar su propio 'log' y
// tapar al publico, asi que esto es lo unico que distingue CUAL de los dos estas viendo.
//
// label undefined = viene del marketplace publico OSS.
interface IMarketplaceBadgeProps {
    label?: string
    // Procedencia real de una extension YA INSTALADA. Solo la tienen las tarjetas de instalados.
    installedFrom?: string
}

// Se pinta SIEMPRE, tambien para el publico. Marcar solo las privadas dejaba a las publicas sin ningun
// indicador, y no habia forma de distinguir "viene del marketplace publico" de "no se ha marcado" —
// sobre todo en dialogos cuya tarjeta ya lleva un candado como icono, que se lee como 'privado'.
// Algo mas pequeño que el 'small' de MUI. Se exporta para que TODOS los chips de una tarjeta de extension
// usen el mismo tamaño: mezclar tamaños en la misma fila se ve desordenado.
const compactChip = { height: 20, fontSize: '0.68rem', '& .MuiChip-label': { px: 0.9 } }
const compact = compactChip

/*
    Una extension de dev (kwirth-dev.json), instalada desde un fichero local o descargada de una URL
    suelta NO viene de ningun marketplace: su id no esta en ningun catalogo, asi que 'label' llega
    undefined y el fallback la etiquetaria como "publica de Kwirth". Eso no es solo impreciso, es falso
    — y con un artefacto de pago cargado en dev llega a anunciarlo como OSS publico. En esos casos no se
    pinta chip: basta el icono, que en su tooltip dice de donde salio de verdad.

    Antes la URL se enseñaba recortada en un chip aparte, que ademas de ocupar la fila entera duplicaba
    lo que ya dice el badge cuando la extension SI viene de un catalogo.
*/
const comesFromNoMarketplace = (installedFrom?: string): boolean =>
    installedFrom === 'dev' || installedFrom === 'local' || isPlainUrl(installedFrom)

// Una URL de descarga directa. El marketplace publico se sirve desde el repo de kwirthmagnify, asi que
// esa sí es procedencia conocida y no entra aqui.
const isPlainUrl = (installedFrom?: string): boolean =>
    Boolean(installedFrom)
    && /^https?:\/\//i.test(installedFrom!)
    && !installedFrom!.includes('github.com/kwirthmagnify')

const MarketplaceBadge: React.FC<IMarketplaceBadgeProps> = (props: IMarketplaceBadgeProps) => {
    if (comesFromNoMarketplace(props.installedFrom)) return null

    if (!props.label) {
        return (
            <Tooltip title='Served by the public Kwirth marketplace'>
                <Chip label='Kwirth' size='small' variant='outlined' sx={compact} />
            </Tooltip>
        )
    }
    // relleno, no perfilado: el chip 'dev' de estos dialogos ya es naranja perfilado y se confundirian
    return (
        <Tooltip title={`Served by the '${props.label}' marketplace, which takes precedence over the public Kwirth one`}>
            <Chip label={props.label} size='small' color='warning' sx={compact} />
        </Tooltip>
    )
}

/*
    El icono que acompaña al chip, con la misma decision en un solo sitio: candado si la sirve un
    marketplace privado, nube si la publica, y consola si no viene de ningun marketplace (dev o fichero
    local). Antes estaba duplicado en linea en los 10 dialogos de gestion de extensiones.
*/
const MarketplaceSourceIcon: React.FC<IMarketplaceBadgeProps> = (props: IMarketplaceBadgeProps) => {
    if (comesFromNoMarketplace(props.installedFrom)) {
        const title = props.installedFrom === 'dev'
            ? 'Loaded from disk (kwirth-dev.json) — it does not come from any marketplace'
            : props.installedFrom === 'local'
                ? 'Installed from a local file — it does not come from any marketplace'
                : `Downloaded directly from ${props.installedFrom} — it does not come from any marketplace`
        return (
            <Tooltip title={title}>
                <Box sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', mr: 0.75 }}>
                    <Terminal fontSize='small' />
                </Box>
            </Tooltip>
        )
    }
    return (
        <Tooltip title={props.label ? `From the private '${props.label}' marketplace` : 'From the public Kwirth marketplace'}>
            <Box sx={{ color: props.label ? 'warning.main' : 'text.secondary', display: 'flex', alignItems: 'center', mr: 0.75 }}>
                { props.label ? <Https fontSize='small' /> : <CloudQueue fontSize='small' /> }
            </Box>
        </Tooltip>
    )
}

export { MarketplaceBadge, MarketplaceSourceIcon, compactChip }
