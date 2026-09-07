import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Poller } from '../src/back/Poller'
import { buildHeaders } from '../src/back/HttpFetcher'
import { EAuthType, EEmitMode, EHttpMethod, EResponseType, IHttpPullConfig, IHttpPullPushEvent, newHttpPullConfig } from '../src/common/HttpPullPush'

// Los ciclos se disparan a mano con tick() para no depender de temporizadores reales.

const collect = (config: IHttpPullConfig, fetcher: any) => {
    const events: IHttpPullPushEvent[] = []
    const poller = new Poller(config, fetcher, e => events.push(e))
    return { poller, events }
}

test('a successful pull emits the envelope with config name, status and parsed data', async () => {
    const config = { ...newHttpPullConfig('stocks'), url: 'https://x/1' }
    const { poller, events } = collect(config, async () => ({ status: 200, body: '{"price":42}' }))

    await poller.tick()

    assert.equal(events.length, 1)
    assert.equal(events[0].config, 'stocks')
    assert.equal(events[0].status, 200)
    assert.deepEqual(events[0].data, { price: 42 })
    assert.equal(events[0].error, undefined)
    assert.ok(events[0].timestamp > 0)
})

test('responseType text delivers the raw body, not parsed json', async () => {
    const config = { ...newHttpPullConfig('rss'), url: 'https://x/1', responseType: EResponseType.TEXT }
    const { poller, events } = collect(config, async () => ({ status: 200, body: '{"a":1}' }))

    await poller.tick()

    assert.equal(events[0].data, '{"a":1}')
})

test('a body that is not valid json is delivered raw instead of being dropped', async () => {
    const config = { ...newHttpPullConfig('broken'), url: 'https://x/1', responseType: EResponseType.JSON }
    const { poller, events } = collect(config, async () => ({ status: 200, body: 'not json at all' }))

    await poller.tick()

    assert.equal(events.length, 1)
    assert.equal(events[0].data, 'not json at all')
})

test('a failing pull emits an error envelope with no data', async () => {
    const config = { ...newHttpPullConfig('down'), url: 'https://x/1' }
    const { poller, events } = collect(config, async () => { throw new Error('ECONNREFUSED') })

    await poller.tick()

    assert.equal(events.length, 1)
    assert.equal(events[0].config, 'down')
    assert.equal(events[0].error, 'ECONNREFUSED')
    assert.equal(events[0].data, undefined)
    assert.equal(events[0].status, undefined)
})

test('emitMode onChange suppresses identical results and lets a change through', async () => {
    const config = { ...newHttpPullConfig('quiet'), url: 'https://x/1', emitMode: EEmitMode.ON_CHANGE }
    let body = '{"v":1}'
    const { poller, events } = collect(config, async () => ({ status: 200, body }))

    await poller.tick()
    await poller.tick()
    assert.equal(events.length, 1, 'the repeated result must not be emitted twice')

    body = '{"v":2}'
    await poller.tick()
    assert.equal(events.length, 2)
    assert.deepEqual(events[1].data, { v: 2 })
})

test('emitMode always emits every cycle, even with an identical body', async () => {
    const config = { ...newHttpPullConfig('chatty'), url: 'https://x/1', emitMode: EEmitMode.ALWAYS }
    const { poller, events } = collect(config, async () => ({ status: 200, body: 'same' }))

    await poller.tick()
    await poller.tick()

    assert.equal(events.length, 2)
})

test('onChange treats a status change as a change, even with the same body', async () => {
    const config = { ...newHttpPullConfig('flappy'), url: 'https://x/1', emitMode: EEmitMode.ON_CHANGE }
    let status = 200
    const { poller, events } = collect(config, async () => ({ status, body: 'same' }))

    await poller.tick()
    status = 500
    await poller.tick()

    assert.equal(events.length, 2)
    assert.equal(events[1].status, 500)
})

