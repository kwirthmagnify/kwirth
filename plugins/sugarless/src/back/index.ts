import {
    IInstanceConfig, ISignalMessage, AccessKey, accessKeyDeserialize, EClusterType, BackChannelData,
    IInstanceMessage, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow,
    ESignalMessageLevel, IBackChannelObject, IBackChannelRequirements, IChannel, IProvider,
    IProviderSubscriber
} from '@kwirthmagnify/kwirth-common-back'
import { ISugarlessEvent, ISugarlessMessageResponse } from '../common/SugarlessTypes'

const PROVIDER_ID = 'sugarless'

interface ISocketEntry {
    ws: WebSocket
    lastRefresh: number
    instances: IInstance[]
}

interface IInstance {
    instanceId: string
    accessKey: AccessKey
    paused: boolean
    /*
        Subscriber propio de esta instancia, en vez de suscribir el canal entero.

        Los providers guardan sus subscribers en un Map indexado por el objeto, asi que si el canal se
        pasara a si mismo solo cabria UNA suscripcion. Y hay una razon mas importante: startChannel()
        se llama una vez por canal, no por pestaña, asi que suscribiendo ahi una pestaña nueva no
        provocaria ninguna emision y la grafica arrancaria vacia hasta el siguiente ciclo — con un
        intervalo de un minuto, eso parece una averia. Con un proxy por instancia, addSubscriber() se
        invoca por pestaña y el provider le entrega su ventana en el acto.
    */
    subscriber?: IProviderSubscriber
    provider?: IProvider
}

/*
    Canal sugarless: pinta la glucosa que entrega el provider del mismo nombre. Nada mas.

    Es un canal AUTONOMO — 'cluster' y 'resourced' a false — porque no necesita nada del cluster: ni un
    pod, ni un namespace, ni un contenedor. Esa es justamente la tesis que la demo quiere enseñar, y es
    lo que hace que se arranque con la view 'none' en vez de pedir una clave de ambito de cluster para
    abrir una puerta que no existe.
*/
class SugarlessChannel implements IChannel {
    readonly channelId = 'sugarless'
    readonly requirements: IBackChannelRequirements = { storage: false, providers: [PROVIDER_ID] }
    clusterInfo: { providers?: IProvider[] }
    backChannelObject: IBackChannelObject
    webSockets: ISocketEntry[] = []

    constructor(clusterInfo: { providers?: IProvider[] }, backChannelObject: IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
    }

    getChannelData = (): BackChannelData => ({
        id: 'sugarless',
        routable: false,
        pauseable: true,
        modifiable: false,
        reconnectable: true,
        metrics: false,
        sources: [EClusterType.KUBERNETES, EClusterType.DOCKER],
        endpoints: [],
        websocket: false,
        // Las dos en false = canal autonomo: solo se arranca con la view 'none'.
        cluster: false,
        resourced: false
    })

    getChannelScopeLevel = (scope: string): number => ['', 'none', 'cluster'].indexOf(scope)

    // La suscripcion es por instancia (ver IInstance.subscriber), asi que aqui no hay nada que hacer.
    startChannel = async (): Promise<void> => {}

    // Nunca se invoca: el canal no se registra como subscriber, lo hace cada instancia con su proxy.
    processProviderEvent(_providerId: string, _obj: unknown): void {}

    endpointRequest(_endpoint: string, _req: unknown, _res: unknown, _accessKey?: AccessKey): void {}

    websocketRequest(_newWebSocket: WebSocket, _instanceId: string, _instanceConfig: IInstanceConfig): void {}

    containsAsset = (_webSocket: WebSocket, _podNamespace: string, _podName: string, _containerName: string): boolean => false

    containsInstance = (instanceId: string): boolean =>
        this.webSockets.some(socket => socket.instances.some(i => i.instanceId === instanceId))

    processCommand = async (_webSocket: WebSocket, _instanceMessage: IInstanceMessage): Promise<boolean> => true

