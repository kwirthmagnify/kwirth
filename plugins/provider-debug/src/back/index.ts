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

/**
 * Prefijo del id de un PLUVIDER: un plugin que además produce y expone su información in-process.
 * Se escribe literal en vez de importar PLUVIDER_ID_PREFIX de common porque un export nuevo de
 * common no existe en el runtime de un plugin hasta que el core se reconstruye con esa versión.
 */
const PLUVIDER_PREFIX = 'plugin:'

/**
 * Lo único que este canal necesita de un productor para depurarlo, sea un provider o un pluvider.
 * Los dos publican la misma pareja de métodos; lo demás (routers, config, ciclo de vida) no pinta
 * nada aquí.
 */
interface ISubscribable {
    addSubscriber(c: IProviderSubscriber, data: unknown): Promise<void> | void
    removeSubscriber(c: IProviderSubscriber): Promise<void> | void
}

/** Un pluvider, tal y como lo ve este canal: lo suscribible más lo que sabe contar de sí mismo. */
interface IPluviderLike extends ISubscribable {
    getPluviderData?(): { description: string, eventTypeName?: string }
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
    /** El productor al que se suscribió esta instancia: un provider o un pluvider, da igual cuál. */
    provider?: ISubscribable
}

class ProviderDebugChannel implements IChannel {
    readonly channelId = 'provider-debug'
    /**
     * Deliberadamente vacío: el core solo instancia y arranca los providers que algún canal
     * declara aquí, así que este canal se limita a depurar los que ya están en marcha por
     * cuenta de otros plugins. Declarar providers concretos los arrancaría como efecto
     * colateral de tener instalado un depurador, que es justo lo que no queremos.
     *
     * Con los PLUVIDERS el problema ni se plantea: un pluvider existe porque su plugin está
     * instalado y corriendo, no porque alguien lo declare. Así que se pueden depurar sin
     * declarar nada y sin arrancar nada de rebote.
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
        sources: [EClusterType.KUBERNETES],
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
        // Un id con prefijo es un pluvider y vive en su propio registro; sin prefijo, un provider de
        // toda la vida. Los dos se suscriben igual, que es justo la gracia del asunto.
        const isPluvider = instance.providerId.startsWith(PLUVIDER_PREFIX)
        const provider: ISubscribable | undefined = isPluvider
            ? (this.clusterInfo.pluviders as Map<string, IPluviderLike> | undefined)?.get(instance.providerId)
            : (this.clusterInfo.providers as IProvider[] | undefined)?.find(p => p.id === instance.providerId)
        if (!provider) {
            // El mensaje de un provider no vale para un pluvider: un provider parado es un provider
            // que nadie arrancó, mientras que un pluvider ausente suele ser un plugin que ni está
            // instalado aquí. El de provider se deja intacto.
            const text = isPluvider
                ? `Pluvider '${instance.providerId}' is not available (its plugin is not installed, or is not hosted by this Kwirth)`
                : `Provider '${instance.providerId}' is not running`
            this.sendSignalMessage(socket.ws, EInstanceMessageAction.START, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, text)
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
        /*
            addSubscriber() es async y aqui no se espera: sin catch, un provider que falle al dar de alta
            al suscriptor no deja un error en este canal — deja un unhandled rejection, y el core sale.
            Este canal existe para hurgar en providers ajenos, asi que es el ULTIMO sitio donde vale
            asumir que el provider esta bien escrito. Paso justo con 'trivy' al suscribirse sin payload.
        */
        Promise.resolve(provider.addSubscriber(subscriber, subscriptionData)).catch(err => {
            this.backChannelObject.logWarning?.(`Provider '${instance.providerId}' failed while adding the subscriber: ${String(err)}`)
            this.sendSignalMessage(socket.ws, EInstanceMessageAction.START, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, `Provider '${instance.providerId}' failed while adding the subscriber: ${String(err)}`)
        })
        this.backChannelObject.logInfo?.(`Provider debug instance ${instance.instanceId} subscribed to provider '${instance.providerId}'`)
        this.sendSignalMessage(socket.ws, EInstanceMessageAction.START, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instance.instanceId, `Subscribed to provider '${instance.providerId}'`)
    }

    private unsubscribe = (instance: IInstance): void => {
        if (instance.provider && instance.subscriber) {
            // Mismo motivo que en el alta: la baja tambien es async y tampoco se espera.
            Promise.resolve(instance.provider.removeSubscriber(instance.subscriber)).catch(err => {
                this.backChannelObject.logWarning?.(`Provider '${instance.providerId}' failed while removing the subscriber: ${String(err)}`)
            })
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
    private helpOf = (provider: { getSubscriptionHelp?(): IProviderDebugSubscriptionHelp }, id: string): IProviderDebugSubscriptionHelp | undefined => {
        if (typeof provider.getSubscriptionHelp !== 'function') return undefined
        try {
            const help = provider.getSubscriptionHelp()
            if (!help || typeof help.usage !== 'string' || typeof help.example !== 'object') return undefined
            return help
        }
        catch (err) {
            this.backChannelObject.logWarning?.(`'${id}' failed to report its subscription help: ${String(err)}`)
            return undefined
        }
    }

    /**
     * Un pluvider no tiene 'id' propio (el core se lo compone), ni routers, ni nada de la maquinaria
     * de providers: lo que sabe contar de sí mismo es su getPluviderData(), y se lee igual de a la
     * defensiva que la ayuda de suscripción.
     */
    private pluviderDescriptionOf = (pluvider: IPluviderLike, id: string): string | undefined => {
        if (typeof pluvider.getPluviderData !== 'function') return undefined
        try {
            return pluvider.getPluviderData()?.description
        }
        catch (err) {
            this.backChannelObject.logWarning?.(`Pluvider '${id}' failed to report its data: ${String(err)}`)
            return undefined
        }
    }

    private sendProviders = (socket: ISocketEntry, instance: IInstance): void => {
        const running: IProviderWithHelp[] = (this.clusterInfo.providers as IProviderWithHelp[] | undefined) ?? []
        const providers: IProviderDebugProviderInfo[] = running.map(p => {
            const help = this.helpOf(p, p.id)
            return {
                id: p.id,
                providesRouter: p.providesRouter,
                ...(p.routerAlias ? { routerAlias: p.routerAlias } : {}),
                ...(help ? { help } : {})
            }
        })

        // Los pluviders se listan junto a los providers: para quien depura son lo mismo — algo a lo
        // que suscribirse — y van marcados para que se vea de dónde sale cada uno.
        const pluviders = (this.clusterInfo.pluviders as Map<string, IPluviderLike> | undefined) ?? new Map<string, IPluviderLike>()
        for (const [pluvId, pluv] of pluviders) {
            const help = this.helpOf(pluv, pluvId)
            const description = this.pluviderDescriptionOf(pluv, pluvId)
            providers.push({
                id: pluvId,
                providesRouter: false,
                pluvider: true,
                ...(description ? { description } : {}),
                ...(help ? { help } : {})
            })
        }
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
