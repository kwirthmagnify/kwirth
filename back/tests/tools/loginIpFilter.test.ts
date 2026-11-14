import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IncomingMessage } from 'http'
import { IKwirthSettings, ILoginIpEntry, ILoginIpFilter } from '@kwirthmagnify/kwirth-common'
import { addressesOf, callerOf, isLoginAllowed, isLoginIpFilterActive, loginIpFilterOf, validateLoginIpFilter } from '../../src/tools/LoginIpFilter'

// just what callerOf reads from a request: the socket address and the forwarded header
const requestFrom = (remoteAddress: string, forwardedFor?: string): IncomingMessage =>
    ({ socket: { remoteAddress }, headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {} }) as unknown as IncomingMessage

// a list of entries without comments, which is what most checks need
const ips = (...addresses: string[]): ILoginIpEntry[] => addresses.map(address => ({ address, comment: '' }))

const on = (allowed: string[], trustedProxies: string[] = []): ILoginIpFilter => ({ enabled: true, allowed: ips(...allowed), trustedProxies: ips(...trustedProxies) })

// ---- defaults: a fresh installation lets everybody in ----

test('settings without a filter (fresh installation) → switched off, empty lists', () => {
    assert.deepEqual(loginIpFilterOf({}), { enabled: false, allowed: [], trustedProxies: [] })
})

test('fresh installation: a login from anywhere is allowed', () => {
    const filter = loginIpFilterOf({})
    assert.equal(isLoginAllowed(filter, '203.0.113.9', false), true)
    assert.equal(isLoginAllowed(filter, '', false), true)
})

// ---- 🔴 reading what is stored never throws: a throw is a login nobody can pass, the admin included ----

// what a configmap may hold, whatever the current type says: written before L5, or edited by hand
const storedAs = (loginIpFilter: unknown): IKwirthSettings => ({ loginIpFilter } as unknown as IKwirthSettings)

test('a list stored before the comments (plain strings) is read as the addresses it always was', () => {
    const filter = loginIpFilterOf(storedAs({ enabled: true, allowed: ['10.0.0.0/8', '::1'], trustedProxies: ['192.168.1.1'] }))
    assert.deepEqual(filter.allowed, ips('10.0.0.0/8', '::1'))
    assert.deepEqual(filter.trustedProxies, ips('192.168.1.1'))
    // and the login decides on them exactly as before
    assert.equal(isLoginAllowed(filter, '10.1.2.3', false), true)
    assert.equal(isLoginAllowed(filter, '::1', false), true)
    assert.equal(isLoginAllowed(filter, '203.0.113.9', false), false)
})

test('a mixed or damaged stored list: strings and entries are kept, anything unreadable is dropped, nothing throws', () => {
    const filter = loginIpFilterOf(storedAs({
        enabled: true,
        allowed: ['10.0.0.0/8', { address: '::1', comment: 'v6' }, { address: '127.0.0.1' }, null, 42, { comment: 'no address' }, { address: 7 }],
        trustedProxies: 'not a list'
    }))
    assert.deepEqual(filter.allowed, [{ address: '10.0.0.0/8', comment: '' }, { address: '::1', comment: 'v6' }, { address: '127.0.0.1', comment: '' }])
    assert.deepEqual(filter.trustedProxies, [])
    assert.equal(isLoginAllowed(filter, '127.0.0.1', false), true)
    assert.equal(isLoginAllowed(filter, '203.0.113.9', false), false)
})

test('stored garbage instead of a filter → off, everybody in (never a lock-out by a hand edit)', () => {
    for (const garbage of [null, 'on', 42, [], { enabled: 'yes', allowed: ['10.0.0.0/8'] }]) {
        const filter = loginIpFilterOf(storedAs(garbage))
        assert.equal(isLoginAllowed(filter, '203.0.113.9', false), true, JSON.stringify(garbage))
    }
})

