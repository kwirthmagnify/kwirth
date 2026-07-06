// Tests unitarios del fan-out del BusinessProvider (sin HTTP): ingesta, filtrado por space/type,
// contenido exacto del evento entregado, acumulación en el store y ciclo de subscribers.

import test from 'node:test'
import assert from 'node:assert/strict'
import { BusinessProvider } from '../src/index'
import type { IProviderSubscriber } from '@kwirthmagnify/kwirth-common-back'

class MockSubscriber implements IProviderSubscriber {
    public received: Array<{ providerId: string, obj: any }> = []
    processProviderEvent(providerId: string, obj: any): void {
        this.received.push({ providerId, obj })
    }
}

const newProvider = () => new BusinessProvider(null as any, {} as any)

test('ingest: body inválido → false', () => {
    const p = newProvider()
    assert.equal(p.ingest(undefined), false)
    assert.equal(p.ingest({ space: 'orders' } as any), false)   // sin type
    assert.equal(p.ingest({ type: 'created' } as any), false)   // sin space
    assert.equal(p.ingest({ space: '', type: 'created' }), false)
    assert.equal(p.ingest({ space: 'orders', type: '' }), false)
})

test('ingest: body válido → true', () => {
    assert.equal(newProvider().ingest({ space: 'orders', type: 'created', data: { id: 1 } }), true)
})

test('fan-out: el subscriber recibe su space/type con el evento exacto', async () => {
    const p = newProvider()
    const sub = new MockSubscriber()
    await p.addSubscriber(sub, { spaces: [{ name: 'orders', types: ['created'] }] })

    const body = { space: 'orders', type: 'created', data: { id: 7 } }
    p.ingest(body)

    assert.equal(sub.received.length, 1)
    const { providerId, obj } = sub.received[0]
    assert.equal(providerId, 'business')
    assert.equal(obj.last.type, 'event')
    assert.deepEqual(obj.last.event, body)
    assert.equal(typeof obj.last.timestamp, 'string')
    assert.deepEqual(obj.all.get('orders').get('created'), [body])   // 'all' = store
})

test('fan-out: filtra por type no suscrito', async () => {
    const p = newProvider()
    const sub = new MockSubscriber()
    await p.addSubscriber(sub, { spaces: [{ name: 'orders', types: ['created'] }] })
    p.ingest({ space: 'orders', type: 'deleted', data: {} })
    assert.equal(sub.received.length, 0)
})

test('fan-out: filtra por space no suscrito', async () => {
    const p = newProvider()
    const sub = new MockSubscriber()
    await p.addSubscriber(sub, { spaces: [{ name: 'orders', types: ['created'] }] })
    p.ingest({ space: 'payments', type: 'created', data: {} })
    assert.equal(sub.received.length, 0)
})

test('fan-out: types vacío → no entrega nada de ese space', async () => {
    const p = newProvider()
    const sub = new MockSubscriber()
    await p.addSubscriber(sub, { spaces: [{ name: 'orders', types: [] }] })
    p.ingest({ space: 'orders', type: 'created', data: {} })
    assert.equal(sub.received.length, 0)
})

test('varios subscribers: cada uno recibe solo lo suyo', async () => {
    const p = newProvider()
    const a = new MockSubscriber()
    const b = new MockSubscriber()
    await p.addSubscriber(a, { spaces: [{ name: 'orders', types: ['created'] }] })
    await p.addSubscriber(b, { spaces: [{ name: 'payments', types: ['authorized'] }] })
    p.ingest({ space: 'orders', type: 'created', data: { id: 1 } })
    p.ingest({ space: 'payments', type: 'authorized', data: { id: 2 } })
    assert.equal(a.received.length, 1)
    assert.equal(b.received.length, 1)
    assert.equal(a.received[0].obj.last.event.data.id, 1)
    assert.equal(b.received[0].obj.last.event.data.id, 2)
})

test('removeSubscriber: deja de recibir', async () => {
    const p = newProvider()
    const sub = new MockSubscriber()
    await p.addSubscriber(sub, { spaces: [{ name: 'orders', types: ['created'] }] })
    await p.removeSubscriber(sub)
    p.ingest({ space: 'orders', type: 'created', data: {} })
    assert.equal(sub.received.length, 0)
})

test('acumulación: el store agrega múltiples eventos por space/type', async () => {
    const p = newProvider()
    const sub = new MockSubscriber()
    await p.addSubscriber(sub, { spaces: [{ name: 'orders', types: ['created'] }] })
    p.ingest({ space: 'orders', type: 'created', data: { id: 1 } })
    p.ingest({ space: 'orders', type: 'created', data: { id: 2 } })
    assert.equal(sub.received.length, 2)
    assert.equal(sub.received[1].obj.all.get('orders').get('created').length, 2)
})

test('stopProvider: limpia subscribers y store', async () => {
    const p = newProvider()
    const sub = new MockSubscriber()
    await p.addSubscriber(sub, { spaces: [{ name: 'orders', types: ['created'] }] })
    p.ingest({ space: 'orders', type: 'created', data: {} })
    await p.stopProvider()
    p.ingest({ space: 'orders', type: 'created', data: {} })
    assert.equal(sub.received.length, 1)   // tras stop no llega más
})
