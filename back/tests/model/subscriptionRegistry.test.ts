// Registro de quien consume a quien (ClusterInfo.getSubscriptions), que es de donde sale el grafo de
// Kwirth Status. Lo que se fija aqui es que una arista viva SOBREVIVA a la baja de uno de sus
// suscriptores: el fallo original borraba la arista con la primera baja y el grafo se vaciaba solo
// mientras el provider seguia emitiendo para los demas.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ClusterInfo } from '../../src/model/ClusterInfo'
import { IChannel } from '../../src/channels/IChannel'
import { IProvider } from '../../src/providers/IProvider'

// Un canal solo aporta su id al registro. Dos objetos con el MISMO id son dos suscriptores del mismo
// canal: es justo el caso de dos pestañas, o de un canal que se reinstancia.
const canal = (id: string): IChannel => ({ getChannelData: () => ({ id }) }) as never

interface IFakeProvider {
    provider: IProvider
    altas: number
    bajas: number
}

const provider = (id: string): IFakeProvider => {
    const fake: IFakeProvider = { altas: 0, bajas: 0, provider: undefined as never }
    fake.provider = {
        id,
        addSubscriber: async () => { fake.altas++ },
        removeSubscriber: async () => { fake.bajas++ }
    } as never
    return fake
}

const clusterInfoCon = (...ids: string[]) => {
    const ci = new ClusterInfo()
    const fakes = ids.map(provider)
    ci.providers = fakes.map(f => f.provider)
    return { ci, fakes }
}

test('un alta registra la arista, con quien produce y quien consume', () => {
    const { ci } = clusterInfoCon('events')
    ci.addSubscriber('events', canal('agora'), {})

    const aristas = ci.getSubscriptions()
    assert.equal(aristas.length, 1)
    assert.equal(aristas[0].providerId, 'events')
    assert.equal(aristas[0].channelId, 'agora')
})

test('dos suscriptores del mismo canal son UNA arista, y la primera baja no se la lleva', () => {
    const { ci, fakes } = clusterInfoCon('events')
    const pestaña1 = canal('agora')
    const pestaña2 = canal('agora')

    ci.addSubscriber('events', pestaña1, {})
    ci.addSubscriber('events', pestaña2, {})
    assert.equal(ci.getSubscriptions().length, 1, 'el grafo dice quien alimenta a quien, no cuantas veces')
    assert.equal(fakes[0].altas, 2, 'al provider si le llegan las dos altas')

    ci.removeSubscriber('events', pestaña1)
    assert.equal(ci.getSubscriptions().length, 1, 'queda un suscriptor vivo: la arista sigue existiendo')

    ci.removeSubscriber('events', pestaña2)
    assert.equal(ci.getSubscriptions().length, 0, 'se fue el ultimo: ahora si desaparece')
})

test('el mismo objeto suscrito dos veces cuenta una, igual que en el Map del provider', () => {
    const { ci } = clusterInfoCon('metrics')
    const c = canal('magnify')

    ci.addSubscriber('metrics', c, {})
    ci.addSubscriber('metrics', c, {})
    assert.equal(ci.getSubscriptions().length, 1)

    // Una sola baja basta, porque para el provider tambien hay un solo suscriptor.
    ci.removeSubscriber('metrics', c)
    assert.equal(ci.getSubscriptions().length, 0)
})

test('el since es de la arista: no lo pisa el suscriptor que llega despues', async () => {
    const { ci } = clusterInfoCon('events')
    ci.addSubscriber('events', canal('iter'), {})
    const primero = ci.getSubscriptions()[0].since

    await new Promise(r => setTimeout(r, 5))
    ci.addSubscriber('events', canal('iter'), {})

    assert.equal(ci.getSubscriptions()[0].since, primero)
})

test('una baja de quien nunca se suscribio no borra la arista de los demas', () => {
    const { ci } = clusterInfoCon('trivy')
    const vivo = canal('excubitor')
    ci.addSubscriber('trivy', vivo, {})

    ci.removeSubscriber('trivy', canal('excubitor'))   // mismo id, otro objeto: nunca se dio de alta
    assert.equal(ci.getSubscriptions().length, 1)

    ci.removeSubscriber('trivy', vivo)
    assert.equal(ci.getSubscriptions().length, 0)
})

test('un canal puede alimentarse de varios providers, y cada arista va por su cuenta', () => {
    const { ci } = clusterInfoCon('events', 'metrics')
    const c = canal('agora')
    ci.addSubscriber('events', c, {})
    ci.addSubscriber('metrics', c, {})

    ci.removeSubscriber('events', c)
    const aristas = ci.getSubscriptions()
    assert.equal(aristas.length, 1)
    assert.equal(aristas[0].providerId, 'metrics')
})

test('lo que se devuelve es una copia: tocarla no altera el registro del core', () => {
    const { ci } = clusterInfoCon('events')
    ci.addSubscriber('events', canal('agora'), {})

    const aristas = ci.getSubscriptions()
    aristas[0].channelId = 'otro'
    aristas.length = 0

    const despues = ci.getSubscriptions()
    assert.equal(despues.length, 1)
    assert.equal(despues[0].channelId, 'agora')
})

test('la arista no expone los suscriptores: fuera solo se necesita quien con quien', () => {
    const { ci } = clusterInfoCon('events')
    ci.addSubscriber('events', canal('agora'), {})

    assert.deepEqual(Object.keys(ci.getSubscriptions()[0]).sort(), ['channelId', 'providerId', 'since'])
})

test('suscribirse a un provider que no existe no inventa una arista', () => {
    const { ci } = clusterInfoCon('events')
    ci.addSubscriber('nolohay', canal('agora'), {})
    assert.equal(ci.getSubscriptions().length, 0)
})

test('los pluviders se registran igual, por su id compuesto', () => {
    const ci = new ClusterInfo()
    ci.providers = []
    let altas = 0
    ci.pluviders.set('plugin:agora', { addSubscriber: () => { altas++ }, removeSubscriber: () => {} } as never)

    const c = canal('montag')
    ci.addSubscriber('plugin:agora', c, {})
    assert.equal(altas, 1)
    assert.equal(ci.getSubscriptions()[0].providerId, 'plugin:agora')

    ci.removeSubscriber('plugin:agora', c)
    assert.equal(ci.getSubscriptions().length, 0)
})
