// Fase de arranque de los pluviders. Va entre la de providers y la de canales: cuando el primer
// consumidor haga startChannel() y se suscriba, la produccion del pluvider ya tiene que estar viva.
// Lo que se verifica aqui es que la fase arranca a TODOS y que ninguno puede tumbarla.

import test from 'node:test'
import assert from 'node:assert/strict'
import { startPluviders, TPluviderChannel } from '../../src/providers/Pluvider'

interface IStartSpy {
    started: string[]
    stopped: string[]
}

const fakePluvider = (id: string, spy: IStartSpy, failOnStart = false): TPluviderChannel => ({
    getChannelData: () => ({ id }),
    processProviderEvent: () => {},
    getPluviderData: () => ({ description: `lo que produce ${id}` }),
    addSubscriber: async () => {},
    removeSubscriber: async () => {},
    startProvider: async () => {
        if (failOnStart) throw new Error(`${id} no arranca`)
        spy.started.push(id)
    },
    stopProvider: async () => { spy.stopped.push(id) },
    getSubscriptionHelp: () => ({ usage: '', example: {} })
} as unknown as TPluviderChannel)

const registry = (...entries: [string, TPluviderChannel][]): Map<string, TPluviderChannel> => new Map(entries)

test('arranca todos los pluviders registrados', async () => {
    const spy: IStartSpy = { started: [], stopped: [] }
    await startPluviders(registry(
        ['plugin:agora', fakePluvider('agora', spy)],
        ['plugin:censor', fakePluvider('censor', spy)],
        ['plugin:montag', fakePluvider('montag', spy)]
    ))
    assert.deepEqual(spy.started.sort(), ['agora', 'censor', 'montag'])
})

test('un pluvider que revienta al arrancar NO impide que arranquen los demas', async () => {
    const spy: IStartSpy = { started: [], stopped: [] }
    await startPluviders(registry(
        ['plugin:agora', fakePluvider('agora', spy)],
        ['plugin:roto', fakePluvider('roto', spy, true)],
        ['plugin:montag', fakePluvider('montag', spy)]
    ))
    // el roto no aparece, pero los otros dos si: la fase no se corta por el del medio
    assert.deepEqual(spy.started.sort(), ['agora', 'montag'])
})

test('un pluvider que revienta no propaga la excepcion: el arranque del core sigue', async () => {
    const spy: IStartSpy = { started: [], stopped: [] }
    await assert.doesNotReject(() => startPluviders(registry(['plugin:roto', fakePluvider('roto', spy, true)])))
})

test('sin pluviders registrados la fase no hace nada y no rompe', async () => {
    await assert.doesNotReject(() => startPluviders(new Map()))
})

test('la fase ESPERA a cada startProvider: al volver, la produccion ya esta viva', async () => {
    // Si la fase no esperase, al volver de startPluviders el contador seguiria a cero y un canal que
    // arrancase justo despues se suscribiria a algo que aun no produce.
    const spy: IStartSpy = { started: [], stopped: [] }
    const lento: TPluviderChannel = {
        ...fakePluvider('lento', spy),
        startProvider: async () => {
            await new Promise(r => setTimeout(r, 30))
            spy.started.push('lento')
        }
    } as unknown as TPluviderChannel

    await startPluviders(registry(['plugin:lento', lento]))
    assert.deepEqual(spy.started, ['lento'])
})
