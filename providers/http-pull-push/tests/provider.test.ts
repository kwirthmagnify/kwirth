import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HttpPullPushProvider } from '../src/back/index'
import { EHttpMethod, IHttpPullConfig, IHttpPullPushEvent, newHttpPullConfig } from '../src/common/HttpPullPush'

// Aqui se prueban las DOS capas y como se relacionan: las conexiones (capa 1, persistidas, con enabled)
// y las suscripciones (capa 2, en memoria). El fetcher es de mentira: no se toca la red.

const makeStorage = () => {
    const data = new Map<string, any>()
    return {
        writeStorage: async (id: string, secret: boolean, value: any) => { data.set(`${id}:${secret}`, value) },
        readStorage: async (id: string, secret: boolean) => data.get(`${id}:${secret}`),
        writeStorageCommon: async () => {},
        readStorageCommon: async () => undefined
    }
}

// Suscriptor espia: guarda todo lo que le llega.
const makeSubscriber = () => {
    const received: IHttpPullPushEvent[] = []
    return {
        subscriber: { processProviderEvent: (_id: string, obj: any) => { received.push(obj as IHttpPullPushEvent) } },
        received
    }
}

const conn = (name: string, extra: Partial<IHttpPullConfig> = {}): IHttpPullConfig => ({
    ...newHttpPullConfig(name),
    url: `https://example.com/${name}`,
    intervalSeconds: 3600,        // largo: en los tests solo interesa el pull inmediato del start
    timeoutMs: 1000,
    ...extra
})

// Espera activa corta: el primer pull de un poller es asincrono.
const settle = async (): Promise<void> => {
    for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve))
}

const makeProvider = async (configs: IHttpPullConfig[]) => {
    const calls: string[] = []
    const fetcher = async (config: IHttpPullConfig) => {
        calls.push(config.name)
        return { status: 200, body: JSON.stringify({ from: config.name }) }
    }
    const storage = makeStorage()
    const provider = new HttpPullPushProvider(undefined, {} as any, storage, fetcher)
    await provider.applyConfigs(configs)   // persiste antes de arrancar, como haria el dialogo
    await provider.startProvider()
    return { provider, calls }
}

test('a connection with no subscribers is never polled (lazy)', async () => {
    const { provider, calls } = await makeProvider([conn('stocks'), conn('rss')])

    await settle()

    assert.deepEqual(calls, [], 'nobody is listening, so nothing must be requested')
    await provider.stopProvider()
})

test('subscribing starts the poll and delivers the envelope', async () => {
    const { provider, calls } = await makeProvider([conn('stocks')])
    const { subscriber, received } = makeSubscriber()

    await provider.addSubscriber(subscriber, { configs: ['stocks'] })
    await settle()

    assert.deepEqual(calls, ['stocks'])
    assert.equal(received.length, 1)
    assert.equal(received[0].config, 'stocks')
    assert.deepEqual(received[0].data, { from: 'stocks' })
    await provider.stopProvider()
})

test('an empty configs array subscribes to nothing', async () => {
    const { provider, calls } = await makeProvider([conn('stocks'), conn('rss')])
    const { subscriber, received } = makeSubscriber()

    await provider.addSubscriber(subscriber, { configs: [] })
    await settle()

    assert.deepEqual(calls, [])
    assert.equal(received.length, 0)
    await provider.stopProvider()
})

test('an absent configs field subscribes to every enabled connection', async () => {
    const { provider, calls } = await makeProvider([conn('stocks'), conn('rss'), conn('news', { enabled: false })])
    const { subscriber, received } = makeSubscriber()

    await provider.addSubscriber(subscriber, {})
    await settle()

    assert.deepEqual(calls.sort(), ['rss', 'stocks'], 'the disabled connection is not polled')
    assert.deepEqual(received.map(e => e.config).sort(), ['rss', 'stocks'])
    await provider.stopProvider()
})

test('a disabled connection is never polled even if explicitly subscribed', async () => {
    const { provider, calls } = await makeProvider([conn('news', { enabled: false })])
    const { subscriber, received } = makeSubscriber()

    await provider.addSubscriber(subscriber, { configs: ['news'] })
    await settle()

    assert.deepEqual(calls, [])
    assert.equal(received.length, 0)
    await provider.stopProvider()
})

