/*
    The probe that touches the network.

    It is tested against a loopback server of our own and against a port nobody listens on: both are
    deterministic anywhere, which a test that needs the internet is not.
*/

import { test } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { tcpProbe } from '../src/back/probes'

/** A server on loopback and an ephemeral port, so the test collides with nothing. */
const listen = (): Promise<{ port: number, close: () => Promise<void> }> => new Promise(resolve => {
    const server = net.createServer(socket => socket.end())
    server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as net.AddressInfo).port
        resolve({ port, close: () => new Promise(done => server.close(() => done())) })
    })
})

test('a port that is listening answers, with a time and the address it connected to', async () => {
    const server = await listen()
    try {
        const outcome = await tcpProbe('127.0.0.1', server.port, 2000)
        assert.equal(outcome.ok, true)
        assert.equal(typeof outcome.timeMs, 'number')
        assert.ok((outcome.timeMs as number) >= 0, 'the time is not a number of milliseconds')
        assert.equal(outcome.address, '127.0.0.1')
        assert.equal(outcome.error, undefined)
    }
    finally {
        await server.close()
    }
})

test('🔴 a port nobody listens on is refused, with the reason the system gave and no time', async () => {
    const server = await listen()
    const port = server.port
    await server.close()

    const outcome = await tcpProbe('127.0.0.1', port, 2000)
    assert.equal(outcome.ok, false)
    assert.equal(outcome.timeMs, undefined)
    assert.match(String(outcome.error), /ECONNREFUSED/)
})

test('🔴 nothing is written to the port: the server sees a connection and no data', async () => {
    let received = ''
    const server = net.createServer(socket => { socket.on('data', chunk => { received += String(chunk) }) })
    await new Promise<void>(done => server.listen(0, '127.0.0.1', () => done()))
    const port = (server.address() as net.AddressInfo).port
    try {
        assert.equal((await tcpProbe('127.0.0.1', port, 2000)).ok, true)
        await new Promise(done => setTimeout(done, 50))
        assert.equal(received, '', 'the probe wrote to the port — it must only ask whether it answers')
    }
    finally {
        await new Promise<void>(done => server.close(() => done()))
    }
})
