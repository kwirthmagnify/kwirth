import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

/*
    Harness tests for the Rally-X back channel.

    These verify the static contract: the channelId, the requirements, the
    channel data shape, and the instance/connection accounting. The back is
    imported as a CJS default export (the build output format).
*/

// The back channel is a CJS module that expects the kwirth-common globals.
// We import the source directly — esbuild has externalized the kwirth-common
// packages, and node:test resolves them from node_modules.
import { default as RallyxBackChannel } from '../src/back/index.ts'

describe('RallyxBackChannel — static contract', () => {
    const createChannel = () => {
        const channel = new (RallyxBackChannel as any)({}, {
            writeStorage: async () => { },
            readStorage: async () => [],
            logError: () => { },
            logWarning: () => { },
            senders: { send: () => Promise.resolve() },
        })
        return channel
    }

    it('channelId is "rallyx"', () => {
        const channel = createChannel()
        assert.equal(channel.channelId, 'rallyx')
    })

    it('requires storage', () => {
        const channel = createChannel()
        assert.equal(channel.requirements.storage, true)
    })

    it('channel data is an autonomous channel', () => {
        const channel = createChannel()
        const data = channel.getChannelData()
        assert.equal(data.id, 'rallyx')
        assert.equal(data.routable, false)
        assert.equal(data.pauseable, true)
        assert.equal(data.cluster, false)
        assert.equal(data.resourced, false)
        assert.equal(data.websocket, false)
        assert.deepEqual(data.endpoints, [])
    })

    it('starts with zero instances and connections', () => {
        const channel = createChannel()
        const instances = channel.getInstances()
        assert.equal(instances.instances, 0)
        assert.equal(instances.connections, 0)
    })

    it('containsInstance returns false for unknown id', () => {
        const channel = createChannel()
        assert.equal(channel.containsInstance('unknown'), false)
    })

    it('containsConnection returns false for unknown socket', () => {
        const channel = createChannel()
        assert.equal(channel.containsConnection({} as WebSocket), false)
    })
})
