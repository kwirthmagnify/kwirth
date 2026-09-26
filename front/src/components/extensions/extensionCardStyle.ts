import { SxProps, Theme } from '@mui/material'

/*
    El aspecto de una tarjeta de extension, en UN SOLO SITIO.

    Los once diálogos de gestión pintaban su propia copia del mismo contenedor, y la copia derivaba: themes
    tenía 120 de alto y los otros diez 100. Peor: NINGUNO recortaba la descripción, así que una descripción
    larga —el login de Santander, por ejemplo— estiraba la tarjeta, y con ella la fila entera del grid,
    dejando a sus vecinas con un hueco muerto en medio.

    La descripción se recorta a dos líneas con puntos suspensivos. El texto completo no se pierde: la
    página de la extensión está a un clic en el icono de enlace externo.
*/

// FIXED height, not minimum: with a minimum, a card that grows stretches its whole row of the grid and
// leaves its neighbours with dead space. They all measure the same, in both sections and across all
// eleven types.
export const EXTENSION_CARD_HEIGHT = 140

export const extensionCardSx: SxProps<Theme> = {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    p: 1.5,
    height: EXTENSION_CARD_HEIGHT,
    overflow: 'hidden',
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 1.5
}

// A declared dependency is NOT decorative: when it is not installed, the install button is disabled. But
// drawing it as a row of chips made the card grow, and only 42 plugin entries suffer it — providers,
// senders and the rest declare none. It is summarised in one chip and the detail goes in its tooltip.
export const dependencyList = (deps: { extensionType: string, id: string, minVersion: string }[]): string =>
    deps.map(d => `${d.extensionType} ${d.id} ≥${d.minVersion}`).join(', ')

// The name, ALWAYS on one line. The list views already clipped it; the cards did not, so a long
// displayName wrapped onto two lines and pushed the bottom row (provenance and actions) outside the fixed
// height. It needs minWidth 0: in a flex, the child does not shrink below its content unless told to.
export const extensionCardTitleSx: SxProps<Theme> = {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
}

// An ellipsis at N lines. Without this, the description rules the height of the whole row.
const clampSx = (lineas: number): SxProps<Theme> => ({
    mt: 0.5,
    display: '-webkit-box',
    WebkitLineClamp: lineas,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
})

/** The usual: two lines for the description. */
export const extensionCardDescriptionSx = clampSx(2)

/*
    Una sola línea, cuando la tarjeta lleva ademas subtitulo (hoy, los packs con lo que traen dentro).

    Con las dos líneas de siempre, el subtitulo caia pegado a una descripción CORTADA y se leia como su
    continuación: 'Censor pack for Kwirth — LLM-based log noise filtering channel plus its…' seguido de
    'plugin, login' parecia mas texto de la descripción, no la lista de lo que trae el pack.
*/
export const extensionCardDescriptionOneLineSx = clampSx(1)
