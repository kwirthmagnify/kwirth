// Coincidencia de nombres entre un provider y un pluvider: un provider 'agora' y un plugin 'agora' que
// ademas publica como 'plugin:agora'. Tecnicamente no hay ambiguedad —viven en registros distintos y
// cada uno se direcciona con su id— pero para una persona son faciles de confundir, asi que se AVISA.
// Nunca se rechaza nada: las dos extensiones pueden ser de terceros y el usuario no controlar ninguna.

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
    // un provider llamado literalmente 'plugin:agora' no es el caso que preocupa, y ademas no puede
    // existir: es el nombre compuesto que el core reserva para los pluviders
    assert.deepEqual(findNameCollisions(['plugin:agora'], ['plugin:agora']), [])
})

test('varias coincidencias se reportan todas', () => {
    assert.deepEqual(
        findNameCollisions(['plugin:agora', 'plugin:censor', 'plugin:montag'], ['agora', 'montag', 'events']),
        ['agora', 'montag']
    )
})

test('un id sin prefijo colado entre los pluviders se ignora', () => {
    // defensivo: el registro de pluviders siempre lleva ids compuestos, pero si algo se colara no debe
    // producir una coincidencia falsa contra el provider del mismo nombre
    assert.deepEqual(findNameCollisions(['agora'], ['agora']), [])
})

test('sin pluviders o sin providers no hay nada que comparar', () => {
    assert.deepEqual(findNameCollisions([], ['agora']), [])
    assert.deepEqual(findNameCollisions(['plugin:agora'], []), [])
})

test('avisar devuelve las coincidencias encontradas, y no lanza', () => {
    // el aviso es SOLO un aviso: quien lo llama sigue su curso pase lo que pase
    let found: string[] = []
    assert.doesNotThrow(() => { found = warnNameCollisions(['plugin:agora'], ['agora'], 'at startup') })
    assert.deepEqual(found, ['agora'])
})

test('avisar sin coincidencias no devuelve nada ni rompe', () => {
    assert.deepEqual(warnNameCollisions(['plugin:agora'], ['events'], 'at startup'), [])
})
