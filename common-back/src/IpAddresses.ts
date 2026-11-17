import { BlockList, isIP } from 'net'

/*
    IP addresses and lists of them (addresses and CIDRs, IPv4 and IPv6): what the core's login IP filter and its
    trusted proxies use, and what an extension uses to check where a caller comes from (IRIA Ianus: where a spoke
    may link from). Moved here from the core's ClientIp (2026-11-17) so that both use the SAME code — a second copy
    of a security check is one that drifts.

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

// The family of a (normalized) address, as net.BlockList names it
export const ipFamilyOf = (ip: string): 'ipv4' | 'ipv6' => isIP(ip) === 6 ? 'ipv6' : 'ipv4'

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
    const max = ipFamilyOf(address) === 'ipv6' ? 128 : 32
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
        if (parsed.prefix === undefined) list.addAddress(parsed.address, ipFamilyOf(parsed.address))
        else list.addSubnet(parsed.address, parsed.prefix, ipFamilyOf(parsed.address))
    }
    return list
}

export const ipInList = (ip: string, entries: string[]): boolean => {
    const address = normalizeIp(ip)
    if (!address || entries.length === 0) return false
    return buildBlockList(entries).check(address, ipFamilyOf(address))
}

export const isLoopback = (ip: string): boolean => ipInList(ip, ['127.0.0.0/8', '::1'])
