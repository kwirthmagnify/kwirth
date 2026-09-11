import { WebSocket } from 'ws'
import { IClusterEndpoint, IRemoteChannelHandlers, IRemoteChannelHandle, ERemoteConnState } from '@kwirthmagnify/kwirth-common-back'
import { IInstanceConfig, IInstanceMessage, EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType } from '@kwirthmagnify/kwirth-common'

// Backoff de reconexión: 1s inicial, x2 en cada intento hasta un tope de 30s; se resetea al abrir la conexión.
const BACKOFF_INITIAL_MS = 1000
const BACKOFF_MAX_MS = 30000

// Cliente WebSocket Node (federación back-a-back). Espejo del openRemoteChannels del front (App.tsx) pero
// SINGULAR (una conexión = un cluster remoto): abre un WS hacia el core remoto, lo arranca con un START
// plano (SU accessKey, protocolo sin challenge) y entrega los frames por handlers.onMessage. Gestiona la
// reconexión con backoff y captura el instance asignado en la RESPONSE del START (necesario para enviar
// comandos que referencien un instance válido en ESE cluster). El WS crudo NO se expone: el consumidor
// usa el handle (send/close). Vive en el framework (core), no en ningún plugin.
export function openRemoteChannel(endpoint: IClusterEndpoint, config: IInstanceConfig, handlers: IRemoteChannelHandlers, logError?: (message: unknown) => void): IRemoteChannelHandle {
    let ws: WebSocket | undefined
    let closed = false
    let instanceId = ''
    let backoffMs = BACKOFF_INITIAL_MS
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    const scheduleRetry = () => {
        if (closed || retryTimer) return
        const delay = backoffMs
        backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS)
        retryTimer = setTimeout(() => {
            retryTimer = undefined
            if (!closed) connect()
        }, delay)
    }

    const connect = () => {
        if (closed) return
        let sock: WebSocket
        try {
            sock = new WebSocket(endpoint.url)
        }
        catch (err) {
            if (logError) logError(`openRemoteChannel: cannot open WS to ${endpoint.url}: ${err}`)
            scheduleRetry()
            return
        }
        ws = sock

        sock.on('open', () => {
            backoffMs = BACKOFF_INITIAL_MS
            // START plano con el accessKey del cluster remoto (mismo protocolo que el front: sin challenge).
            const start: IInstanceConfig = { ...config, action: EInstanceMessageAction.START, flow: EInstanceMessageFlow.REQUEST, type: EInstanceMessageType.SIGNAL, instance: '', accessKey: endpoint.accessString }
            try {
                sock.send(JSON.stringify(start))
            }
            catch (err) {
                if (logError) logError(`openRemoteChannel: cannot send START to ${endpoint.url}: ${err}`)
            }
            handlers.onState(ERemoteConnState.CONNECTED)
        })

        sock.on('message', (data: Buffer) => {
            let msg: IInstanceMessage
            try {
                // Buffer.toString() ANTES de parsear (ws entrega Buffer, no string, a diferencia del front).
                msg = JSON.parse(data.toString())
            }
            catch {
                return // frame no-JSON: se ignora
            }
            // El back remoto asigna el instance en la RESPONSE del START; lo guardamos para poder ENVIAR
            // comandos que referencien un instance válido en ESE cluster (si no, el back lo descarta).
            if (msg?.action === EInstanceMessageAction.START && msg?.flow === EInstanceMessageFlow.RESPONSE && msg?.instance) instanceId = msg.instance
            handlers.onMessage(msg)
        })

        sock.on('close', () => {
            if (closed) return
            handlers.onState(ERemoteConnState.RECONNECTING)
            scheduleRetry()
        })

        sock.on('error', (err) => {
            // ws emite 'close' automáticamente tras un 'error'; NO llamamos close() aquí (hacerlo durante
            // CONNECTING vuelve a emitir 'error'). El 'close' se encarga del estado y del reintento.
            if (logError) logError(`openRemoteChannel: WS error to ${endpoint.url}: ${err}`)
        })
    }

    connect()

    return {
        send: (msg: IInstanceMessage) => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                // El comando debe llevar el instance QUE ESTE cluster asignó a su conexión (no el del home).
                try { ws.send(JSON.stringify({ ...msg, instance: instanceId || msg.instance })) }
                catch (err) { if (logError) logError(`openRemoteChannel: cannot send to ${endpoint.url}: ${err}`) }
            }
        },
        close: () => {
            closed = true
            if (retryTimer) { clearTimeout(retryTimer); retryTimer = undefined }
            const sock = ws
            ws = undefined
            if (sock) {
                sock.removeAllListeners()
                // Cerrar durante CONNECTING emite un 'error' tardío ('closed before the connection was
                // established'): un handler no-op lo traga (si no, sería uncaughtException). terminate()
                // destruye el socket sin el handshake de cierre.
                sock.on('error', () => { /* noop */ })
                try { sock.terminate() } catch { /* noop */ }
            }
            // Estado terminal: el consumidor pidió el cierre; no habrá más reconexiones.
            handlers.onState(ERemoteConnState.DOWN)
        }
    }
}
