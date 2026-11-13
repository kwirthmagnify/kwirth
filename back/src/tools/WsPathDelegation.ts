import { IChannel } from '@kwirthmagnify/kwirth-common-back'
import { mountedRouterAlias } from './ClusterRouting'

/*
    WebSockets by PATH: the websocket counterpart of a channel's HTTP router.

    A channel with providesRouter + routerAlias gets its router mounted at <rootPath>/channel/<alias>. Until
    now that was HTTP only: every WebSocket upgrade, whatever its path, ended up as a connection of the
    core's own channel protocol. This picks out the upgrades under that same path and names the channel
    that takes them, if it implements pathWebsocketRequest.

    No client of the core opens a WebSocket under /channel/<alias>/ (the front and openRemoteChannel always
    use the root), so without a channel claiming one nothing changes.
*/

// The channel a WS upgrade on 'requestUrl' belongs to, or undefined to treat it as always.
export const pathWebsocketChannel = (requestUrl: string | undefined, rootPath: string, channels: Iterable<IChannel>): IChannel | undefined => {
    if (!requestUrl) return undefined
    const path = requestUrl.split('?')[0].split('#')[0]
    const root = rootPath.endsWith('/') ? rootPath.slice(0, -1) : rootPath
    const prefix = `${root}/channel/`
    if (!path.startsWith(prefix)) return undefined
    // By SEGMENTS: '/channel/relay2' is not under '/channel/relay' (same reasoning as WsPathGuard).
    const alias = path.slice(prefix.length).split('/')[0]
    if (!alias) return undefined
    for (const channel of channels) {
        if (typeof channel.pathWebsocketRequest === 'function' && mountedRouterAlias(channel) === alias) return channel
    }
    return undefined
}
