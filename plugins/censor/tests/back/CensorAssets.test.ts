import test from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'stream'
import { EInstanceConfigView } from '@kwirthmagnify/kwirth-common'
import CensorChannel from '../../src/back/index'
import { ECensorAssetState, ECensorCommand, ICensorInstanceConfig } from '../../src/common/CensorTypes'
import { MockWs, makeBackObj, makeClusterInfo, cmd, instanceConfigFor, sleep, IPodSpec } from '../helpers'

// Tope de reintentos de reconexión del back (MAX_RECONNECT_ATTEMPTS en src/back/index.ts)
const MAX_RECONNECT_ATTEMPTS = 20
// El inventario se emite agrupado (ASSETS_BROADCAST_DELAY), así que hay que esperar más que eso
// para leer el último mensaje enviado al front
const AFTER_BROADCAST = 150

const logCfg = (over: Record<string, unknown> = {}): ICensorInstanceConfig => ({
    name: 'c1', version: '1', llmId: '', system: '', batchSize: 1000,
    exampleJson: '{"patterns":[""]}', temperature: 0.2, active: true,
    logstreamEnabled: true, logstreamAll: true, logstreamSources: [],
    ...over
})

// Vista de los internos del canal para asertar estado real (inventario, streams y runners)
interface IAssetView {
    namespace: string
    pod: string
    container: string
    state: ECensorAssetState
    reconnectAttempts: number
    runnerIds?: Set<string>
    passThroughStream?: PassThrough
}
interface IInstanceView {
    assets: IAssetView[]
    runners: Map<string, { analyzing: boolean }>
    scope?: string
}
const getInstance = (ch: CensorChannel): IInstanceView =>
    (ch as unknown as { connections: Array<{ instances: IInstanceView[] }> }).connections[0].instances[0]

const assetOf = (ch: CensorChannel, pod: string, container: string): IAssetView =>
    getInstance(ch).assets.find(a => a.pod === pod && a.container === container)!

const PODS: IPodSpec[] = [
    { namespace: 'ns-a', pod: 'pod-a', containers: ['c1', 'c2'] },
    { namespace: 'ns-a', pod: 'pod-b', containers: ['c1'] }
]

// Instancia resource (vista namespace): el core da de alta un objeto por container
const setupResource = async (cfgs: ICensorInstanceConfig[] = [logCfg()], pods: IPodSpec[] = PODS) => {
    const { ci, calls, setFailure } = makeClusterInfo(pods)
    const { obj, own, warnings } = makeBackObj()
    own.set('censor-configs', cfgs)
    const ch = new CensorChannel(ci, obj as never)
    await ch.startChannel()
    const ws = new MockWs()
    const instanceConfig = instanceConfigFor('i1', EInstanceConfigView.NAMESPACE)
    for (const pod of pods) {
        for (const container of pod.containers) await ch.addObject(ws as never, instanceConfig as never, pod.namespace, pod.pod, container)
    }
    const start = () => ch.processCommand(ws as never, cmd('i1', ECensorCommand.ANALYZESTART) as never)
    const stop = () => ch.processCommand(ws as never, cmd('i1', ECensorCommand.ANALYZESTOP) as never)
    // Sin teardown quedarían timers de reconexión vivos y el proceso de test no terminaría
    const teardown = () => ch.stopInstance(ws as never, instanceConfig as never)
    return { ch, ws, instanceConfig, calls, warnings, setFailure, start, stop, teardown }
}

// Instancia cluster: censor descubre los pods por su cuenta
const setupCluster = async (cfgs: ICensorInstanceConfig[] = [logCfg()], pods: IPodSpec[] = PODS) => {
    const { ci, calls, setFailure } = makeClusterInfo(pods)
    const { obj, own, warnings } = makeBackObj()
    own.set('censor-configs', cfgs)
    const ch = new CensorChannel(ci, obj as never)
    await ch.startChannel()
    const ws = new MockWs()
    const instanceConfig = instanceConfigFor('i1', EInstanceConfigView.CLUSTER)
    await ch.addObject(ws as never, instanceConfig as never, '*all', '*all', '*all')
    const teardown = () => ch.stopInstance(ws as never, instanceConfig as never)
    return { ch, ws, instanceConfig, calls, warnings, setFailure, teardown }
}

const assetsMessages = (ws: MockWs) => ws.of('assets')
const lastAssets = (ws: MockWs) => (ws.last('assets')?.assets ?? []) as Array<{ pod: string, container: string, state: ECensorAssetState }>

test('entering censor inventories the objects but opens no log stream (the analysis does)', async (t) => {
    const { ch, ws, calls, teardown } = await setupResource()
    t.after(teardown)
    await sleep(AFTER_BROADCAST)

    assert.equal(calls.length, 0, 'no log stream must be opened before the analysis starts')
    assert.equal(getInstance(ch).assets.length, 3)
    assert.ok(getInstance(ch).assets.every(a => a.state === ECensorAssetState.IDLE))
    assert.ok(getInstance(ch).assets.every(a => a.passThroughStream === undefined))
    assert.equal(lastAssets(ws).length, 3, 'the inventory reaches the front complete')
    assert.ok(lastAssets(ws).every(a => a.state === ECensorAssetState.IDLE))
})

