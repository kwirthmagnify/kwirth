import { IInstanceConfig, ISignalMessage, IInstanceConfigResponse, IInstanceMessage, BackChannelData, EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageChannel, ESignalMessageLevel, EInstanceMessageType, EClusterType, IBackChannelRequirements } from '@kwirthmagnify/kwirth-common'
import { IBackChannelObject } from '@kwirthmagnify/kwirth-common-back'
import * as stream from 'stream'
import { PassThrough } from 'stream'
import { Request, Response } from 'express'
import { ILogInstanceConfig, ILogMessage } from '../common/LogTypes'

interface IAsset {
    podNamespace: string
    podName: string
    containerName: string
    passThroughStream?: PassThrough
    readableStream?: NodeJS.ReadableStream
    msg: ILogMessage
    backpressureInterval?: NodeJS.Timeout
}

interface IInstance {
    instanceId: string
    timestamps: boolean
    previous: boolean
    paused: boolean
    isSending: boolean
    assets: IAsset[]
}

class LogChannel {
    readonly channelId = 'log'
    readonly requirements: IBackChannelRequirements = { storage: false, providers: [] }
    clusterInfo: any
    backChannelObject: IBackChannelObject
    webSockets: { ws: WebSocket, lastRefresh: number, instances: IInstance[] }[] = []

    constructor(clusterInfo: any, backChannelObject: IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
    }

    getChannelData(): BackChannelData {
        return {
            id: 'log', routable: false, pauseable: true, modifiable: false, reconnectable: true,
            metrics: false, sources: [EClusterType.DOCKER, EClusterType.KUBERNETES],
            endpoints: [], websocket: false, cluster: false, resourced: true
        }
    }

    getChannelScopeLevel(scope: string): number { return ['', 'filter', 'view', 'cluster'].indexOf(scope) }
    startChannel = async () => { }
    processProviderEvent(_providerId: string, _obj: any): void { }
    async processCommand(_webSocket: WebSocket, _instanceMessage: IInstanceMessage): Promise<boolean> { return false }
    async endpointRequest(_endpoint: string, _req: Request, _res: Response): Promise<void> { }
    async websocketRequest(_newWebSocket: WebSocket): Promise<void> { }

