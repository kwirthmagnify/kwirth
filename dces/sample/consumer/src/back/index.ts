import { IInstanceConfig, ISignalMessage, AccessKey, EClusterType, BackChannelData, IInstanceMessage, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel, IBackChannelObject, IBackChannelRequirements, IChannel, IChannelInstances, getDce } from '@kwirthmagnify/kwirth-common-back'
import { EConsumerCommand, IConsumerMessageResponse, IConsumerReading } from '../common/ConsumerTypes'

/*
    A DEVELOPMENT STUB, not a product: the smallest plugin that consumes a DCE, so the type's guarantees
    can be seen rather than argued about (plan: plans/completed/dce/PLAN.md, S2).

    It declares `requiresExtension: ["dce:sample:0.1.0"]`, which is what makes the core refuse to install
    it without the DCE and refuse to remove the DCE while this is installed. And it calls getDce() on
    both ends, so the same instance shows up twice: the counter moves forward across readings and across
    tabs, which two copies of the same code could never do.

    It is never published. It lives inside the DCE it consumes, and it is loaded from kwirth-dev.json.
*/

/** What the sample DCE hands out. Declared here, not imported: a consumer depends on the CONTRACT, not on the package. */
interface ISampleDce {
    id: string
    createdAt: number
    boots: number
    next(): number
    greet(name: string): string
}

interface ISocketEntry {
    ws: WebSocket
    instances: string[]
}

class DceConsumerChannel implements IChannel {
    readonly channelId = 'dce-consumer'
    readonly requirements: IBackChannelRequirements = { storage: false, providers: [] }
    clusterInfo: unknown
    backChannelObject: IBackChannelObject
    webSockets: ISocketEntry[] = []

    constructor(clusterInfo: unknown, backChannelObject: IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
    }

    getChannelData = (): BackChannelData => ({
        id: 'dce-consumer',
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

        getDce() THROWS when the DCE is not there — it does not return an empty value — so the error is
        caught here and travels to the screen with its cause. That is the behaviour worth showing: a
        consumer of a missing DCE says why, instead of drawing zeros.

        Two ticks per reading, on purpose: with one, a fresh instance and a shared one look the same.
    */
    private read = (): IConsumerReading => {
        try {
            const sample = getDce<ISampleDce>('sample')
            return {
                dceId: sample.id,
                ticks: [sample.next(), sample.next()],
                boots: sample.boots,
                greeting: sample.greet('consumer')
            }
        }
        catch (err) {
            return { error: err instanceof Error ? err.message : String(err) }
        }
    }

    private send = (ws: WebSocket, instanceId: string): void => {
        const msg: IConsumerMessageResponse = {
            msgtype: 'consumermessage',
            channel: this.channelId,
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA,
            instance: instanceId,
            reading: this.read()
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
        this.send(webSocket, instanceConfig.instance)
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

    // What this channel has running, for the Status channel's Plugins tab. A connection counts while it
    // carries an instance: one left with none is on its way out.
    getInstances = (): IChannelInstances => {
        const carrying = this.webSockets.filter(s => s.instances.length > 0)
        return { instances: carrying.reduce((n, s) => n + s.instances.length, 0), connections: carrying.length }
    }

    containsAsset = (): boolean => false

    stopInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig): void => {
        this.removeInstance(webSocket, instanceConfig.instance)
        this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instanceConfig.instance, 'DCE consumer stopped')
    }

    removeInstance = (webSocket: WebSocket, instanceId: string): void => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return
        const pos = socket.instances.indexOf(instanceId)
        if (pos >= 0) socket.instances.splice(pos, 1)
    }

    processCommand = async (webSocket: WebSocket, instanceMessage: IInstanceMessage): Promise<boolean> => {
        if (instanceMessage.flow === EInstanceMessageFlow.IMMEDIATE) return false
        const command = (instanceMessage as IInstanceMessage & { command?: string }).command
        if (command === EConsumerCommand.READ) {
            this.send(webSocket, instanceMessage.instance)
            return true
        }
        return false
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

export default DceConsumerChannel