test('callerOf over a trusted-proxy list stored as plain strings: still believes the proxy', () => {
    const filter = loginIpFilterOf(storedAs({ enabled: true, allowed: ['203.0.113.0/24'], trustedProxies: ['10.42.0.0/16'] }))
    assert.equal(callerOf(requestFrom('10.42.0.7', '203.0.113.9'), filter).ip, '203.0.113.9')
})

test('switched OFF with a list: the list does not apply', () => {
    const filter: ILoginIpFilter = { enabled: false, allowed: ips('10.0.0.0/8'), trustedProxies: [] }
    assert.equal(isLoginIpFilterActive(filter), false)
    assert.equal(isLoginAllowed(filter, '203.0.113.9', false), true)
})

test('🔴 switched ON with an EMPTY list: everybody may still log in (a hand edit cannot lock the world out)', () => {
    const filter = on([])
    assert.equal(isLoginIpFilterActive(filter), false)
    assert.equal(isLoginAllowed(filter, '203.0.113.9', false), true)
})

test('only "enabled === true" switches it on; anything else stored counts as off', () => {
    const stored = { loginIpFilter: { enabled: 'yes', allowed: ips('10.0.0.0/8'), trustedProxies: [] } } as unknown as IKwirthSettings
    assert.equal(loginIpFilterOf(stored).enabled, false)
})

// ---- active filter ----

test('switched on with a list: inside allowed, outside refused', () => {
    const filter = on(['10.0.0.0/8', '2001:db8::/32'])
    assert.equal(isLoginAllowed(filter, '10.4.5.6', false), true)
    assert.equal(isLoginAllowed(filter, '2001:db8::9', false), true)
    assert.equal(isLoginAllowed(filter, '203.0.113.9', false), false)
    assert.equal(isLoginAllowed(filter, '', false), false)
})

test('the loopback is always allowed on the desktop, and only there', () => {
    const filter = on(['10.0.0.0/8'])
    assert.equal(isLoginAllowed(filter, '127.0.0.1', true), true)
    assert.equal(isLoginAllowed(filter, '::1', true), true)
    assert.equal(isLoginAllowed(filter, '127.0.0.1', false), false)
    assert.equal(isLoginAllowed(filter, '203.0.113.9', true), false)
})

test('the comment never takes part in the check: only the address does', () => {
    const filter: ILoginIpFilter = { enabled: true, allowed: [{ address: '10.0.0.0/8', comment: '203.0.113.9' }], trustedProxies: [] }
    assert.equal(isLoginAllowed(filter, '10.4.5.6', false), true)
    assert.equal(isLoginAllowed(filter, '203.0.113.9', false), false)
})

test('addressesOf: the addresses of a list, in order, without the comments', () => {
    assert.deepEqual(addressesOf([{ address: '10.0.0.0/8', comment: 'office' }, { address: '::1', comment: '' }]), ['10.0.0.0/8', '::1'])
    assert.deepEqual(addressesOf([]), [])
})

// ---- validation on save ----

test('validate: the shape is checked, field by field', () => {
    assert.match(validateLoginIpFilter({ allowed: [], trustedProxies: [] }, undefined, false) as string, /enabled/)
    assert.match(validateLoginIpFilter({ enabled: true, allowed: '10.0.0.0/8', trustedProxies: [] }, undefined, false) as string, /allowed/)
    assert.match(validateLoginIpFilter({ enabled: true, allowed: [], trustedProxies: [1] }, undefined, false) as string, /trustedProxies/)
    assert.match(validateLoginIpFilter(undefined, undefined, false) as string, /enabled/)
})

test('validate: a list of plain strings (the old shape) is refused', () => {
    assert.match(validateLoginIpFilter({ enabled: false, allowed: ['10.0.0.0/8'], trustedProxies: [] }, undefined, false) as string, /allowed must be a list of \{ address, comment \}/)
    assert.match(validateLoginIpFilter({ enabled: false, allowed: [], trustedProxies: ['10.42.0.0/16'] }, undefined, false) as string, /trustedProxies must be/)
})

