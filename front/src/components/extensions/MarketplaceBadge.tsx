import React from 'react'
import { Box, Chip, Tooltip } from '@mui/material'
import { CloudQueue, FolderOpen, Https, Link, Terminal } from '@kwirthmagnify/kwirth-common-front/icons'

// El marketplace publico no tiene id ni label propios: en el catalogo se representa con label undefined.
// Pero una extension YA INSTALADA necesita constancia de que vino de EL y no de una url pegada a mano, asi
// que al instalar se graba este label. Sin esto, lo instalado del publico se veia como 'descargado de una
// url suelta': icono de consola y sin chip.
export const PUBLIC_MARKETPLACE_LABEL = 'Kwirth'

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
// ⚠️ La procedencia se GUARDA al instalar, no se deduce. Antes se miraba la URL de descarga, y eso dejo
// de valer: el manifest y los paquetes viven en servidores distintos, asi que la url del tgz apunta al
// registro y no dice nada del marketplace. Ademas, con precedencia por id, dos marketplaces pueden servir
// la misma extension y hay que saber cual instalo el usuario, no cual gana hoy.
//
// Por eso un label presente MANDA: significa que consta de donde vino. La heuristica de la url solo se
// aplica cuando no consta nada, que es el caso de una url pegada a mano o de lo instalado antes de esto.
const comesFromNoMarketplace = (label?: string, installedFrom?: string): boolean =>
    !label && (installedFrom === 'dev' || installedFrom === 'local' || isPlainUrl(installedFrom))

// Una URL de descarga directa. El marketplace publico se sirve desde el repo de kwirthmagnify, asi que
// esa sí es procedencia conocida y no entra aqui.
const isPlainUrl = (installedFrom?: string): boolean =>
    Boolean(installedFrom)
    && /^https?:\/\//i.test(installedFrom!)
    && !installedFrom!.includes('github.com/kwirthmagnify')

const MarketplaceBadge: React.FC<IMarketplaceBadgeProps> = (props: IMarketplaceBadgeProps) => {
    if (comesFromNoMarketplace(props.label, props.installedFrom)) return null

    // Lo que viene DENTRO de Kwirth no lo sirve el marketplace publico. Etiquetarlo 'Kwirth' anunciaba
    // como OSS publica a una extension de pago cargada en el bundle.
    if (!props.label && props.installedFrom === 'bundled') {
        return (
            <Tooltip title='Shipped inside this Kwirth image — it does not come from any marketplace'>
                <Chip label='Bundled' size='small' variant='outlined' sx={compact} />
            </Tooltip>
        )
    }

    // El publico: sin label en el catalogo, con PUBLIC_MARKETPLACE_LABEL una vez instalado. Perfilado, no
    // relleno, para que se distinga de un privado de un vistazo.
    if (!props.label || props.label === PUBLIC_MARKETPLACE_LABEL) {
        return (
            <Tooltip title='Served by the public Kwirth marketplace'>
                <Chip label={PUBLIC_MARKETPLACE_LABEL} size='small' variant='outlined' sx={compact} />
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
    // La CONSOLA es de dev y solo de dev. Un fichero local y una url pegada a mano tampoco vienen de un
    // marketplace, pero no son lo mismo: cada uno lleva su icono, o el de dev deja de significar dev.
    if (comesFromNoMarketplace(props.label, props.installedFrom)) {
        const [title, icon] = props.installedFrom === 'dev'
            ? ['Loaded from disk (kwirth-dev.json) — it does not come from any marketplace', <Terminal fontSize='small' />]
            : props.installedFrom === 'local'
                ? ['Installed from a local file — it does not come from any marketplace', <FolderOpen fontSize='small' />]
                : [`Downloaded directly from ${props.installedFrom} — it does not come from any marketplace`, <Link fontSize='small' />]
        return (
            <Tooltip title={title as string}>
                <Box sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', mr: 0.75 }}>{icon}</Box>
            </Tooltip>
        )
    }

    const isPrivate = Boolean(props.label) && props.label !== PUBLIC_MARKETPLACE_LABEL
    return (
        <Tooltip title={isPrivate ? `From the private '${props.label}' marketplace` : 'From the public Kwirth marketplace'}>
            <Box sx={{ color: isPrivate ? 'warning.main' : 'text.secondary', display: 'flex', alignItems: 'center', mr: 0.75 }}>
                { isPrivate ? <Https fontSize='small' /> : <CloudQueue fontSize='small' /> }
            </Box>
        </Tooltip>
    )
}

export { MarketplaceBadge, MarketplaceSourceIcon, compactChip }
