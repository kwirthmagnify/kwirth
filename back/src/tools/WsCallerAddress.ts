import { ICallerAddress } from '@kwirthmagnify/kwirth-common'
import { clientAddressOf } from './ClientIp'

/*
    WHO is at the other end of each WebSocket the core accepts (K2), for the channels: they get the socket,
    never the upgrade request, so without this they cannot tell a client's address.

    What the socket came with (the connection's address and its X-Forwarded-For) is kept when it connects, and
    resolved EVERY time it is asked, the same way as the login: X-Forwarded-For is only believed from a trusted
    proxy (IKwirthSettings.trustedProxies), with the list as it is NOW. It used to be resolved once, at connect:
    a proxy added to the trusted ones afterwards never reached the sockets already open, and an Ianus hub kept
    showing (and checking Allowed from against) its ingress's address for spokes linked for days (2026-11-18).

    The list lives in the settings, which are read asynchronously, and the question has to be answered
    synchronously; so the list is kept here and refreshed in the background when it is older than REFRESH_MS.
    A change of the trusted proxies reaches every socket within that time.

    A WeakMap: a closed socket is forgotten with it, nothing has to remove it.
*/

const REFRESH_MS = 30_000

interface IWsConnection {
    remoteAddress: string | undefined
    forwardedFor: string | string[] | undefined
}

export class WsCallerAddresses {
    private connections = new WeakMap<WebSocket, IWsConnection>()
    private trustedProxies: string[] = []
    private readAt = 0
    private reading = false

    // readTrustedProxies: the current list (IKwirthSettings.trustedProxies); now: injectable for the tests
    constructor(private readTrustedProxies: () => Promise<string[]>, private now: () => number = Date.now) {}

    // The socket has just connected: what it came with is kept, and resolved with the trusted proxies known right now
    remember(ws: WebSocket, remoteAddress: string | undefined, forwardedFor: string | string[] | undefined): ICallerAddress {
        this.connections.set(ws, { remoteAddress, forwardedFor })
        return this.addressOf(ws)!
    }

    // Resolved with the trusted proxies known NOW (not those of when it connected)
    addressOf(ws: WebSocket): ICallerAddress | undefined {
        const connection = this.connections.get(ws)
        if (!connection) return undefined
        this.refreshIfStale()
        return clientAddressOf(connection.remoteAddress, connection.forwardedFor, this.trustedProxies)
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