test('two subscribers of the same connection cause ONE request and two deliveries', async () => {
    const { provider, calls } = await makeProvider([conn('stocks')])
    const first = makeSubscriber()
    const second = makeSubscriber()

    await provider.addSubscriber(first.subscriber, { configs: ['stocks'] })
    await settle()
    await provider.addSubscriber(second.subscriber, { configs: ['stocks'] })
    await settle()

    // el segundo se suscribe a un poller que ya corre: no se relanza la peticion
    assert.deepEqual(calls, ['stocks'])
    assert.equal(first.received.length, 1)
    assert.equal(second.received.length, 0, 'the second one will get the next cycle, not the one already served')
    await provider.stopProvider()
})

test('each subscriber only gets the connections it asked for', async () => {
    const { provider } = await makeProvider([conn('stocks'), conn('rss'), conn('news')])
    const xx = makeSubscriber()
    const yy = makeSubscriber()

    await provider.addSubscriber(xx.subscriber, { configs: ['stocks', 'rss'] })
    await provider.addSubscriber(yy.subscriber, { configs: ['stocks', 'rss', 'news'] })
    await settle()

    assert.deepEqual([...new Set(xx.received.map(e => e.config))].sort(), ['rss', 'stocks'])
    assert.ok(yy.received.some(e => e.config === 'news'), 'only YY subscribed to news')
    assert.ok(!xx.received.some(e => e.config === 'news'))
    await provider.stopProvider()
})

test('removing the last subscriber stops the polling', async () => {
    const { provider, calls } = await makeProvider([conn('stocks', { intervalSeconds: 1 })])
    const { subscriber } = makeSubscriber()

    await provider.addSubscriber(subscriber, { configs: ['stocks'] })
    await settle()
    const afterSubscribe = calls.length
    await provider.removeSubscriber(subscriber)
    await new Promise(resolve => setTimeout(resolve, 1200))   // mas de un intervalo

    assert.equal(calls.length, afterSubscribe, 'no further requests once nobody listens')
    await provider.stopProvider()
})

test('disabling a connection stops it live, with no restart', async () => {
    const { provider, calls } = await makeProvider([conn('stocks', { intervalSeconds: 1 })])
    const { subscriber } = makeSubscriber()

    await provider.addSubscriber(subscriber, { configs: ['stocks'] })
    await settle()
    const before = calls.length
    assert.ok(before > 0)

    await provider.applyConfigs([conn('stocks', { intervalSeconds: 1, enabled: false })])
    await new Promise(resolve => setTimeout(resolve, 1200))

    assert.equal(calls.length, before, 'a disabled connection must stop being polled immediately')
    await provider.stopProvider()
})

test('adding a connection live starts polling it for whoever subscribed to everything', async () => {
    const { provider, calls } = await makeProvider([conn('stocks')])
    const { subscriber, received } = makeSubscriber()

    await provider.addSubscriber(subscriber, {})
    await settle()
    assert.deepEqual(calls, ['stocks'])

    await provider.applyConfigs([conn('stocks'), conn('news')])
    await settle()

    assert.deepEqual(calls.sort(), ['news', 'stocks'])
    assert.ok(received.some(e => e.config === 'news'))
    await provider.stopProvider()
})

test('editing a connection recreates its poller, leaving the others alone', async () => {
    const { provider, calls } = await makeProvider([conn('stocks'), conn('rss')])
    const { subscriber } = makeSubscriber()

    await provider.addSubscriber(subscriber, {})
    await settle()
    assert.equal(calls.length, 2)

    await provider.applyConfigs([conn('stocks', { method: EHttpMethod.POST, body: '{}' }), conn('rss')])
    await settle()

    assert.equal(calls.filter(c => c === 'stocks').length, 2, 'the edited one polls again')
    assert.equal(calls.filter(c => c === 'rss').length, 1, 'the untouched one is not restarted')
    await provider.stopProvider()
})

