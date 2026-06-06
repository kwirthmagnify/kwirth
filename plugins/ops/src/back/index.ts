import { IInstanceConfig, InstanceMessageChannelEnum, ISignalMessage, IInstanceConfigResponse, IInstanceMessage, IRouteMessageResponse, AccessKey, accessKeyDeserialize, parseResources, ResourceIdentifier, BackChannelData, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel, EClusterType, IBackChannelObject, IBackChannelRequirements } from '@kwirthmagnify/kwirth-common'
import { WebSocket as NonNativeWebSocket } from 'ws'
import { PassThrough, Readable, Writable } from 'stream'
import { execCommandDescribe } from './GetCommand'
import { execCommandRestart } from './RestartCommand'
import { EOpsCommand, IOpsMessage, IOpsMessageResponse } from '../common/OpsTypes'

const checkResource = (resource: ResourceIdentifier, namespace: string, pod: string, container: string): boolean => {
    const match = (pattern: string, value: string) => !pattern || pattern === '*' || pattern === value
    return match(resource.namespaces || '*', namespace) && match(resource.pods || '*', pod) && match(resource.containers || '*', container)
}

export interface IAsset {
    podNamespace: string
    podName: string
    containerName: string
    inShellMode: boolean
    shellSocket: NonNativeWebSocket | undefined
    termSocket: NonNativeWebSocket | undefined
    wsterm: WebSocket | undefined
    stdin: Readable | undefined
    stdout: Writable | undefined
    stderr: Writable | undefined
    shellId: string
}

export interface IInstance {
    instanceId: string
    accessKey: AccessKey
    assets: IAsset[]
}

