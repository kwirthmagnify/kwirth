import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scopeAllows, keyAllows, scopeLevelOf } from '../src/ExtensionScope'
import { accessKeyDeserialize } from '../src/AccessKey'

/*
    Deciding whether a key was granted enough. It lived in common-back and came down here because the
    FRONT could not reach it there, which is why five extensions had each written their own walk.

    What these tests defend is the behaviour everybody copied slightly differently: that an unknown
    scope grants NOTHING, that resources are OR'd and the highest wins, and that malformed input never
    throws — an exception from an async handler escapes as an unhandledRejection and takes the core
    with it.
*/

// A ladder like a channel's: the position IS the level, and -1 for whatever is not on it.
const LADDER = ['', 'fileman$read', 'fileman$write', 'cluster', 'admin']
const levelOf = (scope: string) => LADDER.indexOf(scope)

const resources = (scopes: string) => `${scopes}::::`

test('a scope on the ladder grants its own level and everything below it', () => {
    assert.equal(scopeAllows(resources('fileman$write'), 'fileman$write', levelOf), true)
    assert.equal(scopeAllows(resources('fileman$write'), 'fileman$read', levelOf), true)
    assert.equal(scopeAllows(resources('admin'), 'fileman$read', levelOf), true)
})

test('and nothing above it', () => {
    assert.equal(scopeAllows(resources('fileman$read'), 'fileman$write', levelOf), false)
    assert.equal(scopeAllows(resources('fileman$write'), 'admin', levelOf), false)
})

test('🔴 a scope the ladder does not know grants NOTHING: it fails closed with nobody writing code', () => {
    /*
        This is what makes thin scopes safe on a channel that does not understand them, and a renamed
        scope safe on keys that still carry the old name: indexOf answers -1, which is below every
        level on the ladder.
    */
    assert.equal(scopeAllows(resources('fileman#write#eyJ4Ijoxfq'), 'fileman$read', levelOf), false)
    assert.equal(scopeAllows(resources('trivy$user'), 'fileman$read', levelOf), false)
    assert.equal(scopeAllows(resources('fileman$admin'), 'fileman$read', levelOf), false)
})

test('resources are OR-ed and the highest scope wins', () => {
    // two resources, the second one carrying the scope that decides
    const two = 'fileman$read:dev:::;admin:pro:::'
    assert.equal(scopeAllows(two, 'admin', levelOf), true)
    // several scopes in the same resource, likewise
    assert.equal(scopeAllows(resources('view,fileman$write'), 'fileman$write', levelOf), true)
})

test('spaces around a scope do not lose the permission', () => {
    // keys are written by hand often enough for this to matter, and the walk used to compare raw
    assert.equal(scopeAllows(resources('view, admin'), 'admin', levelOf), true)
})

test('🔴 malformed resources authorise nothing, and never throw', () => {
    for (const bad of ['', '::::::::', 'not a key at all', ';;;', ':']) {
        assert.doesNotThrow(() => scopeAllows(bad, 'fileman$read', levelOf))
        assert.equal(scopeAllows(bad, 'fileman$read', levelOf), false, `'${bad}' granted something`)
    }
})

test('asking for something that is not on the ladder is refused too', () => {
    // required at -1 would be reached by everything if the comparison were naive
    assert.equal(scopeAllows(resources('fileman$read'), 'whatever$nope', levelOf), false)
})

test('keyAllows: no key, no permission', () => {
    assert.equal(keyAllows(undefined, 'fileman$read', levelOf), false)
    const key = accessKeyDeserialize(`11111111-2222-3333-4444-555555555555|permanent|${resources('admin')}`)
    assert.equal(keyAllows(key, 'fileman$write', levelOf), true)
})

test('scopeLevelOf gives the level itself, for a UI that shows rather than hides', () => {
    assert.equal(scopeLevelOf(resources('fileman$read'), levelOf), 1)
    assert.equal(scopeLevelOf('fileman$read:dev:::;admin:pro:::', levelOf), 4)
    // nothing on the ladder: -1, not 0, so 'reaches the lowest rung' and 'reaches nothing' stay apart
    assert.equal(scopeLevelOf(resources('trivy$user'), levelOf), -1)
    assert.equal(scopeLevelOf('garbage', levelOf), -1)
})
