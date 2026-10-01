import { IInstanceConfig, ISignalMessage, AccessKey, EClusterType, BackChannelData, IInstanceMessage, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel, IBackChannelObject, IBackChannelRequirements, IChannel, getDce } from '@kwirthmagnify/kwirth-common-back'
import { IChannelInstances } from '@kwirthmagnify/kwirth-common'
import { ENetToolsCommand, INetToolsMessageResponse, INetToolsReading, INetToolsRequest } from '../common/NetToolsMessages'
import { INetTools } from '../common/NetToolsContract'

/*
    The back end of the `nettools` channel: a consumer of the DCE of the same name.

    It declares `requiresExtension: ["dce:nettools:0.1.0"]`, which is what makes the core refuse to
    install it without the DCE and refuse to remove the DCE while this is installed.

    All the work happens HERE and not in the browser, and that is not an implementation detail: the DCE
    is back only, because what has to be resolved and reached is what KWIRTH sees from inside the
    cluster — `kwirth-postgres.default.svc.cluster.local` means nothing in the operator's laptop. The
    front end asks; the process that lives in the cluster answers.

    getDce() THROWS when the DCE is not there — it does not return an empty value — so it is caught and
    the cause travels to the screen. A consumer of a missing DCE says why, instead of drawing nothing.
*/

interface ISocketEntry {
    ws: WebSocket
    instances: string[]
}

class NetToolsChannel implements IChannel {
    readonly channelId = 'nettools'
    readonly requirements: IBackChannelRequirements = { storage: false, providers: [] }
    clusterInfo: unknown
    backChannelObject: IBackChannelObject
    webSockets: ISocketEntry[] = []

    constructor(clusterInfo: unknown, backChannelObject: IBackChannelObject) {
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
        id: 'nettools',
        routable: false,
        pauseable: false,
        modifiable: false,
        reconnectable: true,
        metrics: false,
        sources: [EClusterType.KUBERNETES],
        endpoints: [],
        websocket: false,
        cluster: true,
        resourced: false
    })

    getChannelScopeLevel = (scope: string): number => ['', 'none', 'cluster', 'admin'].indexOf(scope)

    startChannel = async () => {}
    processProviderEvent(_providerId: string, _obj: unknown): void {}
    endpointRequest(_endpoint: string, _req: unknown, _res: unknown, _accessKey?: AccessKey): void {}
    websocketRequest(_ws: WebSocket, _instanceId: string, _instanceConfig: IInstanceConfig): void {}

    /*
        The reading, which is the whole plugin.

        The DCE's result travels back UNTOUCHED. A host that refuses a connection or a name that does
        not resolve is inside it, as data, and the screen paints it; `error` here is for the other kind
        of failure — the DCE not being loaded — which is an installation problem and reads differently.
    */
    private read = async (request: INetToolsRequest): Promise<INetToolsReading> => {
        let nettools: INetTools
        try {
            nettools = getDce<INetTools>('nettools')
        }
        catch (err) {
            return { command: request.command, error: err instanceof Error ? err.message : String(err) }
        }

        const target = (request.target ?? '').trim()
        if (!target) return { command: request.command, dceId: nettools.id, error: 'Type a host name or an IP address first' }

        switch (request.command) {
            case ENetToolsCommand.RESOLVE:
                return { command: request.command, dceId: nettools.id, dns: await nettools.resolve(target, { type: request.recordType }) }
            case ENetToolsCommand.REVERSE:
                return { command: request.command, dceId: nettools.id, reverse: await nettools.reverse(target) }
            case ENetToolsCommand.CHECK:
                return { command: request.command, dceId: nettools.id, ping: await nettools.ping(target, { port: request.port, count: request.count }) }
            default:
                return { command: request.command, dceId: nettools.id, error: `Unknown command '${request.command}'` }
        }
    }

    private send = (ws: WebSocket, instanceId: string, reading: INetToolsReading): void => {
        const msg: INetToolsMessageResponse = {
            msgtype: 'nettoolsmessage',
            channel: this.channelId,
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA,
            instance: instanceId,
            reading
        }
        ws.send(JSON.stringify(msg))
    }

    private sendSignalMessage = (ws: WebSocket, action: EInstanceMessageAction, flow: EInstanceMessageFlow, level: ESignalMessageLevel, instance: string, text: string): void => {
        const msg: ISignalMessage = {
            action, flow, level, instance, text,
            channel: this.channelId,
            type: EInstanceMessageType.SIGNAL
        }
        // 'msgtype' is not part of the contract, but the front end's router reads it: it is added on
        // serialising, the same way the other channels do.
        ws.send(JSON.stringify({ msgtype: 'signalmessage', ...msg }))
    }

    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig): Promise<boolean> => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) {
            const len = this.webSockets.push({ ws: webSocket, instances: [] })
            socket = this.webSockets[len - 1]
        }
        if (!socket.instances.includes(instanceConfig.instance)) socket.instances.push(instanceConfig.instance)
        // Nothing is queried on start: the channel waits to be asked. Resolving something nobody typed
        // would be doing network from the cluster because a tab was opened.
        return true
    }

    deleteObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig): Promise<boolean> => {
        this.removeInstance(webSocket, instanceConfig.instance)
        return true
    }

    pauseContinueInstance = (_ws: WebSocket, _instanceConfig: IInstanceConfig, _action: EInstanceMessageAction): void => {}
    modifyInstance = (_ws: WebSocket, _instanceConfig: IInstanceConfig): void => {}

    containsInstance = (instanceId: string): boolean =>
        this.webSockets.some(s => s.instances.includes(instanceId))

    containsAsset = (): boolean => false

    stopInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig): void => {
        this.removeInstance(webSocket, instanceConfig.instance)
        this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instanceConfig.instance, 'Net tools stopped')
    }

    removeInstance = (webSocket: WebSocket, instanceId: string): void => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return
        const pos = socket.instances.indexOf(instanceId)
        if (pos >= 0) socket.instances.splice(pos, 1)
    }

    processCommand = async (webSocket: WebSocket, instanceMessage: IInstanceMessage): Promise<boolean> => {
        if (instanceMessage.flow === EInstanceMessageFlow.IMMEDIATE) return false
        const request = instanceMessage as IInstanceMessage & Partial<INetToolsRequest>
        if (!request.command) return false
        const reading = await this.read({
            command: request.command,
            target: request.target ?? '',
            recordType: request.recordType,
            port: request.port,
            count: request.count
        })
        this.send(webSocket, instanceMessage.instance, reading)
        return true
    }

    containsConnection = (webSocket: WebSocket): boolean => this.webSockets.some(s => s.ws === webSocket)

    removeConnection = (webSocket: WebSocket): void => {
        const pos = this.webSockets.findIndex(s => s.ws === webSocket)
        if (pos >= 0) this.webSockets.splice(pos, 1)
    }

    refreshConnection = (webSocket: WebSocket): boolean => this.containsConnection(webSocket)

    updateConnection = (webSocket: WebSocket, instanceId: string): boolean => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return false
        if (!socket.instances.includes(instanceId)) socket.instances.push(instanceId)
        return true
    }
}

export default NetToolsChannel
