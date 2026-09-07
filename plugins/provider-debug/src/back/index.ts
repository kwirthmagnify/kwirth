import { IInstanceConfig, ISignalMessage, AccessKey, accessKeyDeserialize, EClusterType, BackChannelData, IInstanceMessage, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel, IBackChannelObject, IBackChannelRequirements, IChannel, IProvider, IProviderSubscriber } from '@kwirthmagnify/kwirth-common-back'
import { EProviderDebugPayload, IProviderDebugInstanceConfig, IProviderDebugMessageResponse, IProviderDebugProviderInfo, IProviderDebugSubscriptionHelp } from '../common/ProviderDebugTypes'

/**
 * IProvider declara getSubscriptionHelp() como opcional, pero el kwirth-common-back publicado en
 * node_modules puede ser anterior a ese añadido. Se extiende localmente para poder leerlo sin
 * depender de la versión instalada; el día que se publique, ambas declaraciones coinciden.
 */
interface IProviderWithHelp extends IProvider {
    getSubscriptionHelp?(): IProviderDebugSubscriptionHelp
}

interface ISocketEntry {
    ws: WebSocket
    lastRefresh: number
    instances: IInstance[]
}

interface IInstance {
    instanceId: string
    accessKey: AccessKey
    providerId: string
    paused: boolean
    /**
     * Subscriber propio de esta instancia. Los providers guardan sus subscribers en un Map
     * indexado por el objeto, así que si el canal se pasase a sí mismo solo cabría una
     * suscripción por provider y un único payload: dos usuarios depurando el mismo provider
     * se pisarían. Con un proxy por instancia cada una tiene su entrada y su propio payload.
     */
    subscriber?: IProviderSubscriber
    provider?: IProvider
}

class ProviderDebugChannel implements IChannel {
    readonly channelId = 'provider-debug'
    /**
     * Deliberadamente vacío: el core solo instancia y arranca los providers que algún canal
     * declara aquí, así que este canal se limita a depurar los que ya están en marcha por
     * cuenta de otros plugins. Declarar providers concretos los arrancaría como efecto
     * colateral de tener instalado un depurador, que es justo lo que no queremos.
     */
    readonly requirements: IBackChannelRequirements = { storage: false, providers: [] }
    clusterInfo: any
    backChannelObject: IBackChannelObject
    webSockets: ISocketEntry[] = []

    constructor(clusterInfo: any, backChannelObject: IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
    }

    getChannelData = (): BackChannelData => ({
        id: 'provider-debug',
        routable: false,
        pauseable: true,
        modifiable: false,      // F1: para cambiar de provider se para y se rearranca la instancia
        reconnectable: true,
        metrics: false,
        sources: [EClusterType.KUBERNETES, EClusterType.DOCKER],
        endpoints: [],
        websocket: false,
        cluster: true,          // los providers son cluster-wide, no cuelgan de un pod
        resourced: false
    })

    getChannelScopeLevel = (scope: string): number => ['', 'none', 'cluster'].indexOf(scope)

    startChannel = async () => {}

    /**
     * Nunca se invoca: el canal no se registra a sí mismo como subscriber, cada instancia
     * registra su propio proxy (ver IInstance.subscriber).
     */
    processProviderEvent(_providerId: string, _obj: any): void {}

    endpointRequest(_endpoint: string, _req: any, _res: any, _accessKey?: AccessKey): void {}

    websocketRequest(_newWebSocket: WebSocket, _instanceId: string, _instanceConfig: IInstanceConfig): void {}

