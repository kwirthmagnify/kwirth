import React from 'react'
import { Box, Chip, IconButton, MenuItem, Select, Stack, Tooltip, Typography, useTheme } from '@mui/material'
import { Launch } from '@kwirthmagnify/kwirth-common-front/icons'
import { MarketplaceBadge, MarketplaceSourceIcon, compactChip } from './MarketplaceBadge'
import { extensionCardSx, extensionCardDescriptionSx, extensionCardDescriptionOneLineSx, extensionCardTitleSx } from './extensionCardStyle'
import { IExtensionAction, IExtensionCardModel } from './extensionManagerModel'
import { resolveExtensionIcon } from './extensionIcon'
import { TruncatedText } from './TruncatedText'

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
    /*
        Los chips van en DOS grupos, y no es decoracion:

          · `chips`, a la izquierda con la procedencia — DE DONDE vino esto (dev, fichero local, via pack,
            Kwirth, el marketplace).
          · `statusChips`, a la derecha pegados a los botones — COMO esta esto ahora ('3 configs',
            'enabled', 'active', 'installed').

        Mezclarlos deja una fila de chips donde no se distingue el origen del estado, y el estado es lo que
        se mira antes de pulsar un boton: por eso viaja con ellos.
    */
    chips?: React.ReactNode[]
    statusChips?: React.ReactNode[]
    /** Control propio del tipo (un Select, un switch…), justo antes de los botones. */
    inlineControl?: React.ReactNode
    actions: IExtensionAction[]
}

/*
    Alto de la fila del titulo. Lo marca su control mas alto, que es el boton de la web (30px), y se fija
    para que el ICONO del tipo pueda centrarse con el nombre: sin una altura conocida, el icono se alinea
    contra un bloque que incluye descripcion y subtitulo, y queda descolgado.
*/
const TITLE_ROW_HEIGHT = 30

/** Una linea con elipsis, para nombres y subtitulos. */
const ONE_LINE_SX = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

// Fondo de la tarjeta: un degradado derivado del nombre, para que cada extension sea reconocible de un
// vistazo sin depender de que traiga icono. Los diez lo hacian ya, cada uno con su variante.
const gradientFor = (name: string, dark: boolean): string => {
    let hash = 0
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
    const hue = Math.abs(hash) % 360
    return `linear-gradient(315deg, hsla(${hue}, 75%, 58%, ${dark ? 0.07 : 0.12}) 0%, hsla(${hue}, 55%, 42%, ${dark ? 0.14 : 0.26}) 100%)`
}

const VersionControl: React.FC<{ version: string, versions?: string[], onChange?: (v: string) => void }> = ({ version, versions, onChange }) => {
    if (versions) {
        return <Select size='small' value={version} onChange={e => onChange?.(e.target.value)}
            sx={{ height: 24, fontSize: '0.75rem', minWidth: 80, '& .MuiSelect-select': { py: 0, px: 1 } }}>
            {versions.map(v => <MenuItem key={v} value={v} sx={{ fontSize: '0.75rem' }}>{v}</MenuItem>)}
        </Select>
    }
    // Sin version no hay chip: no todo lo instalado la tiene —un conector de IdP bundled viene dentro de
    // Kwirth— y un chip que solo dice 'v' es peor que no ponerlo.
    if (!version) return null
    return <Chip label={`v${version}`} size='small' sx={{ ...compactChip, minWidth: 62 }} />
}

const ActionButtons: React.FC<{ actions: IExtensionAction[] }> = ({ actions }) => (<>
    {actions.map((a, i) => (
        <Tooltip key={i} title={a.tooltip}>
            {/* El aria-label va tambien en el BOTON, no solo en el span que le pone el Tooltip: MUI no
                puede etiquetar un boton deshabilitado y por eso envuelve, pero sin esto el boton se queda
                sin nombre accesible y un lector de pantalla no sabe decir que hace. */}
            <span>
                <IconButton size='small' aria-label={a.tooltip} color={a.color ?? 'inherit'} disabled={a.disabled} onClick={a.onClick}>
                    {a.icon}
                </IconButton>
            </span>
        </Tooltip>
    ))}
</>)

