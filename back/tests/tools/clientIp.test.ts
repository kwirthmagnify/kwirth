import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clientAddressOf, invalidEntries, ipInList, isLoopback, isValidIpOrCidr, normalizeIp } from '../../src/tools/ClientIp'

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

// ---- entries ----

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

// ---- clientAddressOf: the part that makes the filter impossible to dodge ----

test('no X-Forwarded-For: the client is the connection', () => {
    assert.deepEqual(clientAddressOf('::ffff:203.0.113.9', undefined, []), { ip: '203.0.113.9', remoteAddress: '203.0.113.9', forwardedIgnored: false })
})

test('🔴 X-Forwarded-For from an UNTRUSTED connection is ignored, and said so', () => {
    // the attack: write an allowed address in the header from outside
    const caller = clientAddressOf('203.0.113.9', '10.0.0.5', [])
    assert.equal(caller.ip, '203.0.113.9')
    assert.equal(caller.forwardedIgnored, true)
})

test('X-Forwarded-For from a connection that is not in the trusted list is ignored as well', () => {
    const caller = clientAddressOf('203.0.113.9', '10.0.0.5', ['10.42.0.0/16'])
    assert.equal(caller.ip, '203.0.113.9')
    assert.equal(caller.forwardedIgnored, true)
})

test('behind a trusted ingress the client is the hop the ingress wrote', () => {
    const caller = clientAddressOf('10.42.1.7', '198.51.100.20', ['10.42.0.0/16'])
    assert.deepEqual(caller, { ip: '198.51.100.20', remoteAddress: '10.42.1.7', forwardedIgnored: false })
})

test('🔴 what the client writes on the LEFT of the header is never read', () => {
    // nginx appends: "<what the client sent>, <who connected to nginx>"
    const caller = clientAddressOf('10.42.1.7', '10.0.0.5, 198.51.100.20', ['10.42.0.0/16'])
    assert.equal(caller.ip, '198.51.100.20')
})

test('a chain of trusted proxies is skipped from the right until the first untrusted hop', () => {
    // client → cloud LB (172.16.0.4) → ingress (10.42.1.7) → kwirth
    const caller = clientAddressOf('10.42.1.7', '1.1.1.1, 198.51.100.20, 172.16.0.4', ['10.42.0.0/16', '172.16.0.0/12'])
    assert.equal(caller.ip, '198.51.100.20')
})

test('every hop trusted: the client is the leftmost one', () => {
    const caller = clientAddressOf('10.42.1.7', '10.42.9.9, 10.42.8.8', ['10.42.0.0/16'])
    assert.equal(caller.ip, '10.42.9.9')
})

test('an unreadable hop stops the walk at the last trusted address', () => {
    const caller = clientAddressOf('10.42.1.7', '198.51.100.20, garbage', ['10.42.0.0/16'])
    assert.equal(caller.ip, '10.42.1.7')
})

test('the header sent several times is read as one list', () => {
    const caller = clientAddressOf('10.42.1.7', ['10.0.0.5', '198.51.100.20'], ['10.42.0.0/16'])
    assert.equal(caller.ip, '198.51.100.20')
})

test('IPv6 clients and proxies, with ports in the header', () => {
    const caller = clientAddressOf('fd00::7', '[2001:db8::42]:51000', ['fd00::/8'])
    assert.equal(caller.ip, '2001:db8::42')
})