    // ---- registro: los canales cluster llegan aquí vía addObject('*all') ----
    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, _ns: string, _pod: string, _container: string): Promise<boolean> => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) {
            const len = this.webSockets.push({ ws: webSocket, lastRefresh: Date.now(), instances: [] })
            socket = this.webSockets[len - 1]
        }
        if (socket.instances.find(i => i.instanceId === instanceConfig.instance)) return true

        const configData: IProviderDebugInstanceConfig = instanceConfig.data ?? { providerId: '', subscriptionData: '' }
        const instance: IInstance = {
            instanceId: instanceConfig.instance,
            accessKey: accessKeyDeserialize(instanceConfig.accessKey),
            providerId: configData.providerId ?? '',
            paused: false
        }
        socket.instances.push(instance)

        // el catálogo va siempre, aunque no se haya elegido provider: es lo que puebla el selector
        this.sendProviders(socket, instance)

        if (instance.providerId) this.subscribe(socket, instance, configData.subscriptionData)
        return true
    }

    deleteObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, _ns: string, _pod: string, _container: string): Promise<boolean> => {
        this.removeInstance(webSocket, instanceConfig.instance)
        return true
    }

    pauseContinueInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig, action: EInstanceMessageAction): void => {
        const instance = this.getInstance(webSocket, instanceConfig.instance)
        if (!instance) {
            this.sendSignalMessage(webSocket, action, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceConfig.instance, 'Provider debug instance not found')
            return
        }
        if (action === EInstanceMessageAction.PAUSE) instance.paused = true
        if (action === EInstanceMessageAction.CONTINUE) instance.paused = false
    }

    modifyInstance = (_webSocket: WebSocket, _instanceConfig: IInstanceConfig): void => {}

    containsInstance = (instanceId: string): boolean =>
        this.webSockets.some(socket => socket.instances.some(i => i.instanceId === instanceId))

    containsAsset = (_webSocket: WebSocket, _podNamespace: string, _podName: string, _containerName: string): boolean => false

    stopInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig): void => {
        const instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            this.removeInstance(webSocket, instanceConfig.instance)
            this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instanceConfig.instance, 'Provider debug instance stopped')
        }
        else {
            this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceConfig.instance, 'Provider debug instance not found')
        }
    }

    removeInstance = (webSocket: WebSocket, instanceId: string): void => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return
        const pos = socket.instances.findIndex(i => i.instanceId === instanceId)
        if (pos < 0) return
        this.unsubscribe(socket.instances[pos])
        socket.instances.splice(pos, 1)
    }

    processCommand = async (webSocket: WebSocket, instanceMessage: IInstanceMessage): Promise<boolean> => {
        if (instanceMessage.flow === EInstanceMessageFlow.IMMEDIATE) return false
        const instance = this.getInstance(webSocket, instanceMessage.instance)
        if (!instance) {
            this.sendSignalMessage(webSocket, instanceMessage.action, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceMessage.instance, 'Provider debug instance not found')
            return false
        }
        return true
    }

    containsConnection = (webSocket: WebSocket): boolean => Boolean(this.webSockets.find(s => s.ws === webSocket))

    removeConnection = (webSocket: WebSocket): void => {
        const pos = this.webSockets.findIndex(s => s.ws === webSocket)
        if (pos < 0) return
        for (const instance of this.webSockets[pos].instances) this.unsubscribe(instance)
        this.webSockets.splice(pos, 1)
    }

    refreshConnection = (webSocket: WebSocket): boolean => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            socket.lastRefresh = Date.now()
            return true
        }
        return false
    }

    updateConnection = (newWebSocket: WebSocket, instanceId: string): boolean => {
        // los proxies leen socket.ws en el momento del envío, así que basta con sustituirlo
        for (const entry of this.webSockets) {
            if (entry.instances.find(i => i.instanceId === instanceId)) {
                entry.ws = newWebSocket
                return true
            }
        }
        return false
    }

    // ---- suscripción a un provider en marcha ---------------------------------
    private subscribe = (socket: ISocketEntry, instance: IInstance, rawSubscriptionData: string): void => {
        const provider: IProvider | undefined = (this.clusterInfo.providers as IProvider[] | undefined)?.find(p => p.id === instance.providerId)
        if (!provider) {
            this.sendSignalMessage(socket.ws, EInstanceMessageAction.START, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, `Provider '${instance.providerId}' is not running`)
            return
        }

        let subscriptionData: Record<string, unknown> = {}
        if (rawSubscriptionData && rawSubscriptionData.trim() !== '') {
            try {
                subscriptionData = JSON.parse(rawSubscriptionData)
            }
            catch (err) {
                this.sendSignalMessage(socket.ws, EInstanceMessageAction.START, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, `Subscription payload is not valid JSON: ${String(err)}`)
                return
            }
        }

        const subscriber: IProviderSubscriber = {
            processProviderEvent: (providerId: string, obj: any) => this.deliver(socket, instance, providerId, obj)
        }
        instance.subscriber = subscriber
        instance.provider = provider
        provider.addSubscriber(subscriber, subscriptionData)
        this.backChannelObject.logInfo?.(`Provider debug instance ${instance.instanceId} subscribed to provider '${instance.providerId}'`)
        this.sendSignalMessage(socket.ws, EInstanceMessageAction.START, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instance.instanceId, `Subscribed to provider '${instance.providerId}'`)
    }

    private unsubscribe = (instance: IInstance): void => {
        if (instance.provider && instance.subscriber) {
            instance.provider.removeSubscriber(instance.subscriber)
            this.backChannelObject.logInfo?.(`Provider debug instance ${instance.instanceId} unsubscribed from provider '${instance.providerId}'`)
        }
        instance.provider = undefined
        instance.subscriber = undefined
    }

    private deliver = (socket: ISocketEntry, instance: IInstance, providerId: string, obj: unknown): void => {
        if (instance.paused) return
        const msg: IProviderDebugMessageResponse = {
            msgtype: 'providerdebugmessageresponse',
            channel: this.channelId,
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA,
            instance: instance.instanceId,
            payloadType: EProviderDebugPayload.EVENT,
            event: { ts: Date.now(), providerId, event: obj }
        }
        socket.ws.send(JSON.stringify(msg))
    }

    /**
     * getSubscriptionHelp() es opcional en IProvider y lo implementa quien quiere, así que se llama
     * a la defensiva: ni existir es un error, ni lo es que reviente. Un provider mal escrito no
     * puede tumbar el catálogo del resto.
     */
    private helpOf = (provider: IProviderWithHelp): IProviderDebugSubscriptionHelp | undefined => {
        if (typeof provider.getSubscriptionHelp !== 'function') return undefined
        try {
            const help = provider.getSubscriptionHelp()
            if (!help || typeof help.usage !== 'string' || typeof help.example !== 'object') return undefined
            return help
        }
        catch (err) {
            this.backChannelObject.logWarning?.(`Provider '${provider.id}' failed to report its subscription help: ${String(err)}`)
            return undefined
        }
    }

    private sendProviders = (socket: ISocketEntry, instance: IInstance): void => {
        const running: IProviderWithHelp[] = (this.clusterInfo.providers as IProviderWithHelp[] | undefined) ?? []
        const providers: IProviderDebugProviderInfo[] = running.map(p => {
            const help = this.helpOf(p)
            return {
                id: p.id,
                providesRouter: p.providesRouter,
                ...(p.routerAlias ? { routerAlias: p.routerAlias } : {}),
                ...(help ? { help } : {})
            }
        })
        const msg: IProviderDebugMessageResponse = {
            msgtype: 'providerdebugmessageresponse',
            channel: this.channelId,
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA,
            instance: instance.instanceId,
            payloadType: EProviderDebugPayload.PROVIDERS,
            providers
        }
        socket.ws.send(JSON.stringify(msg))
    }

    private sendSignalMessage = (ws: WebSocket, action: EInstanceMessageAction, flow: EInstanceMessageFlow, level: ESignalMessageLevel, instanceId: string, text: string): void => {
        const resp: ISignalMessage = { action, flow, channel: this.channelId, instance: instanceId, type: EInstanceMessageType.SIGNAL, text, level }
        ws.send(JSON.stringify(resp))
    }

    private getInstance(webSocket: WebSocket, instanceId: string): IInstance | undefined {
        const socket = this.webSockets.find(entry => entry.ws === webSocket)
        if (socket) return socket.instances.find(i => i.instanceId === instanceId)
        return undefined
    }
}

export default ProviderDebugChannel
