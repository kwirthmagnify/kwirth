import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StatusChannel } from '../../src/back/index'
import { EComponentHealth, EComponentKind, EStatusPayload, IStatusMessageResponse } from '../../src/common/StatusTypes'

/*
    El inventario, por el camino real.

    No se prueban los métodos privados: se arranca una instancia como hace el core y se mira lo que sale
    por el socket, que es lo único que el front va a ver. Así el test sigue valiendo si mañana se
    reorganiza el interior.

    Lo que se fija aquí es sobre todo lo que NO se puede decir: que un estado que no se sabe no se
    inventa, y que un registro ausente no rompe nada.
*/

interface IEnviado {
    mensajes: IStatusMessageResponse[]
}

/** Un socket de mentira que solo apunta lo que se le manda. */
const socketFalso = (enviado: IEnviado) => ({
    send: (raw: string) => { enviado.mensajes.push(JSON.parse(raw)) }
}) as unknown as WebSocket

const configFalsa = (instance: string) => ({ instance }) as never

/** Arranca una instancia contra el clusterInfo que se le dé y devuelve el último inventario enviado. */
const inventarioDe = async (clusterInfo: unknown) => {
    const enviado: IEnviado = { mensajes: [] }
    const canal = new StatusChannel(clusterInfo as never, {} as never)
    await canal.addObject(socketFalso(enviado), configFalsa('i1'), '', '', '')
    const ultimo = enviado.mensajes[enviado.mensajes.length - 1]
    assert.equal(ultimo.payloadType, EStatusPayload.INVENTORY)
    return ultimo.inventory!
}

test('al abrir la pestaña se manda una foto, sin que nadie la pida', async () => {
    const inv = await inventarioDe({ name: 'c1', providers: [{ id: 'metrics', started: true }] })
    assert.equal(inv.cluster, 'c1')
    assert.ok(inv.takenAt > 0, 'la foto tiene que decir de cuándo es')
    assert.equal(inv.components.length, 1)
})

test('un provider arrancado sale como INSTANTIATED, y sin motivo que explicar', async () => {
    const inv = await inventarioDe({ providers: [{ id: 'events', started: true }] })
    const c = inv.components[0]
    assert.equal(c.kind, EComponentKind.PROVIDER)
    assert.equal(c.health, EComponentHealth.INSTANTIATED)
    assert.equal(c.reason, undefined)
})

test('🔴 un provider que NO informa no se marca como activo ni como ocioso', async () => {
    /*
        El caso que más fácil sería estropear, y sigue vigente después de S2: 'getStats' es OPCIONAL y la
        mayoría de los providers publicados no lo tienen. Sin el dato no se dice nada — quien lea
        "ocioso" va a ir a desinstalar algo.
    */
    const inv = await inventarioDe({ providers: [{ id: 'events', started: true }] })
    const c = inv.components[0]
    assert.equal(c.health, EComponentHealth.INSTANTIATED)
    assert.equal(c.subscribers, undefined, 'sin getStats no puede haber numero de consumidores')
})

test('con consumidores, el provider sale como ACTIVO y dice cuántos', async () => {
    const inv = await inventarioDe({ providers: [{ id: 'events', started: true, getStats: () => ({ subscribers: 3 }) }] })
    const c = inv.components[0]
    assert.equal(c.health, EComponentHealth.ACTIVE)
    assert.equal(c.subscribers, 3)
})

test('sin consumidores sale como OCIOSO, y se explica que emite para nadie', async () => {
    const inv = await inventarioDe({ providers: [{ id: 'trivy', started: true, getStats: () => ({ subscribers: 0 }) }] })
    const c = inv.components[0]
    assert.equal(c.health, EComponentHealth.IDLE)
    assert.equal(c.subscribers, 0)
    assert.match(c.reason ?? '', /nothing is consuming it/i)
})

test('🔴 un provider que revienta al preguntarle no tumba la pantalla', async () => {
    /*
        getStats lo implementa código de terceros. Si lanza, este canal tiene que seguir dando el resto
        del inventario: se degrada a "no informa", que es exactamente lo mismo que no implementarlo.
    */
    const inv = await inventarioDe({
        providers: [
            { id: 'malo', started: true, getStats: () => { throw new Error('boom') } },
            { id: 'bueno', started: true, getStats: () => ({ subscribers: 1 }) }
        ]
    })
    assert.equal(inv.components.length, 2, 'un provider roto se llevó por delante al resto')
    const malo = inv.components.find(c => c.id === 'malo')!
    assert.equal(malo.health, EComponentHealth.INSTANTIATED)
    assert.equal(malo.subscribers, undefined)
    assert.equal(inv.components.find(c => c.id === 'bueno')!.health, EComponentHealth.ACTIVE)
})

