// The guard that decides what is worth trying to reach or resolve. Its job is the message: telling a
// caller that what they typed is not a host name beats a `queryA EBADNAME` from the resolver.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isValidTarget } from '../src/back/target'

test('a host name, an IPv4 and an IPv6 are valid targets', () => {
    for (const target of ['example.com', 'kwirth-postgres', 'kwirth-postgres.default.svc.cluster.local', '10.0.0.1', '::1', '2001:db8::ff00:42:8329', 'a_b.example.com'])
        assert.equal(isValidTarget(target), true, target)
})

test('empty and over-long targets are refused', () => {
    assert.equal(isValidTarget(''), false)
    assert.equal(isValidTarget('a'.repeat(256)), false)
    assert.equal(isValidTarget('a'.repeat(255)), true)
})

test('🔴 what a caller typed by mistake is refused here, where the message can still say what was expected', () => {
    for (const target of ['my host.local', 'https://example.com', 'example.com/path', 'example.com:8080/x', '$(id)', 'a|b'])
        assert.equal(isValidTarget(target), false, target)
})
