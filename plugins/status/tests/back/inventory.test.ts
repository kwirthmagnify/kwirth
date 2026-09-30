import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StatusChannel } from '../../src/back/index'
import { EComponentHealth, EComponentKind, EStatusPayload, IStatusMessageResponse } from '../../src/common/StatusTypes'

/*
    The inventory, along the real route.

    The private methods are not tested: an instance is started the way the core does and what comes out
    of the socket is looked at, which is the only thing the front end is going to see. That way the test
    still holds if the insides are reorganised tomorrow.

    What is pinned down here is above all what canNOT be said: that a state which is unknown is not made
    up, and that an absent registry breaks nothing.
*/

interface IEnviado {
    mensajes: IStatusMessageResponse[]
}

/** A fake socket that only records what is sent to it. */
const socketFalso = (enviado: IEnviado) => ({
    send: (raw: string) => { enviado.mensajes.push(JSON.parse(raw)) }
}) as unknown as WebSocket

const configFalsa = (instance: string) => ({ instance }) as never

/** Starts an instance against the given clusterInfo and returns the last inventory that was sent. */
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
        The case it would be easiest to spoil, and it still holds after S2: 'getStats' is OPTIONAL and
        most published providers do not have it. Without the fact, nothing is said — whoever reads "idle"
        is going to go and uninstall something.
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
        getStats is implemented by third-party code. If it throws, this channel has to go on giving the
        rest of the inventory: it degrades to "does not report", which is exactly the same as not
        implementing it.
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
    // The contract says 'subscribers: number'; TypeScript does not police an already compiled provider.
    const inv = await inventarioDe({ providers: [{ id: 'raro', started: true, getStats: () => ({ subscribers: 'muchos' }) }] })
    assert.equal(inv.components[0].subscribers, undefined)
    assert.equal(inv.components[0].health, EComponentHealth.INSTANTIATED)
})

test('un provider PARADO no se marca ocioso aunque diga que tiene cero', async () => {
    // Order matters: 'not started' beats 'no consumers', because it is the cause, not the effect.
    const inv = await inventarioDe({ providers: [{ id: 'azure', started: false, getStats: () => ({ subscribers: 0 }) }] })
    assert.equal(inv.components[0].health, EComponentHealth.NOT_INSTANTIATED)
})

test('un provider que el core nunca arrancó dice POR QUÉ', async () => {
    const inv = await inventarioDe({ providers: [{ id: 'trivy', started: false }] })
    const c = inv.components[0]
    assert.equal(c.health, EComponentHealth.NOT_INSTANTIATED)
    // The reason is the column that justifies the screen: a bare 'not running' already exists today.
    assert.match(c.reason ?? '', /declares this provider/i)
})

test('🔴 parado PERO con suscriptores: la avería silenciosa', async () => {
    /*
        It really happens and this screen caught it: agora subscribes to longhorn at runtime, but does not
        declare it in 'requirements.providers', so the core never starts it. The subscription is
        registered, the provider emits nothing and agora waits for data that is not going to arrive — with
        no error and no log.

        The message has to say THAT, not "no channel declares it": that would be true with respect to the
        requirements and misleading, because there IS somebody consuming.
    */
    const inv = await inventarioDe({
        providers: [{ id: 'suse-longhorn', started: false, getStats: () => ({ subscribers: 1 }) }]
    })
    const c = inv.components[0]
    assert.equal(c.health, EComponentHealth.NOT_INSTANTIATED)
    assert.match(c.reason ?? '', /never arrive/i, 'no avisa de que alguien espera datos que no llegan')
    assert.match(c.reason ?? '', /requirements/i, 'no dice la causa: que nadie lo declara en requirements')
})

