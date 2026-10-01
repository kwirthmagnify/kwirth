import { IInstanceConfig, ISignalMessage, AccessKey, accessKeyDeserialize, EClusterType, BackChannelData, IInstanceMessage, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel, IBackChannelObject, IBackChannelRequirements, IChannel, IProvider, IProviderSubscriber } from '@kwirthmagnify/kwirth-common-back'
import { IChannelInstances } from '@kwirthmagnify/kwirth-common'
import { EProviderDebugPayload, IProviderDebugInstanceConfig, IProviderDebugMessageResponse, IProviderDebugProviderInfo, IProviderDebugSubscriptionHelp } from '../common/ProviderDebugTypes'

/**
 * IProvider declares getSubscriptionHelp() as optional, but the kwirth-common-back published in
 * node_modules may predate that addition. It is extended locally so it can be read without depending
 * on the installed version; the day it is published, both declarations agree.
 */
interface IProviderWithHelp extends IProvider {
    getSubscriptionHelp?(): IProviderDebugSubscriptionHelp
}

/**
 * Id prefix of a PLUVIDER: a plugin that also produces and exposes its information in-process.
 * It is written literally rather than importing PLUVIDER_ID_PREFIX from common, because a new export
 * of common does not exist in a plugin's runtime until the core is rebuilt with that version.
 */
const PLUVIDER_PREFIX = 'plugin:'

/**
 * The only thing this channel needs from a producer in order to debug it, be it a provider or a
 * pluvider. Both publish the same pair of methods; the rest (routers, config, lifecycle) plays no
 * part here.
 */
/*
    The handle the core hands out, as seen by this channel. It is declared here instead of imported from
    kwirth-common-back so as not to tie itself to a particular version of the package.

    'subscribe' returns whatever the provider returns — normally a promise — and here that matters
    especially: this channel exists to poke around in other people's providers, so it is the last place
    where one can assume none of them is going to fail when registering a subscriber.
*/
interface ISubscribable {
    subscribe(c: IProviderSubscriber, data: unknown): unknown
    unsubscribe(c: IProviderSubscriber): unknown
}

/** A pluvider as this channel sees it: what can be subscribed to, plus what it can tell about itself. */
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
     * This instance's own subscriber. Providers keep their subscribers in a Map indexed by the
     * object, so if the channel passed itself there would be room for only one subscription per
     * provider and a single payload: two users debugging the same provider would collide. With one
     * proxy per instance, each has its own entry and its own payload.
     */
    subscriber?: IProviderSubscriber
    /** The producer this instance subscribed to: a provider or a pluvider, either is fine. */
    provider?: ISubscribable
}

class ProviderDebugChannel implements IChannel {
    readonly channelId = 'provider-debug'
    /**
     * Deliberately empty: the core only instantiates and starts the providers some channel declares
     * here, so this channel confines itself to debugging those already running on other plugins'
     * behalf. Declaring concrete providers would start them as a side effect of having a debugger
     * installed, which is exactly what we do not want.
     *
     * With PLUVIDERS the problem does not even arise: a pluvider exists because its plugin is
     * installed and running, not because somebody declares it. So they can be debugged without
     * declaring anything and without starting anything as a side effect.
     */
    readonly requirements: IBackChannelRequirements = { storage: false, providers: [] }
    clusterInfo: any
    backChannelObject: IBackChannelObject
    webSockets: ISocketEntry[] = []

    constructor(clusterInfo: any, backChannelObject: IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
    }

    /*
        What this channel has running right now, for Status's Plugins tab. Instances are counted
        across EVERY connection: one browser carries one instance per open tab, and a user may have
        several browsers. Connections carrying no instance mean the channel is open but unused.
    */
    getInstances = (): IChannelInstances => ({
        instances: this.webSockets.reduce((total, socket) => total + socket.instances.length, 0),
        connections: this.webSockets.length
    })

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

    getChannelScopeLevel = (scope: string): number => ['', 'none', 'cluster', 'admin'].indexOf(scope)

