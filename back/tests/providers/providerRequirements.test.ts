// A provider that CONSUMES others declares them in 'requirements.providers', and the core instantiates
// them even when no channel asks for them. Before this, a producer that only another provider needed —
// no channel listing it, no router exposed— was never created, and the consumer got 'undefined' from
// getProvider() in onProvidersReady().
//
// What is pinned down: the set is closed TRANSITIVELY, nothing is created twice, cycles terminate, and
// the dependency stays soft (a missing id is reported, the rest carry on).

import test from 'node:test'
import assert from 'node:assert/strict'
import { IRequiringProvider, resolveConsumedProviders } from '../../src/providers/Consumer'

const prov = (id: string, ...consumes: string[]): IRequiringProvider =>
    consumes.length > 0 ? { id, requirements: { providers: consumes } } : { id }

/*
    A tiny fake of the core: 'registered' is what is installed, 'running' what is instantiated. The
    instantiate callback records every call, so a test can assert both WHAT was created and HOW MANY
    times — creating a provider twice is the bug a cycle would cause.
*/
const world = (registered: Record<string, IRequiringProvider>, runningIds: string[] = []) => {
    const running = new Set(runningIds)
    const calls: Array<{ providerId: string, consumerId: string }> = []
    return {
        calls,
        running,
        isPresent: (id: string) => running.has(id),
        isRegistered: (id: string) => id in registered,
        instantiate: async (providerId: string, consumerId: string) => {
            calls.push({ providerId, consumerId })
            running.add(providerId)
            return registered[providerId]
        }
    }
}

const resolve = (consumers: IRequiringProvider[], w: ReturnType<typeof world>) =>
    resolveConsumedProviders(consumers, w.isPresent, w.isRegistered, w.instantiate)

test('a consumed provider nobody else asks for is instantiated, and told who needs it', async () => {
    const mapper = prov('mapper', 'flights')
    const w = world({ mapper, flights: prov('flights') }, ['mapper'])
    const r = await resolve([mapper], w)
    assert.deepEqual(w.calls, [{ providerId: 'flights', consumerId: 'mapper' }])
    assert.deepEqual(r.added.map(p => p.id), ['flights'])
    assert.deepEqual(r.missing, [])
})

test('the set is closed transitively: A consumes B, B consumes C', async () => {
    const a = prov('a', 'b')
    const w = world({ a, b: prov('b', 'c'), c: prov('c') }, ['a'])
    const r = await resolve([a], w)
    assert.deepEqual(r.added.map(p => p.id), ['b', 'c'])
    assert.deepEqual(w.calls, [{ providerId: 'b', consumerId: 'a' }, { providerId: 'c', consumerId: 'b' }])
})

test('a provider that is already running is never created again', async () => {
    const mapper = prov('mapper', 'v16')
    const w = world({ mapper, v16: prov('v16') }, ['mapper', 'v16'])
    const r = await resolve([mapper], w)
    assert.equal(w.calls.length, 0)
    assert.deepEqual(r.added, [])
})

test('a cycle terminates and creates each provider once', async () => {
    const a = prov('a', 'b')
    const w = world({ a, b: prov('b', 'a') }, ['a'])
    const r = await resolve([a], w)
    assert.deepEqual(w.calls.map(c => c.providerId), ['b'])
    assert.deepEqual(r.added.map(p => p.id), ['b'])
})

test('a self-reference is harmless', async () => {
    const a = prov('a', 'a')
    const w = world({ a }, ['a'])
    const r = await resolve([a], w)
    assert.equal(w.calls.length, 0)
    assert.deepEqual(r.added, [])
})

test('two consumers of the same producer create it ONCE', async () => {
    const x = prov('x', 'shared')
    const y = prov('y', 'shared')
    const w = world({ x, y, shared: prov('shared') }, ['x', 'y'])
    const r = await resolve([x, y], w)
    assert.deepEqual(w.calls, [{ providerId: 'shared', consumerId: 'x' }])
    assert.deepEqual(r.added.map(p => p.id), ['shared'])
})

test('an id that is not installed is reported per consumer, and the others still resolve', async () => {
    const x = prov('x', 'ghost', 'real')
    const y = prov('y', 'ghost')
    const w = world({ x, y, real: prov('real') }, ['x', 'y'])
    const r = await resolve([x, y], w)
    assert.deepEqual(r.missing, [{ consumerId: 'x', providerId: 'ghost' }, { consumerId: 'y', providerId: 'ghost' }])
    assert.deepEqual(r.added.map(p => p.id), ['real'])
})

test('pluvider ids are skipped: the core cannot create one', async () => {
    const mapper = prov('mapper', 'plugin:situs')
    const w = world({ mapper }, ['mapper'])
    const r = await resolve([mapper], w)
    assert.equal(w.calls.length, 0)
    assert.deepEqual(r.missing, [], 'an absent pluvider is legitimate, not a missing provider')
    assert.deepEqual(r.added, [])
})

test('a producer that fails to instantiate is not added and not retried', async () => {
    const x = prov('x', 'broken')
    const y = prov('y', 'broken')
    const calls: string[] = []
    const r = await resolveConsumedProviders([x, y],
        () => false,
        id => id === 'broken',
        async id => { calls.push(id); return undefined })
    assert.deepEqual(calls, ['broken'])
    assert.deepEqual(r.added, [])
    assert.deepEqual(r.missing, [])
})

test('providers without requirements, or with a malformed one, consume nothing', async () => {
    const w = world({}, [])
    const malformed = [
        { id: 'none' },
        { id: 'nolist', requirements: {} },
        { id: 'notarray', requirements: { providers: 'v16' } },
        { id: 'junk', requirements: { providers: ['', 42, null] } }
    ] as unknown as IRequiringProvider[]
    const r = await resolve(malformed, w)
    assert.equal(w.calls.length, 0)
    assert.deepEqual(r, { added: [], missing: [] })
})

test('an empty or missing consumer list resolves to nothing', async () => {
    const w = world({}, [])
    assert.deepEqual(await resolve([], w), { added: [], missing: [] })
    assert.deepEqual(await resolve(undefined as unknown as IRequiringProvider[], w), { added: [], missing: [] })
})
