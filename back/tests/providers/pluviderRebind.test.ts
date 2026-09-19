// Sustituir la INSTANCIA de un canal que ademas es pluvider. Hoy solo pasa en el hot-reload de un
// plugin de dev, pero el problema es el mismo siempre: el registro guarda la instancia, no la clase.
// Si no se rehace, el core se queda hablando con un objeto que ya nadie usa y sigue sirviendo su
// descripcion, su ayuda de suscripcion y su filtro TAL Y COMO ERAN — y un cambio recien recargado
// parece no haber surtido efecto.

import test from 'node:test'
import assert from 'node:assert/strict'
import { IChannel } from '../../src/channels/IChannel'
import { rebindPluvider, TPluviderChannel } from '../../src/providers/Pluvider'

interface ILifecycle {
    started: string[]
    stopped: string[]
}

const fakePluvider = (tag: string, life: ILifecycle, failOnStop = false): TPluviderChannel => ({
    getChannelData: () => ({ id: 'agora' }),
    processProviderEvent: () => {},
    getPluviderData: () => ({ description: `soy ${tag}` }),
    addSubscriber: async () => {},
    removeSubscriber: async () => {},
    startProvider: async () => { life.started.push(tag) },
    stopProvider: async () => {
        if (failOnStop) throw new Error(`${tag} no para`)
        life.stopped.push(tag)
    },
    getSubscriptionHelp: () => ({ usage: tag, example: {} })
} as unknown as TPluviderChannel)

// un canal normal, que NO es pluvider
const fakeChannel = (): IChannel => ({
    getChannelData: () => ({ id: 'log' }),
    processProviderEvent: () => {}
} as unknown as IChannel)

const newLife = (): ILifecycle => ({ started: [], stopped: [] })

test('la instancia nueva REEMPLAZA a la vieja en el registro', async () => {
    const life = newLife()
    const pluviders = new Map<string, TPluviderChannel>([['plugin:agora', fakePluvider('vieja', life)]])

    await rebindPluvider(pluviders, 'plugin:agora', fakePluvider('nueva', life))

    // lo que el core sirva a partir de ahora sale de la nueva, no de la anterior
    assert.equal(pluviders.get('plugin:agora')?.getPluviderData().description, 'soy nueva')
    assert.equal(pluviders.size, 1)
})

test('la vieja se PARA y la nueva ARRANCA, en ese orden', async () => {
    const life = newLife()
    const pluviders = new Map<string, TPluviderChannel>([['plugin:agora', fakePluvider('vieja', life)]])

    await rebindPluvider(pluviders, 'plugin:agora', fakePluvider('nueva', life))

    assert.deepEqual(life.stopped, ['vieja'])
    assert.deepEqual(life.started, ['nueva'])
})

test('si no habia nada registrado, simplemente se da de alta', async () => {
    const life = newLife()
    const pluviders = new Map<string, TPluviderChannel>()

    await rebindPluvider(pluviders, 'plugin:agora', fakePluvider('nueva', life))

    assert.equal(pluviders.size, 1)
    assert.deepEqual(life.started, ['nueva'])
    assert.deepEqual(life.stopped, [])
})

test('si la instancia nueva ya NO es pluvider, la vieja se da de baja y no se registra nada', async () => {
    // caso real: alguien quita getPluviderData del plugin y recarga. El registro no puede quedarse
    // con la instancia anterior publicando algo que el codigo actual ya no ofrece.
    const life = newLife()
    const pluviders = new Map<string, TPluviderChannel>([['plugin:agora', fakePluvider('vieja', life)]])

    await rebindPluvider(pluviders, 'plugin:agora', fakeChannel())

    assert.equal(pluviders.size, 0)
    assert.deepEqual(life.stopped, ['vieja'])
})

test('un canal que nunca fue pluvider no ensucia el registro', async () => {
    const pluviders = new Map<string, TPluviderChannel>()
    await rebindPluvider(pluviders, 'plugin:log', fakeChannel())
    assert.equal(pluviders.size, 0)
})

test('si la vieja revienta al parar, la nueva se registra igual', async () => {
    // una instancia que ya esta rota no puede impedir que la que la sustituye entre en servicio
    const life = newLife()
    const pluviders = new Map<string, TPluviderChannel>([['plugin:agora', fakePluvider('rota', life, true)]])

    await assert.doesNotReject(() => rebindPluvider(pluviders, 'plugin:agora', fakePluvider('nueva', life)))

    assert.equal(pluviders.get('plugin:agora')?.getPluviderData().description, 'soy nueva')
    assert.deepEqual(life.started, ['nueva'])
})

test('rebind no toca a los demas pluviders del registro', async () => {
    const life = newLife()
    const pluviders = new Map<string, TPluviderChannel>([
        ['plugin:agora', fakePluvider('agora-vieja', life)],
        ['plugin:montag', fakePluvider('montag', life)]
    ])

    await rebindPluvider(pluviders, 'plugin:agora', fakePluvider('agora-nueva', life))

    assert.equal(pluviders.get('plugin:montag')?.getPluviderData().description, 'soy montag')
    assert.deepEqual(life.stopped, ['agora-vieja'])
})
