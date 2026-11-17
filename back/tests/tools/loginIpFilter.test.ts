import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IncomingMessage } from 'http'
import { IIpAddressEntry, IKwirthSettings, ILoginIpFilter } from '@kwirthmagnify/kwirth-common'
import { addressesOf, callerOf, isLoginAllowed, isLoginIpFilterActive, loginIpFilterOf, trustedProxiesOf, validateLoginIpFilter, validateTrustedProxies } from '../../src/tools/LoginIpFilter'

// just what callerOf reads from a request: the socket address and the forwarded header
const requestFrom = (remoteAddress: string, forwardedFor?: string): IncomingMessage =>
    ({ socket: { remoteAddress }, headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {} }) as unknown as IncomingMessage

// a list of entries without comments, which is what most checks need
const ips = (...addresses: string[]): IIpAddressEntry[] => addresses.map(address => ({ address, comment: '' }))

const on = (allowed: string[]): ILoginIpFilter => ({ enabled: true, allowed: ips(...allowed) })

// ---- defaults: a fresh installation lets everybody in ----

test('settings without a filter (fresh installation) → switched off, empty list; no trusted proxies', () => {
    assert.deepEqual(loginIpFilterOf({}), { enabled: false, allowed: [] })
    assert.deepEqual(trustedProxiesOf({}), [])
})

test('fresh installation: a login from anywhere is allowed', () => {
    const filter = loginIpFilterOf({})
    assert.equal(isLoginAllowed(filter, '203.0.113.9', false), true)
    assert.equal(isLoginAllowed(filter, '', false), true)
})

// ---- 🔴 reading what is stored never throws: a throw is a login nobody can pass, the admin included ----

// what a configmap may hold, whatever the current type says: written before L5, or edited by hand
const storedAs = (settings: unknown): IKwirthSettings => settings as IKwirthSettings

test('a list stored before the comments (plain strings) is read as the addresses it always was', () => {
    const settings = storedAs({ loginIpFilter: { enabled: true, allowed: ['10.0.0.0/8', '::1'] }, trustedProxies: ['192.168.1.1'] })
    const filter = loginIpFilterOf(settings)
    assert.deepEqual(filter.allowed, ips('10.0.0.0/8', '::1'))
    assert.deepEqual(trustedProxiesOf(settings), ips('192.168.1.1'))
    // and the login decides on them exactly as before
    assert.equal(isLoginAllowed(filter, '10.1.2.3', false), true)
    assert.equal(isLoginAllowed(filter, '::1', false), true)
    assert.equal(isLoginAllowed(filter, '203.0.113.9', false), false)
})

test('a mixed or damaged stored list: strings and entries are kept, anything unreadable is dropped, nothing throws', () => {
    const settings = storedAs({
        loginIpFilter: { enabled: true, allowed: ['10.0.0.0/8', { address: '::1', comment: 'v6' }, { address: '127.0.0.1' }, null, 42, { comment: 'no address' }, { address: 7 }] },
        trustedProxies: 'not a list'
    })
    const filter = loginIpFilterOf(settings)
    assert.deepEqual(filter.allowed, [{ address: '10.0.0.0/8', comment: '' }, { address: '::1', comment: 'v6' }, { address: '127.0.0.1', comment: '' }])
    assert.deepEqual(trustedProxiesOf(settings), [])
    assert.equal(isLoginAllowed(filter, '127.0.0.1', false), true)
    assert.equal(isLoginAllowed(filter, '203.0.113.9', false), false)
})

test('stored garbage instead of a filter → off, everybody in (never a lock-out by a hand edit)', () => {
    for (const garbage of [null, 'on', 42, [], { enabled: 'yes', allowed: ['10.0.0.0/8'] }]) {
        const filter = loginIpFilterOf(storedAs({ loginIpFilter: garbage }))
        assert.equal(isLoginAllowed(filter, '203.0.113.9', false), true, JSON.stringify(garbage))
    }
})