test('y si devuelve una basura en vez de un número, tampoco se la cree', async () => {
    // El contrato dice 'subscribers: number'; TypeScript no vigila a un provider ya compilado.
    const inv = await inventarioDe({ providers: [{ id: 'raro', started: true, getStats: () => ({ subscribers: 'muchos' }) }] })
    assert.equal(inv.components[0].subscribers, undefined)
    assert.equal(inv.components[0].health, EComponentHealth.INSTANTIATED)
})

test('un provider PARADO no se marca ocioso aunque diga que tiene cero', async () => {
    // El orden importa: 'no arrancado' manda sobre 'sin consumidores', porque es la causa, no el efecto.
    const inv = await inventarioDe({ providers: [{ id: 'azure', started: false, getStats: () => ({ subscribers: 0 }) }] })
    assert.equal(inv.components[0].health, EComponentHealth.NOT_INSTANTIATED)
})

test('un provider que el core nunca arrancó dice POR QUÉ', async () => {
    const inv = await inventarioDe({ providers: [{ id: 'trivy', started: false }] })
    const c = inv.components[0]
    assert.equal(c.health, EComponentHealth.NOT_INSTANTIATED)
    // El motivo es la columna que justifica la pantalla: un 'not running' a secas ya existe hoy.
    assert.match(c.reason ?? '', /declares this provider/i)
})

test('con el router de configuración sin montar, pide reinicio en vez de parecer roto', async () => {
    const inv = await inventarioDe({ providers: [{ id: 'azure', started: true, configRouter: {}, configRouterStarted: false }] })
    const c = inv.components[0]
    assert.equal(c.health, EComponentHealth.PENDING_RESTART)
    assert.match(c.reason ?? '', /restart/i)
})

test('y si el router SÍ está montado, no molesta con un aviso de reinicio', async () => {
    const inv = await inventarioDe({ providers: [{ id: 'azure', started: true, configRouter: {}, configRouterStarted: true }] })
    assert.equal(inv.components[0].health, EComponentHealth.INSTANTIATED)
})

test('los pluviders se listan, y existir ya significa estar en marcha', async () => {
    /*
        Su estado concreto (activo u ocioso) se comprueba mas abajo, con el grafo: desde S3 un pluvider
        sin consumidores sale IDLE, porque el registro del core es lo unico que se sabe de el. Aqui solo
        se fija que aparece, y que aparece como pluvider.
    */
    const inv = await inventarioDe({ pluviders: new Map([['plugin:agora', {}]]) })
    assert.equal(inv.components[0].kind, EComponentKind.PLUVIDER)
    assert.equal(inv.components[0].id, 'plugin:agora')
    assert.notEqual(inv.components[0].health, EComponentHealth.NOT_INSTANTIATED)
})

test('un sender sin configuraciones se lista, y se avisa de que no puede entregar nada', async () => {
    const inv = await inventarioDe({
        senders: { listSenders: () => [{ id: 'email', configNames: [] }, { id: 'file', configNames: ['logs'] }] }
    })
    const email = inv.components.find(c => c.id === 'email')!
    const file = inv.components.find(c => c.id === 'file')!
    assert.match(email.reason ?? '', /no configuration/i)
    assert.equal(file.reason, undefined, 'uno con configuración no tiene nada que explicar')
})

test('🔴 de los webhooks no sale la URL por ninguna parte', async () => {
    /*
        getUrl() devuelve la URL con el TOKEN dentro, y esta pantalla la puede estar mirando alguien que
        no debe conocerlo. El test lo fija para que nadie la añada "porque es cómoda".
    */
    let pidioUrl = false
    const inv = await inventarioDe({
        webhooks: {
            listWebhooks: () => [{ id: 'jira', configNames: ['prod'] }],
            getUrl: () => { pidioUrl = true; return 'https://kwirth/webhook/jira/prod?token=SECRETO' }
        }
    })
    assert.equal(pidioUrl, false, 'se ha pedido la URL de un webhook, que lleva el token dentro')
    assert.ok(!JSON.stringify(inv).includes('SECRETO'), 'un token ha acabado en el inventario')
})

// ── el grafo (S3) ──────────────────────────────────────────────────────────────

