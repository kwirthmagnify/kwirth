import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IProviderStorage, IProviderSubscriber, KwirthData } from '@kwirthmagnify/kwirth-common-back'
import { SugarlessProvider } from '../src/back/index'
import {
    ESugarlessErrorKind, ESugarlessPayload, ISugarlessEvent
} from '../src/common/Sugarless'
import {
    connectionsEmpty, connectionsOk, isLogin, loginOk, makeFetcher, testConfig
} from './fixtures'

const memoryStorage = (): IProviderStorage => {
    const store = new Map<string, unknown>()
    return {
        writeStorage: async (id: string, secret: boolean, data: unknown) => { store.set(`${id}:${secret}`, data) },
        readStorage: async (id: string, secret: boolean) => store.get(`${id}:${secret}`),
        writeStorageCommon: async () => { /* sin uso */ },
        readStorageCommon: async () => undefined
    }
}

interface IRecordingSubscriber extends IProviderSubscriber {
    events: ISugarlessEvent[]
}

const recorder = (): IRecordingSubscriber => {
    const events: ISugarlessEvent[] = []
    return {
        events,
        processProviderEvent: (_providerId: string, obj: unknown) => { events.push(obj as ISugarlessEvent) }
    }
}

const waitFor = async (predicate: () => boolean, label: string): Promise<void> => {
    for (let attempt = 0; attempt < 200; attempt++) {
        if (predicate()) return
        await new Promise(resolve => setTimeout(resolve, 5))
    }
    throw new Error(`timed out waiting for ${label}`)
}

const happyFetcher = () => makeFetcher(request => {
    if (isLogin(request)) return { status: 200, body: loginOk() }
    return { status: 200, body: connectionsOk() }
}).fetcher

test('a configured provider polls and delivers samples to its subscribers', async () => {
    const provider = new SugarlessProvider(undefined, {} as KwirthData, memoryStorage(), happyFetcher())
    try {
        await provider.applyConfig(testConfig())
        const subscriber = recorder()
        await provider.addSubscriber(subscriber)

        await waitFor(() => subscriber.events.some(e => e.payloadType === ESugarlessPayload.SAMPLE), 'a sample')
        const sample = subscriber.events.find(e => e.payloadType === ESugarlessPayload.SAMPLE)
        assert.equal(sample!.sample!.value, 112)
    }
    finally {
        await provider.stopProvider()
    }
})

test('a subscriber gets the window immediately, without waiting for a cycle', async () => {
    const provider = new SugarlessProvider(undefined, {} as KwirthData, memoryStorage(), happyFetcher())
    try {
        await provider.applyConfig(testConfig())
        // Se deja que el primer ciclo llene el historico con una pestaña ya abierta...
        const first = recorder()
        await provider.addSubscriber(first)
        await waitFor(() => first.events.some(e => e.payloadType === ESugarlessPayload.SAMPLE), 'the first sample')

        // ...y ahora se abre otra: tiene que recibir la ventana entera en el acto.
        const second = recorder()
        await provider.addSubscriber(second)

        assert.equal(second.events.length >= 1, true)
        assert.equal(second.events[0].payloadType, ESugarlessPayload.SNAPSHOT)
        assert.equal(second.events[0].samples!.length, 1)
        assert.equal(second.events[0].samples![0].value, 112)
        assert.equal(second.events[0].targetLow, 70)
    }
    finally {
        await provider.stopProvider()
    }
})

test('a subscriber on an unconfigured provider is told so, and nothing is polled', async () => {
    const { fetcher, requests } = makeFetcher(() => ({ status: 200, body: loginOk() }))
    const provider = new SugarlessProvider(undefined, {} as KwirthData, memoryStorage(), fetcher)
    try {
        await provider.startProvider()
        const subscriber = recorder()
        await provider.addSubscriber(subscriber)

        assert.equal(subscriber.events.length, 1)
        assert.equal(subscriber.events[0].payloadType, ESugarlessPayload.ERROR)
        assert.equal(subscriber.events[0].errorKind, ESugarlessErrorKind.NOT_CONFIGURED)
        // Sin credenciales no se hace ni una peticion.
        assert.equal(requests.length, 0)
    }
    finally {
        await provider.stopProvider()
    }
})

test('a new subscriber is told about a pending problem without waiting a whole interval', async () => {
    const { fetcher } = makeFetcher(request => {
        if (isLogin(request)) return { status: 200, body: loginOk() }
        return { status: 200, body: connectionsEmpty() }
    })
    const provider = new SugarlessProvider(undefined, {} as KwirthData, memoryStorage(), fetcher)
    try {
        await provider.applyConfig(testConfig())
        const first = recorder()
        await provider.addSubscriber(first)
        await waitFor(() => first.events.some(e => e.payloadType === ESugarlessPayload.ERROR), 'the error')

        const second = recorder()
        await provider.addSubscriber(second)

        // Snapshot vacio y, detras, el estado que dejo el ultimo ciclo.
        assert.equal(second.events[0].payloadType, ESugarlessPayload.SNAPSHOT)
        assert.equal(second.events[1].payloadType, ESugarlessPayload.ERROR)
        assert.equal(second.events[1].errorKind, ESugarlessErrorKind.NO_FOLLOWED_PATIENT)
    }
    finally {
        await provider.stopProvider()
    }
})

