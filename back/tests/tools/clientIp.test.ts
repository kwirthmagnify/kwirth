import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clientAddressOf } from '../../src/tools/ClientIp'

// normalizeIp, isValidIpOrCidr, ipInList… moved to kwirth-common-back (IpAddresses), with their tests (2026-11-17)

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
    assert.deepEqual(caller, { ip: '198.51.100.20', remoteAddress: '10.42.1.7', forwardedIgnored: false, forwardedFor: '198.51.100.20' })
})

// ---- forwardedFor: the header as it came, to be shown (Ianus' spoke table), never decided by ----

test('forwardedFor is the header as it came, trusted or not; absent when there was none', () => {
    assert.equal(clientAddressOf('203.0.113.9', undefined, []).forwardedFor, undefined)
    assert.equal(clientAddressOf('203.0.113.9', '  ', []).forwardedFor, undefined)
    // untrusted: ignored for the address, still shown (it is how you see which proxy is missing from the list)
    const untrusted = clientAddressOf('203.0.113.9', '10.0.0.5,  198.51.100.20', [])
    assert.equal(untrusted.ip, '203.0.113.9')
    assert.equal(untrusted.forwardedFor, '10.0.0.5, 198.51.100.20')
    // sent several times: one list; what cannot be read is shown as it came
    assert.equal(clientAddressOf('10.42.1.7', ['10.0.0.5', 'garbage'], ['10.42.0.0/16']).forwardedFor, '10.0.0.5, garbage')
})

test('🔴 forwardedFor is capped: a client cannot fill a table with it', () => {
    const long = Array.from({ length: 200 }, (_, i) => `10.0.${i % 256}.1`).join(',')
    assert.equal(clientAddressOf('203.0.113.9', long, []).forwardedFor!.length, 512)
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
