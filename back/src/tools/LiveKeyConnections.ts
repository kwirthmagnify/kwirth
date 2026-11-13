import { IChannel } from '@kwirthmagnify/kwirth-common-back'

/*
    Which live connections were authenticated with which access key (K1).

    The core validates the key of a WebSocket instance once, when it starts (START, RECONNECT) and when it
    asks for an extra socket (WEBSOCKET + challenge), and never again: deleting the key afterwards closed
    nothing, so whoever was already connected went on as if nothing had happened. This index is what lets
    DELETE /key/:key cut them at once — which is what "revoke" means for whoever holds the key.

    It is an index, nothing else: the instances and the sockets belong to the channels. An entry that the
    channel no longer has (stopped, purged, its socket closed) is dropped the next time it is looked at, so
    a reconnectable instance whose socket died stays revocable until its channel forgets it.

    The extra sockets of an instance (the challenge ones) speak the channel's own protocol, not the core's:
    they are not uses of their own, they hang from their instance and are only closed, never told.
*/

export interface ILiveKeyUse {
    ws: WebSocket
    channelId: string
    instanceId: string
}

// WebSocket close code for a connection whose key has been deleted (RFC 6455: policy violation)
export const KEY_REVOKED_CLOSE_CODE = 1008
export const KEY_REVOKED_CLOSE_REASON = 'Access key revoked'

const instanceRef = (channelId: string, instanceId: string) => `${channelId}\n${instanceId}`

export class LiveKeyConnections {
    private uses: Map<string, ILiveKeyUse[]> = new Map()
    // channelId+instanceId -> the extra sockets the channel was handed for that instance
    private extraSockets: Map<string, WebSocket[]> = new Map()

    // One instance runs under one key: registering it again (a RECONNECT moves it to a new socket) replaces it.
    register(keyId: string, use: ILiveKeyUse): void {
        if (!keyId || !use.instanceId) return
        this.dropUse(use.channelId, use.instanceId)
        const list = this.uses.get(keyId) ?? []
        list.push(use)
        this.uses.set(keyId, list)
    }

    // An extra socket for an instance already registered (the challenge of a WEBSOCKET request)
    attachSocket(channelId: string, instanceId: string, ws: WebSocket): void {
        const ref = instanceRef(channelId, instanceId)
        this.extraSockets.set(ref, [...(this.extraSockets.get(ref) ?? []), ws])
    }

    // STOP: the instance is gone, whatever its key.
    unregister(channelId: string, instanceId: string): void {
        this.dropUse(channelId, instanceId)
        this.extraSockets.delete(instanceRef(channelId, instanceId))
    }

    /*
        Drops the uses of 'ws' that the channels no longer hold. Called when that socket closes, after the
        channels have cleaned up: a reconnectable instance they keep stays revocable.

        Only THAT socket's, never all of them: an instance is registered when its START is accepted, and a
        channel with a pod view does not hold it until the first pod is handed over (a namespace with no
        pods yet, maybe never). Pruning everything would forget those, and deleting their key later would
        not reach them.
    */
    prune(channels: Map<string, IChannel>, ws: WebSocket): void {
        const alive = (channelId: string, instanceId: string) => channels.get(channelId)?.containsInstance(instanceId) === true
        for (const [keyId, list] of this.uses) {
            const kept = list.filter(u => u.ws !== ws || alive(u.channelId, u.instanceId))
            if (kept.length === list.length) continue
            if (kept.length) this.uses.set(keyId, kept)
            else this.uses.delete(keyId)
        }
        // an extra socket that closed is gone; the others go while their instance is still known
        for (const [ref, extras] of [...this.extraSockets]) {
            const [channelId, instanceId] = ref.split('\n')
            const kept = extras.filter(e => e !== ws)
            if (kept.length && (alive(channelId, instanceId) || this.isRegistered(channelId, instanceId))) this.extraSockets.set(ref, kept)
            else this.extraSockets.delete(ref)
        }
    }

    usesOf(keyId: string): ILiveKeyUse[] {
        return [...(this.uses.get(keyId) ?? [])]
    }

    // Whether 'ws' still carries an instance started with some key
    carries(ws: WebSocket): boolean {
        for (const list of this.uses.values()) {
            if (list.some(u => u.ws === ws)) return true
        }
        return false
    }

    /*
        The key has been deleted: each instance started with it is told ('notify') and removed from its
        channel, its extra sockets are closed, and its socket is closed when nothing started with another key
        is left on it. A socket shared with other keys stays open: closing it would cut them too. Returns how
        many instances were cut.
    */
    revoke(keyId: string, channels: Map<string, IChannel>, notify: (use: ILiveKeyUse) => void): number {
        // no prune here: an accepted instance its channel does not hold yet must be cut too (removeInstance of one it does not have is a no-op)
        const list = this.uses.get(keyId)
        if (!list) return 0
        this.uses.delete(keyId)
        const sockets = new Set<WebSocket>()
        for (const use of list) {
            try { notify(use) } catch { /* the socket may be gone: the instance is removed anyway */ }
            channels.get(use.channelId)?.removeInstance(use.ws, use.instanceId)
            sockets.add(use.ws)
            const ref = instanceRef(use.channelId, use.instanceId)
            for (const extra of this.extraSockets.get(ref) ?? []) closeRevoked(extra)
            this.extraSockets.delete(ref)
        }
        for (const ws of sockets) {
            if (!this.carries(ws)) closeRevoked(ws)
        }
        return list.length
    }

    private isRegistered(channelId: string, instanceId: string): boolean {
        for (const list of this.uses.values()) {
            if (list.some(u => u.channelId === channelId && u.instanceId === instanceId)) return true
        }
        return false
    }

    private dropUse(channelId: string, instanceId: string): void {
        for (const [keyId, list] of this.uses) {
            const kept = list.filter(u => u.channelId !== channelId || u.instanceId !== instanceId)
            if (kept.length === list.length) continue
            if (kept.length) this.uses.set(keyId, kept)
            else this.uses.delete(keyId)
        }
    }
}

const closeRevoked = (ws: WebSocket) => {
    try { ws.close(KEY_REVOKED_CLOSE_CODE, KEY_REVOKED_CLOSE_REASON) } catch { /* already closed */ }
}
