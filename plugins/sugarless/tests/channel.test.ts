import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EInstanceMessageAction, IInstanceConfig, IProvider, IProviderSubscriber } from '@kwirthmagnify/kwirth-common-back'
import SugarlessChannel from '../src/back/index'
import {
    EGlucoseUnit, ESugarlessPayload, ETrendArrow, ISugarlessEvent, ISugarlessMessageResponse
} from '../src/common/SugarlessTypes'

/*
    El canal es un reenviador: su unica responsabilidad es que cada pestaña tenga SU suscripcion al
    provider y reciba lo suyo. Lo que se comprueba aqui es precisamente eso, porque es donde estan las
    dos trampas: suscribir el canal en vez de la instancia (y que una pestaña nueva se quede vacia), y
    dejar suscriptores huerfanos al cerrar.
*/

interface IFakeSocket {
    sent: string[]
    send: (text: string) => void
}

const fakeSocket = (): IFakeSocket => {
    const sent: string[] = []
    return { sent, send: (text: string) => { sent.push(text) } }
}

interface IFakeProvider extends IProvider {
    subscribers: IProviderSubscriber[]
    emit: (event: ISugarlessEvent) => void
}

const fakeProvider = (): IFakeProvider => {
    const subscribers: IProviderSubscriber[] = []
    return {
        id: 'sugarless',
        providesRouter: false,
        requiresApiKeyApi: false,
        router: undefined,
        routerAlias: undefined,
        apiKeyApi: undefined,
        subscribers,
        addSubscriber: async (c: IProviderSubscriber) => { subscribers.push(c) },
        removeSubscriber: async (c: IProviderSubscriber) => {
            const index = subscribers.indexOf(c)
            if (index >= 0) subscribers.splice(index, 1)
        },
        startProvider: async () => {},
        stopProvider: async () => {},
        emit: (event: ISugarlessEvent) => { for (const s of [...subscribers]) s.processProviderEvent('sugarless', event) }
    }
}

// El accessKey se deserializa en addObject, asi que tiene que tener la forma esperada.
const ACCESS_KEY = 'id|type|resources'

const instanceConfig = (instance: string): IInstanceConfig => ({
    channel: 'sugarless',
    instance,
    accessKey: ACCESS_KEY,
    scope: 'none',
    view: 'none',
    namespace: '',
    group: '',
    pod: '',
    container: '',
    objects: '',
    data: {}
} as unknown as IInstanceConfig)

const sampleEvent = (timestamp: number): ISugarlessEvent => ({
    payloadType: ESugarlessPayload.SAMPLE,
    unit: EGlucoseUnit.MGDL,
    sample: { timestamp, value: 112, trend: ETrendArrow.STABLE, isHigh: false, isLow: false }
})

const buildChannel = () => {
    const provider = fakeProvider()
    const channel = new SugarlessChannel({ providers: [provider] }, {} as never)
    return { channel, provider }
}

const eventsOf = (socket: IFakeSocket): ISugarlessEvent[] =>
    socket.sent.map(text => JSON.parse(text) as ISugarlessMessageResponse)
        .filter(m => m.msgtype === 'sugarlessmessageresponse')
        .map(m => m.event)

test('declares itself autonomous: it needs nothing from the cluster', () => {
    const { channel } = buildChannel()
    const meta = channel.getChannelData()

    // Las dos en false es lo que hace que solo se arranque con la view 'none'. Si alguna se pusiera a
    // true, el canal volveria a pedir ambito de cluster para no mirar ni un pod.
    assert.equal(meta.cluster, false)
    assert.equal(meta.resourced, false)
    assert.equal(meta.id, 'sugarless')
})

test('requires the sugarless provider, so the core starts it', () => {
    const { channel } = buildChannel()
    assert.deepEqual(channel.requirements.providers, ['sugarless'])
})

test('each instance gets its OWN subscription', async () => {
    /*
        Es la diferencia entre que una pestaña nueva pinte la ventana entera al abrirse o se quede
        vacia hasta el siguiente ciclo. Con un intervalo de un minuto, lo segundo parece una averia.
    */
    const { channel, provider } = buildChannel()
    const socketA = fakeSocket()
    const socketB = fakeSocket()

    await channel.addObject(socketA as never, instanceConfig('one'), '', '', '')
    await channel.addObject(socketB as never, instanceConfig('two'), '', '', '')

    assert.equal(provider.subscribers.length, 2)
})