    /*
        Un canal autonomo llega aqui una sola vez, con los tres selectores vacios: el core no le pasa
        recursos porque no los necesita.
    */
    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, _ns: string, _pod: string, _container: string): Promise<boolean> => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) {
            const length = this.webSockets.push({ ws: webSocket, lastRefresh: Date.now(), instances: [] })
            socket = this.webSockets[length - 1]
        }
        if (socket.instances.find(i => i.instanceId === instanceConfig.instance)) return true

        const instance: IInstance = {
            instanceId: instanceConfig.instance,
            accessKey: accessKeyDeserialize(instanceConfig.accessKey),
            paused: false
        }
        socket.instances.push(instance)
        this.subscribe(socket, instance)
        return true
    }

    deleteObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, _ns: string, _pod: string, _container: string): Promise<boolean> => {
        this.removeInstance(webSocket, instanceConfig.instance)
        return true
    }

    pauseContinueInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig, action: EInstanceMessageAction): void => {
        const instance = this.getInstance(webSocket, instanceConfig.instance)
        if (!instance) {
            this.sendSignalMessage(webSocket, action, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceConfig.instance, 'Sugarless instance not found')
            return
        }
        /*
            Pausar NO desuscribe: el provider sigue llenando su historico igual, y lo unico que se
            congela es la grafica. Al continuar, la pestaña se pone al dia sola con la siguiente
            muestra, sin pedirle nada a la API.
        */
        if (action === EInstanceMessageAction.PAUSE) instance.paused = true
        if (action === EInstanceMessageAction.CONTINUE) instance.paused = false
    }

    modifyInstance = (_webSocket: WebSocket, _instanceConfig: IInstanceConfig): void => {}

    stopInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig): void => {
        const instance = this.getInstance(webSocket, instanceConfig.instance)
        if (!instance) {
            this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceConfig.instance, 'Sugarless instance not found')
            return
        }
        this.removeInstance(webSocket, instanceConfig.instance)
        this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instanceConfig.instance, 'Sugarless instance stopped')
    }

    removeInstance = (webSocket: WebSocket, instanceId: string): void => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return
        const position = socket.instances.findIndex(i => i.instanceId === instanceId)
        if (position < 0) return
        this.unsubscribe(socket.instances[position])
        socket.instances.splice(position, 1)
    }

    containsConnection = (webSocket: WebSocket): boolean => this.webSockets.some(s => s.ws === webSocket)

    removeConnection = (webSocket: WebSocket): void => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return
        // Se desuscribe instancia a instancia: dejar suscriptores huerfanos haria que el provider
        // siguiera entregando eventos a sockets muertos.
        for (const instance of socket.instances) this.unsubscribe(instance)
        this.webSockets.splice(this.webSockets.findIndex(s => s.ws === webSocket), 1)
    }

    refreshConnection = (webSocket: WebSocket): boolean => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return false
        socket.lastRefresh = Date.now()
        return true
    }

    updateConnection = (newWebSocket: WebSocket, instanceId: string): boolean => {
        // Los proxies leen socket.ws en el momento del envio, asi que basta con sustituirlo.
        for (const entry of this.webSockets) {
            if (entry.instances.find(i => i.instanceId === instanceId)) {
                entry.ws = newWebSocket
                return true
            }
        }
        return false
    }

    // ── Suscripcion al provider ─────────────────────────────────────────────────

    private subscribe = (socket: ISocketEntry, instance: IInstance): void => {
        const provider = this.clusterInfo.providers?.find(p => p.id === PROVIDER_ID)
        if (!provider) {
            this.sendSignalMessage(socket.ws, EInstanceMessageAction.START, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId,
                `The '${PROVIDER_ID}' provider is not running. Install it and restart Kwirth.`)
            return
        }

        const subscriber: IProviderSubscriber = {
            processProviderEvent: (_providerId: string, obj: unknown) => this.deliver(socket, instance, obj as ISugarlessEvent)
        }
        instance.subscriber = subscriber
        instance.provider = provider
        // Sin payload: hay una sola cuenta y una sola serie, no hay nada que elegir.
        void provider.addSubscriber(subscriber, {})
    }

    private unsubscribe = (instance: IInstance): void => {
        if (instance.provider && instance.subscriber) void instance.provider.removeSubscriber(instance.subscriber)
        instance.provider = undefined
        instance.subscriber = undefined
    }

    private deliver = (socket: ISocketEntry, instance: IInstance, event: ISugarlessEvent): void => {
        if (instance.paused) return
        const message: ISugarlessMessageResponse = {
            msgtype: 'sugarlessmessageresponse',
            channel: this.channelId,
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA,
            instance: instance.instanceId,
            event
        }
        socket.ws.send(JSON.stringify(message))
    }

    private sendSignalMessage = (ws: WebSocket, action: EInstanceMessageAction, flow: EInstanceMessageFlow, level: ESignalMessageLevel, instanceId: string, text: string): void => {
        const response: ISignalMessage = {
            action, flow, level, text,
            channel: this.channelId,
            instance: instanceId,
            type: EInstanceMessageType.SIGNAL
        }
        ws.send(JSON.stringify(response))
    }

    private getInstance = (webSocket: WebSocket, instanceId: string): IInstance | undefined =>
        this.webSockets.find(s => s.ws === webSocket)?.instances.find(i => i.instanceId === instanceId)
}

export default SugarlessChannel
