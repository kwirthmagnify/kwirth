import { WebSocket } from 'ws'
import { IClusterEndpoint, IRemoteChannelHandlers, IRemoteChannelHandle, ERemoteConnState } from '@kwirthmagnify/kwirth-common-back'
import { IInstanceConfig, IInstanceMessage, EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType, ESignalMessageReason } from '@kwirthmagnify/kwirth-common'

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
/** Cap for the probe once we know the channel is UNINSTALLED over there: it may be hours, and asking every
 *  three seconds buys nothing but a log nobody can read (see `armStartWatchdog`). */
const GONE_PROBE_MAX_MS = 60000

// Node WebSocket client (back-to-back federation). A mirror of the front end's openRemoteChannels (App.tsx)
// but SINGULAR (one connection = one remote cluster): it opens a WS towards the remote core, starts it with a
// plain START (ITS accessKey, a protocol without a challenge) and delivers the frames through
// handlers.onMessage. It manages the reconnection with backoff and captures the instance assigned in the
// START's RESPONSE (needed in order to send commands referencing an instance valid in THAT cluster). The raw
// WS is NOT exposed: the consumer uses the handle (send/close). It lives in the framework (the core), not in
// any plugin.
/*
    Traduce el error de conexión a algo que diga QUÉ hacer.

    🔴 El de verdad confuso es `Unexpected server response: 200`: un 200 parece éxito, y lo que significa
    es que pedimos cambiar a WebSocket y nos contestaron con una página normal — o sea que esa ruta la
    sirve otra cosa, no este canal. Diagnosticarlo costó una mañana (2026-10-09) con un ingress cuya regla
    de prefijo dejaba pasar `/kwirth2` hasta que se corrigió, y entonces el mismo sitio empezó a devolver
    200 sin que el mensaje explicara nada.
*/
const explainWsError = (err: unknown, url: string): string => {
    const msg = String((err as { message?: string })?.message ?? err)
    const status = /Unexpected server response:\s*(\d+)/i.exec(msg)
    if (status) return `${msg} — a WebSocket handshake must be answered with 101 Switching Protocols; a ${status[1]} means ${url} is served by something that is not this channel (check the path and the ingress rule)`
    if (/ENOTFOUND/i.test(msg)) return `${msg} — the host does not resolve`
    if (/ECONNREFUSED/i.test(msg)) return `${msg} — nothing is listening on that host and port`
    if (/CERT|SSL|self.signed/i.test(msg)) return `${msg} — the TLS certificate was rejected`
    return msg
}

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

    /*
        Arms the watchdog WITHOUT sending a START now. Used when the remote has just told us there is nothing
        to talk to: sending again right away would be answered with the same refusal, as fast as the link
        allows. The probe is how we find out it is back.

        🔴 Two cadences, because the two cases are nothing alike. START_RETRY_MS (3s) is for a channel that
        is STARTING UP and will answer in a moment. A channel that has been UNINSTALLED may take hours, and
        probing it every three seconds means a START, a refusal and a log line three times a minute, for as
        long as it stays uninstalled — which is how a useful log becomes unreadable. So while we know it is
        gone the probe backs off to a cap; recovery is still automatic, just not frantic.
    */
    /*  `backoff` = «acabamos de confirmar que sigue sin estar», que es lo ÚNICO que debe alargar la espera.
        Sin esa distinción se doblaba dos veces por vuelta —una al armar tras mandar el START y otra al
        llegar su rechazo—, o sea ×4 por ciclo: la cadencia se plantaba en el tope de un minuto en dos
        vueltas y una reinstalación tardaba eso en notarse. El rearme que hace `sendStart` es solo la red
        de seguridad por si no contesta nadie, y no cuenta como intento fallido. */
    const armStartWatchdog = (backoff = false) => {
        clearStartAck()
        const delay = channelGone ? goneProbeMs : START_RETRY_MS
        if (backoff && channelGone) goneProbeMs = Math.min(GONE_PROBE_MAX_MS, goneProbeMs * 2)
        startAckTimer = setTimeout(() => { if (!instanceId) sendStart() }, delay)
        if (typeof (startAckTimer as unknown as { unref?: () => void }).unref === 'function') (startAckTimer as unknown as { unref: () => void }).unref()
    }

    /*
        🔴 The remote no longer serves this channel — its plugin was uninstalled while the socket stayed up.

        Why this needs its own state: the socket is alive, the keepalive answers, and `instanceId` still holds
        the one assigned before the plugin went away. Nothing re-validates it, so the link stays CONNECTED and
        the home goes on **sending and calling it delivered**. Found in QA (2026-10-14): with the plugin
        uninstalled on one member, an assign made from the home produced no ticket, no owner, no queued
        delivery and no warning of any kind. It was reported as done and it was lost.

        The member does say so — the core answers `Unsupported channel in this Kwirth deployment` — but the
        only RESPONSE we listened for was "not been found for command", so this one fell through in silence.

        `true` once we know the channel is gone, back to `false` as soon as an instance is assigned again.
        It exists to keep this idempotent: the probe is refused every time, and the state callback
        downstream neither dedupes nor is free — it logs and re-broadcasts. It also silences the START
        chatter: those lines are worth reading once, not on a loop.
    */
    let channelGone = false
    let goneProbeMs = START_RETRY_MS   // backoff del sondeo mientras el canal no esté (ver `armStartWatchdog`)

    /*
        🔴 What has been sent with the CURRENT instance, kept so it can be sent again if that instance turns
        out to be dead.

        The remote channel can restart with the socket still open — its instance lives only in the pod's
        memory — and then it answers `Instance ... has not been found for command`. We already re-did the
        handshake on that, but the message that was rejected was simply **gone**, and the caller had been
        told `delivered` a round trip earlier, because `send()` returns as soon as the bytes leave.

        What it cost (QA 2026-10-14): assigning an owner to a finding of a member produced
        `1 decision(s) for <uid>: delivered` and, in the very same millisecond, `remote lost our instance —
        re-STARTing the flow`. The decision was never applied, the finding stayed orphan, and nothing
        anywhere said so. It happened on every test because reinstalling the plugin on the member is
        exactly what rotates its instance.

        Bounded on purpose: this is a repair for the handful of messages in flight across a handshake, not
        a durable queue — that one lives in the plugin (`EPendingDeliveryKind`) and survives restarts,
        which this cannot.
    */
    const REPLAY_MAX = 20
    let sentWithInstance: IInstanceMessage[] = []
    let replayPending = false

    // Sends the plain START (ITS accessKey, a protocol without a challenge) and arms the watchdog: if within
    // START_RETRY_MS we have not captured a valid instance (the START's RESPONSE), it resends. It stops as
    // soon as the instance arrives.
    const sendStart = () => {
        if (closed || !ws || ws.readyState !== WebSocket.OPEN) return
        const start: IInstanceConfig = { ...config, action: EInstanceMessageAction.START, flow: EInstanceMessageFlow.REQUEST, type: EInstanceMessageType.SIGNAL, instance: '', accessKey: endpoint.accessString }
        // Silent while we already know the channel is gone: this is the backoff probe, and it is refused
        // every time. The one line that matters was written when we found out.
        if (logInfo && !channelGone) logInfo(`[fedtrace] ★ START ${wsUrl}: channel=${config.channel} view=${(config as { view?: string }).view} (instance so far='${instanceId || '<none>'}')`)
        try { ws.send(JSON.stringify(start)) }
        catch (err) { if (logError) logError(`openRemoteChannel: cannot send START to ${wsUrl}: ${err}`) }
        armStartWatchdog()
    }

    // Kwirth stores cluster URLs as http(s):// (as entered in "Manage clusters"); the WS lives at the SAME
    // host+port+path, only the scheme changes. The browser's WebSocket auto-upgrades http->ws / https->wss,
    // but the Node 'ws' client does NOT, so we normalize the scheme here (host/port/path untouched).
    const wsUrl = endpoint.url.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:')

    /*
        🔴 Al otro lado de `handlers` hay código de una EXTENSIÓN, y se le llama desde dentro del manejador
        de eventos de un WebSocket. Si lanza, no hay nadie que lo recoja: la excepción sale del emisor de
        `ws`, nadie la espera, node la convierte en `uncaughtException` y el core se va ENTERO — con todos
        sus canales y todos sus usuarios dentro, por un fallo en el manejador de uno solo.

        Pasó el 2026-10-14: un identificador sin importar en el back de un plugin (el bundle de desarrollo
        se construye sin typecheck, así que el error no aparece hasta ejecutarlo) acabó en `ReferenceError`
        dentro de `onMessage` y tumbó Kwirth. El mismo criterio que ya se aplica a las promesas sin catch
        (ver `FailureOrigin`): el fallo es del consumidor, se traza diciendo de qué canal es, y el enlace
        —y el core— siguen en pie.
    */
    const consumerThrew = (what: string, err: unknown) => {
        if (logError) logError(`openRemoteChannel: the consumer of channel '${config.channel}' threw on ${what} from ${wsUrl} — isolated, the link and the core keep running: ${(err as Error)?.stack ?? err}`)
    }

    const notifyMessage = (msg: IInstanceMessage) => {
        try { handlers.onMessage(msg) }
        catch (err) { consumerThrew('a message', err) }
    }

    const notifyState = (state: ERemoteConnState) => {
        try { handlers.onState(state) }
        catch (err) { consumerThrew(`state ${state}`, err) }
    }

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
            channelGone = false   // socket nuevo: lo que supiéramos del canal remoto ya no vale, se vuelve a preguntar
            goneProbeMs = START_RETRY_MS
            if (logInfo) logInfo(`[fedtrace] ★ OPEN ${wsUrl}: sending START channel=${config.channel} view=${(config as { view?: string }).view} scope=${(config as { scope?: string }).scope} objects=${(config as { objects?: string }).objects} accessKeyLen=${endpoint.accessString?.length ?? 0}`)
            sendStart()   // arma el watchdog: reintenta hasta capturar un instance válido (el canal remoto puede no estar arrancado aún)
            // The socket is open but we are NOT operational yet: without a valid instance in the remote back
            // end every command is discarded. HANDSHAKING (not CONNECTED): we report CONNECTED only on
            // capturing the instance (the START RESPONSE) — that way the consumer (Agora's dot, for instance)
            // turns green only when the bot is really reachable; meanwhile the socket is up but asking for an
            // instance.
            notifyState(ERemoteConnState.HANDSHAKING)
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
            const mAny = msg as { action?: string; flow?: string; msgtype?: string; instance?: string; text?: string; signalMessage?: string; reason?: string }
            /*  🔴 SOLO por código. Una frase en inglés no es un protocolo: decidir por ella significa que
                reescribir un mensaje de log rompe el comportamiento de un par, en silencio y sin que
                ningún test lo note. Ver ESignalMessageReason.

                Exige que el otro extremo mande el código, o sea un core al día. Es deliberado: un par
                desactualizado se comporta como antes de que esto existiera —el enlace sigue en pie y los
                mensajes se pierden— y eso se arregla desplegando, no adivinando por el texto. */
            const isUnsupported = mAny.reason === ESignalMessageReason.CHANNEL_UNSUPPORTED
            const isInstanceUnknown = mAny.reason === ESignalMessageReason.INSTANCE_UNKNOWN
            /*
                🔴 Una traza POR FRAME no puede ir a INFO. Nació para levantar la federación de Agora, donde
                el tráfico son preguntas y respuestas sueltas, pero un enlace que trae un FEED —la postura de
                un cluster, miles de findings— convierte el log en algo inservible: miles de líneas por
                segundo, y los mensajes que importan sepultados (visto en dev, 2026-10-08).
                Se conservan las de ciclo de vida (START, OPEN, keepalive, cierre), que son pocas y son las
                que de verdad se consultan, y la de frame NO-JSON de arriba, que es rara y siempre interesa.
            */
            // The remote back end assigns the instance in the START's RESPONSE; we store it in order to be able
            // to SEND commands referencing an instance valid in THAT cluster (otherwise the back end discards it).
            if (msg?.action === EInstanceMessageAction.START && msg?.flow === EInstanceMessageFlow.RESPONSE) {
                if (msg?.instance) {
                    instanceId = msg.instance
                    clearStartAck()   // instance válido → deja de reintentar el START
                    channelGone = false   // vuelve a haber canal al otro lado
                    goneProbeMs = START_RETRY_MS   // y el sondeo vuelve a su cadencia normal
                    notifyState(ERemoteConnState.CONNECTED)   // ahora sí operativos: socket + instance
                    if (logInfo) logInfo(`[fedtrace] ★ REMOTE ASSIGNED instance=${instanceId} (START RESPONSE from ${wsUrl}, text='${mAny.text ?? ''}')`)
                    /*  Ya hay instancia válida: se reenvía lo que el remoto rechazó con la anterior. Sin
                        esto, el handshake se rehacía y el mensaje se perdía — que es exactamente cómo un
                        assign sobre un finding ajeno acababa sin dueño con el log diciendo `delivered`. */
                    if (replayPending) {
                        const replay = sentWithInstance
                        sentWithInstance = []
                        replayPending = false
                        for (const m of replay) {
                            try { ws?.send(JSON.stringify({ ...m, instance: instanceId, accessKey: endpoint.accessString })) }
                            catch (err) { if (logError) logError(`openRemoteChannel: cannot resend to ${wsUrl}: ${err}`) }
                        }
                        if (logInfo) logInfo(`[fedtrace] ↻ resent ${replay.length} message(s) to ${wsUrl} with the new instance`)
                    }
                    else sentWithInstance = []   // instancia nueva: lo de la anterior ya no se puede reenviar con sentido
                }
                /*  Sin instancia. Si el texto dice que el canal no está, es el sondeo de backoff siendo
                    rechazado otra vez: ya se dijo una vez y aquí solo se mantiene el estado. Cualquier otro
                    motivo sí se cuenta — es raro y siempre interesa. */
                else if (isUnsupported) {
                    // Solo en la TRANSICIÓN, como abajo: `onState` aguas abajo loguea y re-difunde en cada
                    // llamada, así que repetirlo en cada sondeo sería la misma inundación por otra puerta.
                    if (!channelGone) {
                        channelGone = true
                        if (logError) logError(`[fedtrace] ⚠ ${wsUrl} no longer serves channel '${config.channel}' (uninstalled there?) — the link is NOT operational and everything addressed to it will be QUEUED until it returns`)
                        notifyState(ERemoteConnState.HANDSHAKING)
                    }
                    armStartWatchdog(true)   // sondeo rechazado: la próxima pregunta, más tarde
                }
                else if (logInfo) logInfo(`[fedtrace] ⚠ START RESPONSE with NO instance from ${wsUrl} (text='${mAny.text ?? ''}') — remote will reject our commands`)
            }
            // The remote back end lost our instance (its channel restarted with the socket alive: the instance
            // only lives in the pod's memory) → it answers "not been found for command". We redo the handshake
            // over the SAME socket in order to get a fresh one (the keepalive does not catch it: the socket is
            // still open).
            else if (msg?.flow === EInstanceMessageFlow.RESPONSE && isInstanceUnknown) {
                /*  🔴 Y se REENVÍA lo que se mandó con esa instancia. Antes solo se rehacía el handshake y
                    el mensaje rechazado desaparecía — con el llamante ya informado de `delivered`, porque
                    `send()` vuelve en cuanto salen los bytes. Todos los de `sentWithInstance` fueron con la
                    MISMA instancia muerta, así que todos fueron rechazados igual: se reintentan todos. */
                if (logInfo) logInfo(`[fedtrace] ⚠ remote lost our instance (${instanceId || '<empty>'}) at ${wsUrl} — re-STARTing the flow${sentWithInstance.length ? ` and resending ${sentWithInstance.length} message(s) it refused` : ''}`)
                instanceId = ''
                replayPending = sentWithInstance.length > 0
                notifyState(ERemoteConnState.HANDSHAKING)   // socket vivo pero ya sin instance → naranja, no verde
                sendStart()
            }
            /*
                The channel is no longer installed over there. Unlike the case above, re-STARTing gets us
                nowhere: the core refuses a START for a channel it does not have, with this very message, so
                answering it with another START would loop at link speed. We drop the instance, mark the link
                NOT operational — which is what makes callers QUEUE instead of firing into the void — and let
                the watchdog keep probing. When the plugin comes back, the START is answered with an instance
                and everything owed is delivered.

                Only on the TRANSITION: the probe is refused every START_RETRY_MS, and `onState` downstream
                logs and re-broadcasts on every call, so repeating it would mean a line every three seconds
                for as long as the plugin stays uninstalled.
            */
            /*  Sin mirar el `flow`: este aviso llega de DOS formas —como respuesta a algo nuestro, y
                empujado por el core en el instante de desinstalar (UNSOLICITED, porque nadie lo pidió)—.
                Filtrar por RESPONSE descartaba justo el segundo, que es el que llega a tiempo. El código
                es la señal; el sobre en que venga, no. */
            else if (isUnsupported) {
                instanceId = ''
                /*  🔴 Y lo que se mandó antes de saberlo, se REENVÍA al volver.

                    Este es el primer mensaje tras la desaparición del canal: salió cuando el enlace aún
                    figuraba operativo —nadie había hablado con el miembro desde la desinstalación— y el
                    llamante ya fue informado de `delivered`. Sin esto se pierde justo ese, que es el que
                    el usuario acababa de pedir: `1 decision(s): delivered` seguido, en el mismo
                    milisegundo, de `no longer serves channel` (QA 2026-10-14). Los siguientes sí se
                    encolan, porque para entonces el enlace ya está marcado; el primero no tenía quien lo
                    salvara. */
                if (sentWithInstance.length > 0) replayPending = true
                if (!channelGone) {
                    channelGone = true
                    if (logError) logError(`[fedtrace] ⚠ ${wsUrl} no longer serves channel '${config.channel}' (uninstalled there?) — the link is NOT operational and everything addressed to it will be QUEUED until it returns`)
                    notifyState(ERemoteConnState.HANDSHAKING)
                }
                armStartWatchdog(true)   // sondeo rechazado: la próxima pregunta, más tarde
            }
            notifyMessage(msg)
        })

        sock.on('close', (code: number, reason: Buffer) => {
            stopKeepAlive()   // no seguir pingeando un socket cerrado
            clearStartAck()   // no reintentar el START sobre un socket cerrado (el reconnect reenvía uno nuevo)
            if (logInfo) logInfo(`[fedtrace] CLOSE ${wsUrl}: code=${code} reason=${reason?.toString?.() ?? ''}`)
            if (closed) return
            notifyState(ERemoteConnState.RECONNECTING)
            scheduleRetry()
        })

        sock.on('error', (err) => {
            // ws emits 'close' automatically after an 'error'; we do NOT call close() here (doing so during
            // CONNECTING emits 'error' again). The 'close' takes care of the state and of the retry.
            if (logError) logError(`openRemoteChannel: WS error to ${wsUrl}: ${explainWsError(err, wsUrl)}`)
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
                try {
                    ws.send(JSON.stringify({ ...msg, instance: instanceId || msg.instance, accessKey: endpoint.accessString }))
                    // Se recuerda para poder reenviarlo si esta instancia resulta estar muerta (ver arriba).
                    if (instanceId) {
                        sentWithInstance.push(msg)
                        if (sentWithInstance.length > REPLAY_MAX) sentWithInstance.shift()
                    }
                }
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
            notifyState(ERemoteConnState.DOWN)
        }
    }
}
