import React from 'react'

/*
    Icono propio del plugin, en SVG inline.

    No se importa de '@kwirthmagnify/kwirth-common-front/icons' a proposito: ese set lo sirve el paquete
    comun, asi que un icono nuevo obligaria a publicar common-front y reconstruir el core — imposible
    para un plugin de terceros. Un SVG propio no depende de nadie. Mismo criterio que trivy con sus
    iconos de distribucion.

    'currentColor' es lo que hace que siga el color del tema igual que un icono de MUI, y 1em el que
    lo haga con el tamaño de donde se ponga.
*/
export const SugarlessIcon = (
    <svg viewBox='0 0 24 24' width='1em' height='1em'>
        <path fill='currentColor' d='M12 2.6c0 0-6.6 7.7-6.6 11.9a6.6 6.6 0 1 0 13.2 0C18.6 10.3 12 2.6 12 2.6z' />
    </svg>
)
