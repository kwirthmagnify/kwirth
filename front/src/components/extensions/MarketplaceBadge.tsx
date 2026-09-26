import React from 'react'
import { Box, Chip, Tooltip } from '@mui/material'
import { CloudQueue, FolderOpen, Https, Link, Terminal } from '@kwirthmagnify/kwirth-common-front/icons'
import { Extension } from '../../icons'

/*
    Procedencia de un PLUVIDER: no viene de ningun marketplace, viene de un plugin instalado, y su
    'installedFrom' es su propio id ('plugin:agora'). Se marca con la misma convencion que 'pack:<id>'.

    Sin este caso caeria en el fallback del marketplace publico y se anunciaria como servido por el,
    que es falso — y con un plugin de pago lo anunciaria ademas como OSS.
*/
const PLUGIN_SOURCE_PREFIX = 'plugin:'

const hostingPluginOf = (installedFrom?: string): string | undefined =>
    installedFrom?.startsWith(PLUGIN_SOURCE_PREFIX) ? installedFrom.substring(PLUGIN_SOURCE_PREFIX.length) : undefined

// The public marketplace has neither an id nor a label of its own: in the catalogue it is represented by
// an undefined label. But an ALREADY INSTALLED extension needs a record that it came from IT and not from
// a hand-pasted url, so this label is recorded on install. Without it, what was installed from the public
// one looked like 'downloaded from a loose url': a console icon and no chip.
export const PUBLIC_MARKETPLACE_LABEL = 'Kwirth'

// Provenance indicator on the catalogue's cards: which marketplace serves that extension.
// It is not decorative. With precedence by id, a private marketplace can publish its own 'log' and hide
// the public one, so this is the only thing that tells WHICH of the two you are looking at.
//
// an undefined label = it comes from the public OSS marketplace.
interface IMarketplaceBadgeProps {
    label?: string
    // Real provenance of an ALREADY INSTALLED extension. Only the installed cards have it.
    installedFrom?: string
}

// It is ALWAYS drawn, for the public one too. Marking only the private ones left the public ones with no
// indicator at all, and there was no way to tell "it comes from the public marketplace" from "it has not
// been marked" — especially in dialogs whose card already carries a padlock as its icon, which reads as
// 'private'.
// Something smaller than MUI's 'small'. It is exported so that ALL the chips on an extension card use the
// same size: mixing sizes on the same row looks untidy.
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
// ⚠️ Provenance is STORED on install, not deduced. The download URL used to be looked at, and that stopped
// working: the manifest and the packages live on different servers, so the tgz's url points at the
// registry and says nothing about the marketplace. Besides, with precedence by id, two marketplaces can
// serve the same extension and what matters is which one the user installed, not which one wins today.
//
// That is why a label being present RULES: it means where it came from is on record. The url heuristic is
// applied only when nothing is on record, which is the case of a hand-pasted url or of what was installed
// before this.
const comesFromNoMarketplace = (label?: string, installedFrom?: string): boolean =>
    !label && (installedFrom === 'dev' || installedFrom === 'local' || isPlainUrl(installedFrom))

// A direct download URL. The public marketplace is served from kwirthmagnify's repo, so that one is known
// provenance and does not come in here.
const isPlainUrl = (installedFrom?: string): boolean =>
    Boolean(installedFrom)
    && /^https?:\/\//i.test(installedFrom!)
    && !installedFrom!.includes('github.com/kwirthmagnify')

const MarketplaceBadge: React.FC<IMarketplaceBadgeProps> = (props: IMarketplaceBadgeProps) => {
    // What a plugin publishes carries ITS plugin's name: it is the only thing that says where it came
    // from, and it is where one has to go to install, update or remove it.
    const hostingPlugin = hostingPluginOf(props.installedFrom)
    if (hostingPlugin) {
        return (
            <Tooltip title={`Published by the '${hostingPlugin}' plugin — it is not installed on its own, it comes and goes with it`}>
                <Chip label={hostingPlugin} size='small' variant='outlined' color='primary' sx={compact} />
            </Tooltip>
        )
    }

    if (comesFromNoMarketplace(props.label, props.installedFrom)) return null

    // What comes INSIDE Kwirth is not served by the public marketplace. Labelling it 'Kwirth' announced a
    // paid extension loaded in the bundle as public OSS.
    if (!props.label && props.installedFrom === 'bundled') {
        return (
            <Tooltip title='Shipped inside this Kwirth image — it does not come from any marketplace'>
                <Chip label='Bundled' size='small' variant='outlined' sx={compact} />
            </Tooltip>
        )
    }

    // The public one: with no label in the catalogue, with PUBLIC_MARKETPLACE_LABEL once installed.
    // Outlined, not filled, so it is told from a private one at a glance.
    if (!props.label || props.label === PUBLIC_MARKETPLACE_LABEL) {
        return (
            <Tooltip title='Served by the public Kwirth marketplace'>
                <Chip label={PUBLIC_MARKETPLACE_LABEL} size='small' variant='outlined' sx={compact} />
            </Tooltip>
        )
    }
    // filled, not outlined: the 'dev' chip of these dialogs is already outlined orange and they would be confused
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
    // It comes from a plugin: the icon is an extension's, not a download origin's — because it has not
    // been downloaded from anywhere, it is published by something already installed.
    const hostingPlugin = hostingPluginOf(props.installedFrom)
    if (hostingPlugin) {
        return (
            <Tooltip title={`Published by the '${hostingPlugin}' plugin — manage it from the plugins manager`}>
                <Box sx={{ color: 'primary.main', display: 'flex', alignItems: 'center', mr: 0.75 }}><Extension fontSize='small' /></Box>
            </Tooltip>
        )
    }

    // The CONSOLE belongs to dev and to dev alone. A local file and a hand-pasted url do not come from a
    // marketplace either, but they are not the same thing: each carries its own icon, or dev's stops
    // meaning dev.
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
