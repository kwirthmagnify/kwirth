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

// Altura FIJA, no minima: con un minimo, una tarjeta que crece estira toda su fila del grid y deja a las
// vecinas con un hueco muerto. Todas miden lo mismo, en las dos secciones y en los once tipos.
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

// Una dependencia declarada NO es decorativa: si no está instalada, el botón de instalar se deshabilita.
// Pero pintarla como una fila de chips hacía crecer la tarjeta, y solo la sufren 42 entradas de plugins —
// providers, senders y el resto no declaran ninguna. Se resume en un chip y el detalle va en su tooltip.
export const dependencyList = (deps: { extensionType: string, id: string, minVersion: string }[]): string =>
    deps.map(d => `${d.extensionType} ${d.id} ≥${d.minVersion}`).join(', ')

// Dos líneas y elipsis. Sin esto, la descripción manda sobre la altura de toda la fila.
export const extensionCardDescriptionSx: SxProps<Theme> = {
    mt: 0.5,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
}
