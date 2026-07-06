// e2e test of the HTTP router: mounts the provider router on an ephemeral express app and makes real
// POSTs, verifying the contract (200/400) and that the subscriber receives the event with its payload.

import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import http from 'node:http'
import { BusinessProvider } from '../src/index'
import type { IProviderSubscriber } from '@kwirthmagnify/kwirth-common-back'

class MockSubscriber implements IProviderSubscriber {
    public received: Array<{ providerId: string, obj: any }> = []
    processProviderEvent(providerId: string, obj: any): void {
        this.received.push({ providerId, obj })
    }
}

test('e2e HTTP: POST al router → 200 y el subscriber recibe; body inválido → 400', async () => {
    const p = new BusinessProvider(null as any, {} as any)
    const sub = new MockSubscriber()
    await p.addSubscriber(sub, { spaces: [{ name: 'orders', types: ['created'] }] })

    const app = express()
    app.use(express.json())
    app.use('/provider/business', p.router)
    const server = http.createServer(app)
    await new Promise<void>(resolve => server.listen(0, resolve))
    const port = (server.address() as any).port
    const url = `http://127.0.0.1:${port}/provider/business`

    try {
        const ok = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ space: 'orders', type: 'created', data: { id: 42 } })
        })
        assert.equal(ok.status, 200)
        assert.equal(sub.received.length, 1)
        assert.equal(sub.received[0].obj.last.event.data.id, 42)

        const bad = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ space: 'orders' })   // missing type
        })
        assert.equal(bad.status, 400)
        assert.equal(sub.received.length, 1)   // no new dispatch happened
    }
    finally {
        await new Promise<void>(resolve => server.close(() => resolve()))
    }
})