test('the inventory is broadcast coalesced: one message no matter how many objects', async (t) => {
    const { ws, teardown } = await setupResource()
    t.after(teardown)
    await sleep(AFTER_BROADCAST)

    assert.equal(assetsMessages(ws).length, 1, '3 containers must not produce 3 assets messages')
})

test('cluster discovery broadcasts the whole inventory in a single message', async (t) => {
    const { ch, ws, calls, teardown } = await setupCluster()
    t.after(teardown)
    await sleep(AFTER_BROADCAST)

    assert.equal(getInstance(ch).scope, 'cluster')
    assert.equal(getInstance(ch).assets.length, 3)
    assert.equal(calls.length, 0, 'discovery inventories, it does not stream')
    assert.equal(assetsMessages(ws).length, 1)
    assert.equal(lastAssets(ws).length, 3)
})

test('starting the analysis opens one stream per inventoried object', async (t) => {
    const { ch, ws, calls, start, teardown } = await setupResource()
    t.after(teardown)
    await start()
    await sleep(AFTER_BROADCAST)

    assert.equal(calls.length, 3)
    assert.deepEqual(calls.map(c => `${c.pod}/${c.container}`).sort(), ['pod-a/c1', 'pod-a/c2', 'pod-b/c1'])
    assert.ok(getInstance(ch).assets.every(a => a.state === ECensorAssetState.STREAMING))
    assert.ok(lastAssets(ws).every(a => a.state === ECensorAssetState.STREAMING))
})

test('streams are opened asking only for new lines, never for the historical tail', async (t) => {
    const { calls, start, teardown } = await setupResource()
    t.after(teardown)
    await start()
    await sleep(AFTER_BROADCAST)

    // tailLines traería la última línea vieja de CADA container al primer lote del LLM
    assert.ok(calls.every(c => c.opts.tailLines === undefined), 'no historical tail must be requested')
    assert.ok(calls.every(c => c.opts.sinceSeconds === 1), 'only lines from now on')
    assert.ok(calls.every(c => c.opts.follow === true))
})

test('a reconnection recovers the window lost during the outage', async (t) => {
    const { ch, calls, start, teardown } = await setupResource()
    t.after(teardown)
    await start()
    await sleep(AFTER_BROADCAST)

    assetOf(ch, 'pod-b', 'c1').passThroughStream!.end()
    await sleep(1200)

    assert.equal(calls.length, 4)
    assert.ok(calls[3].opts.sinceSeconds! >= 1, 'the reconnection must ask for the gap, not for the whole history')
    assert.ok(calls[3].opts.sinceSeconds! <= 5, 'and only for the gap')
    assert.equal(calls[3].opts.tailLines, undefined)
})

test('a stop and a later start analyze from the restart, not from the stopped window', async (t) => {
    const { calls, start, stop, teardown } = await setupResource()
    t.after(teardown)
    await start()
    await sleep(AFTER_BROADCAST)
    await stop()
    await sleep(1200)
    await start()
    await sleep(AFTER_BROADCAST)

    assert.equal(calls.length, 6)
    assert.ok(calls.slice(3).every(c => c.opts.sinceSeconds === 1), 'a deliberate stop must not be recovered')
})

test('a premature stream close keeps the object and reconnects it', async (t) => {
    const { ch, ws, calls, start, teardown } = await setupResource()
    t.after(teardown)
    await start()
    await sleep(AFTER_BROADCAST)
    ws.clear()

    // El cliente de k8s cierra el PassThrough cuando el body HTTP se corta (habitual con follow)
    assetOf(ch, 'pod-b', 'c1').passThroughStream!.end()
    await sleep(AFTER_BROADCAST)

    assert.equal(getInstance(ch).assets.length, 3, 'the object must NOT be dropped from the inventory')
    assert.equal(assetOf(ch, 'pod-b', 'c1').state, ECensorAssetState.RECONNECTING)
    assert.equal(lastAssets(ws).length, 3)
    assert.equal(lastAssets(ws).find(a => a.pod === 'pod-b')!.state, ECensorAssetState.RECONNECTING)
    assert.equal(calls.length, 3, 'no reconnection before the backoff elapses')

    // Primer reintento del backoff (1s)
    await sleep(1200)
    assert.equal(calls.length, 4, 'the stream must be reopened')
    assert.equal(calls[3].pod, 'pod-b')
    assert.equal(assetOf(ch, 'pod-b', 'c1').state, ECensorAssetState.STREAMING)
})

test('a stream that fails to open keeps the object listed instead of dropping it', async (t) => {
    const { ch, ws, setFailure, start, teardown } = await setupResource()
    t.after(teardown)
    setFailure(new Error('pod is not ready'))
    await start()
    await sleep(AFTER_BROADCAST)

    assert.equal(getInstance(ch).assets.length, 3, 'a failed open must not remove the object')
    assert.ok(getInstance(ch).assets.every(a => a.state === ECensorAssetState.RECONNECTING))
    assert.equal(lastAssets(ws).length, 3)
})

