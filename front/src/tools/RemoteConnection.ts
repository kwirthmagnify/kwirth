import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType, ESignalMessageReason } from '@kwirthmagnify/kwirth-common'
import { ERemoteConnState, IRemoteChannelHandlers } from '@kwirthmagnify/kwirth-common-front'
import { Cluster } from '../model/Cluster'
import { clusterBaseUrl } from './ClusterRouting'

/*
    ONE managed connection from the front to a channel on some Kwirth: START with that Kwirth's key, state
    reported only when it means something, keepalive, reconnection that re-resolves the endpoint. The raw
    WebSocket is never handed out — it is replaced on every reconnect.

    It was the inside of a tab's openRemoteChannels (multi-cluster federation, Excubitor's landscape) and
    was taken out unchanged so that something that is NOT a tab can hold one too: the front getting its
    route ticket from its own core (ClusterRouting). The lessons written below were paid for in the
    federation; they apply to any connection like this one.
*/
export class RemoteConnection {
    private ws?: WebSocket
    private closed = false
    private retry?: ReturnType<typeof setInterval>
    private keepAlive?: ReturnType<typeof setInterval>
    private startAck?: ReturnType<typeof setTimeout>
    private instanceId?: string
    /*
        🔴 `using` guarda COPIAS de la url y la clave, no el objeto Cluster.

        Guardaba la referencia, y el diálogo de Manage clusters edita los clusters EN EL SITIO
        (`selectedCluster.url = url`, sobre los mismos objetos que la lista de App). Con eso,
        la comprobación de "¿ha cambiado el endpoint?" comparaba un objeto consigo mismo: daba
        "no ha cambiado" siempre, y la conexión viva nunca se soltaba. La pestaña abierta
        seguía diciendo 3/3 mientras una nueva decía 2/3 — y el arreglo que debía evitarlo
        estaba leyendo su propia escritura (visto en dev, 2026-10-09).

        Copiar los dos valores al conectar hace la comparación inmune a que alguien mute el
        objeto por detrás, que es exactamente lo que pasa aquí.
    */
    private using?: { url: string, accessString: string }

    /*
        'resolve' gives the endpoint to dial NOW: it is asked again on every retry (see onclose). 'instanceConfig'
        is what goes in the START besides action/flow/type/instance/accessKey. 'keepAliveSeconds' is read on every
        connection, so a change in the user settings applies on the next one.
    */
    constructor(
        readonly clusterId: string,
        private readonly resolve: () => Cluster,
        private readonly instanceConfig: object,
        private readonly channelId: string,
        private readonly keepAliveSeconds: () => number,
        private readonly handlers: IRemoteChannelHandlers
    ) {}

    start = (): void => this.connect(this.resolve())

