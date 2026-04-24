import { IInstanceConfig, InstanceMessageChannelEnum, ISignalMessage, IInstanceConfigResponse, IInstanceMessage, IOpsMessage, IOpsMessageResponse, EOpsCommand, IRouteMessageResponse, AccessKey, accessKeyDeserialize, parseResources, BackChannelData, ClusterTypeEnum, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel } from '@kwirthmagnify/kwirth-common';
import { WebSocket as NonNativeWebSocket } from 'ws'
import { ClusterInfo } from '../../model/ClusterInfo'
import { IBackChannelRequirements, IChannel } from '../IChannel';
import { PassThrough, Readable, Writable } from 'stream';
import { execCommandDescribe } from './GetCommand';
import { execCommandRestart } from './RestartCommand';
import { AuthorizationManagement } from '../../tools/AuthorizationManagement';
import { Request, Response } from 'express'

export interface IAsset {
    podNamespace: string
    podName: string
    containerName: string
    inShellMode: boolean
    shellSocket: NonNativeWebSocket|undefined
    termSocket: NonNativeWebSocket|undefined
    wsterm:WebSocket|undefined
    stdin: Readable|undefined
    stdout: Writable|undefined
    stderr: Writable|undefined
    shellId: string
}

export interface IInstance {
    instanceId: string
    accessKey: AccessKey
    assets: IAsset[]
}

