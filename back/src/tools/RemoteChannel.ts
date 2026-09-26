import { WebSocket } from 'ws'
import { IClusterEndpoint, IRemoteChannelHandlers, IRemoteChannelHandle, ERemoteConnState } from '@kwirthmagnify/kwirth-common-back'
import { IInstanceConfig, IInstanceMessage, EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType } from '@kwirthmagnify/kwirth-common'

// Reconnection backoff: 1s to start, x2 on every attempt up to a 30s ceiling; it is reset when the connection opens.
const BACKOFF_INITIAL_MS = 1000
const BACKOFF_MAX_MS = 30000

// WS keepalive (ping/pong): an ingress/LB (AKS, for instance) closes idle WSs WITHOUT a close frame, and the
// client does not find out until it tries to WRITE (the send fails / it drops with 1006 in the middle of a
// command → the command is lost). We ping periodically in order to (a) keep the connection alive against the
// LB's idle timeout and (b) detect the cut early: if the pong does not arrive before the next tick, we give
// the connection up for dead and force a reconnection. 30s sits comfortably under the typical idle timeouts
// (AKS ~4min, ingress ~60s).
const KEEPALIVE_MS = 30000

// START watchdog: the socket can be ALIVE but without a valid instance in the remote back end —
// (a) we reconnect to a core that already accepts WSs but whose plugin/channel has not started yet (plugins
// start at the END of the core's boot) → the START registers no instance ("Access denied"/no RESPONSE);
// (b) the remote channel restarted with the socket alive → its instance (only in the pod's memory)
// disappears and every command answers "not been found for command". In both cases we resend the START until
// we capture a valid instance; the keepalive does not help here because the socket is still open. 3s leaves
// room for the plugin's startup.
const START_RETRY_MS = 3000

