import React from 'react'
import { Box, Chip, IconButton, MenuItem, Select, Stack, Tooltip, Typography, useTheme } from '@mui/material'
import { Launch } from '@kwirthmagnify/kwirth-common-front/icons'
import { MarketplaceBadge, MarketplaceSourceIcon, compactChip } from './MarketplaceBadge'
import { extensionCardSx, extensionCardDescriptionSx, extensionCardDescriptionOneLineSx, extensionCardTitleSx } from './extensionCardStyle'
import { IExtensionAction, IExtensionCardModel } from './extensionManagerModel'
import { resolveExtensionIcon } from './extensionIcon'
import { TruncatedText } from './TruncatedText'

/*
    The TWO views of an extension —card and row— in a single place, for all eleven types and both
    sections. That is 44 combinations that used to be written by hand and drifted one by one.

    The rules of plans/extension-managers-ui/PLAN.md are met here by construction:
      1. installed and available look the same: it is the SAME component, only chips and actions change
      2. provenance always, in both views
      3. a version Select in the catalogue (even with a single one), a Chip on what is installed
      4. compactChip on every chip
      6. in the row, the chips to the right (a grid with justifySelf)
      9. the same text in card and in row
*/

interface IExtensionViewProps {
    model: IExtensionCardModel
    fallbackIcon: React.ReactNode
    /** Present in the catalogue only: it turns the version into a Select (rule 3). */
    versions?: string[]
    onVersionChange?: (v: string) => void
    /*
        The chips go in TWO groups, and that is not decoration:

          · `chips`, on the left with the provenance — WHERE this came from (dev, local file, via pack,
            Kwirth, the marketplace).
          · `statusChips`, on the right right next to the buttons — HOW this is now ('3 configs',
            'enabled', 'active', 'installed').

        Mixing them leaves a row of chips where origin cannot be told from status, and the status is what
        gets looked at before pressing a button: that is why it travels with them.
    */
    chips?: React.ReactNode[]
    statusChips?: React.ReactNode[]
    /** A control of the type's own (a Select, a switch…), just before the buttons. */
    inlineControl?: React.ReactNode
    actions: IExtensionAction[]
}

/*
    The title row's height. Its tallest control sets it, which is the website button (30px), and it is
    fixed so that the type's ICON can be centred with the name: without a known height, the icon aligns
    against a block that includes description and subtitle, and ends up hanging.
*/
const TITLE_ROW_HEIGHT = 30

/** A single line with an ellipsis, for names and subtitles. */
const ONE_LINE_SX = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

// The card's background: a gradient derived from the name, so each extension is recognisable at a glance
// without depending on it bringing an icon. All ten did it already, each with its own variant.
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
    // With no version there is no chip: not everything installed has one — a bundled IdP connector comes
    // inside Kwirth — and a chip that only says 'v' is worse than no chip at all.
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

/** Card view. Fixed height (extensionCardSx): one that grows stretches its whole row of the grid. */
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
    The row view. It returns a grid's CELLS, not a container: the grid is put there by the dialog, which
    is what aligns the columns across rows. With one flex per row —as plugins, providers and senders used
    to do— each row aligns on its own account and the chips dance from one to the next.
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

/** Columns of the list view's grid. It must match extensionRowCells. */
const EXTENSION_ROW_COLUMNS = 'auto 1fr auto auto auto auto auto'

export { ExtensionCard, extensionRowCells, EXTENSION_ROW_COLUMNS }
