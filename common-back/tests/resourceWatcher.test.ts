import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { AddressInfo } from 'node:net'
import { KubeConfig } from '@kubernetes/client-node'
import { createResourceWatcher } from '../src/KubernetesTools'

/*
    createResourceWatcher against a tiny local API server that speaks the watch protocol: one JSON line per
    change ({"type":"ADDED","object":{...}}), on a request that stays open. What is checked is what the
    'events' provider depends on: changes are delivered as they come, objects without metadata are not,
    the watch reconnects when the server closes it — for ever, if it keeps connecting —, it gives up after
    maxRetries failures to connect in a row, and stop() stops it.
*/

interface IFakeApi {
    url: string
    requests: string[]
    close(): Promise<void>
}

// Each request gets the lines of the next script; an empty script closes the request straight away, and
// a script ['FAIL'] answers 500 — the watch does not connect.
const fakeApi = async (scripts: string[][]): Promise<IFakeApi> => {
    const requests: string[] = []
    const sockets = new Set<import('node:net').Socket>()
    let n = 0
    const server = http.createServer((req, res) => {
        requests.push(req.url ?? '')
        const lines = scripts[Math.min(n++, scripts.length - 1)]
        if (lines[0] === 'FAIL') {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end('{}')
            return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        for (const line of lines) res.write(line + '\n')
        // a script ending in 'KEEP' leaves the request open, like a live watch
        if (lines[lines.length - 1] !== 'KEEP') res.end()
    })
    server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    return {
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        requests,
        close: () => new Promise<void>(resolve => { for (const s of sockets) s.destroy(); server.close(() => resolve()) })
    }
}

const clusterInfoFor = (url: string) => {
    const kubeConfig = new KubeConfig()
    kubeConfig.loadFromOptions({
        clusters: [{ name: 'c', server: url, skipTLSVerify: true }],
        users: [{ name: 'u', token: 't' }],
        contexts: [{ name: 'x', cluster: 'c', user: 'u' }],
        currentContext: 'x'
    })
    return { kubeConfig }
}

const line = (type: string, object: unknown) => JSON.stringify({ type, object })
const until = async (condition: () => boolean, ms = 3000): Promise<void> => {
    const end = Date.now() + ms
    while (!condition() && Date.now() < end) await new Promise(r => setTimeout(r, 20))
}
const silent = { info: () => { }, error: () => { } }

test('changes are delivered as they arrive, with their type', async () => {
    const api = await fakeApi([[line('ADDED', { kind: 'Pod', metadata: { name: 'a' } }), line('DELETED', { kind: 'Pod', metadata: { name: 'a' } }), 'KEEP']])
    const got: string[] = []
    const watcher = createResourceWatcher(clusterInfoFor(api.url), '/api/v1/pods', (type, obj) => { got.push(`${type} ${obj.metadata.name}`) }, { log: silent })
    await until(() => got.length === 2)
    watcher.stop()
    await api.close()
    assert.deepEqual(got, ['ADDED a', 'DELETED a'])
    assert.ok(api.requests[0].startsWith('/api/v1/pods?'), api.requests[0])
    assert.ok(api.requests[0].includes('watch=true'))
})

test('an object without metadata is not delivered', async () => {
    const api = await fakeApi([[line('ADDED', { kind: 'Status' }), line('ADDED', { kind: 'Pod', metadata: { name: 'b' } }), 'KEEP']])
    const got: string[] = []
    const watcher = createResourceWatcher(clusterInfoFor(api.url), '/api/v1/pods', (_type, obj) => { got.push(obj.kind) }, { log: silent })
    await until(() => got.length >= 1)
    await new Promise(r => setTimeout(r, 100))
    watcher.stop()
    await api.close()
    assert.deepEqual(got, ['Pod'])
})

test('when the server closes the watch it reconnects, and keeps delivering', async () => {
    const api = await fakeApi([
        [line('ADDED', { kind: 'Pod', metadata: { name: 'first' } })],
        [line('ADDED', { kind: 'Pod', metadata: { name: 'second' } }), 'KEEP']
    ])
    const got: string[] = []
    const watcher = createResourceWatcher(clusterInfoFor(api.url), '/api/v1/pods', (_type, obj) => { got.push(obj.metadata.name) }, { log: silent, initialWaitMs: 20 })
    await until(() => got.length === 2)
    watcher.stop()
    await api.close()
    assert.deepEqual(got, ['first', 'second'])
    assert.equal(api.requests.length, 2)
})

test('🔴 a watch that connects and closes without events never gives up: a quiet resource stays watched', async () => {
    // Every request connects and closes empty, as the API server does with a watch nobody's changes reach.
    // It used to count those, and gave up for ever after maxRetries of them.
    const api = await fakeApi([[]])
    let gaveUp = 0
    const watcher = createResourceWatcher(clusterInfoFor(api.url), '/api/v1/configmaps', () => { }, {
        maxRetries: 2, initialWaitMs: 10, onGiveUp: () => { gaveUp++ }, log: silent
    })
    await until(() => api.requests.length >= 6)
    watcher.stop()
    await api.close()
    assert.equal(gaveUp, 0)
    assert.ok(api.requests.length >= 6, `only ${api.requests.length} requests: it stopped reconnecting`)
})

test('after maxRetries failures to connect in a row it gives up, says so once, and stops', async () => {
    // every request fails: it never connects, so the count never resets
    const api = await fakeApi([['FAIL']])
    let gaveUp = 0
    const errors: string[] = []
    const watcher = createResourceWatcher(clusterInfoFor(api.url), '/api/v1/pods', () => { }, {
        maxRetries: 2, initialWaitMs: 10, onGiveUp: () => { gaveUp++ }, log: { info: () => { }, error: m => { errors.push(String(m)) } }
    })
    await until(() => gaveUp > 0)
    await new Promise(r => setTimeout(r, 100))
    await api.close()
    assert.equal(gaveUp, 1)
    assert.equal(watcher.stopped, true)
    // the first request plus two retries
    assert.equal(api.requests.length, 3)
    assert.ok(errors.some(e => e.includes('MAX RETRIES')))
})

test('stop() aborts the open request and does not reconnect', async () => {
    const api = await fakeApi([[line('ADDED', { kind: 'Pod', metadata: { name: 'a' } }), 'KEEP']])
    const got: string[] = []
    const watcher = createResourceWatcher(clusterInfoFor(api.url), '/api/v1/pods', (_type, obj) => { got.push(obj.metadata.name) }, { log: silent, initialWaitMs: 10 })
    await until(() => got.length === 1)
    watcher.stop()
    await new Promise(r => setTimeout(r, 150))
    assert.equal(watcher.stopped, true)
    // no second request: stopping is not a close to recover from
    assert.equal(api.requests.length, 1)
    await api.close()
})
