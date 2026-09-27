import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TrivyProvider } from '../../src/index'
import { ETrivyEventKind, TRIVY_API_VULN_PLURAL, TRIVY_API_AUDIT_PLURAL, TRIVY_API_SBOM_PLURAL, TRIVY_API_EXPOSED_PLURAL, TRIVY_API_RBAC_PLURAL, TRIVY_API_CLUSTER_RBAC_PLURAL } from '../../src/TrivyTypes'
import { fakeCluster, fakeSubscriber, settle } from '../helpers'

/*
    Registering a subscriber is where this provider used to take the whole core down.

    A subscriber that asks for no particular report types sends an EMPTY object — provider-debug always
    does, because subscribing with no payload is the normal thing there — and the default value was picked
    with `data ?? { reportTypes: ALL_PLURALS }`: `{}` is not nullish, so the default did NOT kick in and
    reportTypes was left undefined. What came next was a `for...of undefined` inside a promise nobody
    awaited: an unhandled rejection, and the core exits through its own handler.

    Hence the two rules these tests pin down: the default is decided by LOOKING AT reportTypes, and every
    fire-and-forget carries its catch. `node --test` fails the file when any rejection is left unattended,
    so these tests catch the regression by themselves.
*/

const ALL_PLURALS = [TRIVY_API_VULN_PLURAL, TRIVY_API_AUDIT_PLURAL, TRIVY_API_SBOM_PLURAL, TRIVY_API_EXPOSED_PLURAL, TRIVY_API_RBAC_PLURAL, TRIVY_API_CLUSTER_RBAC_PLURAL]

test('un suscriptor sin payload ({}, como provider-debug) recibe TODOS los tipos de reporte', async () => {
    const { clusterInfo, listedPlurals } = fakeCluster()
    const provider = new TrivyProvider(clusterInfo, {})
    const subscriber = fakeSubscriber()

    await provider.addSubscriber(subscriber, {} as any)
    await settle()

    assert.deepEqual(listedPlurals, ALL_PLURALS)
})

test('sin datos de suscripcion (undefined) tambien se cae a todos los tipos', async () => {
    const { clusterInfo, listedPlurals } = fakeCluster()
    const provider = new TrivyProvider(clusterInfo, {})

    await provider.addSubscriber(fakeSubscriber(), undefined as any)
    await settle()

    assert.deepEqual(listedPlurals, ALL_PLURALS)
})

test('una lista de tipos VACIA significa todos, no ninguno', async () => {
    const { clusterInfo, listedPlurals } = fakeCluster()
    const provider = new TrivyProvider(clusterInfo, {})

    await provider.addSubscriber(fakeSubscriber(), { reportTypes: [] } as any)
    await settle()

    assert.deepEqual(listedPlurals, ALL_PLURALS)
})

test('quien pide tipos concretos recibe SOLO esos', async () => {
    const { clusterInfo, listedPlurals } = fakeCluster()
    const provider = new TrivyProvider(clusterInfo, {})

    await provider.addSubscriber(fakeSubscriber(), { reportTypes: [TRIVY_API_VULN_PLURAL] } as any)
    await settle()

    assert.deepEqual(listedPlurals, [TRIVY_API_VULN_PLURAL])
})

test('el estado inicial se entrega SOLO al suscriptor que acaba de llegar', async () => {
    const { clusterInfo } = fakeCluster({ items: { [TRIVY_API_VULN_PLURAL]: [{ metadata: { name: 'r1' } }, { metadata: { name: 'r2' } }] } })
    const provider = new TrivyProvider(clusterInfo, {})
    const first = fakeSubscriber()
    await provider.addSubscriber(first, { reportTypes: [TRIVY_API_VULN_PLURAL] } as any)
    await settle()
    const deliveredToFirst = first.events.length

    const late = fakeSubscriber()
    await provider.addSubscriber(late, { reportTypes: [TRIVY_API_VULN_PLURAL] } as any)
    await settle()

    // the one arriving late receives the current state...
    assert.equal(late.events.filter(e => e.event.eventKind !== ETrivyEventKind.META).length, 2)
    // ...and nothing bounces back to the first one
    assert.equal(first.events.length, deliveredToFirst)
})

test('la version de Trivy del cluster llega como evento meta en el alta', async () => {
    const { clusterInfo } = fakeCluster()
    const provider = new TrivyProvider(clusterInfo, {})
    const subscriber = fakeSubscriber()

    await provider.addSubscriber(subscriber, {} as any)
    await settle()

    const meta = subscriber.events.find(e => e.event?.eventKind === ETrivyEventKind.META)
    assert.ok(meta, 'no ha llegado el evento meta')
    assert.equal(meta!.event.meta.trivyVersion, '0.58.1')
    assert.equal(meta!.event.meta.operatorVersion, '0.24.1')
})

test('si Trivy no esta instalado el alta sigue adelante y el meta llega vacio', async () => {
    const { clusterInfo } = fakeCluster({ trivyMissing: true })
    const provider = new TrivyProvider(clusterInfo, {})
    const subscriber = fakeSubscriber()

    await provider.addSubscriber(subscriber, {} as any)
    await settle()

    const meta = subscriber.events.find(e => e.event?.eventKind === ETrivyEventKind.META)
    assert.ok(meta, 'no ha llegado el evento meta')
    assert.deepEqual(meta!.event.meta, {})
})

test('un LIST que falla no se lleva por delante a los demas tipos de reporte', async () => {
    const { clusterInfo, listedPlurals } = fakeCluster({
        failingPlurals: [TRIVY_API_AUDIT_PLURAL],
        items: { [TRIVY_API_VULN_PLURAL]: [{ metadata: { name: 'r1' } }] },
    })
    const provider = new TrivyProvider(clusterInfo, {})
    const subscriber = fakeSubscriber()

    await provider.addSubscriber(subscriber, {} as any)
    await settle()

    assert.deepEqual(listedPlurals, ALL_PLURALS)
    assert.equal(subscriber.events.filter(e => e.event.eventKind !== ETrivyEventKind.META).length, 1)
})

test('un suscriptor que se cae al recibir NO deja un rechazo sin atender', async () => {
    const { clusterInfo } = fakeCluster({ items: { [TRIVY_API_VULN_PLURAL]: [{ metadata: { name: 'r1' } }] } })
    const provider = new TrivyProvider(clusterInfo, {})

    // registration must not propagate the subscriber's failure...
    await provider.addSubscriber(fakeSubscriber(true), {} as any)
    await settle()

    // ...and the provider keeps serving whoever comes next
    const healthy = fakeSubscriber()
    await provider.addSubscriber(healthy, {} as any)
    await settle()
    assert.ok(healthy.events.length > 0)
})

test('el alta queda registrada aunque el sync inicial falle', async () => {
    const { clusterInfo } = fakeCluster({ failingPlurals: ALL_PLURALS })
    const provider = new TrivyProvider(clusterInfo, {})
    const subscriber = fakeSubscriber()

    await provider.addSubscriber(subscriber, {} as any)
    await settle()

    // the meta is delivered all the same: a failing LIST does not cancel the registration
    assert.ok(subscriber.events.some(e => e.event?.eventKind === ETrivyEventKind.META))
    await provider.removeSubscriber(subscriber)
})
