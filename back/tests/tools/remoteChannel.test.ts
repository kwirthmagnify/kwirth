// Fase 5 (federación back-a-back): openRemoteChannel es el cliente WS Node del framework. Se prueba contra
// un WebSocketServer real en un puerto efímero de loopback (rápido y determinista, sin red externa):
// handshake + accessKey del cluster remoto, captura del instance de la RESPONSE del START, sellado del
// instance en los envíos, ignorado de frames no-JSON, reconexión con backoff y close() (sin reconexión + DOWN).

import test from 'node:test'
import assert from 'node:assert/strict'
import { AddressInfo } from 'net'
import { WebSocketServer, WebSocket } from 'ws'
import { IInstanceConfig, IInstanceMessage, EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType, EInstanceConfigObject, EInstanceConfigView, EInstanceConfigScope } from '@kwirthmagnify/kwirth-common'
import { ERemoteConnState } from '@kwirthmagnify/kwirth-common-back'
import { openRemoteChannel } from '../../src/tools/RemoteChannel'

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

function makeServer(): Promise<{ wss: WebSocketServer, url: string }> {
    return new Promise((resolve) => {
        const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 })
        wss.on('listening', () => {
            const port = (wss.address() as AddressInfo).port
            resolve({ wss, url: `ws://127.0.0.1:${port}` })
        })
    })
}

// Config de canal que el consumidor pasaría; action/flow/type/instance/accessKey los sobreescribe el cliente.
function baseConfig(): IInstanceConfig {
    return {
        action: EInstanceMessageAction.NONE,
        flow: EInstanceMessageFlow.IMMEDIATE,
        type: EInstanceMessageType.SIGNAL,
        channel: 'agora',
        instance: '',
        objects: EInstanceConfigObject.PODS,
        accessKey: 'LOCAL-SHOULD-BE-OVERRIDDEN',
        scope: EInstanceConfigScope.VIEW,
        view: EInstanceConfigView.CLUSTER,
        namespace: '',
        group: '',
        pod: '',
        container: ''
    }
}

test('START handshake: sends a flat START with the remote accessKey + config, reports CONNECTED', { timeout: 8000 }, async () => {
    const { wss, url } = await makeServer()
    const firstMsg = new Promise<Record<string, unknown>>((resolve) => {
        wss.on('connection', (sock: WebSocket) => {
            sock.once('message', (data: Buffer) => resolve(JSON.parse(data.toString())))
        })
    })
    const states: ERemoteConnState[] = []
    const handle = openRemoteChannel(
        { name: 'remote', url, accessString: 'AK-REMOTE' },
        baseConfig(),
        { onMessage: () => {}, onState: (s) => states.push(s) }
    )
    const msg = await firstMsg
    assert.equal(msg.action, EInstanceMessageAction.START)
    assert.equal(msg.flow, EInstanceMessageFlow.REQUEST)
    assert.equal(msg.type, EInstanceMessageType.SIGNAL)
    assert.equal(msg.instance, '')
    assert.equal(msg.accessKey, 'AK-REMOTE')          // el accessKey del cluster remoto, no el del config
    assert.equal(msg.channel, 'agora')                // los campos del config se preservan
    assert.ok(states.includes(ERemoteConnState.CONNECTED))
    handle.close()
    wss.close()
})

test('captures the instance from the START RESPONSE and stamps it on outgoing sends', { timeout: 8000 }, async () => {
    const { wss, url } = await makeServer()
    let serverSock: WebSocket | undefined
    const gotStart = new Promise<void>((resolve) => {
        wss.on('connection', (sock: WebSocket) => {
            serverSock = sock
            sock.once('message', () => {
                sock.send(JSON.stringify({ action: EInstanceMessageAction.START, flow: EInstanceMessageFlow.RESPONSE, type: EInstanceMessageType.SIGNAL, channel: 'agora', instance: 'INST-123' }))
                resolve()
            })
        })
    })
    const received: IInstanceMessage[] = []
    const handle = openRemoteChannel({ name: 'r', url, accessString: 'AK' }, baseConfig(), { onMessage: (m) => received.push(m), onState: () => {} })
    await gotStart
    await delay(100)   // deja llegar la RESPONSE al cliente
    assert.equal(received.length, 1)
    assert.equal(received[0].instance, 'INST-123')
    // un comando enviado por el handle debe llevar el instance que ESTE cluster asignó
    const cmd = new Promise<Record<string, unknown>>((resolve) => serverSock!.once('message', (data: Buffer) => resolve(JSON.parse(data.toString()))))
    handle.send({ action: EInstanceMessageAction.COMMAND, flow: EInstanceMessageFlow.REQUEST, type: EInstanceMessageType.SIGNAL, channel: 'agora', instance: '' })
    const seen = await cmd
    assert.equal(seen.action, EInstanceMessageAction.COMMAND)
    assert.equal(seen.instance, 'INST-123')
    handle.close()
    wss.close()
})

test('ignores non-JSON frames (no onMessage, no crash)', { timeout: 8000 }, async () => {
    const { wss, url } = await makeServer()
    wss.on('connection', (sock: WebSocket) => {
        sock.once('message', () => sock.send('this is not json {{{'))
    })
    const received: IInstanceMessage[] = []
    const handle = openRemoteChannel({ name: 'r', url, accessString: 'AK' }, baseConfig(), { onMessage: (m) => received.push(m), onState: () => {} })
    await delay(150)
    assert.equal(received.length, 0)
    handle.close()
    wss.close()
})

test('reconnects after an unexpected close (RECONNECTING, then a fresh connection)', { timeout: 8000 }, async () => {
    const { wss, url } = await makeServer()
    let connectionCount = 0
    const secondConnection = new Promise<void>((resolve) => {
        wss.on('connection', (sock: WebSocket) => {
            connectionCount++
            if (connectionCount === 1) sock.once('message', () => sock.close())   // corta la primera tras el START
            else resolve()                                                        // reconectó
        })
    })
    const states: ERemoteConnState[] = []
    const handle = openRemoteChannel({ name: 'r', url, accessString: 'AK' }, baseConfig(), { onMessage: () => {}, onState: (s) => states.push(s) })
    await secondConnection   // espera la reconexión (~1s de backoff inicial)
    assert.ok(states.includes(ERemoteConnState.RECONNECTING))
    assert.ok(connectionCount >= 2)
    handle.close()
    wss.close()
})

test('close() cancels pending retries (no reconnect) and reports DOWN', { timeout: 8000 }, async () => {
    const { wss, url } = await makeServer()
    let connectionCount = 0
    wss.on('connection', (sock: WebSocket) => {
        connectionCount++
        sock.once('message', () => sock.close())   // fuerza al cliente a programar reintento (backoff 1s)
    })
    const states: ERemoteConnState[] = []
    const handle = openRemoteChannel({ name: 'r', url, accessString: 'AK' }, baseConfig(), { onMessage: () => {}, onState: (s) => states.push(s) })
    await delay(200)   // conecta, envía START, el server cierra → reintento programado a 1s
    handle.close()
    const countAtClose = connectionCount
    assert.ok(states.includes(ERemoteConnState.DOWN))
    await delay(1400)   // supera el backoff inicial (1s): un reintento HABRÍA disparado si no se cancelara
    assert.equal(connectionCount, countAtClose)   // no hubo nueva conexión tras close()
    wss.close()
})
