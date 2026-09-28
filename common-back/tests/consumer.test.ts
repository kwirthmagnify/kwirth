import test from 'node:test'
import assert from 'node:assert/strict'
import { KWIRTH_CONSUMER_ID, consumerIdOf, consumerIdFor, stampConsumerId } from '../src/Consumer'

/*
    Who is consuming a provider. The rule a PRODUCER applies to name whoever subscribed — the same one
    the core applies in its registry — so a producer that keeps one credential per consumer can tell who
    is asking, and cannot be fooled by a consumer claiming to be somebody else.
*/

test('the stamp the core wrote wins over any shape', () => {
    const sender = { id: 'ses', getChannelData: () => ({ id: 'not-me' }) }
    stampConsumerId(sender, consumerIdFor('sender', 'ses'))
    assert.equal(consumerIdOf(sender), 'sender:ses')
})

test('the stamp is not enumerable: it does not leak into JSON or into a spread', () => {
    const webhook = { id: 'gitlab' }
    stampConsumerId(webhook, consumerIdFor('webhook', 'gitlab'))
    assert.equal(JSON.stringify(webhook), '{"id":"gitlab"}')
    assert.equal((webhook as Record<string, unknown>)[KWIRTH_CONSUMER_ID], 'webhook:gitlab')
})

test('🔴 an extension cannot overwrite the stamp the core wrote', () => {
    const idp = { id: 'cognito' } as Record<string, unknown>
    stampConsumerId(idp, consumerIdFor('idp', 'cognito'))
    assert.throws(() => { 'use strict'; idp[KWIRTH_CONSUMER_ID] = 'excubitor' })
    assert.equal(consumerIdOf(idp), 'idp:cognito')
})

test('without a stamp, a channel is known by its bare id', () => {
    assert.equal(consumerIdOf({ getChannelData: () => ({ id: 'excubitor' }) }), 'excubitor')
})

test('without a stamp, a pluvider (a channel that also carries an id) is a channel', () => {
    assert.equal(consumerIdOf({ id: 'agora', getChannelData: () => ({ id: 'agora' }) }), 'agora')
})

test('without a stamp, a bare id is a provider wired by an older core', () => {
    assert.equal(consumerIdOf({ id: 'aws' }), 'provider:aws')
})

test('every family gets its prefix', () => {
    assert.equal(consumerIdFor('homepage', 'status'), 'homepage:status')
    assert.equal(consumerIdFor('login', 'sso'), 'login:sso')
    assert.equal(consumerIdFor('provider', 'azure'), 'provider:azure')
})

test('a consumer that cannot name itself is undefined, not a guess', () => {
    assert.equal(consumerIdOf({}), undefined)
    assert.equal(consumerIdOf(undefined), undefined)
    assert.equal(consumerIdOf('excubitor'), undefined)
    assert.equal(consumerIdOf({ getChannelData: () => undefined }), undefined)
    assert.equal(consumerIdOf({ id: '' }), undefined)
})