/** Vista de tarjeta. Altura fija (extensionCardSx): una que crece estira toda su fila del grid. */
const ExtensionCard: React.FC<IExtensionViewProps> = ({ model, fallbackIcon, versions, onVersionChange, chips, statusChips, inlineControl, actions }) => {
    const theme = useTheme()
    return (
        <Box sx={{ ...extensionCardSx, background: gradientFor(model.name, theme.palette.mode === 'dark') }}>
            <Stack direction='row' alignItems='flex-start' spacing={1.5}>
                {/* El icono se centra con la FILA DEL TITULO, no con el bloque entero: alineado arriba
                    quedaba mas alto que el nombre, y centrado con todo el bloque se hundia hasta la
                    descripcion. La fila del titulo mide lo que su control mas alto (el boton de web). */}
                <Box sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', height: TITLE_ROW_HEIGHT }}>
                    {model.icon ?? resolveExtensionIcon(model.iconName, fallbackIcon)}
                </Box>
                <Box flex={1} minWidth={0}>
                    {/* El boton de web va DENTRO de la fila del titulo, no como columna aparte del Stack
                        exterior. Fuera se alineaba por arriba (`flex-start`) contra un chip de 20px siendo
                        el de 30, asi que sus centros quedaban a 5px y se veia caido. Aqui lo centra la
                        propia fila, sin margenes magicos. */}
                    <Stack direction='row' alignItems='center' spacing={0.5} sx={{ width: '100%', height: TITLE_ROW_HEIGHT }}>
                        <Box sx={extensionCardTitleSx}>
                            <TruncatedText text={model.name} variant='body2' fontWeight='bold' sx={ONE_LINE_SX} />
                        </Box>
                        <VersionControl version={model.version} versions={versions} onChange={onVersionChange} />
                        <Tooltip title={model.website ? 'Open website' : 'No website available'}>
                            <span style={{ marginLeft: 'auto' }}>
                                <IconButton size='small' aria-label='Open website' sx={{ mr: -0.5 }} disabled={!model.website} onClick={() => window.open(model.website!, '_blank', 'noopener')}>
                                    <Launch fontSize='small' />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Stack>
                    <TruncatedText text={model.description} variant='caption' color='text.secondary'
                        sx={model.subtitle ? extensionCardDescriptionOneLineSx : extensionCardDescriptionSx} />
                    {model.subtitle && <TruncatedText text={model.subtitle} variant='caption' color='text.disabled' sx={{ ...ONE_LINE_SX, mt: 0.25 }} />}
                </Box>
            </Stack>
            <Stack direction='row' alignItems='center' spacing={0.5} sx={{ mt: 1 }}>
                <MarketplaceSourceIcon label={model.marketplaceLabel} installedFrom={model.installedFrom} />
                <MarketplaceBadge label={model.marketplaceLabel} installedFrom={model.installedFrom} />
                {chips}
                <Box sx={{ flex: 1, minWidth: 0 }} />
                {statusChips}
                {inlineControl}
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
    { model, fallbackIcon, versions, onVersionChange, chips, statusChips, inlineControl, actions }: IExtensionViewProps
): React.ReactNode[] => [
    <Box key={`${key}-icon`} sx={{ color: 'text.secondary', display: 'flex', py: 1 }}>{model.icon ?? resolveExtensionIcon(model.iconName, fallbackIcon)}</Box>,
    <Box key={`${key}-name`} sx={{ py: 1, minWidth: 0 }}>
        <TruncatedText text={model.name} variant='body2' fontWeight='bold' sx={ONE_LINE_SX} />
        {model.subtitle && <TruncatedText text={model.subtitle} variant='caption' color='text.disabled' sx={ONE_LINE_SX} />}
    </Box>,
    <Box key={`${key}-mkp`} sx={{ justifySelf: 'end', py: 1, display: 'flex', alignItems: 'center' }}>
        <MarketplaceSourceIcon label={model.marketplaceLabel} installedFrom={model.installedFrom} />
        <MarketplaceBadge label={model.marketplaceLabel} installedFrom={model.installedFrom} />
    </Box>,
    <Box key={`${key}-chips`} sx={{ justifySelf: 'end', py: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>{chips}</Box>,
    <Box key={`${key}-status`} sx={{ justifySelf: 'end', py: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>{statusChips}</Box>,
    <Box key={`${key}-ver`} sx={{ justifySelf: 'end', py: 1 }}>
        <VersionControl version={model.version} versions={versions} onChange={onVersionChange} />
    </Box>,
    <Box key={`${key}-actions`} sx={{ justifySelf: 'end', py: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {inlineControl}
        <ActionButtons actions={actions} />
    </Box>
]

/** Columnas del grid de la vista de lista. Debe casar con extensionRowCells. */
const EXTENSION_ROW_COLUMNS = 'auto 1fr auto auto auto auto auto'

export { ExtensionCard, extensionRowCells, EXTENSION_ROW_COLUMNS }
