// Phase 5 (back-to-back federation): openRemoteChannel is the framework's Node WS client. It is tested
// against a real WebSocketServer on an ephemeral loopback port (fast and deterministic, with no external
// network): handshake + the remote cluster's accessKey, capture of the instance from the START's RESPONSE,
// stamping of the
// instance on outgoing sends, ignoring non-JSON frames, reconnection with backoff and close() (no reconnection + DOWN).

import test from 'node:test'
import assert from 'node:assert/strict'
import { AddressInfo } from 'net'
import { WebSocketServer, WebSocket } from 'ws'
import { IInstanceConfig, IInstanceMessage, EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType, EInstanceConfigObject, EInstanceConfigView, EInstanceConfigScope, ESignalMessageReason } from '@kwirthmagnify/kwirth-common'
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

// The channel config a consumer would pass; action/flow/type/instance/accessKey are overwritten by the client.
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

test('START handshake: sends a flat START with the remote accessKey + config; HANDSHAKING then CONNECTED once an instance is assigned', { timeout: 8000 }, async () => {
    const { wss, url } = await makeServer()
    // Reply to the START with an instance so the connector reaches CONNECTED (socket up but no instance = only
    // HANDSHAKING; green/CONNECTED requires the instance).
    const firstMsg = new Promise<Record<string, unknown>>((resolve) => {
        wss.on('connection', (sock: WebSocket) => {
            sock.once('message', (data: Buffer) => {
                sock.send(JSON.stringify({ action: EInstanceMessageAction.START, flow: EInstanceMessageFlow.RESPONSE, type: EInstanceMessageType.SIGNAL, channel: 'agora', instance: 'INST-1' }))
                resolve(JSON.parse(data.toString()))
            })
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
    await delay(100)                                  // deja llegar la RESPONSE del START
    assert.ok(states.includes(ERemoteConnState.HANDSHAKING), 'socket abierto sin instance → HANDSHAKING')
    assert.ok(states.includes(ERemoteConnState.CONNECTED), 'instance capturado → CONNECTED')
    assert.ok(states.indexOf(ERemoteConnState.HANDSHAKING) < states.indexOf(ERemoteConnState.CONNECTED), 'HANDSHAKING precede a CONNECTED')
    handle.close()
    wss.close()
})

test('normalizes an http(s) URL to ws(s) (Kwirth stores cluster URLs as http/https)', { timeout: 8000 }, async () => {
    const { wss, url } = await makeServer()          // url = ws://127.0.0.1:PORT
    const httpUrl = url.replace(/^ws:/, 'http:')     // a Kwirth http endpoint (same host+port+path)
    // Reply to the START with an instance so the connector reaches CONNECTED (green needs socket + instance).
    wss.on('connection', (sock: WebSocket) => {
        sock.once('message', () => sock.send(JSON.stringify({ action: EInstanceMessageAction.START, flow: EInstanceMessageFlow.RESPONSE, type: EInstanceMessageType.SIGNAL, channel: 'agora', instance: 'INST-1' })))
    })
    // Resolve on the CLIENT's CONNECTED. Getting CONNECTED at all proves the http:// URL was dialed as ws://.
    let resolveConnected: () => void = () => {}
    const connected = new Promise<void>((r) => { resolveConnected = r })
    const handle = openRemoteChannel(
        { name: 'remote', url: httpUrl, accessString: 'AK' },
        baseConfig(),
        { onMessage: () => {}, onState: (s) => { if (s === ERemoteConnState.CONNECTED) resolveConnected() } }
    )
    try {
        await connected
    }
    finally {
        handle.close()
        wss.close()
    }
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
    // a command sent through the handle must carry the instance THIS cluster assigned
    const cmd = new Promise<Record<string, unknown>>((resolve) => serverSock!.once('message', (data: Buffer) => resolve(JSON.parse(data.toString()))))
    handle.send({ action: EInstanceMessageAction.COMMAND, flow: EInstanceMessageFlow.REQUEST, type: EInstanceMessageType.SIGNAL, channel: 'agora', instance: '' })
    const seen = await cmd
    assert.equal(seen.action, EInstanceMessageAction.COMMAND)
    assert.equal(seen.instance, 'INST-123')
    assert.equal(seen.accessKey, 'AK')   // the core requires an accessKey on every command; the connector stamps it
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

test('re-STARTs the flow when the remote lost our instance ("not been found for command")', { timeout: 8000 }, async () => {
    // Failure mode 1: the remote CHANNEL restarted with the socket still alive → its instance (only in the
    // pod's memory) is gone, so every command answers "not been found for command". The keepalive can't catch
    // it (the socket is open). The connector must re-handshake on the same socket to get a fresh instance.
    const { wss, url } = await makeServer()
    let starts = 0
    let serverSock: WebSocket | undefined
    const secondStart = new Promise<void>((resolve) => {
        wss.on('connection', (sock: WebSocket) => {
            serverSock = sock
            sock.on('message', (data: Buffer) => {
                const m = JSON.parse(data.toString())
                if (m.action === EInstanceMessageAction.START) {
                    starts++
                    sock.send(JSON.stringify({ action: EInstanceMessageAction.START, flow: EInstanceMessageFlow.RESPONSE, type: EInstanceMessageType.SIGNAL, channel: 'agora', instance: `INST-${starts}` }))
                    if (starts >= 2) resolve()   // the client re-STARTed after the error
                }
            })
        })
    })
    const handle = openRemoteChannel({ name: 'r', url, accessString: 'AK' }, baseConfig(), { onMessage: () => {}, onState: () => {} })
    await delay(120)   // first START/RESPONSE settles (INST-1 captured, watchdog cleared)
    // The remote lost our instance → it replies with the core's stale-instance error.
    /*  🔴 El doble manda el CÓDIGO, que es lo único que el cliente mira. El texto va también porque el core
        lo manda (es para que lo lea una persona), pero quitarlo no debe cambiar nada: si este test pasara
        sin `reason`, estaría probando el camino frágil que se eliminó a propósito. */
    serverSock!.send(JSON.stringify({ action: EInstanceMessageAction.COMMAND, flow: EInstanceMessageFlow.RESPONSE, type: EInstanceMessageType.SIGNAL, channel: 'agora', instance: '', reason: ESignalMessageReason.INSTANCE_UNKNOWN, text: "Instance 'INST-1' has not been found for command" }))
    await secondStart
    assert.ok(starts >= 2, 'the connector re-sends START to obtain a fresh instance')
    handle.close()
    wss.close()
})

test('START watchdog: keeps re-sending START until the remote assigns an instance (remote plugin still booting)', { timeout: 12000 }, async () => {
    // Failure mode 2: after a full remote-core restart the client reconnects, but the core accepts WS BEFORE
    // its plugins start (plugins boot last) → the first START gets no valid instance. The watchdog retries
    // until the channel is up and finally assigns one.
    const { wss, url } = await makeServer()
    let starts = 0
    const gotInstance = new Promise<void>((resolve) => {
        wss.on('connection', (sock: WebSocket) => {
            sock.on('message', (data: Buffer) => {
                const m = JSON.parse(data.toString())
                if (m.action === EInstanceMessageAction.START) {
                    starts++
                    if (starts >= 2) {   // channel "up" only by the retry: ignore the first START, answer the second
                        sock.send(JSON.stringify({ action: EInstanceMessageAction.START, flow: EInstanceMessageFlow.RESPONSE, type: EInstanceMessageType.SIGNAL, channel: 'agora', instance: 'INST-late' }))
                        resolve()
                    }
                }
            })
        })
    })
    const received: IInstanceMessage[] = []
    const handle = openRemoteChannel({ name: 'r', url, accessString: 'AK' }, baseConfig(), { onMessage: (m) => received.push(m), onState: () => {} })
    await gotInstance   // the second START needs one START_RETRY_MS (~3s)
    await delay(120)
    assert.ok(starts >= 2, 'the connector retries the START while no instance is assigned')
    assert.ok(received.some(m => m.instance === 'INST-late'), 'the late instance is finally captured')
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

/*
    🔴 The remote no longer serves the channel: its plugin was uninstalled with the socket still up.

    Found in QA (2026-10-14) and it was the worst kind of bug. The member's core does answer — `Unsupported
    channel in this Kwirth deployment` — but the only RESPONSE this client listened for was "not been found
    for command", so that one fell through in silence. The socket stayed open, the keepalive kept answering
    and `instanceId` still held the one assigned before the plugin went away, so the link stayed CONNECTED
    and the home went on **sending and calling it delivered**. An assign made from the home produced no
    ticket, no owner, no queued delivery and no warning: reported as done, and lost.

    What the link must do instead: stop being operational, so callers QUEUE; and keep probing, so it comes
    back on its own when the plugin is reinstalled.
*/
test('a remote that no longer has the channel stops being CONNECTED (so callers queue) and keeps probing', { timeout: 20000 }, async () => {
    const { wss, url } = await makeServer()
    let serveChannel = true          // el plugin está instalado… hasta que lo desinstalamos a mitad
    let startsReceived = 0
    wss.on('connection', (sock: WebSocket) => {
        sock.on('message', (data: Buffer) => {
            const m = JSON.parse(data.toString()) as { action?: string }
            if (m.action === EInstanceMessageAction.START) startsReceived++
            /*  Fiel al core: la comprobación de "¿tengo este canal?" va ANTES de despachar la acción
                (back/src/index.ts), así que un canal desinstalado rechaza CUALQUIER mensaje —START o
                comando— con el mismo texto. Es importante que el doble lo haga igual: en la realidad el
                primero que choca contra esto suele ser un comando, no un START. */
            if (!serveChannel) { sock.send(JSON.stringify({ flow: EInstanceMessageFlow.RESPONSE, type: EInstanceMessageType.SIGNAL, channel: 'agora', reason: ESignalMessageReason.CHANNEL_UNSUPPORTED, text: 'Unsupported channel in this Kwirth deployment' })); return }
            if (m.action === EInstanceMessageAction.START) sock.send(JSON.stringify({ action: EInstanceMessageAction.START, flow: EInstanceMessageFlow.RESPONSE, type: EInstanceMessageType.SIGNAL, channel: 'agora', instance: 'INST-1' }))
        })
    })
    const states: ERemoteConnState[] = []
    const handle = openRemoteChannel({ name: 'r', url, accessString: 'AK' }, baseConfig(), { onMessage: () => {}, onState: (s) => states.push(s) })
    await delay(300)
    assert.equal(states[states.length - 1], ERemoteConnState.CONNECTED, 'con el canal instalado, el enlace es operativo')

    // Desinstalan el plugin en el remoto. El socket NO se cierra: eso es justo lo que hacía invisible el fallo.
    serveChannel = false
    const startsBefore = startsReceived
    handle.send({ msgtype: 'whatever', channel: 'agora' } as unknown as IInstanceMessage)   // el remoto la rechaza
    await delay(400)
    assert.notEqual(states[states.length - 1], ERemoteConnState.CONNECTED, '🔴 seguir CONNECTED es lo que hace que el llamante mande al vacío en vez de encolar')

    // Y sigue sondeando: así se entera solo de que el plugin ha vuelto, sin reiniciar nada.
    await delay(3500)   // > START_RETRY_MS (3s): a esa cadencia cabe UN sondeo, que es lo que se exige
    assert.ok(startsReceived >= startsBefore + 1, `esperaba al menos un reintento del START, hubo ${startsReceived - startsBefore}`)

    /*  Reinstalan: el siguiente sondeo trae instancia y el enlace vuelve a ser operativo.

        🔴 La espera es más larga que la anterior A PROPÓSITO, y no es holgura: mientras se sabe que el
        canal no está, el sondeo hace BACKOFF (3s, 6s, 12s… hasta `GONE_PROBE_MAX_MS`), porque una
        desinstalación puede durar horas y preguntar cada tres segundos solo llena el log. Así que tras
        el primer sondeo rechazado el siguiente ya no llega a los 3 s, sino a los 6. Esperar 3500 aquí
        hacía fallar el test por la cadencia, no por la recuperación. */
    serveChannel = true
    await delay(6500)
    assert.equal(states[states.length - 1], ERemoteConnState.CONNECTED, 'al volver el plugin, el enlace se recupera solo')
    handle.close()
    wss.close()
})

test('the refusal is reported ONCE, not on every probe', { timeout: 10000 }, async () => {
    // El sondeo se rechaza cada 3 s mientras el plugin no esté, y `onState` aguas abajo loguea y re-difunde
    // en CADA llamada: sin la guarda de transición, esto sería una línea cada tres segundos para siempre.
    const { wss, url } = await makeServer()
    wss.on('connection', (sock: WebSocket) => {
        sock.on('message', () => sock.send(JSON.stringify({ flow: EInstanceMessageFlow.RESPONSE, type: EInstanceMessageType.SIGNAL, channel: 'agora', reason: ESignalMessageReason.CHANNEL_UNSUPPORTED, text: 'Unsupported channel in this Kwirth deployment' })))
    })
    const states: ERemoteConnState[] = []
    const handle = openRemoteChannel({ name: 'r', url, accessString: 'AK' }, baseConfig(), { onMessage: () => {}, onState: (s) => states.push(s) })
    await delay(7500)   // da tiempo a dos o tres sondeos rechazados
    const handshakings = states.filter(s => s === ERemoteConnState.HANDSHAKING).length
    assert.ok(handshakings <= 2, `HANDSHAKING una vez por el OPEN y otra por el rechazo; hubo ${handshakings}`)
    handle.close()
    wss.close()
})

/*
    🔴 The remote restarted its channel with the socket still open, so the instance we hold is dead and
    every command sent with it is refused — `Instance '<id>' and flow request not found for command`.

    Re-doing the handshake was already handled. What was NOT handled is the message that was refused: it
    simply vanished, and the caller had been told `delivered` a round trip earlier, because `send()`
    returns the moment the bytes leave.

    What it cost (QA 2026-10-14): assigning an owner to a finding of a member logged
    `1 decision(s) for <uid>: delivered` and, in the same millisecond, `remote lost our instance`. The
    member's own log showed it receiving the decision, complete and correct, and refusing it. The finding
    stayed orphan and nothing anywhere said so — and it happened on every single test, because
    reinstalling the plugin on the member is precisely what rotates its instance.
*/
test('a command refused for a dead instance is RESENT once the new one arrives', { timeout: 10000 }, async () => {
    const { wss, url } = await makeServer()
    const commands = []
    let instance = 'INST-OLD'
    let refuseOnce = true
    wss.on('connection', (sock) => {
        sock.on('message', (data) => {
            const m = JSON.parse(data.toString())
            if (m.action === EInstanceMessageAction.START) {
                sock.send(JSON.stringify({ action: EInstanceMessageAction.START, flow: EInstanceMessageFlow.RESPONSE, type: EInstanceMessageType.SIGNAL, channel: 'agora', instance }))
                return
            }
            // Un comando: la primera vez se rechaza por instancia muerta (el canal remoto se reinició).
            if (refuseOnce) {
                refuseOnce = false
                instance = 'INST-NEW'
                /*  🔴 Lo que decide es el CÓDIGO. Antes esto se probaba con la frase, y hubo que aprender
                    dos veces por qué no vale: el core escribe en SU log «and flow request not found for
                    command» y por el socket manda «has not been found for command», así que el doble se
                    construyó con la del log y el test pasaba sin parecerse al original justo en lo que
                    se estaba probando. Con un enum no hay dos frases que confundir. */
                sock.send(JSON.stringify({ flow: EInstanceMessageFlow.RESPONSE, type: EInstanceMessageType.SIGNAL, channel: 'agora', reason: ESignalMessageReason.INSTANCE_UNKNOWN, text: `Instance '${m.instance}' has not been found for command` }))
                return
            }
            commands.push(m)
        })
    })
    const handle = openRemoteChannel({ name: 'r', url, accessString: 'AK' }, baseConfig(), { onMessage: () => {}, onState: () => {} })
    await delay(300)
    handle.send({ msgtype: 'excubitordecisionmessage', channel: 'agora', command: 'add' })
    await delay(900)
    assert.equal(commands.length, 1, 'el comando rechazado tiene que llegar en el reintento, no perderse')
    assert.equal(commands[0].command, 'add')
    assert.equal(commands[0].instance, 'INST-NEW', 'y con la instancia NUEVA, no la muerta')
    handle.close()
    wss.close()
})
