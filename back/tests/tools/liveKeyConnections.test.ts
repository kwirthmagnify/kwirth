// K1: deleting an access key cuts the live instances started with it. The index must cut exactly those —
// never an instance of another key, never a socket that still carries one — and forget what the channels
// already let go of.

import test from 'node:test'
import assert from 'node:assert/strict'
import { IChannel } from '@kwirthmagnify/kwirth-common-back'
import { ILiveKeyUse, KEY_REVOKED_CLOSE_CODE, LiveKeyConnections } from '../../src/tools/LiveKeyConnections'

interface IFakeSocket {
    socket: WebSocket
    closes: number[]
}

const fakeSocket = (): IFakeSocket => {
    const closes: number[] = []
    const socket = { close: (code: number) => { closes.push(code) } } as unknown as WebSocket
    return { socket, closes }
}

interface IFakeChannel {
    channel: IChannel
    instances: Set<string>
    removed: string[]
}

// Only what the index uses: containsInstance and removeInstance
const fakeChannel = (...instanceIds: string[]): IFakeChannel => {
    const instances = new Set(instanceIds)
    const removed: string[] = []
    const channel = {
        containsInstance: (id: string) => instances.has(id),
        removeInstance: (_ws: WebSocket, id: string) => { removed.push(id); instances.delete(id) }
    } as unknown as IChannel
    return { channel, instances, removed }
}

const channelsOf = (entries: [string, IFakeChannel][]): Map<string, IChannel> => new Map(entries.map(([id, c]) => [id, c.channel]))

test('revoking a key cuts its instances, tells each one, and closes a socket left with nothing', () => {
    const ws = fakeSocket()
    const log = fakeChannel('i1', 'i2')
    const channels = channelsOf([['log', log]])
    const index = new LiveKeyConnections()
    index.register('k1', { ws: ws.socket, channelId: 'log', instanceId: 'i1' })
    index.register('k1', { ws: ws.socket, channelId: 'log', instanceId: 'i2' })

    const told: ILiveKeyUse[] = []
    assert.equal(index.revoke('k1', channels, use => told.push(use)), 2)
    assert.deepEqual(told.map(u => u.instanceId), ['i1', 'i2'])
    assert.deepEqual(log.removed, ['i1', 'i2'])
    assert.deepEqual(ws.closes, [KEY_REVOKED_CLOSE_CODE])
    assert.deepEqual(index.usesOf('k1'), [])
})

test('a socket shared with another key stays open, and the other key\'s instance is untouched', () => {
    const ws = fakeSocket()
    const log = fakeChannel('mine', 'theirs')
    const channels = channelsOf([['log', log]])
    const index = new LiveKeyConnections()
    index.register('k1', { ws: ws.socket, channelId: 'log', instanceId: 'mine' })
    index.register('k2', { ws: ws.socket, channelId: 'log', instanceId: 'theirs' })

    assert.equal(index.revoke('k1', channels, () => {}), 1)
    assert.deepEqual(log.removed, ['mine'])
    assert.deepEqual(ws.closes, [])
    assert.equal(index.usesOf('k2').length, 1)
    assert.equal(index.carries(ws.socket), true)
})

test('a key with no live instance cuts nothing and closes nothing', () => {
    const ws = fakeSocket()
    const log = fakeChannel('i1')
    const index = new LiveKeyConnections()
    index.register('k1', { ws: ws.socket, channelId: 'log', instanceId: 'i1' })
    assert.equal(index.revoke('other', channelsOf([['log', log]]), () => { throw new Error('must not be told') }), 0)
    assert.deepEqual(log.removed, [])
    assert.deepEqual(ws.closes, [])
})

test('a STOPped instance is forgotten: revoking its key afterwards does not touch the socket', () => {
    const ws = fakeSocket()
    const log = fakeChannel('i1')
    const index = new LiveKeyConnections()
    index.register('k1', { ws: ws.socket, channelId: 'log', instanceId: 'i1' })
    index.unregister('log', 'i1')
    assert.equal(index.revoke('k1', channelsOf([['log', log]]), () => {}), 0)
    assert.deepEqual(ws.closes, [])
})

test('when a socket closes, its uses the channels let go of are pruned (non-reconnectable, uninstalled)', () => {
    const ws = fakeSocket()
    const log = fakeChannel('alive')
    const channels = channelsOf([['log', log]])
    const index = new LiveKeyConnections()
    index.register('k1', { ws: ws.socket, channelId: 'log', instanceId: 'alive' })
    index.register('k1', { ws: ws.socket, channelId: 'log', instanceId: 'gone' })
    index.register('k1', { ws: ws.socket, channelId: 'uninstalled', instanceId: 'x' })
    index.prune(channels, ws.socket)
    assert.deepEqual(index.usesOf('k1').map(u => u.instanceId), ['alive'])
})

test('closing a socket never prunes ANOTHER socket\'s instance the channel does not hold yet (a pod view with no pods)', () => {
    const closing = fakeSocket()
    const other = fakeSocket()
    const log = fakeChannel()
    const index = new LiveKeyConnections()
    index.register('k1', { ws: other.socket, channelId: 'log', instanceId: 'waiting-for-pods' })
    index.prune(channelsOf([['log', log]]), closing.socket)
    assert.equal(index.revoke('k1', channelsOf([['log', log]]), () => {}), 1)
    assert.deepEqual(other.closes, [KEY_REVOKED_CLOSE_CODE])
})