test('callerOf over a trusted-proxy list stored as plain strings: still believes the proxy', () => {
    const proxies = trustedProxiesOf(storedAs({ trustedProxies: ['10.42.0.0/16'] }))
    assert.equal(callerOf(requestFrom('10.42.0.7', '203.0.113.9'), proxies).ip, '203.0.113.9')
})

test('🔴 the trusted proxies are their own setting: a list left inside the login filter (the shape before 2026-11-17) is not read', () => {
    const settings = storedAs({ loginIpFilter: { enabled: false, allowed: [], trustedProxies: ['10.42.0.0/16'] } })
    assert.deepEqual(trustedProxiesOf(settings), [])
    assert.deepEqual(loginIpFilterOf(settings), { enabled: false, allowed: [] })
    // with no trusted proxy, the header is not believed: the address is the connection's
    assert.equal(callerOf(requestFrom('10.42.0.7', '203.0.113.9'), trustedProxiesOf(settings)).ip, '10.42.0.7')
})

test('🔴 the trusted proxies work with the login filter switched OFF (a Kwirth that does not restrict its login may need them)', () => {
    const settings = storedAs({ loginIpFilter: { enabled: false, allowed: [] }, trustedProxies: [{ address: '10.42.0.0/16', comment: 'ingress' }] })
    assert.equal(callerOf(requestFrom('10.42.0.7', '203.0.113.9'), trustedProxiesOf(settings)).ip, '203.0.113.9')
})

test('switched OFF with a list: the list does not apply', () => {
    const filter: ILoginIpFilter = { enabled: false, allowed: ips('10.0.0.0/8') }
    assert.equal(isLoginIpFilterActive(filter), false)
    assert.equal(isLoginAllowed(filter, '203.0.113.9', false), true)
})

test('🔴 switched ON with an EMPTY list: everybody may still log in (a hand edit cannot lock the world out)', () => {
    const filter = on([])
    assert.equal(isLoginIpFilterActive(filter), false)
    assert.equal(isLoginAllowed(filter, '203.0.113.9', false), true)
})

test('only "enabled === true" switches it on; anything else stored counts as off', () => {
    const stored = { loginIpFilter: { enabled: 'yes', allowed: ips('10.0.0.0/8') } } as unknown as IKwirthSettings
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
    const filter: ILoginIpFilter = { enabled: true, allowed: [{ address: '10.0.0.0/8', comment: '203.0.113.9' }] }
    assert.equal(isLoginAllowed(filter, '10.4.5.6', false), true)
    assert.equal(isLoginAllowed(filter, '203.0.113.9', false), false)
})

test('addressesOf: the addresses of a list, in order, without the comments', () => {
    assert.deepEqual(addressesOf([{ address: '10.0.0.0/8', comment: 'office' }, { address: '::1', comment: '' }]), ['10.0.0.0/8', '::1'])
    assert.deepEqual(addressesOf([]), [])
})

// ---- validation on save ----

test('validate: the shape is checked, field by field', () => {
    assert.match(validateLoginIpFilter({ allowed: [] }, undefined, false, []) as string, /enabled/)
    assert.match(validateLoginIpFilter({ enabled: true, allowed: '10.0.0.0/8' }, undefined, false, []) as string, /allowed/)
    assert.match(validateLoginIpFilter(undefined, undefined, false, []) as string, /enabled/)
    assert.match(validateTrustedProxies([1]) as string, /trustedProxies/)
    assert.match(validateTrustedProxies('10.42.0.0/16') as string, /trustedProxies/)
})

test('validate: a list of plain strings (the old shape) is refused', () => {
    assert.match(validateLoginIpFilter({ enabled: false, allowed: ['10.0.0.0/8'] }, undefined, false, []) as string, /allowed must be a list of \{ address, comment \}/)
    assert.match(validateTrustedProxies(['10.42.0.0/16']) as string, /trustedProxies must be/)
})

