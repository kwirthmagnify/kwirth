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
export function openRemoteChannel(endpoint: IClusterEndpoint, config: IInstanceConfig, handlers: IRemoteChannelHandlers, logError?: (message: unknown) => void, logInfo?: (message: unknown) => void): IRemoteChannelHandle {
    let ws: WebSocket | undefined
    let closed = false
    let instanceId = ''
    let backoffMs = BACKOFF_INITIAL_MS
    let retryTimer: ReturnType<typeof setTimeout> | undefined

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
            // START plano con el accessKey del cluster remoto (mismo protocolo que el front: sin challenge).
            const start: IInstanceConfig = { ...config, action: EInstanceMessageAction.START, flow: EInstanceMessageFlow.REQUEST, type: EInstanceMessageType.SIGNAL, instance: '', accessKey: endpoint.accessString }
            if (logInfo) logInfo(`[fedtrace] OPEN ${wsUrl}: sending START (channel=${config.channel}, accessKey len=${endpoint.accessString?.length ?? 0})`)
            try {
                sock.send(JSON.stringify(start))
            }
            catch (err) {
                if (logError) logError(`openRemoteChannel: cannot send START to ${wsUrl}: ${err}`)
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
                if (logInfo) logInfo(`[fedtrace] recv ${wsUrl}: NON-JSON frame (${data.toString().slice(0, 120)})`)
                return // frame no-JSON: se ignora
            }
            if (logInfo) logInfo(`[fedtrace] recv ${wsUrl}: action=${(msg as { action?: string }).action} flow=${(msg as { flow?: string }).flow} msgtype=${(msg as { msgtype?: string }).msgtype} instance=${(msg as { instance?: string }).instance}`)
            // El back remoto asigna el instance en la RESPONSE del START; lo guardamos para poder ENVIAR
            // comandos que referencien un instance válido en ESE cluster (si no, el back lo descarta).
            if (msg?.action === EInstanceMessageAction.START && msg?.flow === EInstanceMessageFlow.RESPONSE && msg?.instance) {
                instanceId = msg.instance
                if (logInfo) logInfo(`[fedtrace] captured instance=${instanceId} from START RESPONSE`)
            }
            handlers.onMessage(msg)
        })

        sock.on('close', (code: number, reason: Buffer) => {
            if (logInfo) logInfo(`[fedtrace] CLOSE ${wsUrl}: code=${code} reason=${reason?.toString?.() ?? ''}`)
            if (closed) return
            handlers.onState(ERemoteConnState.RECONNECTING)
            scheduleRetry()
        })

        sock.on('error', (err) => {
            // ws emite 'close' automáticamente tras un 'error'; NO llamamos close() aquí (hacerlo durante
            // CONNECTING vuelve a emitir 'error'). El 'close' se encarga del estado y del reintento.
            if (logError) logError(`openRemoteChannel: WS error to ${wsUrl}: ${err}`)
        })
    }

    connect()

    return {
        send: (msg: IInstanceMessage) => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                // El comando debe llevar el instance QUE ESTE cluster asignó a su conexión (no el del home).
                if (logInfo) logInfo(`[fedtrace] send ${wsUrl}: msgtype=${(msg as { msgtype?: string }).msgtype} instance=${instanceId || (msg as { instance?: string }).instance}`)
                try { ws.send(JSON.stringify({ ...msg, instance: instanceId || msg.instance })) }
                catch (err) { if (logError) logError(`openRemoteChannel: cannot send to ${wsUrl}: ${err}`) }
            }
            else if (logInfo) logInfo(`[fedtrace] send DROPPED ${wsUrl}: socket not OPEN (readyState=${ws?.readyState}) msgtype=${(msg as { msgtype?: string }).msgtype}`)
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
