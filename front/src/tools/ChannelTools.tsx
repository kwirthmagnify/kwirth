import React from 'react'
import { HelpOutline } from '@kwirthmagnify/kwirth-common-front/icons'
import { TChannelConstructor, IChannel } from '../channels/IChannel'

const createChannelInstance = (channelConstructor:TChannelConstructor): IChannel | null => {
    if (!channelConstructor) return null
    return new channelConstructor()
}

/*
    A channel's icon is built by the PLUGIN, and it may arrive BROKEN.

    It is not hypothetical: a plugin's front end asks the core's global for its icons BY NAME
    (window.__kwirth__.MUI.icons), so a plugin installed from a version predating a pruning of the barrel
    asks for one that no longer exists. The element arrives with `type` undefined and React brings the
    whole page down with "Element type is invalid: ... got: undefined" — without saying which plugin it is.

    It really happened when FolderCopyTwoTone was removed, which was fileman's channel icon: with fileman
    0.2.8 installed, the home stopped painting.

    Whoever paints a channel's icon must go through here. It returns the question mark —the same one
    already used when the channel's CLASS was missing— instead of letting everything fall over.
*/
const canalIconoFallback = <HelpOutline sx={{ minWidth: '24px', color: 'warning.main' }} />

/*
    An element being "valid" for React is NOT enough: what blows up when painting it is its `type`, and
    that can hold things that are truthy and still cannot be rendered.

    The second failure mode, which cost a morning: a plugin with a DEEP import (`@mui/icons-material/X`)
    does not fail to resolve — the build's shim hands it THE WHOLE BARREL as the module — so `type` ends
    up being an object with 80 icons inside. React rejects it with "got: object" instead of "got:
    undefined", and an `if (icono.type)` lets it through because an object is truthy.

    Renderable is: a tag ('div'), a function (a component), or an object WITH a React MARK —forwardRef,
    memo, lazy, a context. A module's namespace has no `$$typeof`, and that is exactly what tells it apart.
*/
const tipoRenderizable = (type: unknown): boolean => {
    if (typeof type === 'string' || typeof type === 'function') return true
    return typeof type === 'object' && type !== null && (type as { $$typeof?: symbol }).$$typeof !== undefined
}

const iconoUtilizable = (icono: unknown): boolean =>
    React.isValidElement(icono) && tipoRenderizable((icono as React.ReactElement).type)

// The warning is given ONCE per channel: this is drawn on every render of the home and the tabs, and one
// trace per frame hides precisely what needs reading.
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
    A channel's icon from its CLASS. Instantiating the channel just to ask it for the icon is what the
    places that do not have an instance yet do (notification menus, plugin lists).
*/
const getChannelIconSafe = (channelConstructor: TChannelConstructor | undefined, channelId?: string): JSX.Element => {
    if (!channelConstructor) return canalIconoFallback
    try {
        const canal = new channelConstructor()
        return getChannelIconOf(canal, channelId ?? canal.channelId)
    }
    catch { /* a constructor that blows up cannot take the page down either */ }
    avisar(channelId, undefined)
    return canalIconoFallback
}

/*
    The same when the channel is ALREADY at hand: the tabs and the overview work with the live instance,
    and building it again just for the icon is throwing work away (and running a plugin's constructor one
    time too many).
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