test('validate: an entry without its comment, or with a non-string one, is refused', () => {
    assert.match(validateLoginIpFilter({ enabled: false, allowed: [{ address: '10.0.0.0/8' }], trustedProxies: [] }, undefined, false) as string, /allowed/)
    assert.match(validateLoginIpFilter({ enabled: false, allowed: [{ address: '10.0.0.0/8', comment: 7 }], trustedProxies: [] }, undefined, false) as string, /allowed/)
    assert.match(validateLoginIpFilter({ enabled: false, allowed: [null], trustedProxies: [] }, undefined, false) as string, /allowed/)
})

test('validate: entries are trimmed, blanks and repeats dropped; a repeat keeps the FIRST comment', () => {
    const result = validateLoginIpFilter({
        enabled: false,
        allowed: [{ address: ' 10.0.0.0/8 ', comment: ' office ' }, { address: '', comment: 'orphan note' }, { address: '10.0.0.0/8', comment: 'second' }],
        trustedProxies: [{ address: '10.42.0.0/16', comment: 'ingress' }, { address: '  ', comment: '' }]
    }, undefined, false)
    assert.deepEqual(result, {
        enabled: false,
        allowed: [{ address: '10.0.0.0/8', comment: 'office' }],
        trustedProxies: [{ address: '10.42.0.0/16', comment: 'ingress' }]
    })
})

test('validate: a bad entry is named, in either list', () => {
    assert.match(validateLoginIpFilter({ enabled: false, allowed: ips('10.0.0.0/8', 'office'), trustedProxies: [] }, undefined, false) as string, /allow list: office/)
    assert.match(validateLoginIpFilter({ enabled: false, allowed: [], trustedProxies: ips('10.42.0.0/99') }, undefined, false) as string, /trusted proxies: 10\.42\.0\.0\/99/)
})

test('🔴 validate: switching it on with a list that leaves the author out is refused', () => {
    const result = validateLoginIpFilter(on(['10.0.0.0/8']), requestFrom('203.0.113.9'), false)
    assert.equal(typeof result, 'string')
    assert.match(result as string, /203\.0\.113\.9/)
})

test('validate: the same list switched OFF can be saved from outside it', () => {
    const result = validateLoginIpFilter({ enabled: false, allowed: ips('10.0.0.0/8'), trustedProxies: [] }, requestFrom('203.0.113.9'), false)
    assert.equal(typeof result, 'object')
})

test('validate: a list that includes the author is accepted', () => {
    const result = validateLoginIpFilter(on(['203.0.113.0/24']), requestFrom('::ffff:203.0.113.9'), false)
    assert.deepEqual(result, on(['203.0.113.0/24']))
})

test('validate: the author is resolved with the trusted proxies BEING SAVED, not the stored ones', () => {
    // behind the ingress, the author is only seen as themselves once the ingress is trusted
    const behindIngress = requestFrom('10.42.1.7', '198.51.100.20')
    assert.equal(typeof validateLoginIpFilter(on(['198.51.100.0/24']), behindIngress, false), 'string')
    assert.equal(typeof validateLoginIpFilter(on(['198.51.100.0/24'], ['10.42.0.0/16']), behindIngress, false), 'object')
})

test('🔴 validate: switched ON with an empty allow list cannot be saved (it would restrict nothing)', () => {
    assert.equal(validateLoginIpFilter(on([]), undefined, false), 'Add at least one allowed address to restrict login')
    // blank addresses do not count as entries, even with a comment
    assert.equal(validateLoginIpFilter({ enabled: true, allowed: [{ address: '  ', comment: 'office' }, { address: '', comment: '' }], trustedProxies: [] }, requestFrom('10.0.0.1'), false), 'Add at least one allowed address to restrict login')
    // switched off, an empty list is the normal state
    assert.equal(typeof validateLoginIpFilter({ enabled: false, allowed: [], trustedProxies: [] }, undefined, false), 'object')
})

test('validate: without an origin only the shape is checked', () => {
    assert.equal(typeof validateLoginIpFilter(on(['10.0.0.0/8']), undefined, false), 'object')
})
