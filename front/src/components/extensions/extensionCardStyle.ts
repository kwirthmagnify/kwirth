import { SxProps, Theme } from '@mui/material'

/*
    An extension card's appearance, in a SINGLE PLACE.

    The eleven management dialogs each painted their own copy of the same container, and the copies
    drifted: themes was 120 tall and the other ten 100. Worse: NONE of them truncated the description, so
    a long description —Santander's login, for instance— stretched the card, and with it the grid's whole
    row, leaving its neighbours with dead space in the middle.

    The description is truncated to two lines with an ellipsis. The full text is not lost: the
    extension's page is one click away on the external link icon.
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
    A single line, when the card also carries a subtitle (today, the packs with what they bring inside).

    With the usual two lines, the subtitle fell right below a TRUNCATED description and read as its
    continuation: 'Censor pack for Kwirth — LLM-based log noise filtering channel plus its…' followed by
    'plugin, login' looked like more description text, not the list of what the pack brings.
*/
export const extensionCardDescriptionOneLineSx = clampSx(1)
