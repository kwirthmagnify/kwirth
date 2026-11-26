import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clusterLoginOutcomeOf, clusterLoginUnreachable, EClusterLoginOutcome } from '../src/tools/ClusterLoginOutcome.ts'

/*
    What a sign-in against a REMOTE Kwirth came to (plan: plans/cluster-login/PRD.md), from the answers its
    POST /login really gives (back/src/api/LoginApi.ts). Each outcome has to tell the user what to do: a bare
    'failed' is what this replaces.
*/

test('200 is a sign-in', () => {
    assert.deepEqual(clusterLoginOutcomeOf(200, { accessKey: {} }, null), { outcome: EClusterLoginOutcome.OK, message: '' })
})

test('201 = the password must be changed first: it is said, and nothing is forced (D4)', () => {
    const r = clusterLoginOutcomeOf(201, undefined, null)
    assert.equal(r.outcome, EClusterLoginOutcome.PASSWORD_CHANGE)
    assert.match(r.message, /change its password/)
    assert.match(r.message, /Sign in to that Kwirth directly/)
})

test('401 = wrong credentials, and it says SSO users cannot sign in from here (D6)', () => {
    const r = clusterLoginOutcomeOf(401, {}, null)
    assert.equal(r.outcome, EClusterLoginOutcome.INVALID)
    assert.match(r.message, /Invalid user or password/)
    assert.match(r.message, /SSO/)
})

test('403 with the IP refusal = the remote does not allow this address; any other 403 is a plain refusal', () => {
    assert.equal(clusterLoginOutcomeOf(403, { refusal: 'ipnotallowed' }, null).outcome, EClusterLoginOutcome.IP_NOT_ALLOWED)
    for (const body of [undefined, {}, { refusal: 'other' }, 'text', null]) {
        const r = clusterLoginOutcomeOf(403, body, null)
        assert.equal(r.outcome, EClusterLoginOutcome.FAILED, String(body))
        assert.match(r.message, /403/)
    }
})

test('429 says how long to wait, from Retry-After, and never a wrong number', () => {
    assert.match(clusterLoginOutcomeOf(429, {}, '30').message, /Try again in 30 s/)
    assert.match(clusterLoginOutcomeOf(429, {}, '2.4').message, /Try again in 3 s/)
    for (const bad of [null, '', 'soon', '-5', '0']) {
        const r = clusterLoginOutcomeOf(429, {}, bad)
        assert.equal(r.outcome, EClusterLoginOutcome.TOO_MANY)
        assert.match(r.message, /Try again later/, String(bad))
    }
})

test('anything else is a failure with its status', () => {
    for (const status of [400, 404, 500, 502]) {
        const r = clusterLoginOutcomeOf(status, undefined, null)
        assert.equal(r.outcome, EClusterLoginOutcome.FAILED)
        assert.match(r.message, new RegExp(String(status)))
    }
})

test('no answer at all is "unreachable", with the reason', () => {
    const r = clusterLoginUnreachable(new TypeError('Failed to fetch'))
    assert.equal(r.outcome, EClusterLoginOutcome.UNREACHABLE)
    assert.match(r.message, /could not be reached: Failed to fetch/)
    assert.match(clusterLoginUnreachable('boom').message, /boom/)
})
