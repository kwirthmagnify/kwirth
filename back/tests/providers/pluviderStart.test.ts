// The pluviders' startup phase. It sits between the providers' and the channels': by the time the first
// consumer calls startChannel() and subscribes, the pluvider's production has to be alive already. What
// is verified here is that the phase starts them ALL and that none of them can bring it down.

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
    // the broken one does not appear, but the other two do: the phase is not cut short by the middle one
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
    // Were the phase not to wait, on returning from startPluviders the counter would still be at zero and
    // a channel starting right afterwards would subscribe to something that does not produce yet.
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