    startChannel = async () => {}

    /**
     * Never invoked: the channel does not register itself as a subscriber, each instance registers
     * its own proxy (see IInstance.subscriber).
     */
    processProviderEvent(_providerId: string, _obj: any): void {}

    endpointRequest(_endpoint: string, _req: any, _res: any, _accessKey?: AccessKey): void {}

    websocketRequest(_newWebSocket: WebSocket, _instanceId: string, _instanceConfig: IInstanceConfig): void {}

    // ---- registration: cluster channels arrive here through addObject('*all') ----
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

        // the catalogue always goes out, even with no provider chosen: it is what populates the selector
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
        // the proxies read socket.ws at send time, so replacing it is enough
        for (const entry of this.webSockets) {
            if (entry.instances.find(i => i.instanceId === instanceId)) {
                entry.ws = newWebSocket
                return true
            }
        }
        return false
    }

    // ---- subscribing to a running provider -----------------------------------
    private subscribe = (socket: ISocketEntry, instance: IInstance, rawSubscriptionData: string): void => {
        // An id with a prefix is a pluvider and lives in its own registry; without a prefix, an
        // ordinary provider. Both subscribe the same way, which is precisely the point.
        const isPluvider = instance.providerId.startsWith(PLUVIDER_PREFIX)
        /*
            Through the core's HANDLE, not by taking the object from the registry and calling it behind
            the core's back. This channel subscribes per INSTANCE — one subscriber per tab, so each can be
            paused and filtered on its own — and the handle admits that: it is what sits behind each tab.
            In exchange, the core learns that provider-debug consumes, which it could not know before and
            is why this channel did not show up in the graph.
        */
        const provider: ISubscribable | undefined = this.clusterInfo.getProvider?.(instance.providerId, this)
        if (!provider) {
            // A provider's message does not serve a pluvider: a stopped provider is one nobody
            // started, whereas an absent pluvider is usually a plugin that is not even installed
            // here. The provider's message is left untouched.
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
            addSubscriber() is async and it is not awaited here: with no catch, a provider that fails when
            registering the subscriber does not leave an error in this channel — it leaves an unhandled
            rejection, and the core exits. This channel exists to poke around in other people's providers,
            so it is the LAST place where assuming the provider is well written is acceptable. It happened
            with 'trivy' precisely, on subscribing with no payload.
        */
        Promise.resolve(provider.subscribe(subscriber, subscriptionData)).catch(err => {
            this.backChannelObject.logWarning?.(`Provider '${instance.providerId}' failed while adding the subscriber: ${String(err)}`)
            this.sendSignalMessage(socket.ws, EInstanceMessageAction.START, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, `Provider '${instance.providerId}' failed while adding the subscriber: ${String(err)}`)
        })
        this.backChannelObject.logInfo?.(`Provider debug instance ${instance.instanceId} subscribed to provider '${instance.providerId}'`)
        this.sendSignalMessage(socket.ws, EInstanceMessageAction.START, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instance.instanceId, `Subscribed to provider '${instance.providerId}'`)
    }

    private unsubscribe = (instance: IInstance): void => {
        if (instance.provider && instance.subscriber) {
            // The same reason as on registration: removal is async too, and is not awaited either.
            Promise.resolve(instance.provider.unsubscribe(instance.subscriber)).catch(err => {
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
     * getSubscriptionHelp() is optional on IProvider and implemented by whoever wants to, so it is
     * called defensively: neither its absence nor its blowing up is an error. A badly written
     * provider must not bring down everybody else's catalogue.
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
     * A pluvider has no 'id' of its own (the core composes it), no routers, nothing of the provider
     * machinery: what it can tell about itself is its getPluviderData(), and it is read just as
     * defensively as the subscription help.
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

        // Pluviders are listed alongside providers: to whoever debugs they are the same thing —
        // something to subscribe to — and they are flagged so it is clear where each one comes from.
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