class OpsChannel {
    readonly channelId = 'ops'
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
            id: 'ops', routable: true, pauseable: false, modifiable: false, reconnectable: false,
            metrics: false, sources: [EClusterType.KUBERNETES], endpoints: [], websocket: true, cluster: false, resourced: true
        }
    }

    getChannelScopeLevel(scope: string): number {
        return ['', 'ops$get', 'ops$execute', 'ops$shell', 'ops$restart', 'cluster'].indexOf(scope)
    }

    startChannel = async () => { }
    processProviderEvent(_providerId: string, _obj: any): void { }
    async endpointRequest(_endpoint: string, _req: any, _res: any): Promise<void> { }

    async websocketRequest(wso: WebSocket, instanceId: string, instanceConfig: IInstanceConfig): Promise<void> {
        let instance = this.getInstance(instanceId)
        if (!instance) { console.log('[ops] no instance'); return }
        let asset = instance.assets.find(a => a.podNamespace === instanceConfig.namespace && a.podName === instanceConfig.pod && a.containerName === instanceConfig.container)
        if (!asset) { console.log('[ops] no asset'); return }

        const stdoutStream = new PassThrough()
        const stderrStream = new PassThrough()
        const stdinStream = new PassThrough()

        wso.onmessage = async (event: any) => {
            const data = (typeof event.data === 'string') ? event.data : Buffer.from(await event.data.arrayBuffer())
            stdinStream.write(data)
        }
        wso.onclose = () => { stdinStream.end() }
        stdoutStream.on('data', (chunk: any) => wso.send(chunk.toString('utf-8')))
        stderrStream.on('data', (chunk: any) => wso.send(chunk.toString('utf-8')))

        let startCommand = ['/bin/sh']
        if (instanceConfig.data) startCommand = instanceConfig.data

        await this.clusterInfo.execApi.exec(
            asset.podNamespace, asset.podName, asset.containerName,
            startCommand, stdoutStream, stderrStream, stdinStream, true,
            (status: any) => {
                wso.send('Connection to pod has been interrupted\r\n')
                wso.close()
                let socket = this.webSockets.find(s => s.instances.some(i => i.instanceId === instanceId))
                if (socket?.ws) {
                    if (status.status === 'Success' || status.reason === 'NonZeroExitCode')
                        this.sendSignalMessage(socket.ws, EInstanceMessageAction.NONE, EInstanceMessageFlow.UNSOLICITED, ESignalMessageLevel.INFO, instanceConfig.instance, `XTerm session ended`)
                    else
                        this.sendSignalMessage(socket.ws, EInstanceMessageAction.NONE, EInstanceMessageFlow.UNSOLICITED, ESignalMessageLevel.ERROR, instanceConfig.instance, status.message || 'Error launching shell')
                }
            }
        )
    }

    containsAsset = (webSocket: WebSocket, podNamespace: string, podName: string, containerName: string): boolean => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) return socket.instances.some(i => i.assets.some(a => a.podNamespace === podNamespace && a.podName === podName && a.containerName === containerName))
        return false
    }

    containsInstance(instanceId: string): boolean {
        return this.webSockets.some(s => s.instances.find(i => i.instanceId === instanceId))
    }

    async processCommand(webSocket: WebSocket, instanceMessage: IInstanceMessage): Promise<boolean> {
        if (instanceMessage.flow === EInstanceMessageFlow.IMMEDIATE) {
            let resp = await this.executeImmediateCommand(instanceMessage)
            if (resp) webSocket.send(JSON.stringify(resp))
            return Boolean(resp)
        }
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return false
        let instance = socket.instances.find(i => i.instanceId === instanceMessage.instance)
        if (!instance) {
            this.sendSignalMessage(webSocket, instanceMessage.action, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceMessage.instance, `Instance not found`)
            return false
        }
        let opsMessage = instanceMessage as IOpsMessage
        let resp = await this.executeCommand(webSocket, instance, opsMessage)
        if (resp) webSocket.send(JSON.stringify(resp))
        return Boolean(resp)
    }

    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) {
            let len = this.webSockets.push({ ws: webSocket, lastRefresh: Date.now(), instances: [] })
            socket = this.webSockets[len - 1]
        }
        let instances = socket.instances
        let instance = instances.find(i => i.instanceId === instanceConfig.instance)
        if (!instance) {
            instance = { accessKey: accessKeyDeserialize(instanceConfig.accessKey), instanceId: instanceConfig.instance, assets: [] }
            instances.push(instance)
        }
        instance.assets.push({ podNamespace, podName, containerName, inShellMode: false, shellSocket: undefined, stdin: undefined, stdout: undefined, stderr: undefined, shellId: '', termSocket: undefined, wsterm: undefined })
        return true
    }

    deleteObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        const instance = socket?.instances.find(i => i.instanceId === instanceConfig.instance)
        if (instance) instance.assets = instance.assets.filter((a: IAsset) => !(a.podNamespace === podNamespace && a.podName === podName && (containerName === '' || a.containerName === containerName)))
        return true
    }

    pauseContinueInstance(_webSocket: WebSocket, _instanceConfig: IInstanceConfig, _action: EInstanceMessageAction): void { }
    modifyInstance(_webSocket: WebSocket, _instanceConfig: IInstanceConfig): void { }

    stopInstance(webSocket: WebSocket, instanceConfig: IInstanceConfig): void {
        if (this.webSockets.find(s => s.ws === webSocket)?.instances.find(i => i.instanceId === instanceConfig.instance)) {
            this.removeInstance(webSocket, instanceConfig.instance)
            this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instanceConfig.instance, 'Ops instance stopped')
        } else {
            this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceConfig.instance, `Instance not found`)
        }
    }

    removeInstance(webSocket: WebSocket, instanceId: string): void {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            let pos = socket.instances.findIndex(t => t.instanceId === instanceId)
            if (pos >= 0) {
                let instance = socket.instances[pos]
                for (let asset of instance.assets) {
                    asset.shellSocket?.close()
                    asset.stdin?.destroy()
                    asset.stdout?.destroy()
                    asset.stderr?.destroy()
                }
                socket.instances.splice(pos, 1)
            }
        }
    }

    containsConnection(webSocket: WebSocket): boolean { return Boolean(this.webSockets.find(s => s.ws === webSocket)) }

    removeConnection(webSocket: WebSocket): void {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            const ids = socket.instances.map(i => i.instanceId)
            for (const id of ids) this.removeInstance(webSocket, id)
            let pos = this.webSockets.findIndex(s => s.ws === webSocket)
            this.webSockets.splice(pos, 1)
        }
    }

    refreshConnection(webSocket: WebSocket): boolean {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) { socket.lastRefresh = Date.now(); return true }
        return false
    }

    updateConnection(_newWebSocket: WebSocket, _instanceId: string): boolean { return false }

    // ─── PRIVATE ────────────────────────────────────────────────────────────────

    private sendSignalMessage = (ws: WebSocket, action: EInstanceMessageAction, flow: EInstanceMessageFlow, level: ESignalMessageLevel, instanceId: string, text: string): void => {
        ws.send(JSON.stringify({ action, flow, channel: InstanceMessageChannelEnum.OPS, instance: instanceId, type: EInstanceMessageType.SIGNAL, text, level } as ISignalMessage))
    }

    private sendDataMessage = (ws: WebSocket, instanceId: string, text: string): void => {
        ws.send(JSON.stringify({ action: EInstanceMessageAction.NONE, flow: EInstanceMessageFlow.UNSOLICITED, channel: InstanceMessageChannelEnum.OPS, instance: instanceId, type: EInstanceMessageType.DATA, text } as IInstanceConfigResponse))
    }

    private async executeLinuxCommand(webSocket: WebSocket, instance: IInstance, podNamespace: string, podName: string, containerName: string, id: string, command: string) {
        let stdout = new Writable({})
        let stderr = new Writable({})
        let stdin = new Readable({ read() { } })
        let shellSocket = await this.clusterInfo.execApi.exec(podNamespace, podName, containerName, ['/bin/sh', '-i'], stdout, stderr, stdin, true, (_st: any) => { })
        shellSocket.onmessage = (event: any) => {
            let text = event.data.toString('utf8').substring(1)
            webSocket.send(JSON.stringify({ action: EInstanceMessageAction.NONE, flow: EInstanceMessageFlow.UNSOLICITED, channel: InstanceMessageChannelEnum.OPS, instance: instance.instanceId, type: EInstanceMessageType.DATA, id, command: EOpsCommand.EXECUTE, namespace: podNamespace, group: '', pod: podName, container: containerName, data: text, msgtype: 'opsmessageresponse' } as IOpsMessageResponse))
        }
        shellSocket.onclose = () => { this.sendDataMessage(webSocket, instance.instanceId, 'Connection to container has been interrupted') }
        stdin?.push(command + '\n')
    }

    private checkAssetScope = (instance: IInstance, asset: IAsset, scope: string) => {
        let resources = parseResources(instance.accessKey.resources)
        let requiredLevel = this.getChannelScopeLevel(scope)
        return resources.some(r => r.scopes.split(',').some((sc: string) => this.getChannelScopeLevel(sc) >= requiredLevel) && checkResource(r, asset.podNamespace, asset.podName, asset.containerName))
    }

    private async executeImmediateCommand(instanceMessage: IInstanceMessage): Promise<IRouteMessageResponse> {
        let opsMessage = instanceMessage as IOpsMessage
        let instance: IInstance = {
            accessKey: accessKeyDeserialize(opsMessage.accessKey),
            instanceId: opsMessage.instance,
            assets: [{ podNamespace: opsMessage.namespace, podName: opsMessage.pod, containerName: opsMessage.container, inShellMode: false, shellSocket: undefined, stdin: undefined, stdout: undefined, stderr: undefined, shellId: '', termSocket: undefined, wsterm: undefined }]
        }
        let resp: IOpsMessageResponse = { action: opsMessage.action, flow: EInstanceMessageFlow.RESPONSE, type: EInstanceMessageType.SIGNAL, channel: opsMessage.channel, instance: opsMessage.instance, command: opsMessage.command, id: opsMessage.id, namespace: opsMessage.namespace, group: opsMessage.group, pod: opsMessage.pod, container: opsMessage.container, msgtype: 'opsmessageresponse' }

        switch (opsMessage.command) {
            case EOpsCommand.DESCRIBE:
                resp = this.checkAssetScope(instance, instance.assets[0], 'ops$get') ? await execCommandDescribe(this.clusterInfo, opsMessage) : { ...resp, data: 'Insufficient scope for GET' }
                break
            case EOpsCommand.RESTARTPOD:
            case EOpsCommand.RESTARTNS:
                resp = this.checkAssetScope(instance, instance.assets[0], 'ops$restart') ? await execCommandRestart(this.clusterInfo, instance, opsMessage) : { ...resp, data: 'Insufficient scope for RESTART' }
                break
            default:
                resp.data = `Invalid command for route: '${opsMessage.command}'`
        }
        return { msgtype: 'routemessageresponse', action: EInstanceMessageAction.ROUTE, flow: EInstanceMessageFlow.RESPONSE, type: EInstanceMessageType.SIGNAL, channel: InstanceMessageChannelEnum.OPS, instance: instanceMessage.instance, data: resp } as IRouteMessageResponse
    }

    private async executeCommand(webSocket: WebSocket, instance: IInstance, opsMessage: IOpsMessage): Promise<IOpsMessageResponse | undefined> {
        let execResponse: IOpsMessageResponse = { action: opsMessage.action, flow: EInstanceMessageFlow.RESPONSE, type: EInstanceMessageType.SIGNAL, channel: opsMessage.channel, instance: opsMessage.instance, command: opsMessage.command, id: opsMessage.id, namespace: opsMessage.namespace, group: opsMessage.group, pod: opsMessage.pod, container: opsMessage.container, msgtype: 'opsmessageresponse' }
        if (!opsMessage.command) { execResponse.data = 'No command received'; return execResponse }

        switch (opsMessage.command) {
            case EOpsCommand.DESCRIBE: {
                let asset = instance.assets.find(a => a.podNamespace === opsMessage.namespace && a.podName === opsMessage.pod && a.containerName === opsMessage.container)
                if (!asset) { execResponse.data = 'Asset not found'; return execResponse }
                if (!this.checkAssetScope(instance, asset, 'ops$get')) { execResponse.data = 'Insufficient scope for GET/DESCRIBE'; return execResponse }
                execResponse = await execCommandDescribe(this.clusterInfo, opsMessage)
                break
            }
            case EOpsCommand.RESTART: {
                if (!opsMessage.namespace || !opsMessage.pod || !opsMessage.container) { execResponse.data = 'Namespace, pod and container required'; return execResponse }
                let asset = instance.assets.find(a => a.podNamespace === opsMessage.namespace && a.podName === opsMessage.pod && a.containerName === opsMessage.container)
                if (!asset) { execResponse.data = 'Asset not found'; return execResponse }
                if (!this.checkAssetScope(instance, asset, 'ops$restart')) { execResponse.data = 'Insufficient scope to RESTART CONTAINER'; return execResponse }
                try {
                    await this.executeLinuxCommand(webSocket, instance, asset.podNamespace, asset.podName, asset.containerName, opsMessage.id, '/usr/sbin/killall5')
                    this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instance.instanceId, `Container ${asset.podNamespace}/${asset.podName}/${asset.containerName} restarted`)
                } catch (err) {
                    this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, `Error restarting: ${err}`)
                }
                execResponse.type = EInstanceMessageType.DATA
                break
            }
            case EOpsCommand.RESTARTNS:
                for (let asset of instance.assets) {
                    if (!this.checkAssetScope(instance, asset, 'ops$restart')) { execResponse.data = `No RESTART scope on [${asset.podNamespace}/${asset.podName}/${asset.containerName}]`; return execResponse }
                }
                execResponse = await execCommandRestart(this.clusterInfo, instance, opsMessage)
                break
            case EOpsCommand.RESTARTPOD: {
                if (!opsMessage.namespace || !opsMessage.pod) { execResponse.data = 'Namespace and pod required'; return execResponse }
                let asset = instance.assets.find(a => a.podNamespace === opsMessage.namespace && a.podName === opsMessage.pod)
                if (!asset) { execResponse.data = 'Asset not found'; return execResponse }
                if (!this.checkAssetScope(instance, asset, 'ops$restart')) { execResponse.data = 'Insufficient scope to RESTARTPOD'; return execResponse }
                execResponse = await execCommandRestart(this.clusterInfo, instance, opsMessage)
                break
            }
            default:
                execResponse.data = `Invalid command '${opsMessage.command}'`
        }
        return execResponse
    }

    getInstance(instanceId: string): IInstance | undefined {
        return this.webSockets.find(s => s.instances.some(i => i.instanceId === instanceId))?.instances.find(i => i.instanceId === instanceId)
    }
}

export { OpsChannel }
