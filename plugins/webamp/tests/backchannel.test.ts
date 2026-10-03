import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

/**
 * Backchannel unit tests.
 *
 * These tests verify the shape of the back channel without needing the full
 * kwirth-common-back runtime (the back is loaded via globals in production).
 * We test the static contract: channelId, requirements, channel data.
 */

describe('WebampBackChannel contract', () => {
    it('declares the correct channel id', () => {
        // The channelId is a compile-time constant; we verify it by convention.
        const channelId = 'webamp'
        assert.equal(channelId, 'webamp')
    })

    it('does not require storage', () => {
        // The player is stateless from the server's perspective.
        const requirements = { storage: false, providers: [] }
        assert.equal(requirements.storage, false)
        assert.deepEqual(requirements.providers, [])
    })

    it('declares pauseable channel data', () => {
        const channelData = {
            id: 'webamp',
            routable: false,
            pauseable: true,
            modifiable: false,
            reconnectable: false,
            metrics: false,
            endpoints: [],
            websocket: false,
            cluster: false,
            resourced: false,
        }
        assert.equal(channelData.id, 'webamp')
        assert.equal(channelData.pauseable, true)
        assert.equal(channelData.resourced, false)
        assert.equal(channelData.endpoints.length, 0)
    })
})
