import { IInstanceConfig, InstanceMessageChannelEnum, InstanceMessageTypeEnum, ISignalMessage, SignalMessageLevelEnum, ClusterTypeEnum, IInstanceConfigResponse, InstanceMessageActionEnum, InstanceMessageFlowEnum, IInstanceMessage, LogConfig, BackChannelData, ILogMessage, EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageChannel, ESignalMessageLevel, EInstanceMessageType, EClusterType } from '@kwirthmagnify/kwirth-common';
import * as stream from 'stream'
import { PassThrough } from 'stream'
import { ClusterInfo } from '../../model/ClusterInfo'
import { IChannel } from '../IChannel';
import { Request, Response } from 'express'

interface IAsset {
    podNamespace:string
    podName:string
    containerName:string
    passThroughStream?:PassThrough
    readableStream?: NodeJS.ReadableStream
    msg:ILogMessage  
}        

interface IInstance {
    instanceId:string
    timestamps: boolean
    previous:boolean
    paused:boolean
    isSending:boolean
    assets: IAsset[]
}

class LogChannel implements IChannel {    
    clusterInfo : ClusterInfo
    webSockets: {
        ws:WebSocket,
        lastRefresh: number,
        instances: IInstance[] 
    }[] = []

    constructor (clusterInfo:ClusterInfo) {
        this.clusterInfo = clusterInfo
    }

    getChannelData(): BackChannelData {
        return {
            id: 'log',
            routable: false,
            pauseable: true,
            modifyable: false,
            reconnectable: true,
            metrics: false,
            //events: false,
            providers: [],
            sources: [ ClusterTypeEnum.DOCKER, ClusterTypeEnum.KUBERNETES ],
            endpoints: [],
            websocket: false,
            cluster:false
        }
    }

    getChannelScopeLevel(scope: string): number {
        return ['', 'filter', 'view', 'cluster'].indexOf(scope)
    }

    startChannel = async () =>  {
    }

    processProviderEvent(providerId:string, obj:any) : void {
    }

    async processCommand (webSocket:WebSocket, instanceMessage:IInstanceMessage) : Promise<boolean> {
        return false
    }
    
    async endpointRequest(endpoint:string,req:Request, res:Response) : Promise<void> {
    }

    async websocketRequest(newWebSocket:WebSocket) : Promise<void> {
    }

