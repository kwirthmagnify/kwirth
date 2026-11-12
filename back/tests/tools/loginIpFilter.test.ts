import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IncomingMessage } from 'http'
import { IKwirthSettings, ILoginIpFilter } from '@kwirthmagnify/kwirth-common'
import { isLoginAllowed, isLoginIpFilterActive, loginIpFilterOf, validateLoginIpFilter } from '../../src/tools/LoginIpFilter'

// just what callerOf reads from a request: the socket address and the forwarded header
const requestFrom = (remoteAddress: string, forwardedFor?: string): IncomingMessage =>
    ({ socket: { remoteAddress }, headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {} }) as unknown as IncomingMessage

const on = (allowed: string[], trustedProxies: string[] = []): ILoginIpFilter => ({ enabled: true, allowed, trustedProxies })

// ---- defaults: a fresh installation lets everybody in ----

test('settings without a filter (fresh installation) → switched off, empty lists', () => {
    assert.deepEqual(loginIpFilterOf({}), { enabled: false, allowed: [], trustedProxies: [] })
})

test('fresh installation: a login from anywhere is allowed', () => {
    const filter = loginIpFilterOf({})
    assert.equal(isLoginAllowed(filter, '203.0.113.9', false), true)
    assert.equal(isLoginAllowed(filter, '', false), true)
})

test('switched OFF with a list: the list does not apply', () => {
    const filter: ILoginIpFilter = { enabled: false, allowed: ['10.0.0.0/8'], trustedProxies: [] }
    assert.equal(isLoginIpFilterActive(filter), false)
    assert.equal(isLoginAllowed(filter, '203.0.113.9', false), true)
})

test('🔴 switched ON with an EMPTY list: everybody may still log in (a hand edit cannot lock the world out)', () => {
    const filter = on([])
    assert.equal(isLoginIpFilterActive(filter), false)
    assert.equal(isLoginAllowed(filter, '203.0.113.9', false), true)
})

test('only "enabled === true" switches it on; anything else stored counts as off', () => {
    const stored = { loginIpFilter: { enabled: 'yes', allowed: ['10.0.0.0/8'], trustedProxies: [] } } as unknown as IKwirthSettings
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

// ---- validation on save ----

test('validate: the shape is checked, field by field', () => {
    assert.match(validateLoginIpFilter({ allowed: [], trustedProxies: [] }, undefined, false) as string, /enabled/)
    assert.match(validateLoginIpFilter({ enabled: true, allowed: '10.0.0.0/8', trustedProxies: [] }, undefined, false) as string, /allowed/)
    assert.match(validateLoginIpFilter({ enabled: true, allowed: [], trustedProxies: [1] }, undefined, false) as string, /trustedProxies/)
    assert.match(validateLoginIpFilter(undefined, undefined, false) as string, /enabled/)
})

test('validate: entries are trimmed, blanks and repeats dropped', () => {
    const result = validateLoginIpFilter({ enabled: false, allowed: [' 10.0.0.0/8 ', '', '10.0.0.0/8'], trustedProxies: ['10.42.0.0/16', '  '] }, undefined, false)
    assert.deepEqual(result, { enabled: false, allowed: ['10.0.0.0/8'], trustedProxies: ['10.42.0.0/16'] })
})

test('validate: a bad entry is named, in either list', () => {
    assert.match(validateLoginIpFilter({ enabled: false, allowed: ['10.0.0.0/8', 'office'], trustedProxies: [] }, undefined, false) as string, /allow list: office/)
    assert.match(validateLoginIpFilter({ enabled: false, allowed: [], trustedProxies: ['10.42.0.0/99'] }, undefined, false) as string, /trusted proxies: 10\.42\.0\.0\/99/)
})

test('🔴 validate: switching it on with a list that leaves the author out is refused', () => {
    const result = validateLoginIpFilter(on(['10.0.0.0/8']), requestFrom('203.0.113.9'), false)
    assert.equal(typeof result, 'string')
    assert.match(result as string, /203\.0\.113\.9/)
})

test('validate: the same list switched OFF can be saved from outside it', () => {
    const result = validateLoginIpFilter({ enabled: false, allowed: ['10.0.0.0/8'], trustedProxies: [] }, requestFrom('203.0.113.9'), false)
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

test('validate: without an origin only the shape is checked', () => {
    assert.equal(typeof validateLoginIpFilter(on(['10.0.0.0/8']), undefined, false), 'object')
})
