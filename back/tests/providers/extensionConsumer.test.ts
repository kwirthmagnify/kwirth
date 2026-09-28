// ANY extension consuming a provider — senders, webhooks, homepages, IdPs — through one door, with an
// identity the CORE writes. What is pinned down: the stamp wins over shape (a sender and a provider both
// carry a bare `id`), it is written once and cannot be rewritten, the required providers get
// instantiated, the access handed over is bound to the very instance, and a second pass is harmless.

import test from 'node:test'
import assert from 'node:assert/strict'
import { consumerIdOf, consumerIdFor, stampConsumerId, stampedConsumerId, wireExtensionConsumers, KWIRTH_CONSUMER_ID, IExtensionWiringDeps, IWireableExtension } from '../../src/providers/Consumer'
import { IProviderAccess, IProviderHandle } from '@kwirthmagnify/kwirth-common-back'

interface ICalls {
    instantiated: string[]
    warnings: string[]
    errors: string[]
    handles: Array<{ providerId: string, consumer: unknown }>
}

const fakeDeps = (present: string[], registered: string[]): { deps: IExtensionWiringDeps, calls: ICalls } => {
    const calls: ICalls = { instantiated: [], warnings: [], errors: [], handles: [] }
    const running = new Set(present)
    const deps: IExtensionWiringDeps = {
        isPresent: id => running.has(id),
        isRegistered: id => registered.includes(id),
        instantiate: async (id, consumerId) => { calls.instantiated.push(`${id}<-${consumerId}`); running.add(id); return { id } },
        getProvider: (providerId, consumer) => { calls.handles.push({ providerId, consumer }); return running.has(providerId) ? { id: providerId } as unknown as IProviderHandle : undefined },
        warn: m => calls.warnings.push(m),
        error: (c, err) => calls.errors.push(`${c}: ${err}`)
    }
    return { deps, calls }
}

test('the stamp wins over the shape: a sender is not a provider even though both carry an id', () => {
    const sender = { id: 'ses' }
    assert.equal(consumerIdOf(sender as never), 'provider:ses', 'unstamped, a bare id reads as a provider')
    stampConsumerId(sender, consumerIdFor('sender', 'ses'))
    assert.equal(consumerIdOf(sender as never), 'sender:ses')
})

test('the stamp is read-only and does not leak into a JSON dump', () => {
    const webhook = { id: 'gitlab' } as Record<string, unknown>
    stampConsumerId(webhook, 'webhook:gitlab')
    assert.equal(JSON.stringify(webhook), '{"id":"gitlab"}')
    assert.throws(() => { 'use strict'; webhook[KWIRTH_CONSUMER_ID] = 'excubitor' })
    assert.equal(stampedConsumerId(webhook), 'webhook:gitlab')
})

test('wiring stamps the instance, instantiates what it consumes, and hands it an access bound to itself', async () => {
    const { deps, calls } = fakeDeps([], ['cloud-config'])
    let received: IProviderAccess | undefined
    const ses: IWireableExtension = { id: 'ses', requirements: { providers: ['cloud-config'] }, onProvidersReady: access => { received = access } }
    const wired = await wireExtensionConsumers('sender', [ses], deps)
    assert.equal(wired, 1)
    assert.equal(stampedConsumerId(ses), 'sender:ses')
    assert.deepEqual(calls.instantiated, ['cloud-config<-sender:ses'])
    // The access asks the core on behalf of THIS instance: the producer will read its stamp.
    assert.ok(received)
    assert.deepEqual(received!.getProvider('cloud-config'), { id: 'cloud-config' })
    assert.equal(calls.handles[0].consumer, ses)
})

test('a required provider that is not installed is a warning, and the extension is still wired', async () => {
    const { deps, calls } = fakeDeps([], [])
    let called = false
    const wh: IWireableExtension = { id: 'gitlab', requirements: { providers: ['cloud-config'] }, onProvidersReady: () => { called = true } }
    await wireExtensionConsumers('webhook', [wh], deps)
    assert.equal(called, true)
    assert.equal(calls.instantiated.length, 0)
    assert.ok(calls.warnings.some(w => w.includes('webhook:gitlab') && w.includes('cloud-config')))
})

test('a provider already running is not instantiated again', async () => {
    const { deps, calls } = fakeDeps(['cloud-config'], ['cloud-config'])
    await wireExtensionConsumers('sender', [{ id: 'ses', requirements: { providers: ['cloud-config'] }, onProvidersReady: () => {} }], deps)
    assert.equal(calls.instantiated.length, 0)
})

test('🔴 a second pass over the same instance does nothing: startup and a later birth cannot double-wire', async () => {
    const { deps, calls } = fakeDeps([], ['cloud-config'])
    let times = 0
    const ses: IWireableExtension = { id: 'ses', requirements: { providers: ['cloud-config'] }, onProvidersReady: () => { times++ } }
    await wireExtensionConsumers('sender', [ses], deps)
    await wireExtensionConsumers('sender', [ses], deps)
    assert.equal(times, 1)
    assert.equal(calls.instantiated.length, 1)
})

test('an extension with nothing to wire is stamped anyway, and counts as wired for the next pass', async () => {
    const { deps } = fakeDeps([], [])
    const plain: IWireableExtension = { id: 'teams' }
    assert.equal(await wireExtensionConsumers('sender', [plain], deps), 0)
    assert.equal(stampedConsumerId(plain), 'sender:teams')
})

test('one extension failing does not take the rest down', async () => {
    const { deps, calls } = fakeDeps([], [])
    let secondCalled = false
    await wireExtensionConsumers('sender', [
        { id: 'broken', onProvidersReady: () => { throw new Error('boom') } },
        { id: 'fine', onProvidersReady: () => { secondCalled = true } }
    ], deps)
    assert.equal(secondCalled, true)
    assert.ok(calls.errors.some(e => e.startsWith('sender:broken')))
})

test('pluvider ids in requirements are skipped: a pluvider exists when its plugin does', async () => {
    const { deps, calls } = fakeDeps([], [])
    await wireExtensionConsumers('homepage', [{ id: 'status', requirements: { providers: ['plugin:agora'] } }], deps)
    assert.equal(calls.warnings.length, 0)
    assert.equal(calls.instantiated.length, 0)
})

test('junk in the list is ignored', async () => {
    const { deps } = fakeDeps([], [])
    assert.equal(await wireExtensionConsumers('sender', [undefined as never, { id: '' } as never, null as never], deps), 0)
})
