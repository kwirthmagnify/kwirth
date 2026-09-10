// Autostart del ANALISIS (no del channel). El channel lo arranca el core (a mano, por login o al
// restaurar un workspace); una vez arrancado, si el flag de autostart esta puesto se arranca el
// analisis de TODAS las configs activas, igual que pulsar Start en la topbar.
// El flag es uno solo para todo el canal y vive en su propia clave de storage.

import test from 'node:test'
import assert from 'node:assert/strict'
import { EInstanceConfigView } from '@kwirthmagnify/kwirth-common'
import CensorChannel from '../../src/back/index'
import { ECensorAssetState, ECensorCommand, ICensorInstanceConfig } from '../../src/common/CensorTypes'
import { MockWs, makeBackObj, makeClusterInfo, cmd, instanceConfigFor, sleep, IPodSpec } from '../helpers'

const AFTER_BROADCAST = 150
const STORAGE_KEY_AUTOSTART = 'censor-autostart'

const cfgOf = (over: Record<string, unknown> = {}): ICensorInstanceConfig => ({
    name: 'c1', version: '1', llmId: '', system: '', batchSize: 1000,
    exampleJson: '{"patterns":[""]}', temperature: 0.2, active: true,
    logstreamEnabled: true, logstreamAll: true, logstreamSources: [],
    ...over
})

interface IRunnerView {
    analyzing: boolean
    cfg: ICensorInstanceConfig
}
interface IInstanceView {
    analyzing: boolean
    assets: Array<{ pod: string, container: string, state: ECensorAssetState }>
    runners: Map<string, IRunnerView>
}
const getInstance = (ch: CensorChannel): IInstanceView =>
    (ch as unknown as { connections: Array<{ instances: IInstanceView[] }> }).connections[0].instances[0]

const PODS: IPodSpec[] = [
    { namespace: 'ns-a', pod: 'pod-a', containers: ['c1', 'c2'] },
    { namespace: 'ns-a', pod: 'pod-b', containers: ['c1'] }
]

// Arranque del channel: el core da de alta un objeto por container (vista namespace)
const startChannel = async (cfgs: ICensorInstanceConfig[], autoStart?: boolean, pods: IPodSpec[] = PODS) => {
    const { ci, calls } = makeClusterInfo(pods)
    const { obj, own } = makeBackObj()
    own.set('censor-configs', cfgs)
    if (autoStart !== undefined) own.set(STORAGE_KEY_AUTOSTART, autoStart)
    const ch = new CensorChannel(ci, obj as never)
    await ch.startChannel()
    const ws = new MockWs()
    const instanceConfig = instanceConfigFor('i1', EInstanceConfigView.NAMESPACE)
    for (const pod of pods) {
        for (const container of pod.containers) await ch.addObject(ws as never, instanceConfig as never, pod.namespace, pod.pod, container)
    }
    const teardown = () => ch.stopInstance(ws as never, instanceConfig as never)
    return { ch, ws, own, calls, instanceConfig, teardown }
}

const analyzingOf = (ws: MockWs, runnerKey: string): boolean | undefined => {
    const msgs = ws.of('analyzing').filter(m => m.runnerKey === runnerKey)
    return msgs.length > 0 ? msgs[msgs.length - 1].analyzing as boolean : undefined
}
const lastConfig = (ws: MockWs) => ws.last('config')

test('with autostart on, the analysis runs as soon as the channel starts, with no Start command', async (t) => {
    const { ch, ws, calls, teardown } = await startChannel([cfgOf()], true)
    t.after(teardown)
    await sleep(AFTER_BROADCAST)

    assert.equal(getInstance(ch).runners.get('c1:1')!.analyzing, true)
    assert.equal(getInstance(ch).analyzing, true, 'the instance must reflect that it is analyzing')
    assert.equal(analyzingOf(ws, 'c1:1'), true, 'the front is told, so its Start button shows Stop')
    assert.equal(calls.length, 3, 'and the log streams are open')
    assert.ok(getInstance(ch).assets.every(a => a.state === ECensorAssetState.STREAMING))
})

test('with autostart off the channel starts but nothing analyzes', async (t) => {
    const { ch, ws, calls, teardown } = await startChannel([cfgOf()], false)
    t.after(teardown)
    await sleep(AFTER_BROADCAST)

    assert.equal(getInstance(ch).runners.get('c1:1')!.analyzing, false)
    assert.equal(getInstance(ch).analyzing, false)
    assert.equal(analyzingOf(ws, 'c1:1'), false)
    assert.equal(calls.length, 0, 'no log stream is opened')
})

