import { ICallerAddress } from '@kwirthmagnify/kwirth-common'
import { buildBlockList, ipFamilyOf, normalizeIp } from '@kwirthmagnify/kwirth-common-back'

/*
    Who is really on the other end of a request (plan: plans/login-ip-filter).

    There used to be five copies of `clientIp || x-forwarded-for || remoteAddress`, and all of them were
    wrong in the same way: X-Forwarded-For was taken as it came, so anybody could write any address in it
    — and with it, dodge the login rate limiter, whose key is `ip:user`.

    The rule now is the one Express' 'trust proxy' applies. X-Forwarded-For is believed ONLY when the TCP
    connection comes from a trusted proxy, and it is walked from the RIGHT, skipping trusted hops: the
    client is the first hop that is not trusted. The rightmost entry is the one the proxy itself wrote,
    about whoever connected to it; anything further left may have been written by the client.

    No dependency: 'net.BlockList' (Node ≥ 15) already matches addresses and subnets, IPv4 and IPv6.
*/

// The address matching itself (normalizeIp, ipInList…) lives in kwirth-common-back (IpAddresses), shared with the
// extensions that check where a caller comes from; this file keeps what is the core's: who the client is.

/*
    The client behind a request. 'forwardedFor' is the raw header: one string, several (when it was sent
    more than once) or nothing. An unreadable hop stops the walk, and the client is then the trusted hop
    right of it — the last address that somebody we trust vouched for.
*/
// The header as it came, to be SHOWN (ICallerAddress.forwardedFor): its hops joined with ', ', capped, so a client cannot fill a table with it
const FORWARDED_FOR_SHOWN_MAX = 512

export const clientAddressOf = (remoteAddress: string | undefined, forwardedFor: string | string[] | undefined, trustedProxies: string[]): ICallerAddress => {
    const remote = normalizeIp(remoteAddress)
    const header = Array.isArray(forwardedFor) ? forwardedFor.join(',') : (forwardedFor ?? '')
    const hops = header.split(',').map(h => h.trim()).filter(h => h !== '')
    if (hops.length === 0) return { ip: remote, remoteAddress: remote, forwardedIgnored: false }
    // shown whatever is decided below: trusted or not, it says where the caller comes from and which proxy is missing
    const shown = hops.join(', ').slice(0, FORWARDED_FOR_SHOWN_MAX)

    const trusted = buildBlockList(trustedProxies)
    const isTrusted = (ip: string) => ip !== '' && trustedProxies.length > 0 && trusted.check(ip, ipFamilyOf(ip))
    if (!isTrusted(remote)) return { ip: remote, remoteAddress: remote, forwardedIgnored: true, forwardedFor: shown }

    let client = remote
    for (let i = hops.length - 1; i >= 0; i--) {
        const hop = normalizeIp(hops[i])
        if (!hop) break
        client = hop
        if (!isTrusted(hop)) break
    }
    return { ip: client, remoteAddress: remote, forwardedIgnored: false, forwardedFor: shown }
}