test('giving up on a stream marks it failed and still keeps it in the inventory', async (t) => {
    const { ch, ws, warnings, start, teardown } = await setupResource()
    t.after(teardown)
    await start()
    await sleep(AFTER_BROADCAST)

    const asset = assetOf(ch, 'pod-b', 'c1')
    asset.reconnectAttempts = MAX_RECONNECT_ATTEMPTS
    asset.passThroughStream!.end()
    await sleep(AFTER_BROADCAST)

    assert.equal(asset.state, ECensorAssetState.FAILED)
    assert.equal(getInstance(ch).assets.length, 3)
    assert.equal(lastAssets(ws).find(a => a.pod === 'pod-b')!.state, ECensorAssetState.FAILED)
    assert.ok(warnings.some(w => w.includes('giving up on log stream')), 'the give-up must be logged')
})

test('stopping the analysis aborts the requests and keeps the inventory', async (t) => {
    const { ch, ws, calls, start, stop, teardown } = await setupResource()
    t.after(teardown)
    await start()
    await sleep(AFTER_BROADCAST)
    await stop()
    await sleep(AFTER_BROADCAST)

    assert.ok(calls.every(c => c.aborted), 'every log request must be aborted, not left dangling')
    assert.equal(getInstance(ch).assets.length, 3, 'the inventory survives a stop')
    assert.ok(getInstance(ch).assets.every(a => a.state === ECensorAssetState.IDLE))
    assert.ok(getInstance(ch).assets.every(a => a.passThroughStream === undefined))
    assert.ok(lastAssets(ws).every(a => a.state === ECensorAssetState.IDLE))
})

test('restarting the analysis reopens the streams of the same inventory', async (t) => {
    const { ch, calls, start, stop, teardown } = await setupResource()
    t.after(teardown)
    await start()
    await sleep(AFTER_BROADCAST)
    await stop()
    await sleep(50)
    await start()
    await sleep(AFTER_BROADCAST)

    assert.equal(calls.length, 6, '3 streams opened, closed and opened again')
    assert.ok(getInstance(ch).assets.every(a => a.state === ECensorAssetState.STREAMING))
})

test('a deleted pod leaves the inventory and its stream is aborted', async (t) => {
    const { ch, calls, start, teardown } = await setupResource()
    t.after(teardown)
    await start()
    await sleep(AFTER_BROADCAST)

    ch.processProviderEvent('events', {
        type: 'DELETED',
        obj: { kind: 'Pod', metadata: { name: 'pod-b', namespace: 'ns-a' }, spec: { containers: [{ name: 'c1' }] } }
    })
    await sleep(AFTER_BROADCAST)

    assert.equal(getInstance(ch).assets.length, 2)
    assert.ok(!getInstance(ch).assets.some(a => a.pod === 'pod-b'))
    assert.ok(calls.find(c => c.pod === 'pod-b')!.aborted)
})

test('an object only matched by the second active config survives the runner sync', async (t) => {
    // El pod entra por evento de cluster (que no filtra), así que nace sin runner que lo cubra
    const other = logCfg({ name: 'other', version: '1', logstreamAll: false, logstreamSources: [{ namespace: 'ns-zzz' }] })
    const { ch, ws, teardown } = await setupCluster([other], [])
    t.after(teardown)
    ch.processProviderEvent('events', {
        type: 'ADDED',
        obj: { kind: 'Pod', metadata: { name: 'pod-late', namespace: 'ns-a' }, spec: { containers: [{ name: 'c1' }] } }
    })
    await sleep(AFTER_BROADCAST)
    assert.equal(getInstance(ch).assets.length, 1)

    // Llega una segunda config activa que sí cubre ese pod: la purga de huérfanos no debe ejecutarse
    // hasta haber sincronizado TODOS los runners
    const covering = logCfg({ name: 'covering', version: '1', logstreamAll: false, logstreamSources: [{ namespace: 'ns-a' }] })
    await ch.processCommand(ws as never, cmd('i1', ECensorCommand.CONFIGSET, { ...covering, _llms: [], _allConfigs: [other, covering] }) as never)
    await sleep(AFTER_BROADCAST)

    assert.equal(getInstance(ch).assets.length, 1, 'the object must survive the sync')
    assert.ok(assetOf(ch, 'pod-late', 'c1').runnerIds!.has('covering:1'))
})

test('an object matched by no active config leaves a cluster inventory', async (t) => {
    const { ch, ws, teardown } = await setupCluster()
    t.after(teardown)
    await sleep(AFTER_BROADCAST)
    assert.equal(getInstance(ch).assets.length, 3)

    const unrelated = logCfg({ logstreamAll: false, logstreamSources: [{ namespace: 'ns-zzz' }] })
    await ch.processCommand(ws as never, cmd('i1', ECensorCommand.CONFIGSET, { ...unrelated, _llms: [], _allConfigs: [unrelated] }) as never)
    await sleep(AFTER_BROADCAST)

    assert.equal(getInstance(ch).assets.length, 0)
    assert.equal(lastAssets(ws).length, 0)
})
