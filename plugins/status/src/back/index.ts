import { IInstanceConfig, ISignalMessage, AccessKey, EClusterType, BackChannelData, IInstanceMessage, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel, IBackChannelObject, IBackChannelRequirements, IChannel } from '@kwirthmagnify/kwirth-common-back'
import { EComponentHealth, EComponentKind, EStatusPayload, IStatusComponent, IStatusInventory, IStatusMessageResponse } from '../common/StatusTypes'

/*
    Kwirth Status — el inventario de lo que Kwirth tiene montado (S1).

    El canal NO recolecta: consulta. No hay temporizador, ni suscripción a nada, ni estado que mantener
    entre peticiones. Cuando alguien abre la pestaña se lee ClusterInfo —que ya está en memoria— y se manda
    una foto. Con la pestaña cerrada, este plugin no ejecuta una sola instrucción, que es el requisito que
    manda sobre todo lo demás (RNF1 del PRD).
*/

/**
 * Lo que este canal necesita de ClusterInfo, y solo eso.
 *
 * Se declara aquí en vez de usar 'any' porque es lo único que hace este plugin: leer estos cuatro
 * registros. El tipo real vive en el core y no se publica a las extensiones, así que la alternativa
 * honesta a una vista mínima sería un 'any' que no dice nada y no avisa de nada.
 */
interface IProviderLike {
    id: string
    started?: boolean
    configRouterStarted?: boolean
    providesRouter?: boolean
    configRouter?: unknown
}

interface IListing {
    id: string
    configNames: string[]
}

interface IClusterInfoView {
    name?: string
    providers?: IProviderLike[]
    pluviders?: Map<string, unknown>
    senders?: { listSenders(): IListing[] }
    webhooks?: { listWebhooks(): IListing[] }
}

interface ISocketEntry {
    ws: WebSocket
    lastRefresh: number
    instanceIds: string[]
}

class StatusChannel implements IChannel {
    readonly channelId = 'status'
    /*
        Sin providers y sin almacenamiento. Declarar un provider aquí lo ARRANCARÍA como efecto colateral
        de tener instalado un visor de estado —el core instancia lo que algún canal declara—, y entonces
        esta pantalla estaría modificando justo lo que dice observar.
    */
    readonly requirements: IBackChannelRequirements = { storage: false, providers: [] }
    clusterInfo: IClusterInfoView
    backChannelObject: IBackChannelObject
    webSockets: ISocketEntry[] = []

    constructor(clusterInfo: IClusterInfoView, backChannelObject: IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
    }

    getChannelData = (): BackChannelData => ({
        id: 'status',
        routable: false,
        pauseable: false,       // no hay flujo que pausar: es una foto bajo demanda
        modifiable: false,
        reconnectable: true,
        metrics: false,
        sources: [EClusterType.KUBERNETES, EClusterType.DOCKER],
        endpoints: [],
        websocket: false,
        cluster: true,          // lo que se mira es el Kwirth entero, no un pod
        resourced: false
    })

    /*
        Ver el inventario completo es una vista privilegiada: enseña todas las extensiones montadas y su
        estado. Por eso el nivel mínimo es 'cluster' y no hay escalón por namespace — no tendría sentido
        un inventario "de un namespace", y dejarlo en 'none' lo abriría a cualquiera.
    */
    getChannelScopeLevel = (scope: string): number => ['', 'none', 'cluster'].indexOf(scope)

    startChannel = async () => {}

    processProviderEvent(_providerId: string, _obj: unknown): void {}

    endpointRequest(_endpoint: string, _req: unknown, _res: unknown, _accessKey?: AccessKey): void {}

