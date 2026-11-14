import { BlockList, isIP } from 'net'
import { ICallerAddress } from '@kwirthmagnify/kwirth-common'

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

const IPV4_MAPPED = /^::ffff:(\d{1,3}(\.\d{1,3}){3})$/i
const IPV4_WITH_PORT = /^(\d{1,3}(\.\d{1,3}){3}):\d+$/
const IPV6_BRACKETED = /^\[([^\]]+)\](:\d+)?$/

// One address as it may come in a socket or in a forwarded header, in its canonical form; '' if it is not one.
export const normalizeIp = (raw: string | undefined): string => {
    if (!raw) return ''
    let value = raw.trim()
    const bracketed = IPV6_BRACKETED.exec(value)
    if (bracketed) value = bracketed[1]
    const withPort = IPV4_WITH_PORT.exec(value)
    if (withPort) value = withPort[1]
    const mapped = IPV4_MAPPED.exec(value)
    if (mapped) value = mapped[1]
    if (isIP(value) === 0) return ''
    return value.toLowerCase()
}

const familyOf = (ip: string): 'ipv4' | 'ipv6' => isIP(ip) === 6 ? 'ipv6' : 'ipv4'

// An entry of a list as it is stored: a bare address or a CIDR, already parsed. undefined = not valid.
const parseEntry = (entry: string): { address: string, prefix?: number } | undefined => {
    // the type says string, but this runs on every login over stored data: never throw, an unreadable entry is just not valid
    if (typeof entry !== 'string') return undefined
    const trimmed = entry.trim()
    const slash = trimmed.indexOf('/')
    if (slash < 0) {
        const address = normalizeIp(trimmed)
        return address ? { address } : undefined
    }
    const address = normalizeIp(trimmed.substring(0, slash))
    const prefixText = trimmed.substring(slash + 1)
    if (!address || !/^\d{1,3}$/.test(prefixText)) return undefined
    const prefix = Number(prefixText)
    const max = familyOf(address) === 'ipv6' ? 128 : 32
    return prefix <= max ? { address, prefix } : undefined
}

export const isValidIpOrCidr = (entry: string): boolean => parseEntry(entry) !== undefined

// The entries of a list that are neither an address nor a CIDR, as they were written.
export const invalidEntries = (entries: string[]): string[] => entries.filter(e => !isValidIpOrCidr(e))

// Invalid entries are skipped here: what may be stored is checked when it is saved, not on every request.
export const buildBlockList = (entries: string[]): BlockList => {
    const list = new BlockList()
    for (const entry of entries) {
        const parsed = parseEntry(entry)
        if (!parsed) continue
        if (parsed.prefix === undefined) list.addAddress(parsed.address, familyOf(parsed.address))
        else list.addSubnet(parsed.address, parsed.prefix, familyOf(parsed.address))
    }
    return list
}

export const ipInList = (ip: string, entries: string[]): boolean => {
    const address = normalizeIp(ip)
    if (!address || entries.length === 0) return false
    return buildBlockList(entries).check(address, familyOf(address))
}

export const isLoopback = (ip: string): boolean => ipInList(ip, ['127.0.0.0/8', '::1'])

/*
    The client behind a request. 'forwardedFor' is the raw header: one string, several (when it was sent
    more than once) or nothing. An unreadable hop stops the walk, and the client is then the trusted hop
    right of it — the last address that somebody we trust vouched for.
*/
export const clientAddressOf = (remoteAddress: string | undefined, forwardedFor: string | string[] | undefined, trustedProxies: string[]): ICallerAddress => {
    const remote = normalizeIp(remoteAddress)
    const header = Array.isArray(forwardedFor) ? forwardedFor.join(',') : (forwardedFor ?? '')
    const hops = header.split(',').map(h => h.trim()).filter(h => h !== '')
    if (hops.length === 0) return { ip: remote, remoteAddress: remote, forwardedIgnored: false }

    const trusted = buildBlockList(trustedProxies)
    const isTrusted = (ip: string) => ip !== '' && trustedProxies.length > 0 && trusted.check(ip, familyOf(ip))
    if (!isTrusted(remote)) return { ip: remote, remoteAddress: remote, forwardedIgnored: true }

    let client = remote
    for (let i = hops.length - 1; i >= 0; i--) {
        const hop = normalizeIp(hops[i])
        if (!hop) break
        client = hop
        if (!isTrusted(hop)) break
    }
    return { ip: client, remoteAddress: remote, forwardedIgnored: false }
}
