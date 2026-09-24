import { IInstanceConfig, ISignalMessage, AccessKey, accessKeyDeserialize, EClusterType, BackChannelData, IInstanceMessage, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel, IBackChannelObject, IBackChannelRequirements, IChannel, ISenderMessage, ISenderResult } from '@kwirthmagnify/kwirth-common-back'
import { ESenderDebugCommand, ESenderDebugKind, ESenderDebugPayload, ISenderDebugCommandMessage, ISenderDebugMessageResponse, ISenderDebugResult, ISenderDebugSendRequest, ISenderDebugSenderInfo } from '../common/SenderDebugTypes'

/**
 * Lo unico que este canal necesita de un sender. Se declara aqui, y no se importa ISender, porque
 * lo que llega es lo que haya instanciado el core: un sender publicado hace meses puede no traer
 * los metodos opcionales, y aqui se comprueban uno a uno antes de llamarlos.
 */
interface ISenderLike {
    readonly id: string
    readonly senderType?: 'filter' | 'output'
    hasConfig(configName: string): boolean
    getConfigNames(): string[]
    send(configName: string, message: ISenderMessage): Promise<ISenderResult | void>
    sendBatch?(configName: string, messages: ISenderMessage[]): Promise<ISenderResult | void>
}

/** Una fila de lo instalado, tal y como la devuelve el manager del core. */
interface ISenderInstalledMeta {
    id: string
    displayName?: string
    version?: string
    configNames?: string[]
}

/**
 * El registro de senders del core (su SenderManager), tal y como lo ve este canal.
 *
 * Se accede por 'clusterInfo.senders' y NO por 'backChannelObject.senders', que es la via oficial,
 * por el motivo que justifica el plugin entero: SenderManager.send() captura la excepcion del
 * sender, la escribe en el log del core y devuelve undefined — que es lo MISMO que devuelve un
 * envio correcto de un sender de aviso. Por la via oficial, un depurador no puede distinguir
 * entregado de reventado, que es justo lo unico que se viene a ver aqui.
 *
 * Con el registro en crudo se obtiene el sender de verdad y se llama a su send() capturando aqui la
 * excepcion. Mismo precedente que provider-debug con 'clusterInfo.providers'.
 */
interface ISenderRegistry {
    getSender(id: string): ISenderLike | undefined
    /** solo los YA instanciados: getSender() es perezoso, asi que esto no es la lista de instalados */
    listSenders(): Array<{ id: string, configNames: string[] }>
    /** los instalados, con su version y sus configuraciones. Es lo que sirve GET /core/senders */
    listInstalled?(): Promise<ISenderInstalledMeta[]>
}

/** Lo que este canal usa del clusterInfo que le inyecta el core. */
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

/** Tope de mensajes por lote. Un depurador no es un generador de carga. */
const MAX_BATCH = 100

class SenderDebugChannel implements IChannel {
    readonly channelId = 'sender-debug'
    /*
        Vacio a proposito, igual que provider-debug: el core solo instancia y arranca lo que algun
        canal declara, y un depurador no debe abrir nada como efecto colateral de estar instalado.
        Los senders no se declaran aqui de ninguna forma — se piden al registro cuando hacen falta.
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

    // ---- registro: los canales cluster llegan aqui via addObject('*all') ----
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
        // el catalogo va siempre al arrancar: es lo que puebla los dos desplegables de la pestaña
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
     * El catalogo: lo INSTALADO (con su version y sus configuraciones) marcado con quien esta ya
     * instanciado.
     *
     * Son dos preguntas distintas y por eso hay dos fuentes. listSenders() solo ve los senders ya
     * instanciados, y getSender() es perezoso: un sender recien configurado al que nadie ha enviado
     * todavia no aparece ahi — que es justo el caso de quien viene a probarlo. listInstalled() es la
     * lista de verdad (la misma que sirve GET /core/senders).
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
        // Sin listInstalled (un core anterior) queda lo instanciado, que es poco pero es cierto.
        if (installed.length === 0) installed = Array.from(live.entries()).map(([id, configNames]) => ({ id, configNames }))

        /*
            DEDUPLICADO POR ID. El core concatena el indice de instalados con los senders de dev y no
            deduplica (SenderManager.listInstalled), asi que un sender que este en los dos sitios
            —lo normal en un entorno de desarrollo— llega repetido y el desplegable lo pinta dos
            veces. Se conserva la ULTIMA entrada, que es la de dev: es la que el core acaba
            resolviendo por getSender(), asi que es la que describe al sender que de verdad recibira
            el mensaje.
        */
        const unique = new Map<string, ISenderInstalledMeta>()
        for (const meta of installed) unique.set(meta.id, meta)

        return Array.from(unique.values()).map(meta => {
            const instantiated = live.has(meta.id)
            // El sender solo se pide si YA estaba instanciado: pedirlo por getSender() lo crearia y
            // lo arrancaria, y listar no puede arrancar nada.
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

    /** senderType es opcional en ISender: no declararlo no es un error, es lo normal. */
    private kindOf = (sender: ISenderLike | undefined): ESenderDebugKind => {
        if (!sender || !sender.senderType) return ESenderDebugKind.UNKNOWN
        return sender.senderType === 'filter' ? ESenderDebugKind.FILTER : ESenderDebugKind.OUTPUT
    }

    /** getSender() instancia y arranca el sender si aun no lo estaba, asi que puede reventar. */
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
     * Entrega el mensaje y contesta SIEMPRE con un resultado, tanto si salio bien como si no. Que el
     * fallo suba con su texto es el motivo de existir de este canal: por la via del core se quedaria
     * en un logError que nadie ve.
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
            // Sin sendBatch el core entrega uno a uno, asi que aqui se hace lo mismo y se MARCA: quien
            // depura tiene que saber si recorrio la ruta de lote del sender o la emulacion.
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
     * En un lote todos los mensajes serian identicos, y entonces no se sabe cual llego ni si llegaron
     * todos. Se numeran en el asunto y en el origen, que es lo que hace util mirar el destino.
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
