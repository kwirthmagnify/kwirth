import { ICallerAddress } from '@kwirthmagnify/kwirth-common'
import { clientAddressOf } from './ClientIp'

/*
    WHO is at the other end of each WebSocket the core accepts (K2), for the channels: they get the socket,
    never the upgrade request, so without this they cannot tell a client's address.

    The address is resolved ONCE, when the socket connects, the same way as the login: X-Forwarded-For is
    only believed from a trusted proxy (the login IP filter's list). That list lives in the settings, which
    are read asynchronously, and the question has to be answered synchronously; so the list is kept here
    and refreshed in the background when it is older than REFRESH_MS. A change of the trusted proxies
    reaches the sockets that connect after the refresh, not the ones already open.

    A WeakMap: a closed socket is forgotten with it, nothing has to remove it.
*/

const REFRESH_MS = 30_000

export class WsCallerAddresses {
    private addresses = new WeakMap<WebSocket, ICallerAddress>()
    private trustedProxies: string[] = []
    private readAt = 0
    private reading = false

    // readTrustedProxies: the current list (the login IP filter's 'trustedProxies'); now: injectable for the tests
    constructor(private readTrustedProxies: () => Promise<string[]>, private now: () => number = Date.now) {}

    // The socket has just connected: its address is resolved with the trusted proxies known right now
    remember(ws: WebSocket, remoteAddress: string | undefined, forwardedFor: string | string[] | undefined): ICallerAddress {
        this.refreshIfStale()
        const address = clientAddressOf(remoteAddress, forwardedFor, this.trustedProxies)
        this.addresses.set(ws, address)
        return address
    }

    addressOf(ws: WebSocket): ICallerAddress | undefined {
        return this.addresses.get(ws)
    }

    // Reads the list now (at startup, so the first sockets are not resolved without it)
    async refresh(): Promise<void> {
        if (this.reading) return
        this.reading = true
        this.readAt = this.now()
        try {
            this.trustedProxies = await this.readTrustedProxies()
        }
        catch {
            // the last list known stays: an unreadable settings must not make every proxy untrusted at once
        }
        finally {
            this.reading = false
        }
    }

    private refreshIfStale(): void {
        if (this.now() - this.readAt >= REFRESH_MS) void this.refresh()
    }
}
