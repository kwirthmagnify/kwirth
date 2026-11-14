import { IncomingMessage } from 'http'
import { ICallerAddress, IKwirthSettings, ILoginIpEntry, ILoginIpFilter } from '@kwirthmagnify/kwirth-common'
import { clientAddressOf, invalidEntries, ipInList, isLoopback } from './ClientIp'

/*
    The login IP filter (plan: plans/login-ip-filter). Pure functions: reading the settings is up to the
    caller (SettingsApi.readStrict), so that SettingsApi can use the validation below without a cycle.

    🔴 The filter acts ONLY when it is switched on AND the allow list has something. Off is how a fresh
    installation starts, and an empty list lets everybody in even when switched on: a hand edit of the
    configmap must never be able to lock the whole world out.
*/

// What is stored, with the defaults filled in: a settings object written before the filter existed has none.
export const loginIpFilterOf = (settings: IKwirthSettings): ILoginIpFilter => ({
    enabled: settings.loginIpFilter?.enabled === true,
    allowed: settings.loginIpFilter?.allowed ?? [],
    trustedProxies: settings.loginIpFilter?.trustedProxies ?? []
})

export const isLoginIpFilterActive = (filter: ILoginIpFilter): boolean => filter.enabled && filter.allowed.length > 0

// The IPs/CIDRs of a list, which is all the checks look at: the comments are for people.
export const addressesOf = (entries: ILoginIpEntry[]): string[] => entries.map(e => e.address)

// The client behind a request, believing X-Forwarded-For only from the filter's trusted proxies.
export const callerOf = (req: IncomingMessage, filter: ILoginIpFilter): ICallerAddress =>
    clientAddressOf(req.socket.remoteAddress, req.headers['x-forwarded-for'], addressesOf(filter.trustedProxies))

/*
    Whether a login from 'ip' may go ahead. On the desktop the loopback is always allowed: the person in
    front of the screen IS the local user, and a filter there could only lock them out of their own app.
*/
export const isLoginAllowed = (filter: ILoginIpFilter, ip: string, isDesktop: boolean): boolean => {
    if (!isLoginIpFilterActive(filter)) return true
    if (isDesktop && isLoopback(ip)) return true
    return ipInList(ip, addressesOf(filter.allowed))
}

const isEntryArray = (value: unknown): value is ILoginIpEntry[] => Array.isArray(value) && value.every(v =>
    typeof v === 'object' && v !== null && typeof (v as ILoginIpEntry).address === 'string' && typeof (v as ILoginIpEntry).comment === 'string')

// Trimmed, without blank addresses; an address that repeats keeps its first entry (and its comment).
const cleanList = (value: ILoginIpEntry[]): ILoginIpEntry[] => {
    const seen = new Set<string>()
    const result: ILoginIpEntry[] = []
    for (const entry of value) {
        const address = entry.address.trim()
        if (address === '' || seen.has(address)) continue
        seen.add(address)
        result.push({ address, comment: entry.comment.trim() })
    }
    return result
}

/*
    Checks a filter that is about to be saved and returns it cleaned, or the reason it cannot be saved.
    'origin' is the request of whoever saves: the filter as it WILL be (its own trusted proxies included)
    must still let them in, or saving it would lock them out on their next login. Without an origin there
    is nobody to protect and only the shape is checked. 'incoming' is a body nobody has checked yet.
*/
export const validateLoginIpFilter = (incoming: unknown, origin: IncomingMessage | undefined, isDesktop: boolean): ILoginIpFilter | string => {
    const raw = (incoming ?? {}) as Partial<Record<keyof ILoginIpFilter, unknown>>
    if (typeof raw.enabled !== 'boolean') return 'loginIpFilter.enabled must be true or false'
    if (!isEntryArray(raw.allowed)) return 'loginIpFilter.allowed must be a list of { address, comment }'
    if (!isEntryArray(raw.trustedProxies)) return 'loginIpFilter.trustedProxies must be a list of { address, comment }'
    const filter: ILoginIpFilter = { enabled: raw.enabled, allowed: cleanList(raw.allowed), trustedProxies: cleanList(raw.trustedProxies) }

    const badAllowed = invalidEntries(addressesOf(filter.allowed))
    if (badAllowed.length > 0) return `Not an IP or CIDR in the login allow list: ${badAllowed.join(', ')}`
    const badProxies = invalidEntries(addressesOf(filter.trustedProxies))
    if (badProxies.length > 0) return `Not an IP or CIDR in the trusted proxies: ${badProxies.join(', ')}`

    /*
        Switched on with nothing allowed is refused HERE, on save, and only here. At runtime it still lets
        everybody in (a hand edit of the configmap must never lock the world out), which is exactly why it
        cannot be saved from the dialog: the admin ticks 'Restrict', presses OK, and nothing is restricted
        (found in QA, 2026-11-12).
    */
    if (filter.enabled && filter.allowed.length === 0) return 'Add at least one allowed address to restrict login'

    if (origin) {
        const caller = callerOf(origin, filter)
        if (!isLoginAllowed(filter, caller.ip, isDesktop)) return `The login allow list does not include your own address (${caller.ip || 'unknown'}): saving it would lock you out`
    }
    return filter
}
