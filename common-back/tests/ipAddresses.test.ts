// IP addresses and lists (moved here from the core's ClientIp, 2026-11-17, with their tests): what the login IP
// filter, the trusted proxies and an extension's "allowed from" match against.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { invalidEntries, ipFamilyOf, ipInList, isLoopback, isValidIpOrCidr, normalizeIp } from '../src/IpAddresses'

// ---- normalizeIp ----

test('normalizeIp: IPv4, IPv6, v4-mapped, port and brackets come out canonical', () => {
    assert.equal(normalizeIp('10.1.2.3'), '10.1.2.3')
    assert.equal(normalizeIp(' 10.1.2.3 '), '10.1.2.3')
    assert.equal(normalizeIp('::ffff:10.1.2.3'), '10.1.2.3')
    assert.equal(normalizeIp('::FFFF:10.1.2.3'), '10.1.2.3')
    assert.equal(normalizeIp('10.1.2.3:51234'), '10.1.2.3')
    assert.equal(normalizeIp('[2001:DB8::1]:443'), '2001:db8::1')
    assert.equal(normalizeIp('2001:db8::1'), '2001:db8::1')
})

test('normalizeIp: anything that is not an address is empty', () => {
    assert.equal(normalizeIp(undefined), '')
    assert.equal(normalizeIp(''), '')
    assert.equal(normalizeIp('unknown'), '')
    assert.equal(normalizeIp('300.1.1.1'), '')
    assert.equal(normalizeIp('10.0.0.0/8'), '')
})

test('ipFamilyOf: as net.BlockList names it', () => {
    assert.equal(ipFamilyOf('10.0.0.1'), 'ipv4')
    assert.equal(ipFamilyOf('2001:db8::1'), 'ipv6')
})

// ---- entries ----

test('🔴 a non-string entry (stored data with another shape) is not valid and never throws', () => {
    const odd = [undefined, null, 42, { address: '10.0.0.1' }] as unknown as string[]
    for (const entry of odd) assert.equal(isValidIpOrCidr(entry), false)
    assert.deepEqual(invalidEntries(odd), odd)
    // a list with odd entries still matches on the good ones
    assert.equal(ipInList('10.0.0.1', [...odd, '10.0.0.0/8']), true)
    assert.equal(ipInList('203.0.113.9', [...odd, '10.0.0.0/8']), false)
})

test('isValidIpOrCidr: addresses and CIDRs of both families', () => {
    for (const ok of ['10.0.0.1', '10.0.0.0/8', '0.0.0.0/0', '192.168.1.0/24', '10.1.1.1/32', '::1', '2001:db8::/32', '::/0', '2001:db8::1/128'])
        assert.equal(isValidIpOrCidr(ok), true, ok)
})

test('isValidIpOrCidr: rejects malformed entries and prefixes out of range', () => {
    for (const bad of ['', 'localhost', '10.0.0', '10.0.0.0/33', '10.0.0.0/', '10.0.0.0/-1', '10.0.0.0/8/8', '2001:db8::/129', '10.0.0.0/abc', '/8'])
        assert.equal(isValidIpOrCidr(bad), false, bad)
})

test('invalidEntries returns the bad ones as they were written', () => {
    assert.deepEqual(invalidEntries(['10.0.0.0/8', 'nope', '1.2.3.4', '10.0.0.0/40']), ['nope', '10.0.0.0/40'])
})

test('ipInList: CIDR boundaries, exact addresses and IPv6', () => {
    const list = ['10.0.0.0/8', '192.168.1.10', '2001:db8::/32']
    assert.equal(ipInList('10.0.0.0', list), true)
    assert.equal(ipInList('10.255.255.255', list), true)
    assert.equal(ipInList('11.0.0.0', list), false)
    assert.equal(ipInList('9.255.255.255', list), false)
    assert.equal(ipInList('192.168.1.10', list), true)
    assert.equal(ipInList('192.168.1.11', list), false)
    assert.equal(ipInList('2001:db8:abcd::1', list), true)
    assert.equal(ipInList('2001:db9::1', list), false)
    // the socket gives IPv4 clients as v4-mapped on a dual-stack listener
    assert.equal(ipInList('::ffff:10.20.30.40', list), true)
})

test('ipInList: an empty list or an empty address matches nothing', () => {
    assert.equal(ipInList('10.0.0.1', []), false)
    assert.equal(ipInList('', ['0.0.0.0/0']), false)
})

test('isLoopback: 127/8 and ::1, nothing else', () => {
    assert.equal(isLoopback('127.0.0.1'), true)
    assert.equal(isLoopback('127.10.0.1'), true)
    assert.equal(isLoopback('::1'), true)
    assert.equal(isLoopback('::ffff:127.0.0.1'), true)
    assert.equal(isLoopback('10.0.0.1'), false)
})