test('subscribing to an unknown connection is ignored, not an error', async () => {
    const { provider, calls } = await makeProvider([conn('stocks')])
    const { subscriber, received } = makeSubscriber()

    await provider.addSubscriber(subscriber, { configs: ['does-not-exist'] })
    await settle()

    assert.deepEqual(calls, [])
    assert.equal(received.length, 0)
    await provider.stopProvider()
})

test('updateSubscription changes the selection without resubscribing', async () => {
    const { provider, calls } = await makeProvider([conn('stocks'), conn('news')])
    const { subscriber, received } = makeSubscriber()

    await provider.addSubscriber(subscriber, { configs: ['stocks'] })
    await settle()
    assert.deepEqual(calls, ['stocks'])

    await provider.updateSubscription(subscriber, { configs: ['stocks', 'news'] })
    await settle()

    assert.deepEqual(calls.sort(), ['news', 'stocks'])
    assert.ok(received.some(e => e.config === 'news'))
    await provider.stopProvider()
})

test('a subscriber that throws does not break the delivery to the others', async () => {
    const { provider } = await makeProvider([conn('stocks')])
    const broken = { processProviderEvent: () => { throw new Error('subscriber exploded') } }
    const healthy = makeSubscriber()

    await provider.addSubscriber(broken, { configs: ['stocks'] })
    await provider.addSubscriber(healthy.subscriber, { configs: ['stocks'] })
    await settle()

    assert.equal(healthy.received.length, 1)
    await provider.stopProvider()
})

test('connections survive a provider restart, credentials included', async () => {
    const storage = makeStorage()
    const fetcher = async () => ({ status: 200, body: '{}' })
    const first = new HttpPullPushProvider(undefined, {} as any, storage, fetcher)
    await first.applyConfigs([conn('stocks', { auth: { type: 'basic' as any, username: 'u', password: 'p' } })])
    await first.stopProvider()

    const second = new HttpPullPushProvider(undefined, {} as any, storage, fetcher)
    await second.startProvider()

    const loaded = second.getConfigs()
    assert.equal(loaded.length, 1)
    assert.equal(loaded[0].name, 'stocks')
    assert.equal(loaded[0].auth.password, 'p')
    await second.stopProvider()
})

// El boton Test del dialogo llama a este metodo EN EL BACK, que es quien tiene la red y los certificados
// con los que se hara el pull de verdad.

test('testConnection runs the request and reports status, timing, size and a preview', async () => {
    const { provider } = await makeProvider([])
    const result = await provider.testConnection({ ...conn('probe'), url: 'https://example.com/x' })

    assert.equal(result.ok, true)
    assert.equal(result.status, 200)
    assert.equal(result.jsonParsed, true)
    assert.equal(result.bytes, JSON.stringify({ from: 'probe' }).length)
    assert.equal(result.preview, JSON.stringify({ from: 'probe' }))
    assert.ok(result.durationMs >= 0)
    await provider.stopProvider()
})

test('testConnection reports a transport failure as ok:false, never as a thrown error', async () => {
    const storage = makeStorage()
    const provider = new HttpPullPushProvider(undefined, {} as any, storage, async () => { throw new Error('ECONNREFUSED') })

    const result = await provider.testConnection({ ...conn('down'), url: 'https://nope.invalid/x' })

    assert.equal(result.ok, false)
    assert.equal(result.error, 'ECONNREFUSED')
    assert.equal(result.status, undefined)
    await provider.stopProvider()
})

test('testConnection validates before firing, and does not care about the interval', async () => {
    const calls: string[] = []
    const storage = makeStorage()
    const provider = new HttpPullPushProvider(undefined, {} as any, storage, async (c: IHttpPullConfig) => {
        calls.push(c.name)
        return { status: 200, body: 'ok' }
    })

    // url invalida: no se lanza ninguna peticion
    const bad = await provider.testConnection({ ...conn('bad'), url: 'ftp://nope' })
    assert.equal(bad.ok, false)
    assert.match(bad.error!, /http/)
    assert.deepEqual(calls, [])

    // un timeout mayor que el intervalo bloquea el GUARDADO, pero no debe bloquear una prueba puntual
    const ok = await provider.testConnection({ ...conn('fine'), url: 'https://x/1', intervalSeconds: 1, timeoutMs: 30000 })
    assert.equal(ok.ok, true)
    assert.deepEqual(calls, ['fine'])
    await provider.stopProvider()
})