test('an accepted instance its channel does not hold yet is cut too', () => {
    const ws = fakeSocket()
    const log = fakeChannel()
    const index = new LiveKeyConnections()
    index.register('k1', { ws: ws.socket, channelId: 'log', instanceId: 'accepted' })
    const told: ILiveKeyUse[] = []
    assert.equal(index.revoke('k1', channelsOf([['log', log]]), use => told.push(use)), 1)
    assert.equal(told.length, 1)
    assert.deepEqual(ws.closes, [KEY_REVOKED_CLOSE_CODE])
})

test('a closed extra socket leaves its instance; the instance\'s other extra sockets stay', () => {
    const main = fakeSocket()
    const extraA = fakeSocket()
    const extraB = fakeSocket()
    const ops = fakeChannel('i1')
    const channels = channelsOf([['ops', ops]])
    const index = new LiveKeyConnections()
    index.register('k1', { ws: main.socket, channelId: 'ops', instanceId: 'i1' })
    index.attachSocket('ops', 'i1', extraA.socket)
    index.attachSocket('ops', 'i1', extraB.socket)
    index.prune(channels, extraA.socket)
    index.revoke('k1', channels, () => {})
    assert.deepEqual(extraA.closes, [])
    assert.deepEqual(extraB.closes, [KEY_REVOKED_CLOSE_CODE])
})

test('a RECONNECT moves the instance to its new socket: the revoke closes the new one, not the old', () => {
    const oldWs = fakeSocket()
    const newWs = fakeSocket()
    const log = fakeChannel('i1')
    const index = new LiveKeyConnections()
    index.register('k1', { ws: oldWs.socket, channelId: 'log', instanceId: 'i1' })
    index.register('k1', { ws: newWs.socket, channelId: 'log', instanceId: 'i1' })
    assert.equal(index.usesOf('k1').length, 1)
    assert.equal(index.revoke('k1', channelsOf([['log', log]]), () => {}), 1)
    assert.deepEqual(newWs.closes, [KEY_REVOKED_CLOSE_CODE])
    assert.deepEqual(oldWs.closes, [])
})

test('an instance reattached under another key belongs to that key only', () => {
    const ws = fakeSocket()
    const log = fakeChannel('i1')
    const index = new LiveKeyConnections()
    index.register('k1', { ws: ws.socket, channelId: 'log', instanceId: 'i1' })
    index.register('k2', { ws: ws.socket, channelId: 'log', instanceId: 'i1' })
    assert.equal(index.revoke('k1', channelsOf([['log', log]]), () => {}), 0)
    assert.equal(index.usesOf('k2').length, 1)
})

test('the extra (challenge) sockets of a cut instance are closed but never told', () => {
    const main = fakeSocket()
    const extra = fakeSocket()
    const ops = fakeChannel('i1')
    const index = new LiveKeyConnections()
    index.register('k1', { ws: main.socket, channelId: 'ops', instanceId: 'i1' })
    index.attachSocket('ops', 'i1', extra.socket)
    const told: ILiveKeyUse[] = []
    index.revoke('k1', channelsOf([['ops', ops]]), use => told.push(use))
    assert.deepEqual(told.map(u => u.ws), [main.socket])
    assert.deepEqual(extra.closes, [KEY_REVOKED_CLOSE_CODE])
    assert.deepEqual(main.closes, [KEY_REVOKED_CLOSE_CODE])
})

test('the extra sockets of an instance of ANOTHER key are left alone', () => {
    const ws = fakeSocket()
    const extra = fakeSocket()
    const ops = fakeChannel('mine', 'theirs')
    const index = new LiveKeyConnections()
    index.register('k1', { ws: ws.socket, channelId: 'ops', instanceId: 'mine' })
    index.register('k2', { ws: ws.socket, channelId: 'ops', instanceId: 'theirs' })
    index.attachSocket('ops', 'theirs', extra.socket)
    index.revoke('k1', channelsOf([['ops', ops]]), () => {})
    assert.deepEqual(extra.closes, [])
})

test('a notify that throws (socket already gone) does not stop the cut', () => {
    const ws = fakeSocket()
    const log = fakeChannel('i1', 'i2')
    const index = new LiveKeyConnections()
    index.register('k1', { ws: ws.socket, channelId: 'log', instanceId: 'i1' })
    index.register('k1', { ws: ws.socket, channelId: 'log', instanceId: 'i2' })
    assert.equal(index.revoke('k1', channelsOf([['log', log]]), () => { throw new Error('closed') }), 2)
    assert.deepEqual(log.removed, ['i1', 'i2'])
})

test('nothing without a key id or an instance id is registered', () => {
    const ws = fakeSocket()
    const index = new LiveKeyConnections()
    index.register('', { ws: ws.socket, channelId: 'log', instanceId: 'i1' })
    index.register('k1', { ws: ws.socket, channelId: 'log', instanceId: '' })
    assert.equal(index.carries(ws.socket), false)
})