    websocketRequest(_newWebSocket: WebSocket, _instanceId: string, _instanceConfig: IInstanceConfig): void {}

    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, _ns: string, _pod: string, _container: string): Promise<boolean> => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) {
            socket = { ws: webSocket, lastRefresh: Date.now(), instanceIds: [] }
            this.webSockets.push(socket)
        }
        if (!socket.instanceIds.includes(instanceConfig.instance)) socket.instanceIds.push(instanceConfig.instance)
        this.sendInventory(socket, instanceConfig.instance)
        return true
    }

    deleteObject = async (_webSocket: WebSocket, _instanceConfig: IInstanceConfig, _ns: string, _pod: string, _container: string): Promise<boolean> => true

    pauseContinueInstance = (_webSocket: WebSocket, _instanceConfig: IInstanceConfig, _action: EInstanceMessageAction): void => {}

    modifyInstance = (_webSocket: WebSocket, _instanceConfig: IInstanceConfig): void => {}

    containsInstance = (instanceId: string): boolean =>
        this.webSockets.some(socket => socket.instanceIds.includes(instanceId))

    containsAsset = (_webSocket: WebSocket, _podNamespace: string, _podName: string, _containerName: string): boolean => false

    stopInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig): void => {
        this.removeInstance(webSocket, instanceConfig.instance)
    }

    removeInstance = (webSocket: WebSocket, instanceId: string): void => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return
        const pos = socket.instanceIds.indexOf(instanceId)
        if (pos >= 0) socket.instanceIds.splice(pos, 1)
    }

    /*
        Volver a pedir la foto. Es la ÚNICA forma de que este canal haga trabajo: alguien con la pantalla
        abierta pulsa refrescar. No hay refresco automático a propósito — sería recolección disfrazada.
    */
    processCommand = async (webSocket: WebSocket, instanceMessage: IInstanceMessage): Promise<boolean> => {
        if (instanceMessage.flow === EInstanceMessageFlow.IMMEDIATE) return false
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket || !socket.instanceIds.includes(instanceMessage.instance)) {
            this.sendSignalMessage(webSocket, instanceMessage.action, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceMessage.instance, 'Status instance not found')
            return false
        }
        this.sendInventory(socket, instanceMessage.instance)
        return true
    }

    containsConnection = (webSocket: WebSocket): boolean => Boolean(this.webSockets.find(s => s.ws === webSocket))

    removeConnection = (webSocket: WebSocket): void => {
        const pos = this.webSockets.findIndex(s => s.ws === webSocket)
        if (pos >= 0) this.webSockets.splice(pos, 1)
    }

    refreshConnection = (webSocket: WebSocket): boolean => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return false
        socket.lastRefresh = Date.now()
        return true
    }

    updateConnection = (newWebSocket: WebSocket, instanceId: string): boolean => {
        for (const entry of this.webSockets) {
            if (entry.instanceIds.includes(instanceId)) {
                entry.ws = newWebSocket
                return true
            }
        }
        return false
    }

    // ---- el inventario -------------------------------------------------------

    /*
        Estado de un provider con lo que el core sabe HOY.

        Deliberadamente NO se distingue "activo" de "ocioso": para eso hay que preguntarle al provider
        cuántos suscriptores tiene, y ese contrato todavía no existe (llega en S2). Inventar el dato sería
        peor que no darlo — un administrador que lea "ocioso" va a ir a desinstalar algo.
    */
    private healthOfProvider = (p: IProviderLike): { health: EComponentHealth, reason?: string } => {
        if (p.started !== true) {
            return {
                health: EComponentHealth.NOT_INSTANTIATED,
                // El core solo instancia los providers que algún canal declara en sus requirements.
                reason: 'No installed channel declares this provider, so the core never started it'
            }
        }
        // Corriendo, pero con su router de configuración sin montar: los routers se enganchan SOLO al
        // arrancar el servidor, así que su configuración responderá 404 hasta que se reinicie.
        if (p.configRouter && p.configRouterStarted !== true) {
            return {
                health: EComponentHealth.PENDING_RESTART,
                reason: 'Its configuration endpoint is not mounted — the server has not been restarted since it was installed'
            }
        }
        return { health: EComponentHealth.INSTANTIATED }
    }

    private buildInventory = (): IStatusInventory => {
        const components: IStatusComponent[] = []

        for (const p of this.clusterInfo.providers ?? []) {
            const { health, reason } = this.healthOfProvider(p)
            components.push({ kind: EComponentKind.PROVIDER, id: p.id, displayName: p.id, health, ...(reason ? { reason } : {}) })
        }

        /*
            Un pluvider existe porque su plugin está instalado y corriendo, no porque nadie lo declare: si
            está en el registro, está en marcha. No hay un estado intermedio que averiguar.
        */
        for (const pluviderId of (this.clusterInfo.pluviders ?? new Map()).keys()) {
            components.push({
                kind: EComponentKind.PLUVIDER,
                id: pluviderId,
                displayName: pluviderId,
                health: EComponentHealth.INSTANTIATED
            })
        }

        /*
            Senders y webhooks se listan por su registro de acceso. Su 'salud' es más simple: si están
            registrados, están disponibles. Lo que aporta información es cuántas configuraciones tienen —
            un sender sin ninguna está instalado pero no puede entregar nada.

            ⚠️ De los webhooks NO se saca la URL. `getUrl()` la devuelve con el TOKEN dentro, y esta
            pantalla la puede estar mirando alguien que no debe conocerlo.
        */
        for (const s of this.clusterInfo.senders?.listSenders() ?? []) {
            components.push({
                kind: EComponentKind.SENDER,
                id: s.id,
                displayName: s.id,
                health: EComponentHealth.INSTANTIATED,
                reason: s.configNames.length === 0 ? 'Installed, but it has no configuration yet, so it cannot deliver anything' : undefined
            })
        }

        for (const w of this.clusterInfo.webhooks?.listWebhooks() ?? []) {
            components.push({
                kind: EComponentKind.WEBHOOK,
                id: w.id,
                displayName: w.id,
                health: EComponentHealth.INSTANTIATED,
                reason: w.configNames.length === 0 ? 'Installed, but it has no configuration yet, so nothing can reach it' : undefined
            })
        }

        return {
            cluster: this.clusterInfo.name ?? '',
            takenAt: Date.now(),
            components
        }
    }

    private sendInventory = (socket: ISocketEntry, instanceId: string): void => {
        const msg: IStatusMessageResponse = {
            msgtype: 'statusmessageresponse',
            channel: this.channelId,
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA,
            instance: instanceId,
            payloadType: EStatusPayload.INVENTORY,
            inventory: this.buildInventory()
        }
        socket.ws.send(JSON.stringify(msg))
    }

    private sendSignalMessage = (ws: WebSocket, action: EInstanceMessageAction, flow: EInstanceMessageFlow, level: ESignalMessageLevel, instanceId: string, text: string): void => {
        const msg: ISignalMessage = {
            action,
            flow,
            level,
            channel: this.channelId,
            instance: instanceId,
            type: EInstanceMessageType.SIGNAL,
            text
        }
        ws.send(JSON.stringify(msg))
    }
}

export { StatusChannel }
export default StatusChannel