test('el inventario trae las aristas que el core conoce', async () => {
    const inv = await inventarioDe({
        providers: [{ id: 'events', started: true, getStats: () => ({ subscribers: 2 }) }],
        getSubscriptions: () => [
            { providerId: 'events', channelId: 'agora', since: 1 },
            { providerId: 'events', channelId: 'montag', since: 2 }
        ]
    })
    assert.equal(inv.edges.length, 2)
    assert.deepEqual(inv.edges.map(e => e.channelId).sort(), ['agora', 'montag'])
    // y el provider dice cuántos de sus consumidores están identificados
    assert.equal(inv.components[0].subscribers, 2)
    assert.equal(inv.components[0].knownConsumers, 2)
})

test('🔴 si el provider dice más consumidores de los que el core conoce, se nota', async () => {
    /*
        Pasa de verdad: provider-debug se suscribe DIRECTAMENTE al provider, sin pasar por el core, así
        que su suscripción no está en el registro. El grafo dibuja las que conoce y la pantalla avisa de
        las que faltan — dibujar tres y callar que hay cuatro sería mentir por omisión.
    */
    const inv = await inventarioDe({
        providers: [{ id: 'events', started: true, getStats: () => ({ subscribers: 4 }) }],
        getSubscriptions: () => [{ providerId: 'events', channelId: 'agora', since: 1 }]
    })
    const c = inv.components[0]
    assert.equal(c.subscribers, 4)
    assert.equal(c.knownConsumers, 1, 'el core solo intermedió una de las cuatro')
})

test('un pluvider con consumidores sale ACTIVO, y sin ellos OCIOSO', async () => {
    // Un pluvider no implementa IProvider, así que no hay getStats: el grafo es su ÚNICA fuente.
    const conConsumidor = await inventarioDe({
        pluviders: new Map([['plugin:agora', {}]]),
        getSubscriptions: () => [{ providerId: 'plugin:agora', channelId: 'montag', since: 1 }]
    })
    assert.equal(conConsumidor.components[0].health, EComponentHealth.ACTIVE)
    assert.equal(conConsumidor.components[0].subscribers, 1)

    const sinNadie = await inventarioDe({ pluviders: new Map([['plugin:agora', {}]]) })
    assert.equal(sinNadie.components[0].health, EComponentHealth.IDLE)
    assert.match(sinNadie.components[0].reason ?? '', /nothing is consuming it/i)
})

test('un core que no sabe de aristas no rompe la pantalla', async () => {
    // getSubscriptions es opcional: un core anterior a S3 no lo tiene y el inventario sigue saliendo.
    const inv = await inventarioDe({ providers: [{ id: 'events', started: true }] })
    assert.deepEqual(inv.edges, [])
    assert.equal(inv.components.length, 1)
})

test('y si el core revienta al pedirle las aristas, tampoco', async () => {
    const inv = await inventarioDe({
        providers: [{ id: 'events', started: true }],
        getSubscriptions: () => { throw new Error('boom') }
    })
    assert.deepEqual(inv.edges, [])
    assert.equal(inv.components.length, 1)
})

test('un Kwirth pelado no rompe: sin registros, inventario vacío', async () => {
    const inv = await inventarioDe({})
    assert.deepEqual(inv.components, [])
})

test('refrescar manda una foto NUEVA, y solo si la instancia existe', async () => {
    const enviado: IEnviado = { mensajes: [] }
    const canal = new StatusChannel({ providers: [{ id: 'events', started: true }] } as never, {} as never)
    const ws = socketFalso(enviado)
    await canal.addObject(ws, configFalsa('i1'), '', '', '')
    assert.equal(enviado.mensajes.length, 1)

    await canal.processCommand(ws, { instance: 'i1', action: 'command', flow: 'request' } as never)
    assert.equal(enviado.mensajes.length, 2, 'el refresco no mandó una foto nueva')
    assert.ok(enviado.mensajes[1].inventory!.takenAt >= enviado.mensajes[0].inventory!.takenAt)

    // Una instancia que no es de este socket se rechaza con una señal, no con otra foto.
    await canal.processCommand(ws, { instance: 'no-existe', action: 'command', flow: 'request' } as never)
    assert.equal(enviado.mensajes.length, 3)
    assert.equal(enviado.mensajes[2].payloadType, undefined, 'una instancia inexistente no puede recibir inventario')
})

test('cerrar la conexión no deja nada colgando', async () => {
    const enviado: IEnviado = { mensajes: [] }
    const canal = new StatusChannel({} as never, {} as never)
    const ws = socketFalso(enviado)
    await canal.addObject(ws, configFalsa('i1'), '', '', '')
    assert.equal(canal.containsConnection(ws), true)
    canal.removeConnection(ws)
    assert.equal(canal.containsConnection(ws), false)
    assert.equal(canal.containsInstance('i1'), false)
})
