// A soft dependency. What a channel asks for in 'requirements.providers' and is not available must not
// bring its startup down, but it does have to be reported — and it does not mean the same thing depending
// on what is missing: a provider that is declared and not registered is a misconfiguration, whereas an
// absent pluvider is legitimate (its plugin may not be installed, or it may be a SINGLE channel announced
// here as remote).
//
// And it has to say WHO asked. The id on its own cannot be acted upon: with fifteen channels installed,
// 'syslog is missing' does not say which one to go and look at. That is what these tests pin down, because
// the consumer used to be thrown away one line before the message was written.

import test from 'node:test'
import assert from 'node:assert/strict'
import { findMissingSubscriptionTargets, ISubscriptionRequest, TPluviderChannel } from '../../src/providers/Pluvider'

const fakePluvider = (id: string): TPluviderChannel => ({
    getChannelData: () => ({ id }),
    processProviderEvent: () => {},
    getPluviderData: () => ({ description: `what ${id} produces` }),
    addSubscriber: async () => {},
    removeSubscriber: async () => {},
    startProvider: async () => {},
    stopProvider: async () => {},
    getSubscriptionHelp: () => ({ usage: '', example: {} })
} as unknown as TPluviderChannel)

const REGISTERED = ['events', 'metrics']
const PLUVIDERS = new Map<string, TPluviderChannel>([['plugin:agora', fakePluvider('agora')]])

/** Reads as the call site does: which channel asks for what. */
const asks = (consumerId: string, ...targetIds: string[]): ISubscriptionRequest[] =>
    targetIds.map(targetId => ({ consumerId, targetId }))

test('what is available is not reported as missing', () => {
    const missing = findMissingSubscriptionTargets(asks('montag', 'events', 'metrics', 'plugin:agora'), REGISTERED, PLUVIDERS)
    assert.deepEqual(missing.missingProviders, [])
    assert.deepEqual(missing.missingPluviders, [])
})

test('a provider asked for and not registered is reported, WITH whoever asked', () => {
    const missing = findMissingSubscriptionTargets(asks('montag', 'events', 'trivy'), REGISTERED, PLUVIDERS)
    assert.deepEqual(missing.missingProviders, [{ id: 'trivy', consumers: ['montag'] }])
    assert.deepEqual(missing.missingPluviders, [])
})

test('an absent pluvider is reported APART, because it is not an error, and also names its consumer', () => {
    const missing = findMissingSubscriptionTargets(asks('excubitor', 'plugin:situs'), REGISTERED, PLUVIDERS)
    assert.deepEqual(missing.missingProviders, [])
    assert.deepEqual(missing.missingPluviders, [{ id: 'plugin:situs', consumers: ['excubitor'] }])
})

test('both worlds are reported separately in the same pass', () => {
    const missing = findMissingSubscriptionTargets(asks('montag', 'trivy', 'plugin:situs', 'events', 'plugin:agora'), REGISTERED, PLUVIDERS)
    assert.deepEqual(missing.missingProviders, [{ id: 'trivy', consumers: ['montag'] }])
    assert.deepEqual(missing.missingPluviders, [{ id: 'plugin:situs', consumers: ['montag'] }])
})

test('an absent pluvider is NOT confused with an absent provider even when they share a name', () => {
    // a bare 'agora' is a provider that does not exist; 'plugin:agora' is a pluvider that does
    const missing = findMissingSubscriptionTargets(asks('montag', 'agora', 'plugin:agora'), REGISTERED, PLUVIDERS)
    assert.deepEqual(missing.missingProviders, [{ id: 'agora', consumers: ['montag'] }])
    assert.deepEqual(missing.missingPluviders, [])
})

test('🔴 the same id asked for by several channels is ONE line that names them ALL', () => {
    /*
        The invariant that was already here —three channels asking for the same thing must not produce
        three identical warnings— now has to hold WITHOUT losing anybody: one entry per missing target,
        with every consumer inside it. Collapsing to one line used to be done by throwing the consumers
        away, which is exactly the bug this fixes.
    */
    const missing = findMissingSubscriptionTargets([
        ...asks('montag', 'plugin:situs', 'trivy'),
        ...asks('excubitor', 'plugin:situs', 'trivy'),
        ...asks('agora', 'plugin:situs')
    ], REGISTERED, PLUVIDERS)
    assert.deepEqual(missing.missingPluviders, [{ id: 'plugin:situs', consumers: ['agora', 'excubitor', 'montag'] }])
    assert.deepEqual(missing.missingProviders, [{ id: 'trivy', consumers: ['excubitor', 'montag'] }])
})

test('the same channel asking twice for the same thing is named once', () => {
    // a duplicate in 'requirements.providers' must not print the consumer twice in the same line
    const missing = findMissingSubscriptionTargets(asks('montag', 'trivy', 'trivy'), REGISTERED, PLUVIDERS)
    assert.deepEqual(missing.missingProviders, [{ id: 'trivy', consumers: ['montag'] }])
})

test('the consumers come out SORTED, so the same startup always reports the same way', () => {
    // a line that changes order between restarts looks like a change when nothing changed
    const missing = findMissingSubscriptionTargets([
        ...asks('zulu', 'trivy'),
        ...asks('alfa', 'trivy'),
        ...asks('mike', 'trivy')
    ], REGISTERED, PLUVIDERS)
    assert.deepEqual(missing.missingProviders, [{ id: 'trivy', consumers: ['alfa', 'mike', 'zulu'] }])
})

test('with nothing asked for there is nothing to report', () => {
    const missing = findMissingSubscriptionTargets([], REGISTERED, PLUVIDERS)
    assert.deepEqual(missing.missingProviders, [])
    assert.deepEqual(missing.missingPluviders, [])
})

test('with no pluviders registered, everything asked for with the prefix is missing', () => {
    const missing = findMissingSubscriptionTargets(asks('montag', 'plugin:agora', 'plugin:montag'), REGISTERED, new Map())
    assert.deepEqual(missing.missingPluviders, [
        { id: 'plugin:agora', consumers: ['montag'] },
        { id: 'plugin:montag', consumers: ['montag'] }
    ])
    assert.deepEqual(missing.missingProviders, [])
})