test('y sin suscriptores, el motivo sigue siendo el simple', async () => {
    const inv = await inventarioDe({
        providers: [{ id: 'azure', started: false, getStats: () => ({ subscribers: 0 }) }]
    })
    assert.match(inv.components[0].reason ?? '', /No installed channel declares/i)
    assert.doesNotMatch(inv.components[0].reason ?? '', /never arrive/i)
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
        Its particular state (active or idle) is checked further down, with the graph: since S3 a pluvider
        with no consumers comes out IDLE, because the core's registry is the only thing known about it.
        Here it is only pinned down that it appears, and that it appears as a pluvider.
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
        getUrl() returns the URL with the TOKEN inside, and this screen may be being looked at by somebody
        who must not know it. The test pins it down so that nobody adds it "because it is handy".
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

// ── throughput (S4) ────────────────────────────────────────────────────────────

test('un provider que cuenta entregas las publica en el inventario', async () => {
    const inv = await inventarioDe({
        providers: [{ id: 'events', started: true, getStats: () => ({ subscribers: 2, events: 1500 }) }]
    })
    assert.equal(inv.components[0].events, 1500)
    assert.equal(inv.components[0].subscribers, 2)
})

test('🔴 quien no cuenta entregas no sale con un 0', async () => {
    /*
        The same rule as with the consumers, and for the same reason: 'events' is OPTIONAL inside a
        getStats that is already optional itself. A 0 would say "this has moved nothing", and whoever
        reads it may uninstall a provider that has been working for weeks.
    */
    const inv = await inventarioDe({
        providers: [{ id: 'viejo', started: true, getStats: () => ({ subscribers: 1 }) }]
    })
    assert.equal(inv.components[0].subscribers, 1, 'los consumidores sí los dice')
    assert.equal(inv.components[0].events, undefined, 'las entregas no, y no se inventan')
})

test('y si devuelve algo que no es un número, se descarta', async () => {
    const inv = await inventarioDe({
        providers: [{ id: 'raro', started: true, getStats: () => ({ subscribers: 1, events: 'un montón' }) }]
    })
    assert.equal(inv.components[0].events, undefined)
    assert.equal(inv.components[0].subscribers, 1, 'lo que sí es válido se conserva')
})

test('un provider que revienta no deja a los demás sin caudal', async () => {
    const inv = await inventarioDe({
        providers: [
            { id: 'malo', started: true, getStats: () => { throw new Error('boom') } },
            { id: 'bueno', started: true, getStats: () => ({ subscribers: 1, events: 42 }) }
        ]
    })
    assert.equal(inv.components.find(c => c.id === 'malo')!.events, undefined)
    assert.equal(inv.components.find(c => c.id === 'bueno')!.events, 42)
})

// ── the graph (S3) ─────────────────────────────────────────────────────────────

test('el inventario trae las aristas que el core conoce', async () => {
    const inv = await inventarioDe({
        providers: [{ id: 'events', started: true, getStats: () => ({ subscribers: 2 }) }],
        getSubscriptions: () => [
            { providerId: 'events', consumerId: 'agora', since: 1 },
            { providerId: 'events', consumerId: 'montag', since: 2 }
        ]
    })
    assert.equal(inv.edges.length, 2)
    assert.deepEqual(inv.edges.map(e => e.consumerId).sort(), ['agora', 'montag'])
    // and the provider says how many of its consumers are identified
    assert.equal(inv.components[0].subscribers, 2)
    assert.equal(inv.components[0].knownConsumers, 2)
})

test('🔴 the consumer comes from consumerId, the field the current core returns', async () => {
    // The core renamed 'channelId' to 'consumerId'; reading the old name left every edge without a
    // consumer, so the graph drew lines to nowhere.
    const inv = await inventarioDe({
        providers: [{ id: 'b', started: true }, { id: 'c', started: true }],
        getSubscriptions: () => [{ providerId: 'b', consumerId: 'provider:c', since: 1 }]
    })
    assert.deepEqual(inv.edges, [{ providerId: 'b', consumerId: 'provider:c', since: 1 }])
})

test('an older core that still says channelId keeps its graph', async () => {
    const inv = await inventarioDe({
        providers: [{ id: 'events', started: true }],
        getSubscriptions: () => [{ providerId: 'events', channelId: 'agora', since: 1 }]
    })
    assert.deepEqual(inv.edges.map(e => e.consumerId), ['agora'])
})

test('an edge without any consumer is dropped, not drawn as a line to nowhere', async () => {
    const inv = await inventarioDe({
        providers: [{ id: 'events', started: true }],
        getSubscriptions: () => [{ providerId: 'events', since: 1 }]
    })
    assert.equal(inv.edges.length, 0)
})

test('🔴 si el provider dice más consumidores de los que el core conoce, se nota', async () => {
    /*
        It really happens: provider-debug subscribes DIRECTLY to the provider, without going through the
        core, so its subscription is not in the registry. The graph draws the ones it knows and the screen
        warns about the missing ones — drawing three and keeping quiet about there being four would be
        lying by omission.
    */
    const inv = await inventarioDe({
        providers: [{ id: 'events', started: true, getStats: () => ({ subscribers: 4 }) }],
        getSubscriptions: () => [{ providerId: 'events', consumerId: 'agora', since: 1 }]
    })
    const c = inv.components[0]
    assert.equal(c.subscribers, 4)
    assert.equal(c.knownConsumers, 1, 'el core solo intermedió una de las cuatro')
})

test('un pluvider con consumidores sale ACTIVO, y sin ellos OCIOSO', async () => {
    // A pluvider does not implement IProvider, so there is no getStats: the graph is its ONLY source.
    const conConsumidor = await inventarioDe({
        pluviders: new Map([['plugin:agora', {}]]),
        getSubscriptions: () => [{ providerId: 'plugin:agora', consumerId: 'montag', since: 1 }]
    })
    assert.equal(conConsumidor.components[0].health, EComponentHealth.ACTIVE)
    assert.equal(conConsumidor.components[0].subscribers, 1)

    const sinNadie = await inventarioDe({ pluviders: new Map([['plugin:agora', {}]]) })
    assert.equal(sinNadie.components[0].health, EComponentHealth.IDLE)
    assert.match(sinNadie.components[0].reason ?? '', /nothing is consuming it/i)
})

test('un core que no sabe de aristas no rompe la pantalla', async () => {
    // getSubscriptions is optional: a core older than S3 does not have it and the inventory still comes out.
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

    // An instance that does not belong to this socket is rejected with a signal, not another snapshot.
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

// ── the routes (v2, Routes tab) ────────────────────────────────────────────────

test('🔴 without the core route registry, routes are ABSENT — unknown, not an empty list', async () => {
    const inv = await inventarioDe({ providers: [] })
    assert.equal('routes' in inv, false)
})

test('the routes come from the core registry, with their owners', async () => {
    const inv = await inventarioDe({
        providers: [],
        routes: { listRoutes: () => [{ ownerKind: 'core', ownerId: 'config', method: 'GET', path: '/config/info' }] }
    })
    assert.deepEqual(inv.routes, [{ ownerKind: 'core', ownerId: 'config', method: 'GET', path: '/config/info' }])
})

test('an owner kind this plugin does not know (a newer core) is shown as other, not dropped', async () => {
    const inv = await inventarioDe({
        providers: [],
        routes: { listRoutes: () => [{ ownerKind: 'irq', ownerId: 'ha', method: 'GET', path: '/ha' }] }
    })
    assert.equal(inv.routes?.[0].ownerKind, 'other')
})

test('a registry that blows up leaves the routes unknown and the rest of the snapshot intact', async () => {
    const inv = await inventarioDe({
        providers: [{ id: 'metrics', started: true }],
        routes: { listRoutes: () => { throw new Error('boom') } }
    })
    assert.equal('routes' in inv, false)
    assert.equal(inv.components.length, 1)
})

// ── the DCEs (v2, DCE tab) ─────────────────────────────────────────────────────

const meta = (id: string, over: Record<string, unknown> = {}) => ({ id, name: id, version: '1.0.0', hasBack: true, hasFront: false, ...over })

test('🔴 without the core DCE manager, dces are ABSENT — unknown, not an empty list', async () => {
    const inv = await inventarioDe({ providers: [] })
    assert.equal('dces' in inv, false)
})

test('the DCEs come from the core manager: name, version, source, back state and consumers', async () => {
    const inv = await inventarioDe({
        dces: {
            listInstalled: async () => [meta('nettools', { displayName: 'Net Tools', version: '0.1.0', installedFrom: 'dev', hasFront: true })],
            status: () => ({ state: 'loaded', instance: { resolve: () => 'must not travel' } }),
            consumers: async () => [{ type: 'plugin', id: 'nettools', requirement: 'dce:nettools:0.1.0' }]
        }
    })
    // 🔴 No instance and no requirement: only what the tab shows goes to the browser.
    assert.deepEqual(inv.dces, [{
        id: 'nettools',
        name: 'Net Tools',
        version: '0.1.0',
        source: 'dev',
        hasBack: true,
        hasFront: true,
        back: { state: 'loaded' },
        consumers: [{ type: 'plugin', id: 'nettools' }]
    }])
})

test('a failed back end keeps its error; one never loaded has no back state; no displayName falls back to name', async () => {
    const inv = await inventarioDe({
        dces: {
            listInstalled: async () => [meta('a'), meta('b', { name: 'B pkg' })],
            status: (id: string) => id === 'a' ? { state: 'failed', error: 'factory threw' } : undefined,
            consumers: async () => []
        }
    })
    assert.deepEqual(inv.dces?.[0].back, { state: 'failed', error: 'factory threw' })
    assert.equal(inv.dces?.[1].name, 'B pkg')
    assert.equal('back' in inv.dces![1], false)
    assert.equal('source' in inv.dces![1], false)
})

test('a consumer lookup that blows up leaves THAT DCE with none, and the rest intact', async () => {
    const inv = await inventarioDe({
        dces: {
            listInstalled: async () => [meta('a'), meta('b')],
            status: () => ({ state: 'loaded' }),
            consumers: async (id: string) => { if (id === 'a') throw new Error('boom'); return [{ type: 'provider', id: 'p', requirement: 'dce:b:1' }] }
        }
    })
    assert.deepEqual(inv.dces?.map(d => d.consumers), [[], [{ type: 'provider', id: 'p' }]])
})

test('a DCE list that blows up leaves the dces unknown and the rest of the snapshot intact', async () => {
    const inv = await inventarioDe({
        providers: [{ id: 'metrics', started: true }],
        dces: { listInstalled: async () => { throw new Error('boom') }, status: () => undefined, consumers: async () => [] }
    })
    assert.equal('dces' in inv, false)
    assert.equal(inv.components.length, 1)
})