    containsAsset = (webSocket:WebSocket, podNamespace:string, podName:string, containerName:string): boolean => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            let instances = socket.instances
            if (instances) return instances.some(i => i.assets.some(a => a.podNamespace===podNamespace && a.podName===podName && a.containerName===containerName))
        }
        return false
    }

    containsInstance(instanceId: string): boolean {
        for (let socket of this.webSockets) {
            let exists = socket.instances.find(i => i.instanceId === instanceId)
            if (exists) return true
        }
        return false
    }

    sendInstanceConfigMessage = (ws:WebSocket, action:EInstanceMessageAction, flow: EInstanceMessageFlow, channel: EInstanceMessageChannel, instanceConfig:IInstanceConfig, text:string): void => {
        let resp:IInstanceConfigResponse = {
            action,
            flow,
            channel,
            instance: instanceConfig.instance,
            type: EInstanceMessageType.SIGNAL,
            text
        }
        ws.send(JSON.stringify(resp))
    }

    sendChannelSignal (webSocket: WebSocket, level: ESignalMessageLevel, text: string, instanceConfig: IInstanceConfig): void {
        let signalMessage:ISignalMessage = {
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.RESPONSE,
            level,
            channel: instanceConfig.channel,
            instance: instanceConfig.instance,
            type: EInstanceMessageType.SIGNAL,
            text
        }
        webSocket.send(JSON.stringify(signalMessage))
    }

    sendBatch = async (webSocket:WebSocket, instance:IInstance, asset:IAsset, text:string): Promise<void> => {
        if (instance.paused) return
        try {
            if (webSocket.bufferedAmount === 0) {
                asset.msg.text = text
                webSocket.send(JSON.stringify(asset.msg))
            } 
            else {
                asset.passThroughStream!.pause()
                const interval = setInterval((w:WebSocket, a:IAsset) => {
                    if (w.bufferedAmount === 0) {
                        clearInterval(interval)
                        a.passThroughStream!.resume()
                        a.msg.text = text
                        w.send(JSON.stringify(a.msg)) // volver a intentar
                    }
                }, 100, webSocket, asset)
            }
        }
        catch (err) {
            console.log('sendBatch error for', asset.podNamespace, asset.podName, asset.containerName, err)
        }
    }

    async startDockerStream (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<void> {
        try {
            let id = await this.clusterInfo.dockerTools.getContainerId(podName, containerName)
            if (!id) {
                this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Cannot obtain Id for container ${podName}/${containerName}`,instanceConfig)
                return
            }
                             
            let socket = this.webSockets.find(s => s.ws === webSocket)
            if (!socket) {
                let len = this.webSockets.push( {ws:webSocket, lastRefresh: Date.now(), instances:[]} )
                socket = this.webSockets[len-1]
            }

            let instances = socket.instances
            let instance = instances.find(i => i.instanceId === instanceConfig.instance)
            if (!instance) {
                let len = socket?.instances.push ({
                    instanceId: instanceConfig.instance, 
                    timestamps: (instanceConfig.data as LogConfig).timestamp,
                    previous: false,
                    paused: false,
                    assets: [],
                    isSending: false
                })
                instance = socket?.instances[len-1]
            }

            let asset:IAsset = {
                podNamespace,
                podName,
                containerName,
                msg: {
                    action: EInstanceMessageAction.NONE,
                    flow: EInstanceMessageFlow.UNSOLICITED,
                    namespace: podNamespace,
                    instance: instance.instanceId,
                    type: EInstanceMessageType.DATA,
                    pod: podName,
                    container: containerName,
                    channel: EInstanceMessageChannel.LOG,
                    text: '',
                    msgtype: 'logmessage'
                }
            }
            let container = this.clusterInfo.dockerApi.getContainer(id)
            asset.readableStream =  await container.logs({
                follow: true,
                stdout: true,
                stderr: true,
                timestamps: (instanceConfig.data as LogConfig).timestamp as boolean,
                ...((instanceConfig.data as LogConfig).fromStart? {} : {since: Date.now()-1800})
            })

            asset.readableStream.setEncoding('utf8')
            asset.readableStream.on('data', async chunk => this.sendBatch(webSocket, instance, asset, chunk) )
            instance.assets.push( asset )
        }
        catch (err:unknown) {
            console.log('Generic error starting pod log', err)
            this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, err as string, instanceConfig)
        }
    }

    async startKubernetesStream (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<void> {
        try {
            let socket = this.webSockets.find(s => s.ws === webSocket)
            if (!socket) {
                let len = this.webSockets.push( {ws:webSocket, lastRefresh: Date.now(), instances:[]} )
                socket = this.webSockets[len-1]
            }

            let instances = socket.instances
            let instance = instances.find(i => i.instanceId === instanceConfig.instance)
            if (!instance) {
                let len = socket?.instances.push ({
                    instanceId: instanceConfig.instance, 
                    timestamps: (instanceConfig.data as LogConfig).timestamp,
                    previous: false,
                    paused:false,
                    assets:[],
                    isSending: false
                })
                instance = socket?.instances[len-1]
            }
            
            const logStream:PassThrough = new stream.PassThrough()
            let asset:IAsset = {
                podNamespace,
                podName,
                containerName,
                passThroughStream: logStream,
                msg: {
                    action: EInstanceMessageAction.NONE,
                    flow: EInstanceMessageFlow.UNSOLICITED,
                    namespace: podNamespace,
                    instance: instance.instanceId,
                    type: EInstanceMessageType.DATA,
                    pod: podName,
                    container: containerName,
                    channel: EInstanceMessageChannel.LOG,
                    text: '',
                    msgtype: 'logmessage'
                }
            }
            instance.assets.push(asset)

            if (!asset.passThroughStream) {
                this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, 'Passthrough could not be established', instanceConfig)
                return
            }

            asset.passThroughStream.setEncoding('utf8')

            // pipeline(
            //     asset.passThroughStream, // source data
            //     async function* (source: AsyncIterable<Buffer>) {  // asynchronous generator
            //         for await (const chunk of source) {
            //             asset.msg.text = chunk as any
            //             webSocket.send(JSON.stringify(asset.msg))
            //             await new Promise(resolve => setTimeout(resolve, 10 * instance.assets.length))
            //         }
            //     },
            //     (err: Error | null) => {
            //         if (err) {
            //             console.error('Pipeline error:', err)
            //         }
            //         else {
            //             console.log('Pipeline ended.')
            //         }
            //     }
            // )

            // asset.passThroughStream.on('data', async (chunk) => {
            //     while (webSocket.bufferedAmount > 10000 * instance.assets.length ) {
            //         console.log('pause', webSocket.bufferedAmount)
            //         asset.passThroughStream!.pause()
            //         while (webSocket.bufferedAmount > 0) {
            //             await new Promise(resolve => setTimeout(resolve, 100))
            //         }
            //         asset.passThroughStream!.resume()
            //         console.log('resume', webSocket.bufferedAmount)
            //     }
            //     asset.msg.text = chunk
            //     webSocket.send(JSON.stringify(asset.msg))
            // })    

            // asset.passThroughStream.on('data', async (chunk) => {
            //     asset.passThroughStream!.pause()
            //     asset.msg.text = chunk
            //     webSocket.send(JSON.stringify(asset.msg), () => { asset.passThroughStream!.resume() })
            // })    

            asset.passThroughStream.on('data', async (chunk) => this.sendBatch(webSocket, instance, asset, chunk) )
            
            // asset.passThroughStream.on('data', async (chunk) => {
            //     if (instance.isSending) {
            //         asset.passThroughStream!.pause()
            //         asset.msg.text = chunk
            //         webSocket.send(JSON.stringify(asset.msg))
            //         await new Promise(resolve => setTimeout(resolve, 10 * instance.assets.length))
            //         asset.passThroughStream!.resume()
            //     }
            //     else {
            //         instance.isSending = true
            //         asset.msg.text = chunk
            //         webSocket.send(JSON.stringify(asset.msg))
            //         await new Promise(resolve => setTimeout(resolve, 10 * instance.assets.length))
            //         instance.isSending = false
            //     }
            // })
            let logConfig = instanceConfig.data as LogConfig
            let sinceSeconds = logConfig.startTime? Math.max( Math.floor((Date.now() - logConfig.startTime) / 1000), 1) : 1800
            let streamConfig = { 
                follow: true,
                pretty: false,
                timestamps: logConfig.timestamp,
                previous: Boolean(logConfig.previous),
                ...(logConfig.fromStart? {} : {sinceSeconds: sinceSeconds})
            }
            await this.clusterInfo.logApi.log(podNamespace, podName, containerName, asset.passThroughStream, streamConfig)
        }
        catch (err) {
            console.log('Generic error starting pod log', err)
            this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, (err as any).stack, instanceConfig)
        }
    }

    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> => {
        if (this.clusterInfo.type === EClusterType.DOCKER) {
            this.startDockerStream(webSocket, instanceConfig, podNamespace, podName, containerName)
        }
        else {
            this.startKubernetesStream(webSocket, instanceConfig, podNamespace, podName, containerName)
        }
        return true
    }

    deleteObject = async (webSocket:WebSocket, instanceConfig:IInstanceConfig, podNamespace:string, podName:string, containerName:string) : Promise<boolean> => {
        let instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            instance.assets = instance.assets.filter(a => a.podNamespace!==podNamespace && a.podName!==podName && a.containerName!==containerName)
            return true
        }
        else {
            this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Instance not found`, instanceConfig)
            return false
        }
    }
    
    stopInstance(webSocket: WebSocket, instanceConfig: IInstanceConfig): void {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return

        if (socket.instances.find(i => i.instanceId === instanceConfig.instance)) {
            this.removeInstance(webSocket, instanceConfig.instance)
            this.sendInstanceConfigMessage(webSocket,EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, EInstanceMessageChannel.LOG, instanceConfig, 'Log instance stopped')
        }
        else {
            this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Instance not found`, instanceConfig)
        }
    }

    pauseContinueInstance(webSocket: WebSocket, instanceConfig: IInstanceConfig, action: EInstanceMessageAction): void {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) {
            console.log('No socket found for pci')
            return
        }
        let instances = socket.instances

        let instance = instances.find(i => i.instanceId === instanceConfig.instance)
        if (instance) {
            if (action === EInstanceMessageAction.PAUSE) {
                instance.paused = true
                this.sendInstanceConfigMessage(webSocket, EInstanceMessageAction.PAUSE, EInstanceMessageFlow.RESPONSE, EInstanceMessageChannel.LOG, instanceConfig, 'Log paused')
            }
            if (action === EInstanceMessageAction.CONTINUE) {
                instance.paused = false
                this.sendInstanceConfigMessage(webSocket, EInstanceMessageAction.CONTINUE, EInstanceMessageFlow.RESPONSE, EInstanceMessageChannel.LOG, instanceConfig, 'Log continued')
            }
        }
        else {
            this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Instance ${instanceConfig.instance} not found`, instanceConfig)
        }
    }

    modifyInstance (webSocket:WebSocket, instanceConfig: IInstanceConfig): void {

    }

    removeInstance(webSocket: WebSocket, instanceId: string): void {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            let instances = socket.instances
            if (instances) {
                let pos = instances.findIndex(t => t.instanceId === instanceId)
                if (pos>=0) {
                    let instance = instances[pos]
                    for (let asset of instance.assets) {
                        if (asset.passThroughStream)
                            asset.passThroughStream.removeAllListeners()
                        else
                            console.log(`logStream not found of instance id ${instanceId} and asset ${asset.podNamespace}/${asset.podName}/${asset.containerName}`)
                    }
                    instances.splice(pos,1)
                }
                else {
                    console.log(`Instance ${instanceId} not found, cannot delete`)
                }
            }
            else {
                console.log('There are no log Instances on websocket')
            }
        }
        else {
            console.log('WebSocket not found on logs')
        }
    }

    containsConnection (webSocket:WebSocket) : boolean {
        return Boolean (this.webSockets.find(s => s.ws === webSocket))
    }

    removeConnection(webSocket: WebSocket): void {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            for (let instance of socket.instances) {
                this.removeInstance (webSocket, instance.instanceId)
            }
            let pos = this.webSockets.findIndex(s => s.ws === webSocket)
            this.webSockets.splice(pos,1)
        }
        else {
            console.log('WebSocket not found on logs for remove')
        }
    }

    refreshConnection(webSocket: WebSocket): boolean {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            socket.lastRefresh = Date.now()
            return true
        }
        else {
            console.log('WebSocket not found')
            return false
        }
    }

    updateConnection(newWebSocket: WebSocket, instanceId: string): boolean {
        for (let entry of this.webSockets) {
            let exists = entry.instances.find(i => i.instanceId === instanceId)
            if (exists) {
                entry.ws = newWebSocket
                for (let instance of entry.instances) {
                    if (this.clusterInfo.type === EClusterType.DOCKER) {
                        for (let asset of instance.assets) {
                            if (asset.readableStream) {
                                asset.readableStream.removeAllListeners('data')
                                asset.readableStream.on('data', (chunk:any) => this.sendBatch(newWebSocket, instance, asset, chunk) )
                            }        
                        }
                    }
                    else if (this.clusterInfo.type === EClusterType.KUBERNETES) {
                        for (let asset of instance.assets) {
                            if (asset.passThroughStream) {
                                asset.passThroughStream.removeAllListeners('data')
                                asset.passThroughStream.on('data', (chunk:any) => this.sendBatch(newWebSocket, instance, asset, chunk) )
                            }
                        }
                    }
                }
                return true
            }
        }
        return false
    }

    getInstance(webSocket:WebSocket, instanceId: string) : IInstance | undefined{
        let socket = this.webSockets.find(entry => entry.ws === webSocket)
        if (socket) {
            let instances = socket.instances
            if (instances) {
                let instanceIndex = instances.findIndex(t => t.instanceId === instanceId)
                if (instanceIndex>=0) return instances[instanceIndex]
                console.log('Instance not found')
            }
            else {
                console.log('There are no Instances on websocket')
            }
        }
        else {
            console.log('WebSocket not found')
        }
        return undefined
    }

}

export { LogChannel }