    // Sends with the instance THIS connection was assigned (the remote looks it up and drops a mismatch).
    send = (msg: object): void => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ ...msg, instance: this.instanceId ?? (msg as { instance?: string }).instance }))
    }

    close = (): void => {
        this.closed = true
        if (this.retry) { clearInterval(this.retry); this.retry = undefined }
        if (this.keepAlive) { clearInterval(this.keepAlive); this.keepAlive = undefined }
        if (this.startAck) { clearTimeout(this.startAck); this.startAck = undefined }
        if (this.ws) { this.ws.onclose = null; this.ws.onerror = null; this.ws.onmessage = null; try { this.ws.close() } catch { /* noop */ } }
    }

    /*
        Drops the connection if the endpoint it is using is no longer the configured one; the retry loop (which
        re-resolves) brings up the new one. A healthy connection is left alone.
    */
    refresh = (fresh: Cluster): void => {
        if (this.closed || !this.using) return
        if (clusterBaseUrl(fresh) === this.using.url && fresh.accessString === this.using.accessString) return
        console.log(`Cluster ${this.clusterId} changed endpoint: dropping its federated connection to pick the new one up`)
        if (this.ws) { try { this.ws.close() } catch { /* el onclose dispara el reintento */ } }
    }

    private connect = (endpoint: Cluster): void => {
        let ws: WebSocket
        const endpointUrl = clusterBaseUrl(endpoint)
        try { ws = new WebSocket(endpointUrl) }
        catch { return }
        this.using = { url: endpointUrl, accessString: endpoint.accessString }   // con qué dirección y clave está hablando AHORA MISMO (por VALOR: ver `using`)
        this.ws = ws
        ws.onopen = () => {
            if (this.retry) { clearInterval(this.retry); this.retry = undefined }
            ws.send(JSON.stringify({ ...this.instanceConfig, action: EInstanceMessageAction.START, flow: EInstanceMessageFlow.REQUEST, type: EInstanceMessageType.SIGNAL, instance: '', accessKey: endpoint.accessString }))
            /*
                🔴 HANDSHAKING, no CONNECTED. Un socket abierto NO es un cluster operativo.

                Aquí se daba por conectado en cuanto el socket se abría, sin esperar a que el
                otro extremo contestara. Con eso, un cluster cuyo START se rechaza —clave
                inválida, canal inexistente, una URL que no sirve este canal— se pintaba verde
                y "contribuyendo" mientras no aportaba un solo finding. El 2026-10-09 se vio en
                crudo: el back decía `down` para el mismo cluster y la topbar seguía en 3/3.

                El back ya lo hacía bien (RemoteChannel: CONNECTED solo con el START RESPONSE
                que trae instancia). Que los dos lados midan lo mismo es lo que permite creerse
                el indicador; dos definiciones de "conectado" garantizan que una miente.
            */
            /*  ⚠️ Debería ser HANDSHAKING —socket abierto, instancia todavía no—, que es lo que
                el back usa. El enum de common-front no lo tiene: está declarado DOS VECES, en
                common-front y en common-back, y solo el del back lo incluye. Añadirlo obliga a
                publicar common-front y a reinstalarlo en front y plugins, así que se usa
                RECONNECTING, que ya pinta el indicador en naranja y NO cuenta como conectado,
                que es lo que importa. La unificación de los dos enums está en el backlog. */
            this.handlers.onState(this.clusterId, ERemoteConnState.RECONNECTING)
            /*  Y si el START no se contesta, no se deja la conexión colgada en naranja para
                siempre: se cierra, y el bucle de reintento —que re-resuelve el endpoint— la
                vuelve a levantar. Un socket que abre y calla es justo lo que pasa cuando al
                otro lado hay algo que no es este canal. */
            if (this.startAck) clearTimeout(this.startAck)
            this.startAck = setTimeout(() => { if (!this.closed && !this.instanceId) { try { ws.close() } catch { /* noop */ } } }, 10000)
            /*
                `keepAlive` is not an extra: a reverse proxy closes connections it considers idle, and a
                federated DATA connection is quiet by nature — it only speaks when the posture of that
                cluster changes. Without a heartbeat an AWS ALB cut them at its 60 s default, and the user
                watched "reconnecting… / back online" every minute (reported 2026-10-08). The retry below
                hid how bad it was: it reconnected, so it looked survivable, while every cut cost a fresh
                START and a fresh snapshot.
                Same interval the home connection uses (user settings), on purpose: two knobs for the same
                thing is how they end up out of sync, and the day someone raises one and not the other this
                comes back with a worse diagnosis.
                The ping only makes sense once an instance has been assigned (the START reply gives it),
                which is why it is re-armed on EVERY connection: after a reconnect the instance is a
                different one.
            */
            if (this.keepAlive) clearInterval(this.keepAlive)
            this.keepAlive = setInterval(() => {
                if (this.closed || !this.instanceId || this.ws?.readyState !== WebSocket.OPEN) return
                this.ws.send(JSON.stringify({
                    action: EInstanceMessageAction.PING,
                    flow: EInstanceMessageFlow.REQUEST,
                    type: EInstanceMessageType.SIGNAL,
                    channel: this.channelId,
                    instance: this.instanceId
                }))
            }, this.keepAliveSeconds() * 1000)
        }
        ws.onmessage = (ev) => {
            try {
                const m = JSON.parse(ev.data)
                // The back end assigns the instance in the reply to the START; we keep it per
                // connection so commands (accept/assign/remediate) can be SENT referencing an
                // instance valid in THAT cluster (otherwise the back end answers "Instance not
                // found for command").
                if (m?.action === EInstanceMessageAction.START && m?.flow === EInstanceMessageFlow.RESPONSE && m?.instance) {
                    this.instanceId = m.instance
                    if (this.startAck) { clearTimeout(this.startAck); this.startAck = undefined }
                    // AHORA sí: hay instancia en el otro lado, o sea el canal existe allí, la
                    // clave vale y los mensajes van a llegar a alguien. Es el mismo criterio
                    // que el back, y el único que hace que el indicador signifique algo.
                    this.handlers.onState(this.clusterId, ERemoteConnState.CONNECTED)
                }
                /*
                    🔴 The channel is no longer installed over there, and the socket does NOT
                    say so: uninstalling a plugin on a member leaves the cluster up and the
                    connection open, so nothing here ever changes state. The tab went on
                    believing that member was reporting — counting it in the coverage badge
                    with data that had stopped arriving, and never re-subscribing to its
                    findings when the plugin came back (a NEW tab did see them, because it
                    starts from a snapshot). Reported 2026-10-14.

                    Closing is the whole fix: `onclose` already reports RECONNECTING and the
                    retry loop re-resolves the endpoint and re-STARTs. While the plugin is
                    away each START is refused and the 10 s watchdog closes again; the moment
                    it is back, the START is answered with an instance, state goes CONNECTED
                    and the snapshot re-subscribes. Same criterion the back end uses.
                */
                // 🔴 SOLO por código: una frase en inglés no es un protocolo (ver ESignalMessageReason).
                // Sin mirar el `flow`: llega como respuesta a algo nuestro Y empujado por el core
                // al desinstalar (UNSOLICITED). Filtrar por RESPONSE descarta el que llega a tiempo.
                if (m?.reason === ESignalMessageReason.CHANNEL_UNSUPPORTED) {
                    if (this.instanceId) console.log(`Remote channel gone on ${this.clusterId} (uninstalled?): closing to re-handshake`, new Date().toISOString())
                    this.instanceId = undefined
                    this.handlers.onMessage(this.clusterId, m)   // el plugin decide qué hacer con sus datos
                    try { ws.close() } catch { /* noop */ }
                    return
                }
                this.handlers.onMessage(this.clusterId, m)
            } catch { /* no-JSON: ignora */ }
        }
        ws.onclose = (ev) => {
            /*
                The close code is the only thing that says WHO ended the connection, and without
                it a drop is indistinguishable from any other: 1006 means nobody sent a close
                frame (the network or an intermediary killed it), 1000/1001 means somebody closed
                it on purpose, 1011/1008 means the far end rejected it. Diagnosing the federated
                connections dropping on ECS cost a morning for the lack of this one line.
            */
            console.log(`Remote DATA websocket closed (${this.clusterId}): code=${ev.code} reason='${ev.reason}' wasClean=${ev.wasClean}`, new Date().toISOString())
            // Always stopped, even if the connection is already closed or retrying: an interval
            // that outlives its socket keeps firing against a `readyState` that is not OPEN, and
            // every reconnect would leave one more behind.
            if (this.keepAlive) { clearInterval(this.keepAlive); this.keepAlive = undefined }
            if (this.startAck) { clearTimeout(this.startAck); this.startAck = undefined }
            this.instanceId = undefined   // la instancia muere con el socket: la nueva la asigna el próximo START
            if (this.closed || this.retry) return
            this.handlers.onState(this.clusterId, ERemoteConnState.RECONNECTING)
            /*
                🔴 El endpoint se RE-RESUELVE en cada reintento, no se reusa el que se capturó
                al abrir. Reusarlo dejaba la pestaña hablando para siempre con la URL que leyó
                al arrancar: se corregía la URL de un cluster en Manage clusters y la pestaña
                abierta ni se enteraba, mientras una nueva usaba ya la nueva. Dos pestañas del
                mismo usuario, el mismo cluster, estados distintos — y nadie había roto nada
                (visto en dev, 2026-10-08).
            */
            this.retry = setInterval(() => {
                if (this.closed) return
                this.connect(this.resolve())
            }, 10000)
        }
        ws.onerror = () => { try { ws.close() } catch { /* noop */ } }
    }
}
