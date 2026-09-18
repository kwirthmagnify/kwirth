// Dependencia blanda. Lo que un canal pide en 'requirements.providers' y no esta disponible no puede
// tumbar su arranque, pero si tiene que reportarse — y no significa lo mismo segun que falte: un
// provider declarado y no registrado es una mala configuracion, mientras que un pluvider ausente es
// legitimo (su plugin puede no estar instalado, o ser un canal SINGLE anunciado aqui como remoto).

import test from 'node:test'
import assert from 'node:assert/strict'
import { findMissingSubscriptionTargets, TPluviderChannel } from '../../src/providers/Pluvider'

const fakePluvider = (id: string): TPluviderChannel => ({
    getChannelData: () => ({ id }),
    processProviderEvent: () => {},
    getPluviderData: () => ({ description: `lo que produce ${id}` }),
    addSubscriber: async () => {},
    removeSubscriber: async () => {},
    startProvider: async () => {},
    stopProvider: async () => {},
    getSubscriptionHelp: () => ({ usage: '', example: {} })
} as unknown as TPluviderChannel)

const REGISTERED = ['events', 'metrics']
const PLUVIDERS = new Map<string, TPluviderChannel>([['plugin:agora', fakePluvider('agora')]])

test('lo que esta disponible no se reporta como ausente', () => {
    const missing = findMissingSubscriptionTargets(['events', 'metrics', 'plugin:agora'], REGISTERED, PLUVIDERS)
    assert.deepEqual(missing.missingProviders, [])
    assert.deepEqual(missing.missingPluviders, [])
})

test('un provider pedido y no registrado se reporta como provider ausente', () => {
    const missing = findMissingSubscriptionTargets(['events', 'trivy'], REGISTERED, PLUVIDERS)
    assert.deepEqual(missing.missingProviders, ['trivy'])
    assert.deepEqual(missing.missingPluviders, [])
})

test('un pluvider pedido y no disponible se reporta APARTE, porque no es un error', () => {
    const missing = findMissingSubscriptionTargets(['plugin:situs'], REGISTERED, PLUVIDERS)
    assert.deepEqual(missing.missingProviders, [])
    assert.deepEqual(missing.missingPluviders, ['plugin:situs'])
})

test('los dos mundos se reportan por separado en la misma pasada', () => {
    const missing = findMissingSubscriptionTargets(['trivy', 'plugin:situs', 'events', 'plugin:agora'], REGISTERED, PLUVIDERS)
    assert.deepEqual(missing.missingProviders, ['trivy'])
    assert.deepEqual(missing.missingPluviders, ['plugin:situs'])
})

test('un pluvider ausente NO se confunde con un provider ausente aunque se llamen igual', () => {
    // 'agora' pelado es un provider que no existe; 'plugin:agora' es un pluvider que si
    const missing = findMissingSubscriptionTargets(['agora', 'plugin:agora'], REGISTERED, PLUVIDERS)
    assert.deepEqual(missing.missingProviders, ['agora'])
    assert.deepEqual(missing.missingPluviders, [])
})

test('el mismo id pedido por varios canales se reporta UNA vez', () => {
    // tres canales pidiendo lo mismo no deben producir tres avisos identicos en el arranque
    const missing = findMissingSubscriptionTargets(['plugin:situs', 'plugin:situs', 'plugin:situs', 'trivy', 'trivy'], REGISTERED, PLUVIDERS)
    assert.deepEqual(missing.missingPluviders, ['plugin:situs'])
    assert.deepEqual(missing.missingProviders, ['trivy'])
})

test('sin nada pedido no hay nada que reportar', () => {
    const missing = findMissingSubscriptionTargets([], REGISTERED, PLUVIDERS)
    assert.deepEqual(missing.missingProviders, [])
    assert.deepEqual(missing.missingPluviders, [])
})

test('sin pluviders registrados, todo lo pedido con prefijo esta ausente', () => {
    const missing = findMissingSubscriptionTargets(['plugin:agora', 'plugin:montag'], REGISTERED, new Map())
    assert.deepEqual(missing.missingPluviders, ['plugin:agora', 'plugin:montag'])
    assert.deepEqual(missing.missingProviders, [])
})