// Node WebSocket client (back-to-back federation). A mirror of the front end's openRemoteChannels (App.tsx)
// but SINGULAR (one connection = one remote cluster): it opens a WS towards the remote core, starts it with a
// plain START (ITS accessKey, a protocol without a challenge) and delivers the frames through
// handlers.onMessage. It manages the reconnection with backoff and captures the instance assigned in the
// START's RESPONSE (needed in order to send commands referencing an instance valid in THAT cluster). The raw
// WS is NOT exposed: the consumer uses the handle (send/close). It lives in the framework (the core), not in
// any plugin.
export function openRemoteChannel(endpoint: IClusterEndpoint, config: IInstanceConfig, handlers: IRemoteChannelHandlers, logError?: (message: unknown) => void, logInfo?: (message: unknown) => void): IRemoteChannelHandle {
    let ws: WebSocket | undefined
    let closed = false
    let instanceId = ''
    let backoffMs = BACKOFF_INITIAL_MS
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let keepAliveTimer: ReturnType<typeof setInterval> | undefined
    let awaitingPong = false   // se pingeó y aún no volvió el pong → si sigue así al próximo tick, está muerta
    let startAckTimer: ReturnType<typeof setTimeout> | undefined   // watchdog: reintenta el START hasta tener instance

    const stopKeepAlive = () => {
        if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = undefined }
        awaitingPong = false
    }

    const clearStartAck = () => { if (startAckTimer) { clearTimeout(startAckTimer); startAckTimer = undefined } }

    // Sends the plain START (ITS accessKey, a protocol without a challenge) and arms the watchdog: if within
    // START_RETRY_MS we have not captured a valid instance (the START's RESPONSE), it resends. It stops as
    // soon as the instance arrives.
    const sendStart = () => {
        if (closed || !ws || ws.readyState !== WebSocket.OPEN) return
        const start: IInstanceConfig = { ...config, action: EInstanceMessageAction.START, flow: EInstanceMessageFlow.REQUEST, type: EInstanceMessageType.SIGNAL, instance: '', accessKey: endpoint.accessString }
        if (logInfo) logInfo(`[fedtrace] ★ START ${wsUrl}: channel=${config.channel} view=${(config as { view?: string }).view} (instance so far='${instanceId || '<none>'}')`)
        try { ws.send(JSON.stringify(start)) }
        catch (err) { if (logError) logError(`openRemoteChannel: cannot send START to ${wsUrl}: ${err}`) }
        clearStartAck()
        startAckTimer = setTimeout(() => { if (!instanceId) sendStart() }, START_RETRY_MS)
        if (typeof (startAckTimer as unknown as { unref?: () => void }).unref === 'function') (startAckTimer as unknown as { unref: () => void }).unref()
    }

    // Kwirth stores cluster URLs as http(s):// (as entered in "Manage clusters"); the WS lives at the SAME
    // host+port+path, only the scheme changes. The browser's WebSocket auto-upgrades http->ws / https->wss,
    // but the Node 'ws' client does NOT, so we normalize the scheme here (host/port/path untouched).
    const wsUrl = endpoint.url.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:')

    const scheduleRetry = () => {
        if (closed || retryTimer) return
        const delay = backoffMs
        backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS)
        retryTimer = setTimeout(() => {
            retryTimer = undefined
            if (!closed) connect()
        }, delay)
        // Do not keep the event loop alive merely for the reconnection timer (it prevents a test/process from
        // hanging on exit when a connection is left reconnecting).
        if (typeof (retryTimer as unknown as { unref?: () => void }).unref === 'function') (retryTimer as unknown as { unref: () => void }).unref()
    }

    const connect = () => {
        if (closed) return
        if (logInfo) logInfo(`[fedtrace] connect: dialing ${wsUrl} (from ${endpoint.url})`)
        let sock: WebSocket
        try {
            sock = new WebSocket(wsUrl)
        }
        catch (err) {
            if (logError) logError(`openRemoteChannel: cannot open WS to ${wsUrl}: ${err}`)
            scheduleRetry()
            return
        }
        ws = sock

        sock.on('open', () => {
            backoffMs = BACKOFF_INITIAL_MS
            instanceId = ''   // socket nuevo → el instance anterior (si lo hubo) ya no vale en el back remoto
            if (logInfo) logInfo(`[fedtrace] ★ OPEN ${wsUrl}: sending START channel=${config.channel} view=${(config as { view?: string }).view} scope=${(config as { scope?: string }).scope} objects=${(config as { objects?: string }).objects} accessKeyLen=${endpoint.accessString?.length ?? 0}`)
            sendStart()   // arma el watchdog: reintenta hasta capturar un instance válido (el canal remoto puede no estar arrancado aún)
            // The socket is open but we are NOT operational yet: without a valid instance in the remote back
            // end every command is discarded. HANDSHAKING (not CONNECTED): we report CONNECTED only on
            // capturing the instance (the START RESPONSE) — that way the consumer (Agora's dot, for instance)
            // turns green only when the bot is really reachable; meanwhile the socket is up but asking for an
            // instance.
            handlers.onState(ERemoteConnState.HANDSHAKING)
            // Starts the keepalive: on every tick, if the previous ping's pong did NOT come back the connection
            // is dead (the LB closed it without warning) → terminate() fires 'close' → reconnection. If it came
            // back, we ping again.
            stopKeepAlive()
            keepAliveTimer = setInterval(() => {
                if (!sock || sock.readyState !== WebSocket.OPEN) return
                if (awaitingPong) {
                    if (logInfo) logInfo(`[fedtrace] ⚠ keepalive: no pong from ${wsUrl} in ${KEEPALIVE_MS}ms — connection dead, terminating to force reconnect`)
                    try { sock.terminate() } catch { /* noop */ }
                    return
                }
                awaitingPong = true
                try { sock.ping() } catch { /* noop */ }
            }, KEEPALIVE_MS)
            if (typeof (keepAliveTimer as unknown as { unref?: () => void }).unref === 'function') (keepAliveTimer as unknown as { unref: () => void }).unref()
        })

        sock.on('pong', () => { awaitingPong = false })   // el remoto sigue vivo

        sock.on('message', (data: Buffer) => {
            let msg: IInstanceMessage
            try {
                // Buffer.toString() BEFORE parsing (ws delivers a Buffer, not a string, unlike the front end).
                msg = JSON.parse(data.toString())
            }
            catch {
                if (logInfo) logInfo(`[fedtrace] recv ${wsUrl}: NON-JSON frame (${data.toString().slice(0, 120)})`)
                return // frame no-JSON: se ignora
            }
            const mAny = msg as { action?: string; flow?: string; msgtype?: string; instance?: string; text?: string; signalMessage?: string }
            if (logInfo) logInfo(`[fedtrace] recv ${wsUrl}: action=${mAny.action} flow=${mAny.flow} msgtype=${mAny.msgtype} instance=${mAny.instance} text='${mAny.text ?? mAny.signalMessage ?? ''}'`)
            // The remote back end assigns the instance in the START's RESPONSE; we store it in order to be able
            // to SEND commands referencing an instance valid in THAT cluster (otherwise the back end discards it).
            if (msg?.action === EInstanceMessageAction.START && msg?.flow === EInstanceMessageFlow.RESPONSE) {
                if (msg?.instance) {
                    instanceId = msg.instance
                    clearStartAck()   // instance válido → deja de reintentar el START
                    handlers.onState(ERemoteConnState.CONNECTED)   // ahora sí operativos: socket + instance
                    if (logInfo) logInfo(`[fedtrace] ★ REMOTE ASSIGNED instance=${instanceId} (START RESPONSE from ${wsUrl}, text='${mAny.text ?? ''}')`)
                }
                else if (logInfo) logInfo(`[fedtrace] ⚠ START RESPONSE with NO instance from ${wsUrl} (text='${mAny.text ?? ''}') — remote will reject our commands`)
            }
            // The remote back end lost our instance (its channel restarted with the socket alive: the instance
            // only lives in the pod's memory) → it answers "not been found for command". We redo the handshake
            // over the SAME socket in order to get a fresh one (the keepalive does not catch it: the socket is
            // still open).
            else if (msg?.flow === EInstanceMessageFlow.RESPONSE && /not been found for command/i.test(mAny.text ?? mAny.signalMessage ?? '')) {
                if (logInfo) logInfo(`[fedtrace] ⚠ remote lost our instance (${instanceId || '<empty>'}) at ${wsUrl} — re-STARTing the flow`)
                instanceId = ''
                handlers.onState(ERemoteConnState.HANDSHAKING)   // socket vivo pero ya sin instance → naranja, no verde
                sendStart()
            }
            handlers.onMessage(msg)
        })

        sock.on('close', (code: number, reason: Buffer) => {
            stopKeepAlive()   // no seguir pingeando un socket cerrado
            clearStartAck()   // no reintentar el START sobre un socket cerrado (el reconnect reenvía uno nuevo)
            if (logInfo) logInfo(`[fedtrace] CLOSE ${wsUrl}: code=${code} reason=${reason?.toString?.() ?? ''}`)
            if (closed) return
            handlers.onState(ERemoteConnState.RECONNECTING)
            scheduleRetry()
        })

        sock.on('error', (err) => {
            // ws emits 'close' automatically after an 'error'; we do NOT call close() here (doing so during
            // CONNECTING emits 'error' again). The 'close' takes care of the state and of the retry.
            if (logError) logError(`openRemoteChannel: WS error to ${wsUrl}: ${err}`)
        })
    }

    connect()

    return {
        send: (msg: IInstanceMessage) => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                // The command must carry the instance THIS cluster assigned to its connection (not the home one's).
                if (logInfo) logInfo(`[fedtrace] ★ SEND command to ${wsUrl}: msgtype=${(msg as { msgtype?: string }).msgtype} instanceSent=${instanceId || (msg as { instance?: string }).instance || '<EMPTY>'} (remoteAssigned=${instanceId || '<none>'}, msg.instance=${(msg as { instance?: string }).instance || '<empty>'})`)
                // The core requires an accessKey on EVERY command (not just the START), and re-validates it.
                // Stamp the remote endpoint's key on every send, like the front's AgoraClient.cmd does.
                try { ws.send(JSON.stringify({ ...msg, instance: instanceId || msg.instance, accessKey: endpoint.accessString })) }
                catch (err) { if (logError) logError(`openRemoteChannel: cannot send to ${wsUrl}: ${err}`) }
            }
            else if (logInfo) logInfo(`[fedtrace] send DROPPED ${wsUrl}: socket not OPEN (readyState=${ws?.readyState}) msgtype=${(msg as { msgtype?: string }).msgtype}`)
        },
        close: () => {
            closed = true
            stopKeepAlive()
            clearStartAck()
            if (retryTimer) { clearTimeout(retryTimer); retryTimer = undefined }
            const sock = ws
            ws = undefined
            if (sock) {
                sock.removeAllListeners()
                // Closing during CONNECTING emits a late 'error' ('closed before the connection was
                // established'): a no-op handler swallows it (otherwise it would be an uncaughtException).
                // terminate() destroys the socket without the closing handshake.
                sock.on('error', () => { /* noop */ })
                try { sock.terminate() } catch { /* noop */ }
            }
            // A terminal state: the consumer asked for the close; there will be no more reconnections.
            handlers.onState(ERemoteConnState.DOWN)
        }
    }
}