    containsAsset = (webSocket: WebSocket, podNamespace: string, podName: string, containerName: string): boolean => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        return socket?.instances.some(i => i.assets.some(a => a.podNamespace === podNamespace && a.podName === podName && a.containerName === containerName)) ?? false
    }

    containsInstance(instanceId: string): boolean {
        return this.webSockets.some(s => s.instances.find(i => i.instanceId === instanceId))
    }

    sendInstanceConfigMessage = (ws: WebSocket, action: EInstanceMessageAction, flow: EInstanceMessageFlow, channel: EInstanceMessageChannel, instanceConfig: IInstanceConfig, text: string): void => {
        const resp: IInstanceConfigResponse = { action, flow, channel, instance: instanceConfig.instance, type: EInstanceMessageType.SIGNAL, text }
        ws.send(JSON.stringify(resp))
    }

    sendChannelSignal(webSocket: WebSocket, level: ESignalMessageLevel, text: string, instanceConfig: IInstanceConfig): void {
        const signalMessage: ISignalMessage = {
            action: EInstanceMessageAction.NONE, flow: EInstanceMessageFlow.RESPONSE, level,
            channel: instanceConfig.channel, instance: instanceConfig.instance, type: EInstanceMessageType.SIGNAL, text
        }
        webSocket.send(JSON.stringify(signalMessage))
    }

    sendBatch = async (webSocket: WebSocket, instance: IInstance, asset: IAsset, text: string): Promise<void> => {
        if (instance.paused) return
        try {
            if (webSocket.bufferedAmount === 0) {
                asset.msg.text = text
                webSocket.send(JSON.stringify(asset.msg))
            } else {
                asset.passThroughStream!.pause()
                if (asset.backpressureInterval) clearInterval(asset.backpressureInterval)
                asset.backpressureInterval = setInterval((w: WebSocket, a: IAsset) => {
                    const state = (w as any).readyState
                    if (state !== undefined && state !== 1) { clearInterval(a.backpressureInterval); a.backpressureInterval = undefined; return }
                    if (w.bufferedAmount === 0) {
                        clearInterval(a.backpressureInterval)
                        a.backpressureInterval = undefined
                        a.passThroughStream!.resume()
                        a.msg.text = text
                        w.send(JSON.stringify(a.msg))
                    }
                }, 100, webSocket, asset)
            }
        } catch (err) {
            console.log('[log] sendBatch error for', asset.podNamespace, asset.podName, asset.containerName, err)
        }
    }

    async startDockerStream(webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<void> {
        try {
            let id = await this.clusterInfo.dockerTools.getContainerId(podName, containerName)
            if (!id) {
                this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Cannot obtain Id for container ${podName}/${containerName}`, instanceConfig)
                return
            }

            let socket = this.webSockets.find(s => s.ws === webSocket)
            if (!socket) {
                const len = this.webSockets.push({ ws: webSocket, lastRefresh: Date.now(), instances: [] })
                socket = this.webSockets[len - 1]
            }

            let instance = socket.instances.find(i => i.instanceId === instanceConfig.instance)
            if (!instance) {
                const len = socket.instances.push({
                    instanceId: instanceConfig.instance,
                    timestamps: (instanceConfig.data as ILogInstanceConfig).timestamp,
                    previous: false, paused: false, assets: [], isSending: false
                })
                instance = socket.instances[len - 1]
            }

            const asset: IAsset = {
                podNamespace, podName, containerName,
                msg: {
                    action: EInstanceMessageAction.NONE, flow: EInstanceMessageFlow.UNSOLICITED,
                    namespace: podNamespace, instance: instance.instanceId, type: EInstanceMessageType.DATA,
                    pod: podName, container: containerName, channel: EInstanceMessageChannel.LOG,
                    text: '', msgtype: 'logmessage'
                }
            }
            const container = this.clusterInfo.dockerApi.getContainer(id)
            asset.readableStream = await container.logs({
                follow: true, stdout: true, stderr: true,
                timestamps: (instanceConfig.data as ILogInstanceConfig).timestamp as boolean,
                ...((instanceConfig.data as ILogInstanceConfig).fromStart ? {} : { since: Date.now() - 1800 })
            })
            asset.readableStream!.setEncoding('utf8')
            asset.readableStream!.on('data', async (chunk: any) => this.sendBatch(webSocket, instance!, asset, chunk))
            instance.assets.push(asset)
        } catch (err: unknown) {
            console.log('[log] Generic error starting docker log', err)
            this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, err as string, instanceConfig)
        }
    }

    async startKubernetesStream(webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<void> {
        try {
            let socket = this.webSockets.find(s => s.ws === webSocket)
            if (!socket) {
                const len = this.webSockets.push({ ws: webSocket, lastRefresh: Date.now(), instances: [] })
                socket = this.webSockets[len - 1]
            }

            let instance = socket.instances.find(i => i.instanceId === instanceConfig.instance)
            if (!instance) {
                const len = socket.instances.push({
                    instanceId: instanceConfig.instance,
                    timestamps: (instanceConfig.data as ILogInstanceConfig).timestamp,
                    previous: false, paused: false, assets: [], isSending: false
                })
                instance = socket.instances[len - 1]
            }

            const logStream: PassThrough = new stream.PassThrough()
            const asset: IAsset = {
                podNamespace, podName, containerName,
                passThroughStream: logStream,
                msg: {
                    action: EInstanceMessageAction.NONE, flow: EInstanceMessageFlow.UNSOLICITED,
                    namespace: podNamespace, instance: instance.instanceId, type: EInstanceMessageType.DATA,
                    pod: podName, container: containerName, channel: EInstanceMessageChannel.LOG,
                    text: '', msgtype: 'logmessage'
                }
            }
            instance.assets.push(asset)

            if (!asset.passThroughStream) {
                this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, 'Passthrough could not be established', instanceConfig)
                return
            }

            asset.passThroughStream.setEncoding('utf8')
            asset.passThroughStream.on('data', async (chunk: any) => this.sendBatch(webSocket, instance!, asset, chunk))

            const logConfig = instanceConfig.data as ILogInstanceConfig
            const sinceSeconds = logConfig.startTime ? Math.max(Math.floor((Date.now() - logConfig.startTime) / 1000), 1) : 1800
            const streamConfig = {
                follow: true, pretty: false, timestamps: logConfig.timestamp, previous: Boolean(logConfig.previous),
                ...(logConfig.fromStart ? {} : { sinceSeconds })
            }
            const maxRetries = 24
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    await this.clusterInfo.logApi.log(podNamespace, podName, containerName, asset.passThroughStream, streamConfig)
                    break
                } catch (err: any) {
                    const isPodNotReady = err?.code === 400
                    if (isPodNotReady && attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, 5000))
                        const inst = this.getInstance(webSocket, instanceConfig.instance)
                        if (!inst?.assets.some(a => a.podNamespace === podNamespace && a.podName === podName && a.containerName === containerName)) break
                    } else {
                        console.log('[log] Generic error starting pod log', err)
                        this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, (err as any).stack, instanceConfig)
                        break
                    }
                }
            }
        } catch (err) {
            console.log('[log] Generic error starting pod log', err)
            this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, (err as any).stack, instanceConfig)
        }
    }

    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> => {
        if (this.clusterInfo.type === EClusterType.DOCKER)
            this.startDockerStream(webSocket, instanceConfig, podNamespace, podName, containerName)
        else
            this.startKubernetesStream(webSocket, instanceConfig, podNamespace, podName, containerName)
        return true
    }

    deleteObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> => {
        const instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            const matchesPod = (a: IAsset) => a.podNamespace === podNamespace && a.podName === podName
            const toRemove = instance.assets.filter(a => matchesPod(a) && (containerName === '' || a.containerName === containerName))
            for (const asset of toRemove) {
                if (asset.backpressureInterval) clearInterval(asset.backpressureInterval)
                asset.passThroughStream?.destroy()
                ;(asset.readableStream as stream.Readable | undefined)?.destroy()
            }
            instance.assets = instance.assets.filter(a => !(matchesPod(a) && (containerName === '' || a.containerName === containerName)))
            return true
        }
        this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Instance not found`, instanceConfig)
        return false
    }

    stopInstance(webSocket: WebSocket, instanceConfig: IInstanceConfig): void {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return
        if (socket.instances.find(i => i.instanceId === instanceConfig.instance)) {
            this.removeInstance(webSocket, instanceConfig.instance)
            this.sendInstanceConfigMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, EInstanceMessageChannel.LOG, instanceConfig, 'Log instance stopped')
        } else {
            this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Instance not found`, instanceConfig)
        }
    }

    pauseContinueInstance(webSocket: WebSocket, instanceConfig: IInstanceConfig, action: EInstanceMessageAction): void {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return
        const instance = socket.instances.find(i => i.instanceId === instanceConfig.instance)
        if (instance) {
            if (action === EInstanceMessageAction.PAUSE) {
                instance.paused = true
                this.sendInstanceConfigMessage(webSocket, EInstanceMessageAction.PAUSE, EInstanceMessageFlow.RESPONSE, EInstanceMessageChannel.LOG, instanceConfig, 'Log paused')
            }
            if (action === EInstanceMessageAction.CONTINUE) {
                instance.paused = false
                this.sendInstanceConfigMessage(webSocket, EInstanceMessageAction.CONTINUE, EInstanceMessageFlow.RESPONSE, EInstanceMessageChannel.LOG, instanceConfig, 'Log continued')
            }
        } else {
            this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Instance ${instanceConfig.instance} not found`, instanceConfig)
        }
    }

    modifyInstance(_webSocket: WebSocket, _instanceConfig: IInstanceConfig): void { }

    removeInstance(webSocket: WebSocket, instanceId: string): void {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            const pos = socket.instances.findIndex(t => t.instanceId === instanceId)
            if (pos >= 0) {
                for (const asset of socket.instances[pos].assets) {
                    if (asset.backpressureInterval) clearInterval(asset.backpressureInterval)
                    asset.passThroughStream?.destroy()
                    ;(asset.readableStream as stream.Readable | undefined)?.destroy()
                }
                socket.instances.splice(pos, 1)
            }
        }
    }

    containsConnection(webSocket: WebSocket): boolean { return Boolean(this.webSockets.find(s => s.ws === webSocket)) }

    removeConnection(webSocket: WebSocket): void {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            for (const id of socket.instances.map(i => i.instanceId)) this.removeInstance(webSocket, id)
            const pos = this.webSockets.findIndex(s => s.ws === webSocket)
            this.webSockets.splice(pos, 1)
        }
    }

    refreshConnection(webSocket: WebSocket): boolean {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) { socket.lastRefresh = Date.now(); return true }
        return false
    }

    updateConnection(newWebSocket: WebSocket, instanceId: string): boolean {
        for (const entry of this.webSockets) {
            if (entry.instances.find(i => i.instanceId === instanceId)) {
                entry.ws = newWebSocket
                for (const instance of entry.instances) {
                    if (this.clusterInfo.type === EClusterType.DOCKER) {
                        for (const asset of instance.assets) {
                            if (asset.readableStream) {
                                asset.readableStream.removeAllListeners('data')
                                asset.readableStream.on('data', (chunk: any) => this.sendBatch(newWebSocket, instance, asset, chunk))
                            }
                        }
                    } else {
                        for (const asset of instance.assets) {
                            if (asset.passThroughStream) {
                                asset.passThroughStream.removeAllListeners('data')
                                asset.passThroughStream.on('data', (chunk: any) => this.sendBatch(newWebSocket, instance, asset, chunk))
                            }
                        }
                    }
                }
                return true
            }
        }
        return false
    }

    getInstance(webSocket: WebSocket, instanceId: string): IInstance | undefined {
        const socket = this.webSockets.find(e => e.ws === webSocket)
        return socket?.instances.find(i => i.instanceId === instanceId)
    }
}

export { LogChannel }
