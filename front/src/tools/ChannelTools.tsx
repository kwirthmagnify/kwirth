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

const getChannelIconSafe = (channelConstructor: TChannelConstructor | undefined): JSX.Element => {
    if (!channelConstructor) return canalIconoFallback
    try {
        const icono = new channelConstructor().getChannelIcon()
        if (React.isValidElement(icono) && icono.type) return icono
    }
    catch { /* un getChannelIcon que revienta tampoco puede llevarse la pagina por delante */ }
    return canalIconoFallback
}

export { createChannelInstance, getChannelIconSafe }
