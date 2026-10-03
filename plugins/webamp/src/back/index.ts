import { BackChannelData, EClusterType, IBackChannelObject, IChannel, IInstanceConfig, IInstanceMessage } from '@kwirthmagnify/kwirth-common-back'
import { IChannelInstances } from '@kwirthmagnify/kwirth-common'

/**
 * Back channel for Webamp.
 *
 * The music player runs entirely in the browser (iframe); the back exists only
 * to fulfil the Kwirth channel contract. It does not persist anything or
 * process commands — it just tracks instances so the core knows what is running.
 *
 * The transport is the websocket of the tab, not an HTTP endpoint.
 * The accessKey IS required: the core demands it on every command that enters
 * the socket and discards the message without it, before looking at the channel.
 */

interface IInstance {
    instanceId: string
    webSocket: WebSocket
}

class WebampBackChannel implements IChannel {
    readonly channelId = 'webamp'
    readonly requirements = { storage: false, providers: [] as string[] }
    clusterInfo: any
    backChannelObject: IBackChannelObject

    private instances: IInstance[] = []

    constructor(clusterInfo: any, backChannelObject: IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
    }

    getChannelData = (): BackChannelData => ({
        id: 'webamp',
        routable: false,
        pauseable: true,
        modifiable: false,
        reconnectable: false,
        metrics: false,
        sources: [EClusterType.KUBERNETES],
        endpoints: [],
        websocket: false,
        cluster: false,
        resourced: false
    })

    getChannelScopeLevel = (scope: string): number => ['', 'none'].indexOf(scope)

    startChannel = async (): Promise<void> => { }

    endpointRequest = (): void => { }
    websocketRequest = (): void => { }
    processProviderEvent = (): void => { }

    /**
     * The core calls here with the three selectors empty for being an autonomous
     * channel. Registering the instance is what enables processCommand.
     */
    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig): Promise<boolean> => {
        this.instances.push({
            instanceId: instanceConfig.instance,
            webSocket,
        })
        return true
    }

    deleteObject = async (): Promise<boolean> => false

    pauseContinueInstance = (): void => { }
    modifyInstance = (): void => { }

    containsInstance = (instanceId: string): boolean =>
        this.instances.some(i => i.instanceId === instanceId)

    getInstances = (): IChannelInstances => ({
        instances: this.instances.length,
        connections: new Set(this.instances.map(i => i.webSocket)).size,
    })

    containsAsset = (): boolean => false

    stopInstance = (_webSocket: WebSocket, instanceConfig: IInstanceConfig): void => {
        this.instances = this.instances.filter(i => i.instanceId !== instanceConfig.instance)
    }

    removeInstance = (_webSocket: WebSocket, instanceId: string): void => {
        this.instances = this.instances.filter(i => i.instanceId !== instanceId)
    }

    containsConnection = (webSocket: WebSocket): boolean =>
        this.instances.some(i => i.webSocket === webSocket)

    removeConnection = (webSocket: WebSocket): void => {
        this.instances = this.instances.filter(i => i.webSocket !== webSocket)
    }

    refreshConnection = (): boolean => true
    updateConnection = (): boolean => true

    processCommand = async (_webSocket: WebSocket, _instanceMessage: IInstanceMessage): Promise<boolean> => {
        // The player runs entirely in the front; no commands are expected.
        return false
    }
}

export default WebampBackChannel