test('validate: an entry without its comment, or with a non-string one, is refused', () => {
    assert.match(validateLoginIpFilter({ enabled: false, allowed: [{ address: '10.0.0.0/8' }] }, undefined, false, []) as string, /allowed/)
    assert.match(validateLoginIpFilter({ enabled: false, allowed: [{ address: '10.0.0.0/8', comment: 7 }] }, undefined, false, []) as string, /allowed/)
    assert.match(validateLoginIpFilter({ enabled: false, allowed: [null] }, undefined, false, []) as string, /allowed/)
})

test('validate: entries are trimmed, blanks and repeats dropped; a repeat keeps the FIRST comment', () => {
    const result = validateLoginIpFilter({
        enabled: false,
        allowed: [{ address: ' 10.0.0.0/8 ', comment: ' office ' }, { address: '', comment: 'orphan note' }, { address: '10.0.0.0/8', comment: 'second' }]
    }, undefined, false, [])
    assert.deepEqual(result, { enabled: false, allowed: [{ address: '10.0.0.0/8', comment: 'office' }] })
    assert.deepEqual(validateTrustedProxies([{ address: '10.42.0.0/16', comment: 'ingress' }, { address: '  ', comment: '' }]), [{ address: '10.42.0.0/16', comment: 'ingress' }])
})

test('validate: a bad entry is named, in either list', () => {
    assert.match(validateLoginIpFilter({ enabled: false, allowed: ips('10.0.0.0/8', 'office') }, undefined, false, []) as string, /allow list: office/)
    assert.match(validateTrustedProxies(ips('10.42.0.0/99')) as string, /trusted proxies: 10\.42\.0\.0\/99/)
})

test('🔴 validate: switching it on with a list that leaves the author out is refused', () => {
    const result = validateLoginIpFilter(on(['10.0.0.0/8']), requestFrom('203.0.113.9'), false, [])
    assert.equal(typeof result, 'string')
    assert.match(result as string, /203\.0\.113\.9/)
})

test('validate: the same list switched OFF can be saved from outside it', () => {
    const result = validateLoginIpFilter({ enabled: false, allowed: ips('10.0.0.0/8') }, requestFrom('203.0.113.9'), false, [])
    assert.equal(typeof result, 'object')
})

test('validate: a list that includes the author is accepted', () => {
    const result = validateLoginIpFilter(on(['203.0.113.0/24']), requestFrom('::ffff:203.0.113.9'), false, [])
    assert.deepEqual(result, on(['203.0.113.0/24']))
})

test('validate: the author is resolved with the trusted proxies GIVEN (those being saved), not others', () => {
    // behind the ingress, the author is only seen as themselves once the ingress is trusted
    const behindIngress = requestFrom('10.42.1.7', '198.51.100.20')
    assert.equal(typeof validateLoginIpFilter(on(['198.51.100.0/24']), behindIngress, false, []), 'string')
    assert.equal(typeof validateLoginIpFilter(on(['198.51.100.0/24']), behindIngress, false, ips('10.42.0.0/16')), 'object')
})

test('🔴 validate: switched ON with an empty allow list cannot be saved (it would restrict nothing)', () => {
    assert.equal(validateLoginIpFilter(on([]), undefined, false, []), 'Add at least one allowed address to restrict login')
    // blank addresses do not count as entries, even with a comment
    assert.equal(validateLoginIpFilter({ enabled: true, allowed: [{ address: '  ', comment: 'office' }, { address: '', comment: '' }] }, requestFrom('10.0.0.1'), false, []), 'Add at least one allowed address to restrict login')
    // switched off, an empty list is the normal state
    assert.equal(typeof validateLoginIpFilter({ enabled: false, allowed: [] }, undefined, false, []), 'object')
})

test('validate: without an origin only the shape is checked', () => {
    assert.equal(typeof validateLoginIpFilter(on(['10.0.0.0/8']), undefined, false, []), 'object')
})
