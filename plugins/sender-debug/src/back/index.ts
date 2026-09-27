import { IInstanceConfig, ISignalMessage, AccessKey, accessKeyDeserialize, EClusterType, BackChannelData, IInstanceMessage, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel, IBackChannelObject, IBackChannelRequirements, IChannel, ISenderMessage, ISenderResult } from '@kwirthmagnify/kwirth-common-back'
import { ESenderDebugCommand, ESenderDebugKind, ESenderDebugPayload, ISenderDebugCommandMessage, ISenderDebugMessageResponse, ISenderDebugResult, ISenderDebugSendRequest, ISenderDebugSenderInfo } from '../common/SenderDebugTypes'

/**
 * The only thing this channel needs from a sender. It is declared here rather than importing ISender,
 * because what arrives is whatever the core instantiated: a sender published months ago may not carry
 * the optional methods, and here they are checked one by one before being called.
 */
interface ISenderLike {
    readonly id: string
    readonly senderType?: 'filter' | 'output'
    hasConfig(configName: string): boolean
    getConfigNames(): string[]
    send(configName: string, message: ISenderMessage): Promise<ISenderResult | void>
    sendBatch?(configName: string, messages: ISenderMessage[]): Promise<ISenderResult | void>
}

/** One row of what is installed, exactly as the core's manager returns it. */
interface ISenderInstalledMeta {
    id: string
    displayName?: string
    version?: string
    configNames?: string[]
}

/**
 * The core's sender registry (its SenderManager), as this channel sees it.
 *
 * It is reached through 'clusterInfo.senders' and NOT through 'backChannelObject.senders', which is
 * the official route, for the very reason that justifies the whole plugin: SenderManager.send()
 * catches the sender's exception, writes it to the core's log and returns undefined — which is the
 * SAME thing a successful send of a notification sender returns. Through the official route a
 * debugger cannot tell delivered from blown up, which is precisely the only thing one comes here to see.
 *
 * With the raw registry the real sender is obtained and its send() is called, catching the exception
 * here. The same precedent as provider-debug with 'clusterInfo.providers'.
 */
interface ISenderRegistry {
    getSender(id: string): ISenderLike | undefined
    /** only the ALREADY instantiated ones: getSender() is lazy, so this is not the list of installed ones */
    listSenders(): Array<{ id: string, configNames: string[] }>
    /** the installed ones, with their version and configurations. It is what GET /core/senders serves */
    listInstalled?(): Promise<ISenderInstalledMeta[]>
}

/** What this channel uses from the clusterInfo the core injects into it. */
interface IClusterInfoLike {
    senders?: ISenderRegistry
}

interface ISocketEntry {
    ws: WebSocket
    lastRefresh: number
    instances: IInstance[]
}

interface IInstance {
    instanceId: string
    accessKey: AccessKey
}

/** Ceiling on messages per batch. A debugger is not a load generator. */
const MAX_BATCH = 100

class SenderDebugChannel implements IChannel {
    readonly channelId = 'sender-debug'
    /*
        Empty on purpose, just like provider-debug: the core only instantiates and starts what some
        channel declares, and a debugger must not open anything as a side effect of being installed.
        Senders are not declared here in any form — they are asked of the registry when they are needed.
    */
    readonly requirements: IBackChannelRequirements = { storage: false, providers: [] }
    clusterInfo: IClusterInfoLike
    backChannelObject: IBackChannelObject
    webSockets: ISocketEntry[] = []

    constructor(clusterInfo: IClusterInfoLike, backChannelObject: IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
    }

    getChannelData = (): BackChannelData => ({
        id: 'sender-debug',
        routable: false,
        pauseable: false,       // no hay flujo que pausar: aqui solo se envia cuando se pulsa
        modifiable: false,
        reconnectable: true,
        metrics: false,
        sources: [EClusterType.KUBERNETES],
        endpoints: [],
        websocket: false,
        cluster: true,          // los senders son del Kwirth entero, no cuelgan de un pod
        resourced: false
    })

    getChannelScopeLevel = (scope: string): number => ['', 'none', 'cluster'].indexOf(scope)

