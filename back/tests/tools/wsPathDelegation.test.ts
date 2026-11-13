// WebSockets by path (B1): which channel, if any, takes a WS upgrade. Anything not claimed must go on as
// always — so most of what is checked here is that the core's own sockets are NEVER picked out.

import test from 'node:test'
import assert from 'node:assert/strict'
import { IChannel } from '@kwirthmagnify/kwirth-common-back'
import { pathWebsocketChannel } from '../../src/tools/WsPathDelegation'

// Only what the delegation reads: the router members and whether pathWebsocketRequest exists.
const channel = (alias: string | undefined, claims: boolean, providesRouter = true): IChannel =>
    ({ providesRouter, router: {}, routerAlias: alias, ...(claims ? { pathWebsocketRequest: () => {} } : {}) }) as unknown as IChannel

const RELAY = channel('relay', true)

test('a WS under /channel/<alias>/ goes to the channel that claims it, with or without a root path', () => {
    assert.equal(pathWebsocketChannel('/channel/relay/x/u1', '', [RELAY]), RELAY)
    assert.equal(pathWebsocketChannel('/kwirth/channel/relay/x/u1?a=1', '/kwirth', [RELAY]), RELAY)
    assert.equal(pathWebsocketChannel('/kwirth/channel/relay', '/kwirth/', [RELAY]), RELAY)
})

test('the core\'s own sockets are never picked out', () => {
    for (const url of ['/', '/kwirth', '/kwirth/', '/kwirth?challenge=abc', '/kwirth/channel', '/kwirth/channel/', undefined]) {
        assert.equal(pathWebsocketChannel(url, '/kwirth', [RELAY]), undefined, String(url))
    }
})

test('by segments: /channel/relay2 is not /channel/relay', () => {
    assert.equal(pathWebsocketChannel('/channel/relay2/x', '', [RELAY]), undefined)
})

test('the channel must implement pathWebsocketRequest and really mount its router at that alias', () => {
    assert.equal(pathWebsocketChannel('/channel/relay/x', '', [channel('relay', false)]), undefined)
    assert.equal(pathWebsocketChannel('/channel/relay/x', '', [channel('relay', true, false)]), undefined)
    assert.equal(pathWebsocketChannel('/channel/relay/x', '', [channel(undefined, true)]), undefined)
    assert.equal(pathWebsocketChannel('/channel/relay/x', '', [channel('other', true)]), undefined)
})

test('a path under another root path is not this Kwirth\'s', () => {
    assert.equal(pathWebsocketChannel('/other/channel/relay/x', '/kwirth', [RELAY]), undefined)
})