test('testConnection ignores retries: a test reports the first outcome', async () => {
    let attempts = 0
    const storage = makeStorage()
    const provider = new HttpPullPushProvider(undefined, {} as any, storage, async () => {
        attempts++
        throw new Error('flaky')
    })

    await provider.testConnection({ ...conn('flaky'), url: 'https://x/1', retries: 5 })

    assert.equal(attempts, 1, 'a test must not insist five times')
    await provider.stopProvider()
})

test('testConnection neither persists the connection nor starts polling it', async () => {
    const { provider, calls } = await makeProvider([])

    await provider.testConnection({ ...conn('ghost'), url: 'https://x/1' })
    await settle()

    assert.deepEqual(provider.getConfigNames(), [], 'a tested connection is not saved')
    assert.deepEqual(calls.filter(c => c === 'ghost').length, 1, 'exactly one request: the test, no poller')
    await provider.stopProvider()
})

test('testConnection flags a body that is not JSON', async () => {
    const storage = makeStorage()
    const provider = new HttpPullPushProvider(undefined, {} as any, storage, async () => ({ status: 200, body: '<html/>' }))

    const result = await provider.testConnection({ ...conn('html'), url: 'https://x/1' })

    assert.equal(result.ok, true)
    assert.equal(result.jsonParsed, false)
    assert.equal(result.preview, '<html/>')
    await provider.stopProvider()
})

test('getConfigNames reports the names, and only the names', async () => {
    const { provider } = await makeProvider([
        conn('stocks', { auth: { type: 'bearer' as any, token: 'tok-secret' } }),
        conn('rss', { enabled: false })
    ])

    const names = provider.getConfigNames()

    // incluye las deshabilitadas: el contador de la tarjeta cuenta lo definido, no lo que esta corriendo
    assert.deepEqual(names.sort(), ['rss', 'stocks'])
    // y no se filtra nada mas: son cadenas, no objetos con credenciales dentro
    assert.ok(names.every(n => typeof n === 'string'))
    assert.ok(!JSON.stringify(names).includes('tok-secret'))
    await provider.stopProvider()
})

test('getConfigNames follows the connections as they are added and removed', async () => {
    const { provider } = await makeProvider([conn('a')])
    assert.deepEqual(provider.getConfigNames(), ['a'])

    await provider.applyConfigs([conn('a'), conn('b')])
    assert.deepEqual(provider.getConfigNames().sort(), ['a', 'b'])

    await provider.applyConfigs([conn('b')])
    assert.deepEqual(provider.getConfigNames(), ['b'])
    await provider.stopProvider()
})

test('the published subscription help matches the real behaviour', async () => {
    const { provider, calls } = await makeProvider([conn('stocks'), conn('rss')])
    const help = provider.getSubscriptionHelp()

    // el ejemplo tiene que ser un payload que de verdad funcione, no una ilustracion
    const { subscriber, received } = makeSubscriber()
    await provider.applyConfigs([conn('stocks'), conn('rss')])
    await provider.addSubscriber(subscriber, help.example as { configs?: string[] })
    await settle()
    assert.deepEqual(calls.sort(), ['rss', 'stocks'], 'the example payload must deliver those connections')
    assert.deepEqual([...new Set(received.map(e => e.config))].sort(), ['rss', 'stocks'])

    // el gotcha que nadie adivina tiene que estar dicho
    assert.match(help.usage, /empty array/i)
    assert.match(help.usage, /LAZY/i)

    // 'configs' declarado como el unico campo, y con el tipo que se acepta
    assert.deepEqual(help.fields?.map(f => f.name), ['configs'])
    assert.equal(help.fields?.[0].type, 'string[]')

    await provider.stopProvider()
})

test('stopProvider stops every poller', async () => {
    const { provider, calls } = await makeProvider([conn('stocks', { intervalSeconds: 1 })])
    const { subscriber } = makeSubscriber()

    await provider.addSubscriber(subscriber, { configs: ['stocks'] })
    await settle()
    const before = calls.length

    await provider.stopProvider()
    await new Promise(resolve => setTimeout(resolve, 1200))

    assert.equal(calls.length, before)
})