test('after a failure the next good result is emitted again in onChange mode', async () => {
    const config = { ...newHttpPullConfig('recovering'), url: 'https://x/1', emitMode: EEmitMode.ON_CHANGE }
    let fail = false
    const { poller, events } = collect(config, async () => {
        if (fail) throw new Error('boom')
        return { status: 200, body: 'stable' }
    })

    await poller.tick()          // ok      -> emite
    fail = true
    await poller.tick()          // error   -> emite
    fail = false
    await poller.tick()          // ok otra vez, mismo cuerpo -> debe emitir igualmente

    assert.equal(events.length, 3)
    assert.equal(events[2].error, undefined)
    assert.equal(events[2].data, 'stable')
})

test('retries re-attempt the pull and a late success is delivered as success', async () => {
    const config = { ...newHttpPullConfig('flaky'), url: 'https://x/1', retries: 2 }
    let attempts = 0
    const { poller, events } = collect(config, async () => {
        attempts++
        if (attempts < 3) throw new Error('temporary')
        return { status: 200, body: '{"ok":true}' }
    })

    await poller.tick()

    assert.equal(attempts, 3)
    assert.equal(events.length, 1)
    assert.deepEqual(events[0].data, { ok: true })
})

test('with retries exhausted the last error is the one reported', async () => {
    const config = { ...newHttpPullConfig('dead'), url: 'https://x/1', retries: 1 }
    let attempts = 0
    const { poller, events } = collect(config, async () => {
        attempts++
        throw new Error(`attempt ${attempts}`)
    })

    await poller.tick()

    assert.equal(attempts, 2, 'retries=1 means one retry, two attempts in total')
    assert.equal(events[0].error, 'attempt 2')
})

test('a cycle is skipped while the previous one is still in flight', async () => {
    const config = { ...newHttpPullConfig('slow'), url: 'https://x/1' }
    let inFlight = 0
    let maxInFlight = 0
    let release: (() => void) | undefined
    const { poller, events } = collect(config, async () => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise<void>(resolve => { release = resolve })
        inFlight--
        return { status: 200, body: 'ok' }
    })

    const first = poller.tick()
    const second = poller.tick()      // debe salirse sin lanzar peticion
    release!()
    await Promise.all([first, second])

    assert.equal(maxInFlight, 1)
    assert.equal(events.length, 1)
})

test('matches() keeps the poller alive on cosmetic changes and recreates it on real ones', () => {
    const config: IHttpPullConfig = { ...newHttpPullConfig('x'), url: 'https://x/1', headers: { a: '1', b: '2' } }
    const { poller } = collect(config, async () => ({ status: 200, body: '' }))

    // mismo contenido, distinto orden de claves en las cabeceras
    assert.equal(poller.matches({ ...config, headers: { b: '2', a: '1' } }), true)
    // 'enabled' lo gestiona el provider, no obliga a recrear
    assert.equal(poller.matches({ ...config, enabled: false }), true)
    // parametros que si cambian el pull
    assert.equal(poller.matches({ ...config, url: 'https://x/2' }), false)
    assert.equal(poller.matches({ ...config, intervalSeconds: 5 }), false)
    assert.equal(poller.matches({ ...config, method: EHttpMethod.POST }), false)
    assert.equal(poller.matches({ ...config, headers: { a: '9', b: '2' } }), false)
})

test('auth translates into the expected headers', () => {
    const base = { ...newHttpPullConfig('h'), url: 'https://x/1', headers: { 'X-Custom': 'keep' } }

    const none = buildHeaders(base)
    assert.deepEqual(none, { 'X-Custom': 'keep' })

    const basic = buildHeaders({ ...base, auth: { type: EAuthType.BASIC, username: 'user', password: 'pass' } })
    assert.equal(basic['Authorization'], 'Basic ' + Buffer.from('user:pass').toString('base64'))
    assert.equal(basic['X-Custom'], 'keep', 'the connection headers are preserved')

    const bearer = buildHeaders({ ...base, auth: { type: EAuthType.BEARER, token: 'tok' } })
    assert.equal(bearer['Authorization'], 'Bearer tok')

    const header = buildHeaders({ ...base, auth: { type: EAuthType.HEADER, headerName: 'X-Api-Key', headerValue: 'secret' } })
    assert.equal(header['X-Api-Key'], 'secret')
    assert.equal(header['Authorization'], undefined)
})