test('the configuration served to the dialog carries the real password', async () => {
    /*
        Los secretos se tratan como cualquier otro dato: viajan al front y el dialogo los pinta
        enmascarados con un ojo para revelarlos. Nada de 'hasPassword' ni de vistas redactadas.
    */
    const provider = new SugarlessProvider(undefined, {} as KwirthData, memoryStorage(), happyFetcher())
    try {
        await provider.applyConfig(testConfig({ password: 'top-secret' }))
        const served = provider.getConfig()

        assert.equal(served.password, 'top-secret')
        assert.equal(served.email, 'follower@example.com')
    }
    finally {
        await provider.stopProvider()
    }
})

test('an empty password is stored as empty, not merged with the previous one', async () => {
    const provider = new SugarlessProvider(undefined, {} as KwirthData, memoryStorage(), happyFetcher())
    try {
        await provider.applyConfig(testConfig({ password: 'first' }))
        await provider.applyConfig(testConfig({ password: '' }))

        assert.equal(provider.getConfig().password, '')
        // Y sin credencial no se poletea.
        assert.deepEqual(provider.getConfigNames(), [])
    }
    finally {
        await provider.stopProvider()
    }
})

test('the configuration survives a restart of the provider', async () => {
    const storage = memoryStorage()
    const first = new SugarlessProvider(undefined, {} as KwirthData, storage, happyFetcher())
    await first.applyConfig(testConfig({ region: 'eu', intervalSeconds: 120 }))
    await first.stopProvider()

    const second = new SugarlessProvider(undefined, {} as KwirthData, storage, happyFetcher())
    try {
        await second.startProvider()
        const config = second.getConfig()

        assert.equal(config.email, 'follower@example.com')
        assert.equal(config.password, 'secret')
        assert.equal(config.region, 'eu')
        assert.equal(config.intervalSeconds, 120)
    }
    finally {
        await second.stopProvider()
    }
})

test('testing credentials reports the region, the followed patients and whether there is a reading', async () => {
    const provider = new SugarlessProvider(undefined, {} as KwirthData, memoryStorage(), happyFetcher())
    const result = await provider.testConfig(testConfig())

    assert.equal(result.ok, true)
    assert.equal(result.region, 'eu')
    assert.equal(result.connections, 1)
    assert.equal(result.hasReading, true)
    assert.ok(result.durationMs >= 0)
})

test('testing credentials reports the actionable reason when it fails', async () => {
    const { fetcher } = makeFetcher(request => {
        if (isLogin(request)) return { status: 200, body: loginOk() }
        return { status: 200, body: connectionsEmpty() }
    })
    const provider = new SugarlessProvider(undefined, {} as KwirthData, memoryStorage(), fetcher)
    const result = await provider.testConfig(testConfig())

    assert.equal(result.ok, false)
    assert.equal(result.errorKind, ESugarlessErrorKind.NO_FOLLOWED_PATIENT)
})

test('testing an invalid configuration fails without touching the network', async () => {
    const { fetcher, requests } = makeFetcher(() => ({ status: 200, body: loginOk() }))
    const provider = new SugarlessProvider(undefined, {} as KwirthData, memoryStorage(), fetcher)
    const result = await provider.testConfig(testConfig({ email: 'nope' }))

    assert.equal(result.ok, false)
    assert.match(result.error!, /does not look like an email/)
    assert.equal(requests.length, 0)
})

test('the card counter reports a configured account and nothing when unconfigured', async () => {
    const provider = new SugarlessProvider(undefined, {} as KwirthData, memoryStorage(), happyFetcher())
    try {
        assert.deepEqual(provider.getConfigNames(), [])
        await provider.applyConfig(testConfig())
        assert.deepEqual(provider.getConfigNames(), ['account'])
        // Y no filtra el email en el nombre.
        assert.equal(provider.getConfigNames().join('').includes('@'), false)
    }
    finally {
        await provider.stopProvider()
    }
})

test('removing a subscriber stops delivering to it', async () => {
    const provider = new SugarlessProvider(undefined, {} as KwirthData, memoryStorage(), happyFetcher())
    try {
        await provider.applyConfig(testConfig())
        const subscriber = recorder()
        await provider.addSubscriber(subscriber)
        await waitFor(() => subscriber.events.length > 0, 'the snapshot')

        await provider.removeSubscriber(subscriber)
        const countAfterRemoval = subscriber.events.length
        await new Promise(resolve => setTimeout(resolve, 20))

        assert.equal(subscriber.events.length, countAfterRemoval)
    }
    finally {
        await provider.stopProvider()
    }
})

test('a subscriber that throws does not break delivery to the others', async () => {
    const provider = new SugarlessProvider(undefined, {} as KwirthData, memoryStorage(), happyFetcher())
    try {
        await provider.applyConfig(testConfig())
        const broken: IProviderSubscriber = {
            processProviderEvent: () => { throw new Error('boom') }
        }
        const healthy = recorder()
        await provider.addSubscriber(broken)
        await provider.addSubscriber(healthy)

        await waitFor(() => healthy.events.length > 0, 'the healthy subscriber to receive something')
        assert.ok(healthy.events.length > 0)
    }
    finally {
        await provider.stopProvider()
    }
})

test('the subscription help says out loud that NO_DATA is not an error', () => {
    const provider = new SugarlessProvider(undefined, {} as KwirthData, memoryStorage(), happyFetcher())
    const help = provider.getSubscriptionHelp()

    assert.match(help.usage, /NODATA IS NOT AN ERROR/)
    assert.deepEqual(help.example, {})
})
