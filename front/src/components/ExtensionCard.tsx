import React from 'react'
import { Box, Chip, IconButton, MenuItem, Select, Stack, Tooltip, Typography, useTheme } from '@mui/material'
import { Launch } from '@kwirthmagnify/kwirth-common-front/icons'
import { MarketplaceBadge, MarketplaceSourceIcon, compactChip } from './MarketplaceBadge'
import { extensionCardSx, extensionCardDescriptionSx, extensionCardTitleSx } from './extensionCardStyle'
import { IExtensionAction, IExtensionCardModel } from './extensionManagerModel'

/*
    Las DOS vistas de una extension —tarjeta y fila— en un solo sitio, para los once tipos y las dos
    secciones. Son 44 combinaciones que antes se escribian a mano y derivaban una a una.

    Aqui se cumplen por construccion las reglas de plans/extension-managers-ui/PLAN.md:
      1. instalados y disponibles se ven igual: es el MISMO componente, solo cambian chips y acciones
      2. procedencia siempre, en las dos vistas
      3. Select de version en el catalogo (aunque haya una sola), Chip en lo instalado
      4. compactChip en todos los chips
      6. en la fila, los chips a la derecha (grid con justifySelf)
      9. mismo texto en tarjeta y en fila
*/

interface IExtensionViewProps {
    model: IExtensionCardModel
    fallbackIcon: React.ReactNode
    /** Presente solo en el catalogo: convierte la version en un Select (regla 3). */
    versions?: string[]
    onVersionChange?: (v: string) => void
    chips?: React.ReactNode[]
    actions: IExtensionAction[]
}

// Fondo de la tarjeta: un degradado derivado del nombre, para que cada extension sea reconocible de un
// vistazo sin depender de que traiga icono. Los diez lo hacian ya, cada uno con su variante.
const gradientFor = (name: string, dark: boolean): string => {
    let hash = 0
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
    const hue = Math.abs(hash) % 360
    return `linear-gradient(315deg, hsla(${hue}, 75%, 58%, ${dark ? 0.07 : 0.12}) 0%, hsla(${hue}, 55%, 42%, ${dark ? 0.14 : 0.26}) 100%)`
}

const VersionControl: React.FC<{ version: string, versions?: string[], onChange?: (v: string) => void }> = ({ version, versions, onChange }) =>
    versions
        ? <Select size='small' value={version} onChange={e => onChange?.(e.target.value)}
            sx={{ height: 24, fontSize: '0.75rem', minWidth: 80, '& .MuiSelect-select': { py: 0, px: 1 } }}>
            {versions.map(v => <MenuItem key={v} value={v} sx={{ fontSize: '0.75rem' }}>{v}</MenuItem>)}
          </Select>
        : <Chip label={`v${version}`} size='small' sx={{ ...compactChip, minWidth: 62 }} />

const ActionButtons: React.FC<{ actions: IExtensionAction[] }> = ({ actions }) => (<>
    {actions.map((a, i) => (
        <Tooltip key={i} title={a.tooltip}>
            <span>
                <IconButton size='small' color={a.color ?? 'inherit'} disabled={a.disabled} onClick={a.onClick}>
                    {a.icon}
                </IconButton>
            </span>
        </Tooltip>
    ))}
</>)

/** Vista de tarjeta. Altura fija (extensionCardSx): una que crece estira toda su fila del grid. */
const ExtensionCard: React.FC<IExtensionViewProps> = ({ model, fallbackIcon, versions, onVersionChange, chips, actions }) => {
    const theme = useTheme()
    return (
        <Box sx={{ ...extensionCardSx, background: gradientFor(model.name, theme.palette.mode === 'dark') }}>
            <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                <Box sx={{ color: 'text.secondary', mt: 0.25, display: 'flex' }}>{model.icon ?? fallbackIcon}</Box>
                <Box flex={1} minWidth={0}>
                    <Stack direction='row' alignItems='center' spacing={0.5} sx={{ width: '100%' }}>
                        <Typography variant='body2' fontWeight='bold' component='span' sx={extensionCardTitleSx}>{model.name}</Typography>
                        <VersionControl version={model.version} versions={versions} onChange={onVersionChange} />
                    </Stack>
                    <Typography variant='caption' color='text.secondary' display='block' sx={extensionCardDescriptionSx}>{model.description}</Typography>
                </Box>
                <Tooltip title={model.website ? 'Open website' : 'No website available'}>
                    <span>
                        <IconButton size='small' sx={{ mr: -0.5 }} disabled={!model.website} onClick={() => window.open(model.website!, '_blank', 'noopener')}>
                            <Launch fontSize='small' />
                        </IconButton>
                    </span>
                </Tooltip>
            </Stack>
            <Stack direction='row' alignItems='center' spacing={0.5} sx={{ mt: 1 }}>
                <MarketplaceSourceIcon label={model.marketplaceLabel} installedFrom={model.installedFrom} />
                <MarketplaceBadge label={model.marketplaceLabel} installedFrom={model.installedFrom} />
                {chips}
                <Box sx={{ flex: 1, minWidth: 0 }} />
                <ActionButtons actions={actions} />
            </Stack>
        </Box>
    )
}

/*
    Vista de fila. Devuelve CELDAS de un grid, no un contenedor: el grid lo pone el diálogo, que es lo que
    alinea las columnas entre filas. Con un flex por fila —como hacian plugins, providers y senders— cada
    fila se alinea por su cuenta y los chips bailan de una a otra.
*/
const extensionRowCells = (
    key: string,
    { model, fallbackIcon, versions, onVersionChange, chips, actions }: IExtensionViewProps
): React.ReactNode[] => [
    <Box key={`${key}-icon`} sx={{ color: 'text.secondary', display: 'flex', py: 1 }}>{model.icon ?? fallbackIcon}</Box>,
    <Typography key={`${key}-name`} variant='body2' fontWeight='bold' sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', py: 1 }}>{model.name}</Typography>,
    <Box key={`${key}-mkp`} sx={{ justifySelf: 'end', py: 1, display: 'flex', alignItems: 'center' }}>
        <MarketplaceSourceIcon label={model.marketplaceLabel} installedFrom={model.installedFrom} />
        <MarketplaceBadge label={model.marketplaceLabel} installedFrom={model.installedFrom} />
    </Box>,
    <Box key={`${key}-chips`} sx={{ justifySelf: 'end', py: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>{chips}</Box>,
    <Box key={`${key}-ver`} sx={{ justifySelf: 'end', py: 1 }}>
        <VersionControl version={model.version} versions={versions} onChange={onVersionChange} />
    </Box>,
    <Box key={`${key}-actions`} sx={{ justifySelf: 'end', py: 1, display: 'flex', alignItems: 'center' }}>
        <ActionButtons actions={actions} />
    </Box>
]

/** Columnas del grid de la vista de lista. Debe casar con extensionRowCells. */
const EXTENSION_ROW_COLUMNS = 'auto 1fr auto auto auto auto'

export { ExtensionCard, extensionRowCells, EXTENSION_ROW_COLUMNS }
