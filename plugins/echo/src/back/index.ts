import { IInstanceConfig, ISignalMessage, AccessKey, accessKeyDeserialize, EClusterType, BackChannelData, IInstanceMessage, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel, IBackChannelObject, IChannel } from '@kwirthmagnify/kwirth-common-back'
import { Request, Response } from 'express'
import { IEchoInstanceConfig, IEchoMessageResponse } from '../front/EchoTypes'

interface IAsset {
    podNamespace: string
    podName: string
    containerName: string
    interval?: ReturnType<typeof setInterval>
}

interface IInstance {
    instanceId: string
    accessKey: AccessKey
    configData: IEchoInstanceConfig
    paused: boolean
    assets: IAsset[]
}

class EchoChannel implements IChannel {
    readonly channelId = 'echo'
    readonly requirements = { storage: false, providers: [] }
    clusterInfo: any
    backChannelObject: IBackChannelObject
    webSockets: { ws: WebSocket; lastRefresh: number; instances: IInstance[] }[] = []

    constructor(clusterInfo: any, backChannelObject: IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
    }

    getChannelData = (): BackChannelData => ({
        id: 'echo',
        routable: false,
        pauseable: true,
        modifiable: false,
        reconnectable: true,
        metrics: false,
        sources: [EClusterType.KUBERNETES, EClusterType.DOCKER],
        endpoints: [],
        websocket: false,
        cluster: false,
        resourced: true
    })

    getChannelScopeLevel = (scope: string): number => ['', 'none', 'cluster'].indexOf(scope)

    startChannel = async () => {}
    processProviderEvent(_providerId: string, _obj: unknown): void {}
    endpointRequest(_endpoint: string, _req: Request, _res: Response, _accessKey?: AccessKey): void {}
    websocketRequest(_newWebSocket: WebSocket, _instanceId: string, _instanceConfig: IInstanceConfig): void {}

    containsAsset = (webSocket: WebSocket, podNamespace: string, podName: string, containerName: string): boolean => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) return socket.instances.some(i => i.assets.some(a => a.podNamespace === podNamespace && a.podName === podName && a.containerName === containerName))
        return false
    }

    containsInstance = (instanceId: string): boolean =>
        this.webSockets.some(socket => socket.instances.some(i => i.instanceId === instanceId))

    processCommand = async (webSocket: WebSocket, instanceMessage: IInstanceMessage): Promise<boolean> => {
        if (instanceMessage.flow === EInstanceMessageFlow.IMMEDIATE) return false
        const instance = this.getInstance(webSocket, instanceMessage.instance)
        if (!instance) {
            this.sendSignalMessage(webSocket, instanceMessage.action, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceMessage.instance, 'Instance not found')
            return false
        }
        return true
    }

    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) {
            const len = this.webSockets.push({ ws: webSocket, lastRefresh: Date.now(), instances: [] })
            socket = this.webSockets[len - 1]
        }
        let instance = socket.instances.find(i => i.instanceId === instanceConfig.instance)
        if (!instance) {
            instance = {
                accessKey: accessKeyDeserialize(instanceConfig.accessKey),
                instanceId: instanceConfig.instance,
                configData: instanceConfig.data,
                paused: false,
                assets: []
            }
            socket.instances.push(instance)

            // send senders only when adding first object
            let senders = this.backChannelObject.senders?.listSenders()
            if (senders) {
                for (let s of senders) {
                    this.sendSignalMessage(webSocket, EInstanceMessageAction.NONE, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instanceConfig.instance, JSON.stringify(s))
                }
            }            
        }
        const asset: IAsset = { podNamespace, podName, containerName }
        asset.interval = setInterval(
            (ws: WebSocket, i: IInstance, a: IAsset) => this.sendData(ws, i, a),
            instance.configData.interval * 1000,
            webSocket, instance, asset
        )
        instance.assets.push(asset)
        return true
    }

    deleteObject = async (_webSocket: WebSocket, _instanceConfig: IInstanceConfig, _podNamespace: string, _podName: string, _containerName: string): Promise<boolean> => true

    pauseContinueInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig, action: EInstanceMessageAction): void => {
        const instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            if (action === EInstanceMessageAction.PAUSE) instance.paused = true
            if (action === EInstanceMessageAction.CONTINUE) instance.paused = false
        } else {
            this.sendSignalMessage(webSocket, EInstanceMessageAction.PAUSE, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceConfig.instance, 'Echo instance not found')
        }
    }

    modifyInstance = (_webSocket: WebSocket, _instanceConfig: IInstanceConfig): void => {}

    stopInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig): void => {
        const instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            this.removeInstance(webSocket, instanceConfig.instance)
            this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instanceConfig.instance, 'Echo instance stopped')
        } else {
            this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceConfig.instance, 'Echo instance not found')
        }
    }

    removeInstance = (webSocket: WebSocket, instanceId: string): void => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            const pos = socket.instances.findIndex(i => i.instanceId === instanceId)
            if (pos >= 0) {
                for (const asset of socket.instances[pos].assets) clearInterval(asset.interval)
                socket.instances.splice(pos, 1)
            }
        }
    }

    containsConnection = (webSocket: WebSocket): boolean => Boolean(this.webSockets.find(s => s.ws === webSocket))

    removeConnection = (webSocket: WebSocket): void => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            for (const instance of socket.instances) {
                for (const asset of instance.assets) clearInterval(asset.interval)
            }
            const pos = this.webSockets.findIndex(s => s.ws === webSocket)
            this.webSockets.splice(pos, 1)
        }
    }

    refreshConnection = (webSocket: WebSocket): boolean => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) { socket.lastRefresh = Date.now(); return true }
        return false
    }

    updateConnection = (newWebSocket: WebSocket, instanceId: string): boolean => {
        for (const entry of this.webSockets) {
            if (entry.instances.find(i => i.instanceId === instanceId)) {
                entry.ws = newWebSocket
                for (const instance of entry.instances) {
                    for (const asset of instance.assets) {
                        clearInterval(asset.interval)
                        asset.interval = setInterval(
                            (ws: WebSocket, i: IInstance, a: IAsset) => this.sendData(ws, i, a),
                            instance.configData.interval * 1000,
                            newWebSocket, instance, asset
                        )
                    }
                }
                return true
            }
        }
        return false
    }

    private sendData = (ws: WebSocket, instance: IInstance, asset: IAsset): void => {
        if (instance.paused) return
        const msg: IEchoMessageResponse = {
            msgtype: 'echomessageresponse',
            channel: 'echo',
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA,
            instance: instance.instanceId,
            text: `${new Date()} ${asset.podNamespace}/${asset.podName}/${asset.containerName}`
        }
        ws.send(JSON.stringify(msg))
    }

    private sendSignalMessage = (ws: WebSocket, action: EInstanceMessageAction, flow: EInstanceMessageFlow, level: ESignalMessageLevel, instanceId: string, text: string): void => {
        const resp: ISignalMessage = { action, flow, channel: 'echo', instance: instanceId, type: EInstanceMessageType.SIGNAL, text, level }
        ws.send(JSON.stringify(resp))
    }

    private getInstance(webSocket: WebSocket, instanceId: string): IInstance | undefined {
        const socket = this.webSockets.find(entry => entry.ws === webSocket)
        if (socket) return socket.instances.find(i => i.instanceId === instanceId)
        return undefined
    }
}

export default EchoChannel