class OpsChannel implements IChannel {    
    readonly channelId = 'ops'
    readonly requirements: IBackChannelRequirements = {
        storage: false
    }
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
            id: 'ops',
            routable: true,
            pauseable: false,
            modifiable: false,
            reconnectable: false,
            metrics: false,
            //events: false,
            providers: [],
            sources: [ ClusterTypeEnum.KUBERNETES ],
            endpoints: [],
            websocket: true,
            cluster: false
        }
    }

    getChannelScopeLevel(scope: string): number {
        return ['', 'ops$get', 'ops$execute', 'ops$shell', 'ops$restart', 'cluster'].indexOf(scope)
    }

    startChannel = async () =>  {
    }

    processProviderEvent(providerId:string, obj:any) : void {
    }

    async endpointRequest(endpoint:string,req:Request, res:Response) : Promise<void> {
    }

    async websocketRequest(wso:WebSocket, instanceId:string, instanceConfig:IInstanceConfig) : Promise<void> {
        let instance = this.getInstance(instanceId)
        if (!instance) {
            console.log('ops no instance')
            return
        }
        let asset = instance.assets.find(a => a.podNamespace === instanceConfig.namespace && a.podName === instanceConfig.pod && a.containerName === instanceConfig.container)
        if (!asset) {
            console.log('Ops: no asset for')
            console.log(instanceConfig)
            return
        }
        const namespace=asset.podNamespace
        const podName=asset.podName
        const containerName=asset.containerName

        const stdoutStream = new PassThrough()
        const stderrStream = new PassThrough()
        const stdinStream = new PassThrough()

        wso.onmessage = async (event) => {
            const data = (typeof event.data === 'string') ? event.data : Buffer.from(await event.data.arrayBuffer())
            stdinStream.write(data)
        }

        wso.onclose = () => {
            console.log('Client disconnected')
            stdinStream.end()
        }

        stdoutStream.on('data', (chunk) => wso.send(chunk.toString('utf-8')))
        stderrStream.on('data', (chunk) => wso.send(chunk.toString('utf-8')))

        let startCommand = ['/bin/sh']
        if (instanceConfig.data) startCommand=instanceConfig.data

        await this.clusterInfo.execApi.exec(
            namespace,
            podName,
            containerName,
            startCommand,
            stdoutStream,
            stderrStream,
            stdinStream,
            true,
            (status) => {
                wso.send('Connection to pod has been interrupted\r\n')
                wso.close()
                let socket = this.webSockets.find(s => s.instances.some(i => i.instanceId === instanceId))
                if (socket?.ws) {
                    if(status.status === 'Success') {
                        this.sendSignalMessage(socket.ws,EInstanceMessageAction.NONE, EInstanceMessageFlow.UNSOLICITED, ESignalMessageLevel.INFO, instanceConfig.instance, `XTerm session to ${namespace}/${podName}/${containerName} ended`)
                    }
                    else {
                        this.sendSignalMessage(socket.ws,EInstanceMessageAction.NONE, EInstanceMessageFlow.UNSOLICITED, ESignalMessageLevel.ERROR, instanceConfig.instance, status.message || 'Error launching shell')
                    }
                }
            }
        )
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
        return this.webSockets.some(socket => socket.instances.find(i => i.instanceId === instanceId))
    }

    async processCommand (webSocket:WebSocket, instanceMessage:IInstanceMessage) : Promise<boolean> {
        if (instanceMessage.flow === EInstanceMessageFlow.IMMEDIATE) {
            // immediate commands are typical request/repsonse pattern, so we invoke 'executeImmediteCommand' and we send back the response
            let resp = await this.executeImmediateCommand(instanceMessage)
            if (resp) webSocket.send(JSON.stringify(resp))
            return Boolean(resp)
        }
        else {
            let socket = this.webSockets.find(s => s.ws === webSocket)
            if (!socket) {
                console.log('Socket not found')
                return false
            }

            let instances = socket.instances
            let instance = instances.find(i => i.instanceId === instanceMessage.instance)
            if (!instance) {
                this.sendSignalMessage(webSocket, instanceMessage.action, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceMessage.instance, `Instance not found`)
                console.log(`Instance ${instanceMessage.instance} not found`)
                return false
            }    
            let opsMessage = instanceMessage as IOpsMessage
            let resp = await this.executeCommand(webSocket, instance, opsMessage)
            if (resp) webSocket.send(JSON.stringify(resp))
            return Boolean(resp)
        }
    }

    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> => {
        console.log(`Start instance ${instanceConfig.instance} ${podNamespace}/${podName}/${containerName} (view: ${instanceConfig.view})`)

        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) {
            let len = this.webSockets.push( {ws:webSocket, lastRefresh: Date.now(), instances:[]} )
            socket = this.webSockets[len-1]
        }

        let instances = socket.instances
        let instance = instances.find(i => i.instanceId === instanceConfig.instance)
        if (!instance) {
            instance = {
                accessKey: accessKeyDeserialize(instanceConfig.accessKey),
                instanceId: instanceConfig.instance,
                assets: []
            }
            instances.push(instance)
        }
        let asset:IAsset = {
            podNamespace,
            podName,
            containerName,
            inShellMode: false,
            shellSocket: undefined,
            stdin: undefined,
            stdout: undefined,
            stderr: undefined,
            shellId: '',
            termSocket: undefined,
            wsterm: undefined
        }
        instance.assets.push(asset)
        return true
    }

    deleteObject = async (webSocket:WebSocket, instanceConfig:IInstanceConfig, podNamespace:string, podName:string, containerName:string) : Promise<boolean> => {
        return true        
    }
    
    pauseContinueInstance(webSocket: WebSocket, instanceConfig: IInstanceConfig, action: EInstanceMessageAction): void {
        console.log('Pause/Continue not supported')
    }

    modifyInstance (webSocket:WebSocket, instanceConfig: IInstanceConfig): void {
        console.log('Modify not supported')
    }

    stopInstance(webSocket: WebSocket, instanceConfig: IInstanceConfig): void {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return

        if (socket.instances.find(i => i.instanceId === instanceConfig.instance)) {
            this.removeInstance(webSocket, instanceConfig.instance)
            this.sendSignalMessage(webSocket,EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instanceConfig.instance, 'Ops instance stopped')
        }
        else {
            this.sendSignalMessage(webSocket,EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceConfig.instance, `Instance not found`)
        }
    }

    removeInstance(webSocket: WebSocket, instanceId: string): void {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            var instances = socket.instances
            if (instances) {
                let pos = instances.findIndex(t => t.instanceId === instanceId)
                if (pos>=0) {
                    let instance = instances[pos]
                    for (let asset of instance.assets) {
                        asset.shellSocket?.close()
                        asset.stdin?.destroy()
                        asset.stdout?.destroy()
                        asset.stderr?.destroy()
                    }
                    instances.splice(pos,1)
                }
                else {
                    console.log(`Instance ${instanceId} not found, cannot delete`)
                }
            }
            else {
                console.log('There are no ops Instances on websocket')
            }
        }
        else {
            console.log('WebSocket not found on ops')
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
            console.log('WebSocket not found on ops for remove')
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
        console.log('updateConnection not supported')
        return false
    }

    // *************************************************************************************
    // PRIVATE
    // *************************************************************************************

    private sendSignalMessage = (ws:WebSocket, action:EInstanceMessageAction, flow: EInstanceMessageFlow, level: ESignalMessageLevel, instanceId:string, text:string): void => {
        var resp:ISignalMessage = {
            action,
            flow,
            channel: InstanceMessageChannelEnum.OPS,
            instance: instanceId,
            type: EInstanceMessageType.SIGNAL,
            text,
            level
        }
        ws.send(JSON.stringify(resp))
    }

    private sendDataMessage = (ws:WebSocket, instanceId:string, text:string): void => {
        var resp: IInstanceConfigResponse = {
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            channel: InstanceMessageChannelEnum.OPS,
            instance: instanceId,
            type: EInstanceMessageType.DATA,
            text
        }
        ws.send(JSON.stringify(resp))
    }

    private async executeLinuxCommand (webSocket:WebSocket, instance:IInstance, podNamespace:string, podName:string, containerName:string, id:string, command:string) {
        let stdout = new Writable({})
        let stderr = new Writable({})
        let stdin = new Readable({ read() {} })

        let shellSocket = await this.clusterInfo.execApi.exec(podNamespace, podName, containerName, ['/bin/sh', '-i'], stdout, stderr, stdin, true, (st) => { console.log('st',st) })
        shellSocket.onmessage = (event) => {
            let text = event.data.toString('utf8').substring(1)
            var resp: IOpsMessageResponse = {
                action: EInstanceMessageAction.NONE,
                flow: EInstanceMessageFlow.UNSOLICITED,
                channel: InstanceMessageChannelEnum.OPS,
                instance: instance.instanceId,
                type: EInstanceMessageType.DATA,
                id,
                command: EOpsCommand.EXECUTE,
                namespace: podNamespace,
                group: '',
                pod: podName,
                container: containerName,
                data: text,
                msgtype: 'opsmessageresponse'
            }
            webSocket.send(JSON.stringify(resp))
        }
        shellSocket.onclose = (event) => {
            this.sendDataMessage(webSocket, instance.instanceId, 'Connection to container has been interrupted')
        }
        shellSocket.onerror = (event) => {
            this.sendDataMessage(webSocket, instance.instanceId, 'Error detected con connection to container')
        }
        stdin?.push(command+'\n')
    }

    private checkAssetScope = (instance:IInstance, asset: IAsset, scope: string) => {
        let resources = parseResources (instance.accessKey.resources)
        let requiredLevel = this.getChannelScopeLevel(scope)
        let canPerform = resources.some(r => r.scopes.split(',').some(sc => this.getChannelScopeLevel(sc)>= requiredLevel) && AuthorizationManagement.checkResource(r, asset.podNamespace, asset.podName, asset.containerName))
        return canPerform
    }

    private async executeImmediateCommand (instanceMessage:IInstanceMessage) : Promise<IRouteMessageResponse> {
        console.log('Immediate request received')
        let opsMessage = instanceMessage as IOpsMessage

        // we create a dummy instance for executnig command, and we add the asset refrenced in the immediate command
        let instance:IInstance = {
            accessKey: accessKeyDeserialize(opsMessage.accessKey),
            instanceId: opsMessage.instance,
            assets: [ {
                podNamespace: opsMessage.namespace,
                podName: opsMessage.pod,
                containerName: opsMessage.container,
                inShellMode: false,
                shellSocket: undefined,
                stdin: undefined,
                stdout: undefined,
                stderr: undefined,
                shellId: '',
                termSocket: undefined,
                wsterm: undefined
            } ]
        }

        // we prepare a base response message
        let resp:IOpsMessageResponse = {
            action: opsMessage.action,
            flow: EInstanceMessageFlow.RESPONSE,
            type: EInstanceMessageType.SIGNAL,
            channel: opsMessage.channel,
            instance: opsMessage.instance,
            command: opsMessage.command,
            id: opsMessage.id,
            namespace: opsMessage.namespace,
            group: opsMessage.group,
            pod: opsMessage.pod,
            container: opsMessage.container,
            msgtype: 'opsmessageresponse'
        }

        switch (opsMessage.command) {
            case EOpsCommand.DESCRIBE:
                if (this.checkAssetScope(instance, instance.assets[0], 'ops$get'))
                    resp = await execCommandDescribe(this.clusterInfo, opsMessage)
                else
                    resp.data = `Insufficient scope for GET`
                break
            case EOpsCommand.RESTARTPOD:
            case EOpsCommand.RESTARTNS:
                if (this.checkAssetScope(instance, instance.assets[0], 'ops$restart'))
                    resp = await execCommandRestart(this.clusterInfo, instance, opsMessage)
                else
                    resp.data = `Insufficient scope for RESTART`
                break
            default:
                resp.data = `Invalid command for route: '${opsMessage.command}'`
                break
        }

        let routeMessageResponse:IRouteMessageResponse = {
            msgtype: 'routemessageresponse',
            action: EInstanceMessageAction.ROUTE,
            flow: EInstanceMessageFlow.RESPONSE,
            type: EInstanceMessageType.SIGNAL,
            channel: InstanceMessageChannelEnum.OPS,
            instance: instanceMessage.instance,
            data: resp
        }
        return routeMessageResponse
    }

    private async executeCommand (webSocket:WebSocket, instance:IInstance, opsMessage:IOpsMessage) : Promise<IOpsMessageResponse | undefined> {
        let execResponse: IOpsMessageResponse = {
            action: opsMessage.action,
            flow: EInstanceMessageFlow.RESPONSE,
            type: EInstanceMessageType.SIGNAL,
            channel: opsMessage.channel,
            instance: opsMessage.instance,
            command: opsMessage.command,
            id: opsMessage.id,
            namespace: opsMessage.namespace,
            group: opsMessage.group,
            pod: opsMessage.pod,
            container: opsMessage.container,
            msgtype: 'opsmessageresponse'
        }

        if (!opsMessage.command) {
            execResponse.data = 'No command received in data'
            return execResponse
        }

        switch (opsMessage.command) {
            case EOpsCommand.DESCRIBE: {
                let asset = instance.assets.find(a => a.podNamespace === opsMessage.namespace && a.podName === opsMessage.pod && a.containerName === opsMessage.container)
                if (!asset) {
                    execResponse.data = 'Asset not found or not autorized'
                    return execResponse
                }
                if (!this.checkAssetScope(instance, asset, 'ops$get')) {
                    execResponse.data = `Insuffcient scope for GET/DESCRIBE`
                    return execResponse
                }
                execResponse = await execCommandDescribe(this.clusterInfo, opsMessage)
                break
            }
            case EOpsCommand.RESTART: {
                    if (opsMessage.namespace==='' || opsMessage.pod==='' || opsMessage.container==='' || !opsMessage.namespace || !opsMessage.pod || !opsMessage.container) {
                        execResponse.data = `Namespace, pod and container must be specified (format 'ns/pod/container')`
                        return execResponse
                    }

                    let asset = instance.assets.find(a => a.podNamespace === opsMessage.namespace && a.podName === opsMessage.pod && a.containerName === opsMessage.container)
                    if (!asset) {
                        execResponse.data = 'Asset not found or not autorized'
                        return execResponse
                    }

                    if (!this.checkAssetScope(instance, asset, 'ops$restart')) {
                        execResponse.data = 'Insufficient scope to RESTART CONTAINER'
                        return execResponse
                    }

                    try {
                        await this.executeLinuxCommand(webSocket, instance, asset.podNamespace, asset.podName, asset.containerName, opsMessage.id, '/usr/sbin/killall5')
                        this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instance.instanceId, `Container ${asset.podNamespace}/${asset.podName}/${asset.containerName} restarted`)
                    }
                    catch (err) {
                        this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, `Error restarting container ${asset.podNamespace}/${asset.podName}/${asset.containerName}: ${err}`)
                    }
                    execResponse.type = EInstanceMessageType.DATA
                }
                break

            case EOpsCommand.RESTARTNS:
                for (let asset of instance.assets) {
                    if (!this.checkAssetScope(instance, asset, 'ops$restart')) {
                        execResponse.data = `You have no RESTART scope on all namespace objects [${asset.podNamespace}/${asset.podName}/${asset.containerName}]`
                        return execResponse
                    }
                }
                execResponse = await execCommandRestart(this.clusterInfo, instance, opsMessage)
                break

            case EOpsCommand.RESTARTPOD: {
                    if (opsMessage.namespace==='' || opsMessage.pod==='' || !opsMessage.namespace || !opsMessage.pod) {
                        execResponse.data = `Namespace, pod and container must be specified (format 'ns/pod')`
                        return execResponse
                    }

                    let asset = instance.assets.find(a => a.podNamespace === opsMessage.namespace && a.podName === opsMessage.pod)
                    if (!asset) {
                        execResponse.data = 'Asset not found or not autorized'
                        return execResponse
                    }

                    if (!this.checkAssetScope(instance, asset, 'ops$restart')) {
                        execResponse.data = 'Insufficient scope to RESTARTPOD'
                        return execResponse
                    }
                    execResponse = await execCommandRestart(this.clusterInfo, instance, opsMessage)
                }
                break

            default:
                execResponse.data = `Invalid command '${opsMessage.command}'. Valid commands are: ${Object.keys(EOpsCommand)}`
                break
        }
        return execResponse
    }

    getInstance(instanceId: string) : IInstance | undefined{
        let socket = this.webSockets.find(s => s.instances.some(i => i.instanceId === instanceId))
        if (socket) {
            let instances = socket.instances
            if (instances) {
                let instance = instances.find(i => i.instanceId === instanceId)
                if (instance) return instance
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

export { OpsChannel }