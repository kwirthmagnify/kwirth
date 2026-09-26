// A name clash between a provider and a pluvider: an 'agora' provider and an 'agora' plugin that
// also publishes as 'plugin:agora'. Technically there is no ambiguity — they live in different registries and
// each is addressed by its own id — but to a person they are easy to confuse, so a WARNING is issued.
// Nothing is ever rejected: both extensions may be third-party and the user may control neither.

import test from 'node:test'
import assert from 'node:assert/strict'
import { findNameCollisions, warnNameCollisions } from '../../src/providers/Pluvider'

test('un provider y un pluvider con el mismo nombre se detectan', () => {
    assert.deepEqual(findNameCollisions(['plugin:agora'], ['agora', 'events']), ['agora'])
})

test('sin coincidencia no se reporta nada, aunque los nombres se parezcan', () => {
    assert.deepEqual(findNameCollisions(['plugin:agora'], ['events', 'metrics', 'agora-legacy']), [])
})

test('se compara el nombre PELADO, no el id con prefijo', () => {
    // a provider literally called 'plugin:agora' is not the case that worries us, and besides it cannot
    // exist: it is the composed name the core reserves for pluviders
    assert.deepEqual(findNameCollisions(['plugin:agora'], ['plugin:agora']), [])
})

test('varias coincidencias se reportan todas', () => {
    assert.deepEqual(
        findNameCollisions(['plugin:agora', 'plugin:censor', 'plugin:montag'], ['agora', 'montag', 'events']),
        ['agora', 'montag']
    )
})

test('un id sin prefijo colado entre los pluviders se ignora', () => {
    // defensive: the pluvider registry always carries composed ids, but if something slipped through it
    // must not produce a false clash against the provider of the same name
    assert.deepEqual(findNameCollisions(['agora'], ['agora']), [])
})

test('sin pluviders o sin providers no hay nada que comparar', () => {
    assert.deepEqual(findNameCollisions([], ['agora']), [])
    assert.deepEqual(findNameCollisions(['plugin:agora'], []), [])
})

test('avisar devuelve las coincidencias encontradas, y no lanza', () => {
    // the warning is ONLY a warning: whoever calls it carries on whatever happens
    let found: string[] = []
    assert.doesNotThrow(() => { found = warnNameCollisions(['plugin:agora'], ['agora'], 'at startup') })
    assert.deepEqual(found, ['agora'])
})

test('avisar sin coincidencias no devuelve nada ni rompe', () => {
    assert.deepEqual(warnNameCollisions(['plugin:agora'], ['events'], 'at startup'), [])
})