test('delivers provider events to the socket of its instance', async () => {
    const { channel, provider } = buildChannel()
    const socket = fakeSocket()
    await channel.addObject(socket as never, instanceConfig('one'), '', '', '')

    provider.emit(sampleEvent(1000))

    const events = eventsOf(socket)
    assert.equal(events.length, 1)
    assert.equal(events[0].payloadType, ESugarlessPayload.SAMPLE)
    assert.equal(events[0].sample!.value, 112)
})

test('two tabs each receive the event once', async () => {
    const { channel, provider } = buildChannel()
    const socketA = fakeSocket()
    const socketB = fakeSocket()
    await channel.addObject(socketA as never, instanceConfig('one'), '', '', '')
    await channel.addObject(socketB as never, instanceConfig('two'), '', '', '')

    provider.emit(sampleEvent(1000))

    assert.equal(eventsOf(socketA).length, 1)
    assert.equal(eventsOf(socketB).length, 1)
})

test('a paused instance stops receiving, and resumes on continue', async () => {
    const { channel, provider } = buildChannel()
    const socket = fakeSocket()
    const config = instanceConfig('one')
    await channel.addObject(socket as never, config, '', '', '')

    channel.pauseContinueInstance(socket as never, config, EInstanceMessageAction.PAUSE)
    provider.emit(sampleEvent(1000))
    assert.equal(eventsOf(socket).length, 0)

    channel.pauseContinueInstance(socket as never, config, EInstanceMessageAction.CONTINUE)
    provider.emit(sampleEvent(2000))
    assert.equal(eventsOf(socket).length, 1)
})

test('pausing does NOT unsubscribe: the provider keeps its history', async () => {
    // Si pausar desuscribiera, el provider dejaria de tener oyentes y, con una politica lazy, dejaria
    // de poletear. Aqui lo unico que se congela es la grafica.
    const { channel, provider } = buildChannel()
    const socket = fakeSocket()
    const config = instanceConfig('one')
    await channel.addObject(socket as never, config, '', '', '')

    channel.pauseContinueInstance(socket as never, config, EInstanceMessageAction.PAUSE)

    assert.equal(provider.subscribers.length, 1)
})

test('stopping an instance unsubscribes it', async () => {
    const { channel, provider } = buildChannel()
    const socket = fakeSocket()
    const config = instanceConfig('one')
    await channel.addObject(socket as never, config, '', '', '')

    channel.stopInstance(socket as never, config)

    assert.equal(provider.subscribers.length, 0)
    assert.equal(channel.containsInstance('one'), false)
})

test('closing a connection unsubscribes every instance it had', async () => {
    // Dejar suscriptores huerfanos haria que el provider siguiera entregando a sockets muertos.
    const { channel, provider } = buildChannel()
    const socket = fakeSocket()
    await channel.addObject(socket as never, instanceConfig('one'), '', '', '')
    await channel.addObject(socket as never, instanceConfig('two'), '', '', '')
    assert.equal(provider.subscribers.length, 2)

    channel.removeConnection(socket as never)

    assert.equal(provider.subscribers.length, 0)
    assert.equal(channel.containsConnection(socket as never), false)
})

test('the same instance added twice does not subscribe twice', async () => {
    const { channel, provider } = buildChannel()
    const socket = fakeSocket()
    await channel.addObject(socket as never, instanceConfig('one'), '', '', '')
    await channel.addObject(socket as never, instanceConfig('one'), '', '', '')

    assert.equal(provider.subscribers.length, 1)
})

test('without the provider running it says so instead of failing silently', async () => {
    const channel = new SugarlessChannel({ providers: [] }, {} as never)
    const socket = fakeSocket()

    await channel.addObject(socket as never, instanceConfig('one'), '', '', '')

    assert.equal(eventsOf(socket).length, 0)
    const signals = socket.sent.map(t => JSON.parse(t) as { text?: string })
    assert.ok(signals.some(s => (s.text ?? '').includes('is not running')), `no aviso de provider ausente: ${socket.sent.join(' | ')}`)
})

test('a reconnect moves the instance to the new socket', async () => {
    const { channel, provider } = buildChannel()
    const oldSocket = fakeSocket()
    const newSocket = fakeSocket()
    await channel.addObject(oldSocket as never, instanceConfig('one'), '', '', '')

    assert.equal(channel.updateConnection(newSocket as never, 'one'), true)
    provider.emit(sampleEvent(1000))

    assert.equal(eventsOf(newSocket).length, 1)
    assert.equal(eventsOf(oldSocket).length, 0)
})
