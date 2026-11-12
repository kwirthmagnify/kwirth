import { IncomingMessage } from 'http'
import { ICallerAddress, IKwirthSettings, ILoginIpFilter } from '@kwirthmagnify/kwirth-common'
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

// The client behind a request, believing X-Forwarded-For only from the filter's trusted proxies.
export const callerOf = (req: IncomingMessage, filter: ILoginIpFilter): ICallerAddress =>
    clientAddressOf(req.socket.remoteAddress, req.headers['x-forwarded-for'], filter.trustedProxies)

/*
    Whether a login from 'ip' may go ahead. On the desktop the loopback is always allowed: the person in
    front of the screen IS the local user, and a filter there could only lock them out of their own app.
*/
export const isLoginAllowed = (filter: ILoginIpFilter, ip: string, isDesktop: boolean): boolean => {
    if (!isLoginIpFilterActive(filter)) return true
    if (isDesktop && isLoopback(ip)) return true
    return ipInList(ip, filter.allowed)
}

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(v => typeof v === 'string')

// Trimmed, without blanks or repeats.
const cleanList = (value: string[]): string[] => [...new Set(value.map(v => v.trim()).filter(v => v !== ''))]

/*
    Checks a filter that is about to be saved and returns it cleaned, or the reason it cannot be saved.
    'origin' is the request of whoever saves: the filter as it WILL be (its own trusted proxies included)
    must still let them in, or saving it would lock them out on their next login. Without an origin there
    is nobody to protect and only the shape is checked. 'incoming' is a body nobody has checked yet.
*/
export const validateLoginIpFilter = (incoming: unknown, origin: IncomingMessage | undefined, isDesktop: boolean): ILoginIpFilter | string => {
    const raw = (incoming ?? {}) as Partial<Record<keyof ILoginIpFilter, unknown>>
    if (typeof raw.enabled !== 'boolean') return 'loginIpFilter.enabled must be true or false'
    if (!isStringArray(raw.allowed)) return 'loginIpFilter.allowed must be a list of IPs or CIDRs'
    if (!isStringArray(raw.trustedProxies)) return 'loginIpFilter.trustedProxies must be a list of IPs or CIDRs'
    const filter: ILoginIpFilter = { enabled: raw.enabled, allowed: cleanList(raw.allowed), trustedProxies: cleanList(raw.trustedProxies) }

    const badAllowed = invalidEntries(filter.allowed)
    if (badAllowed.length > 0) return `Not an IP or CIDR in the login allow list: ${badAllowed.join(', ')}`
    const badProxies = invalidEntries(filter.trustedProxies)
    if (badProxies.length > 0) return `Not an IP or CIDR in the trusted proxies: ${badProxies.join(', ')}`

    if (origin) {
        const caller = callerOf(origin, filter)
        if (!isLoginAllowed(filter, caller.ip, isDesktop)) return `The login allow list does not include your own address (${caller.ip || 'unknown'}): saving it would lock you out`
    }
    return filter
}
