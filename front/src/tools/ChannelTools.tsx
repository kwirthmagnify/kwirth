import React from 'react'
import { HelpOutline } from '@kwirthmagnify/kwirth-common-front/icons'
import { TChannelConstructor, IChannel } from '../channels/IChannel'

const createChannelInstance = (channelConstructor:TChannelConstructor): IChannel | null => {
    if (!channelConstructor) return null
    return new channelConstructor()
}

/*
    El icono de un canal lo construye el PLUGIN, y puede venir ROTO.

    No es hipotetico: el front de un plugin pide sus iconos POR NOMBRE al global del core
    (window.__kwirth__.MUI.icons), asi que un plugin instalado de una version anterior a una poda del
    barrel pide uno que ya no existe. El elemento llega con `type` undefined y React tumba la pagina
    entera con "Element type is invalid: ... got: undefined" — sin decir de que plugin se trata.

    Paso de verdad al retirar FolderCopyTwoTone, que era el icono de canal de fileman: con el fileman
    0.2.8 instalado, la home dejaba de pintarse.

    Quien pinte el icono de un canal debe pasar por aqui. Devuelve la interrogacion —la misma que ya
    se usaba cuando faltaba la CLASE del canal— en vez de dejar que se caiga todo.
*/
const canalIconoFallback = <HelpOutline sx={{ minWidth: '24px', color: 'warning.main' }} />

/*
    Que un elemento sea "valido" para React NO basta: lo que revienta al pintarlo es su `type`, y ahi
    caben cosas que son truthy y aun asi no se pueden renderizar.

    El segundo modo de fallo, que costo una mañana: un plugin con un DEEP import
    (`@mui/icons-material/X`) no falla al resolver — el shim del build le entrega el BARREL ENTERO como
    modulo—, asi que `type` acaba siendo un objeto con 80 iconos dentro. React lo rechaza con "got:
    object" en vez de "got: undefined", y un `if (icono.type)` lo deja pasar porque un objeto es truthy.

    Renderizable es: un tag ('div'), una funcion (componente), o un objeto CON MARCA de React
    —forwardRef, memo, lazy, un contexto—. El namespace de un modulo no tiene `$$typeof`, y eso es
    justo lo que lo distingue.
*/
const tipoRenderizable = (type: unknown): boolean => {
    if (typeof type === 'string' || typeof type === 'function') return true
    return typeof type === 'object' && type !== null && (type as { $$typeof?: symbol }).$$typeof !== undefined
}

const iconoUtilizable = (icono: unknown): boolean =>
    React.isValidElement(icono) && tipoRenderizable((icono as React.ReactElement).type)

// El aviso se da UNA VEZ por canal: esto se pinta en cada render de la home y de las pestañas, y una
// traza por fotograma esconde justo lo que hay que leer.
const yaAvisados = new Set<string>()
const avisar = (channelId: string|undefined, icono: unknown): void => {
    const id = channelId ?? '(unknown)'
    if (yaAvisados.has(id)) return
    yaAvisados.add(id)
    const tipo = React.isValidElement(icono) ? typeof (icono as React.ReactElement).type : typeof icono
    console.warn(`[channels] channel '${id}' returned an icon that cannot be rendered (type: ${tipo}). ` +
        `Using a placeholder. The extension was most likely built against a different icon barrel and should be updated.`)
}

/*
    El icono de un canal a partir de su CLASE. Instanciar el canal solo para pedirle el icono es lo que
    hacen los sitios que aun no tienen instancia (menus de notificaciones, listas de plugins).
*/
const getChannelIconSafe = (channelConstructor: TChannelConstructor | undefined, channelId?: string): JSX.Element => {
    if (!channelConstructor) return canalIconoFallback
    try {
        const canal = new channelConstructor()
        return getChannelIconOf(canal, channelId ?? canal.channelId)
    }
    catch { /* un constructor que revienta tampoco puede llevarse la pagina por delante */ }
    avisar(channelId, undefined)
    return canalIconoFallback
}

/*
    Lo mismo cuando YA se tiene el canal: las pestañas y el overview trabajan con la instancia viva, y
    volver a construirla solo para el icono es tirar trabajo (y ejecutar el constructor de un plugin de
    mas).
*/
const getChannelIconOf = (channel: IChannel | undefined, channelId?: string): JSX.Element => {
    if (!channel) return canalIconoFallback
    try {
        const icono = channel.getChannelIcon()
        if (iconoUtilizable(icono)) return icono
        avisar(channelId ?? channel.channelId, icono)
    }
    catch {
        avisar(channelId ?? channel.channelId, undefined)
    }
    return canalIconoFallback
}

export { createChannelInstance, getChannelIconSafe, getChannelIconOf }