test('with no flag stored at all, nothing analyzes (autostart is opt-in)', async (t) => {
    const { ch, calls, teardown } = await startChannel([cfgOf()])
    t.after(teardown)
    await sleep(AFTER_BROADCAST)

    assert.equal(getInstance(ch).analyzing, false)
    assert.equal(calls.length, 0)
})

test('autostart runs every ON config, and only those', async (t) => {
    const on1 = cfgOf({ name: 'on1' })
    const on2 = cfgOf({ name: 'on2' })
    const off = cfgOf({ name: 'off', active: false })
    const { ch, ws, teardown } = await startChannel([on1, on2, off], true)
    t.after(teardown)
    await sleep(AFTER_BROADCAST)

    assert.deepEqual([...getInstance(ch).runners.keys()].sort(), ['on1:1', 'on2:1'], 'an OFF config is not even seeded')
    assert.equal(getInstance(ch).runners.get('on1:1')!.analyzing, true)
    assert.equal(getInstance(ch).runners.get('on2:1')!.analyzing, true)
    assert.equal(analyzingOf(ws, 'on1:1'), true)
    assert.equal(analyzingOf(ws, 'on2:1'), true)
    assert.equal(analyzingOf(ws, 'off:1'), undefined)
})

test('autostart does not fire when no ON config has a source configured', async (t) => {
    const noSource = cfgOf({ logstreamEnabled: false, logstreamAll: false, businessSources: [] })
    const { ch, ws, calls, teardown } = await startChannel([noSource], true)
    t.after(teardown)
    await sleep(AFTER_BROADCAST)

    assert.equal(getInstance(ch).runners.get('c1:1')!.analyzing, false, 'it could not receive a single line')
    assert.equal(analyzingOf(ws, 'c1:1'), false)
    assert.equal(calls.length, 0)
})

test('a business-only config autostarts and opens no log stream', async (t) => {
    const businessOnly = cfgOf({
        logstreamEnabled: false, logstreamAll: false,
        businessSources: [{ space: 'orders', type: 'order.created', businessPath: 'data.text' }]
    })
    const { ch, calls, teardown } = await startChannel([businessOnly], true)
    t.after(teardown)
    await sleep(AFTER_BROADCAST)

    assert.equal(getInstance(ch).runners.get('c1:1')!.analyzing, true)
    assert.equal(calls.length, 0, 'business needs no log stream')
})

test('the Stop button still works over an autostarted analysis', async (t) => {
    const { ch, ws, calls, teardown } = await startChannel([cfgOf()], true)
    t.after(teardown)
    await sleep(AFTER_BROADCAST)
    assert.equal(calls.length, 3)

    await ch.processCommand(ws as never, cmd('i1', ECensorCommand.ANALYZESTOP) as never)
    await sleep(AFTER_BROADCAST)

    assert.equal(getInstance(ch).runners.get('c1:1')!.analyzing, false)
    assert.ok(calls.every(c => c.aborted), 'the streams are aborted')
    assert.equal(getInstance(ch).assets.length, 3, 'and the inventory stays')
})

test('the flag reaches the front in the config message and is persisted by CONFIGSET', async (t) => {
    const { ch, ws, own, teardown } = await startChannel([cfgOf()], false)
    t.after(teardown)
    await sleep(AFTER_BROADCAST)
    assert.equal(lastConfig(ws)!.autoStart, false, 'the dialog needs to render the current value')

    const cfg = cfgOf()
    await ch.processCommand(ws as never, cmd('i1', ECensorCommand.CONFIGSET, { ...cfg, _llms: [], _allConfigs: [cfg], _autoStart: true }) as never)
    await sleep(AFTER_BROADCAST)

    assert.equal(own.get(STORAGE_KEY_AUTOSTART), true, 'persisted in its own storage key')
    assert.equal(lastConfig(ws)!.autoStart, true, 'and echoed back to the front')
})

test('CONFIGSET without the flag leaves the stored value untouched', async (t) => {
    const { ch, ws, own, teardown } = await startChannel([cfgOf()], true)
    t.after(teardown)
    await sleep(AFTER_BROADCAST)

    const cfg = cfgOf()
    await ch.processCommand(ws as never, cmd('i1', ECensorCommand.CONFIGSET, { ...cfg, _llms: [], _allConfigs: [cfg] }) as never)
    await sleep(AFTER_BROADCAST)

    assert.equal(own.get(STORAGE_KEY_AUTOSTART), true)
})
