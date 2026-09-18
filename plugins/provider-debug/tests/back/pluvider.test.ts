// Depurar PLUVIDERS: plugins que además producen y exponen su información in-process. Para quien
// depura son lo mismo que un provider —algo a lo que suscribirse— pero viven en otro registro y su id
// lleva el prefijo 'plugin:'. Lo que se verifica aquí es que se listan, que se puede uno suscribir a
// ellos, y que no se confunden con los providers ni cuando comparten nombre.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { IBackChannelObject, IInstanceConfig } from '@kwirthmagnify/kwirth-common-back'
import ProviderDebugChannel from '../../src/back/index'
import { FakePluvider, FakeProvider, MockWs, instanceConfigFor, makeBackObj, makeClusterInfo } from '../helpers'

const makeChannel = (providers: FakeProvider[], pluviders: FakePluvider[] = []) => {
    const { obj } = makeBackObj()
    return new ProviderDebugChannel(makeClusterInfo(providers, pluviders), obj as unknown as IBackChannelObject)
}

const start = async (channel: ProviderDebugChannel, ws: MockWs, instance: string, providerId: string, subscriptionData = '') => {
    const config = instanceConfigFor(instance, providerId, subscriptionData) as unknown as IInstanceConfig
    await channel.addObject(ws as unknown as WebSocket, config, '*all', '*all', '*all')
    return config
}

describe('catalogo con pluviders', () => {
    test('los pluviders se listan junto a los providers, marcados y con su descripcion', async () => {
        const channel = makeChannel([new FakeProvider('events')], [new FakePluvider('plugin:agora', 'Proactive alerts')])
        const ws = new MockWs()
        await start(channel, ws, 'i1', '')

        const catalogue = ws.providersCatalogue()
        assert.deepEqual(catalogue, [
            { id: 'events', providesRouter: false },
            { id: 'plugin:agora', providesRouter: false, pluvider: true, description: 'Proactive alerts' }
        ])
    })

    test('un pluvider publica su ayuda de suscripcion igual que un provider', async () => {
        const help = { usage: 'te llegan las alertas segun se producen', example: {} }
        const channel = makeChannel([], [new FakePluvider('plugin:agora').withHelp(help)])
        const ws = new MockWs()
        await start(channel, ws, 'i1', '')

        assert.deepEqual(ws.providersCatalogue()?.[0].help, help)
    })

    test('sin pluviders el catalogo es el de siempre: no se inventa nada', async () => {
        const channel = makeChannel([new FakeProvider('events')])
        const ws = new MockWs()
        await start(channel, ws, 'i1', '')

        assert.deepEqual(ws.providersCatalogue(), [{ id: 'events', providesRouter: false }])
    })
})

describe('suscripcion a un pluvider', () => {
    test('los eventos de un pluvider llegan igual que los de un provider', async () => {
        const agora = new FakePluvider('plugin:agora')
        const channel = makeChannel([], [agora])
        const ws = new MockWs()
        await start(channel, ws, 'i1', 'plugin:agora')

        assert.equal(agora.subscribers.size, 1)
        agora.emit({ msgtype: 'alert', cluster: 'prod', text: 'CrashLoopBackOff' })

        const events = ws.events()
        assert.equal(events.length, 1)
        assert.equal(events[0].providerId, 'plugin:agora')
        assert.deepEqual(events[0].event, { msgtype: 'alert', cluster: 'prod', text: 'CrashLoopBackOff' })
    })

    test('el payload de suscripcion llega al pluvider tal cual', async () => {
        const agora = new FakePluvider('plugin:agora')
        const channel = makeChannel([], [agora])
        const ws = new MockWs()
        await start(channel, ws, 'i1', 'plugin:agora', '{"severity":"high"}')

        const [data] = Array.from(agora.subscribers.values())
        assert.deepEqual(data, { severity: 'high' })
    })

    test('un pluvider que no esta disponible lo dice, y explica por que', async () => {
        const channel = makeChannel([new FakeProvider('events')])
        const ws = new MockWs()
        await start(channel, ws, 'i1', 'plugin:situs')

        const signals = ws.signals()
        assert.equal(signals.length, 1)
        assert.match(signals[0], /Pluvider 'plugin:situs' is not available/)
        // el motivo no es el de un provider parado: su plugin puede sencillamente no estar aqui
        assert.match(signals[0], /not installed, or is not hosted by this Kwirth/)
    })

    test('un provider ausente sigue dando SU mensaje, no el de pluvider', async () => {
        const channel = makeChannel([new FakeProvider('events')])
        const ws = new MockWs()
        await start(channel, ws, 'i1', 'metrics')

        assert.match(ws.signals()[0], /Provider 'metrics' is not running/)
    })

    test('parar la instancia desuscribe del pluvider', async () => {
        const agora = new FakePluvider('plugin:agora')
        const channel = makeChannel([], [agora])
        const ws = new MockWs()
        const config = await start(channel, ws, 'i1', 'plugin:agora')
        assert.equal(agora.subscribers.size, 1)

        channel.stopInstance(ws as unknown as WebSocket, config)
        assert.equal(agora.subscribers.size, 0)
    })

    test('un provider y un pluvider con el MISMO nombre no se confunden', async () => {
        // 'agora' como provider instalado y 'plugin:agora' como pluvider del plugin: dos cosas
        // distintas, cada una con sus eventos
        const provider = new FakeProvider('agora')
        const pluvider = new FakePluvider('plugin:agora')
        const channel = makeChannel([provider], [pluvider])
        const wsProv = new MockWs()
        const wsPluv = new MockWs()
        await start(channel, wsProv, 'i1', 'agora')
        await start(channel, wsPluv, 'i2', 'plugin:agora')

        provider.emit({ de: 'provider' })
        pluvider.emit({ de: 'pluvider' })

        assert.deepEqual(wsProv.events().map(e => e.event), [{ de: 'provider' }])
        assert.deepEqual(wsPluv.events().map(e => e.event), [{ de: 'pluvider' }])
    })
})
