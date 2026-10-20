import { test } from 'node:test'
import assert from 'node:assert/strict'
import { socketsToCloseOnReload } from '../../src/tools/ChannelReload'

/*
    Which sockets a hot-reload is allowed to close.

    The rule exists because of a real failure (2026-10-20). Reloading a plugin replaced its channel and
    left the live sockets attached to an instance that no longer existed: the browser never saw an
    `onclose`, so it never re-handshaked, its commands reached a channel that did not know them, and no
    data came back — all broadcasts walk the channel's connections, and those were empty. From the screen
    it looked like the back had stopped answering, with nothing in the log.

    Closing them fixes it. What this test pins down is the OTHER half, the one that is easy to get wrong
    and impossible to notice: a socket shared with another channel must survive. Closing it would drop a
    tab that has nothing to do with the plugin being reloaded.
*/

test('the sockets of the reloaded channel are closed', () => {
    assert.deepEqual(socketsToCloseOnReload(['a', 'b'], () => false), ['a', 'b'])
})

test('🔴 a socket still served by another channel is left alone', () => {
    const shared = 'shared-with-logs'
    assert.deepEqual(socketsToCloseOnReload(['a', shared, 'b'], s => s === shared), ['a', 'b'])
})

test('a reload with nothing connected closes nothing', () => {
    assert.deepEqual(socketsToCloseOnReload([], () => false), [])
})

test('if every socket is shared, none is closed', () => {
    assert.deepEqual(socketsToCloseOnReload(['a', 'b'], () => true), [])
})