    startChannel = async () => {}

    processProviderEvent(_providerId: string, _obj: unknown): void {}

    endpointRequest(_endpoint: string, _req: never, _res: never, _accessKey?: AccessKey): void {}

    websocketRequest(_newWebSocket: WebSocket, _instanceId: string, _instanceConfig: IInstanceConfig): void {}

    // ---- registration: cluster channels arrive here through addObject('*all') ----
    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, _ns: string, _pod: string, _container: string): Promise<boolean> => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) {
            const len = this.webSockets.push({ ws: webSocket, lastRefresh: Date.now(), instances: [] })
            socket = this.webSockets[len - 1]
        }
        if (socket.instances.find(i => i.instanceId === instanceConfig.instance)) return true

        const instance: IInstance = {
            instanceId: instanceConfig.instance,
            accessKey: accessKeyDeserialize(instanceConfig.accessKey)
        }
        socket.instances.push(instance)

        if (!this.registry()) {
            this.sendSignalMessage(socket.ws, EInstanceMessageAction.START, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, 'Sender registry is not available on this Kwirth: senders cannot be listed nor invoked')
        }
        // the catalogue always goes out on start: it is what populates the tab's two dropdowns
        await this.sendSenders(socket, instance)
        return true
    }

    deleteObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, _ns: string, _pod: string, _container: string): Promise<boolean> => {
        this.removeInstance(webSocket, instanceConfig.instance)
        return true
    }

    pauseContinueInstance = (_webSocket: WebSocket, _instanceConfig: IInstanceConfig, _action: EInstanceMessageAction): void => {}

    modifyInstance = (_webSocket: WebSocket, _instanceConfig: IInstanceConfig): void => {}

    containsInstance = (instanceId: string): boolean =>
        this.webSockets.some(socket => socket.instances.some(i => i.instanceId === instanceId))

    containsAsset = (_webSocket: WebSocket, _podNamespace: string, _podName: string, _containerName: string): boolean => false

    stopInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig): void => {
        const instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            this.removeInstance(webSocket, instanceConfig.instance)
            this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instanceConfig.instance, 'Sender debug instance stopped')
        }
        else {
            this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceConfig.instance, 'Sender debug instance not found')
        }
    }

    removeInstance = (webSocket: WebSocket, instanceId: string): void => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return
        const pos = socket.instances.findIndex(i => i.instanceId === instanceId)
        if (pos < 0) return
        socket.instances.splice(pos, 1)
    }

    processCommand = async (webSocket: WebSocket, instanceMessage: IInstanceMessage): Promise<boolean> => {
        if (instanceMessage.flow === EInstanceMessageFlow.IMMEDIATE) return false
        if (instanceMessage.action !== EInstanceMessageAction.COMMAND) return false

        const socket = this.webSockets.find(s => s.ws === webSocket)
        const instance = this.getInstance(webSocket, instanceMessage.instance)
        if (!socket || !instance) {
            this.sendSignalMessage(webSocket, instanceMessage.action, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceMessage.instance, 'Sender debug instance not found')
            return false
        }

        const msg = instanceMessage as ISenderDebugCommandMessage
        switch (msg.command) {
            case ESenderDebugCommand.LIST:
                await this.sendSenders(socket, instance)
                return true
            case ESenderDebugCommand.SEND:
                await this.executeSend(socket, instance, msg.data, false)
                return true
            case ESenderDebugCommand.SENDBATCH:
                await this.executeSend(socket, instance, msg.data, true)
                return true
            default:
                this.sendSignalMessage(webSocket, instanceMessage.action, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceMessage.instance, `Unknown command '${String(msg.command)}'`)
                return false
        }
    }

    containsConnection = (webSocket: WebSocket): boolean => Boolean(this.webSockets.find(s => s.ws === webSocket))

    removeConnection = (webSocket: WebSocket): void => {
        const pos = this.webSockets.findIndex(s => s.ws === webSocket)
        if (pos < 0) return
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
        for (const entry of this.webSockets) {
            if (entry.instances.find(i => i.instanceId === instanceId)) {
                entry.ws = newWebSocket
                return true
            }
        }
        return false
    }

    // ---- senders -------------------------------------------------------------
    private registry = (): ISenderRegistry | undefined => this.clusterInfo?.senders

    /**
     * The catalogue: what is INSTALLED (with its version and configurations) flagged with who is already
     * instantiated.
     *
     * They are two different questions and that is why there are two sources. listSenders() only sees
     * the already instantiated senders, and getSender() is lazy: a freshly configured sender nobody has
     * sent anything to yet does not appear there — which is exactly the case of whoever comes to test
     * it. listInstalled() is the real list (the same one GET /core/senders serves).
     */
    private buildSenders = async (): Promise<ISenderDebugSenderInfo[]> => {
        const registry = this.registry()
        if (!registry) return []

        const live = new Map<string, string[]>()
        try {
            for (const entry of registry.listSenders()) live.set(entry.id, entry.configNames)
        }
        catch (err) {
            this.backChannelObject.logWarning?.(`Sender debug could not list live senders: ${String(err)}`)
        }

        let installed: ISenderInstalledMeta[] = []
        if (typeof registry.listInstalled === 'function') {
            try {
                installed = (await registry.listInstalled()) ?? []
            }
            catch (err) {
                this.backChannelObject.logWarning?.(`Sender debug could not list installed senders: ${String(err)}`)
            }
        }
        // Without listInstalled (an older core) what is left is the instantiated ones: little, but true.
        if (installed.length === 0) installed = Array.from(live.entries()).map(([id, configNames]) => ({ id, configNames }))

        /*
            DEDUPLICATED BY ID. The core concatenates the index of installed ones with the dev senders
            and does not deduplicate (SenderManager.listInstalled), so a sender that is in both places
            — the normal thing in a development environment — arrives repeated and the dropdown draws it
            twice. The LAST entry is kept, which is the dev one: it is the one the core ends up resolving
            through getSender(), so it is the one that describes the sender that will really receive the
            message.
        */
        const unique = new Map<string, ISenderInstalledMeta>()
        for (const meta of installed) unique.set(meta.id, meta)

        return Array.from(unique.values()).map(meta => {
            const instantiated = live.has(meta.id)
            // The sender is only asked for when it was ALREADY instantiated: asking through getSender()
            // would create and start it, and listing must not start anything.
            const sender = instantiated ? this.resolve(meta.id) : undefined
            return {
                id: meta.id,
                ...(meta.displayName ? { displayName: meta.displayName } : {}),
                ...(meta.version ? { version: meta.version } : {}),
                configNames: live.get(meta.id) ?? meta.configNames ?? [],
                instantiated,
                kind: this.kindOf(sender),
                supportsBatch: typeof sender?.sendBatch === 'function'
            }
        }).sort((a, b) => a.id.localeCompare(b.id))
    }

    /** senderType is optional on ISender: not declaring it is not an error, it is the norm. */
    private kindOf = (sender: ISenderLike | undefined): ESenderDebugKind => {
        if (!sender || !sender.senderType) return ESenderDebugKind.UNKNOWN
        return sender.senderType === 'filter' ? ESenderDebugKind.FILTER : ESenderDebugKind.OUTPUT
    }

    /** getSender() instantiates and starts the sender when it was not already, so it can blow up. */
    private resolve = (senderId: string): ISenderLike | undefined => {
        try {
            return this.registry()?.getSender(senderId)
        }
        catch (err) {
            this.backChannelObject.logWarning?.(`Sender '${senderId}' failed while being resolved: ${String(err)}`)
            return undefined
        }
    }

    private sendSenders = async (socket: ISocketEntry, instance: IInstance): Promise<void> => {
        const senders = await this.buildSenders()
        const msg: ISenderDebugMessageResponse = {
            msgtype: 'senderdebugmessageresponse',
            channel: this.channelId,
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA,
            instance: instance.instanceId,
            payloadType: ESenderDebugPayload.SENDERS,
            senders
        }
        socket.ws.send(JSON.stringify(msg))
    }

    // ---- envio ---------------------------------------------------------------
    /**
     * Delivers the message and ALWAYS answers with a result, whether it went well or not. That the
     * failure comes back with its text is this channel's reason to exist: through the core's route it
     * would end up as a logError nobody sees.
     */
    private executeSend = async (socket: ISocketEntry, instance: IInstance, request: ISenderDebugSendRequest | undefined, batch: boolean): Promise<void> => {
        if (!request) {
            this.sendSignalMessage(socket.ws, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, 'Send command received with no payload')
            return
        }

        const started = Date.now()
        const count = batch ? Math.max(1, Math.min(MAX_BATCH, request.count ?? 1)) : 1
        const base: ISenderDebugResult = {
            id: request.id,
            ts: started,
            senderId: request.senderId,
            configName: request.configName,
            batch,
            count,
            ok: false,
            elapsed: 0
        }

        const fail = (error: string): void => {
            this.deliver(socket, instance, { ...base, ok: false, error, elapsed: Date.now() - started })
        }

        if (!this.registry()) return fail('Sender registry is not available on this Kwirth')
        if (!request.senderId) return fail('No sender selected')
        if (!request.configName) return fail('No configuration selected')
        if (!request.message || typeof request.message.body !== 'string') return fail('Message body is missing')

        const sender = this.resolve(request.senderId)
        if (!sender) return fail(`Sender '${request.senderId}' is not installed, or failed while starting`)

        try {
            if (!sender.hasConfig(request.configName)) return fail(`Sender '${request.senderId}' has no configuration '${request.configName}'`)
        }
        catch (err) {
            return fail(`Sender '${request.senderId}' failed while checking its configuration: ${String(err)}`)
        }

        const messages: ISenderMessage[] = batch
            ? Array.from({ length: count }, (_v, index) => this.numbered(request.message, index, count))
            : [request.message]

        try {
            // Without sendBatch the core delivers one by one, so the same is done here and FLAGGED:
            // whoever debugs has to know whether the sender's batch path or the emulation was taken.
            const emulated = batch && typeof sender.sendBatch !== 'function'
            let result: ISenderResult | void = undefined
            if (batch && !emulated) result = await sender.sendBatch!(request.configName, messages)
            else {
                for (const message of messages) result = await sender.send(request.configName, message)
            }
            this.deliver(socket, instance, {
                ...base,
                ok: true,
                ...(emulated ? { emulated: true } : {}),
                ...(result && typeof result === 'object' ? { result: result as Record<string, unknown> } : {}),
                elapsed: Date.now() - started
            })
        }
        catch (err) {
            fail(err instanceof Error ? (err.stack ?? err.message) : String(err))
        }
    }

    /**
     * In a batch every message would be identical, and then there is no telling which one arrived or
     * whether they all did. They are numbered in the subject and in the origin, which is what makes
     * looking at the destination useful.
     */
    private numbered = (message: ISenderMessage, index: number, total: number): ISenderMessage => ({
        ...message,
        ...(message.subject ? { subject: `${message.subject} (${index + 1}/${total})` } : {}),
        body: `${message.body} (${index + 1}/${total})`
    })

    private deliver = (socket: ISocketEntry, instance: IInstance, result: ISenderDebugResult): void => {
        const msg: ISenderDebugMessageResponse = {
            msgtype: 'senderdebugmessageresponse',
            channel: this.channelId,
            action: EInstanceMessageAction.COMMAND,
            flow: EInstanceMessageFlow.RESPONSE,
            type: EInstanceMessageType.DATA,
            instance: instance.instanceId,
            payloadType: ESenderDebugPayload.RESULT,
            result
        }
        socket.ws.send(JSON.stringify(msg))
        const what = result.batch ? `batch of ${result.count} message(s)` : 'message'
        if (result.ok) this.backChannelObject.logInfo?.(`Sender debug sent a ${what} through '${result.senderId}/${result.configName}' in ${result.elapsed}ms`)
        else this.backChannelObject.logWarning?.(`Sender debug failed to send a ${what} through '${result.senderId}/${result.configName}': ${result.error}`)
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

export default SenderDebugChannel
