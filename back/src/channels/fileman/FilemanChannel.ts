import { IInstanceConfig, ISignalMessage, IInstanceMessage, AccessKey, accessKeyDeserialize, ClusterTypeEnum, BackChannelData, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, ESignalMessageLevel } from '@kwirthmagnify/kwirth-common'
import { ClusterInfo } from '../../model/ClusterInfo'
import { IChannel } from '../IChannel'
import { Readable, Writable } from 'stream'
import { Request, Response } from 'express'
import { v4 as uuid } from 'uuid'
import fs from 'fs'
import path from 'path'
import fileUpload from 'express-fileupload'
import os from 'os'
const ParseListing = require ('@jfvilas/parse-listing')

export interface IFilemanConfig {
    interval: number
}

export enum EFilemanCommand {
    HOME = 'home',
    DIR = 'dir',
    CREATE = 'create',
    RENAME = 'rename',
    DELETE = 'delete',
    MOVE = 'move',
    COPY = 'copy',
    UPLOAD = 'upload',
    DOWNLOAD = 'download'
}

export interface IFilemanMessage extends IInstanceMessage {
    msgtype: 'filemanmessage'
    id: string
    accessKey: string
    instance: string
    namespace: string
    group: string
    pod: string
    container: string
    command: EFilemanCommand
    params?: string[]
}

export interface IFilemanMessageResponse extends IInstanceMessage {
    msgtype: 'filemanmessageresponse'
    id: string;
    command: EFilemanCommand
    namespace: string
    group: string
    pod: string
    container: string
    data?: any
}

export interface IAsset {
    podNamespace: string
    podName: string
    containerName: string
}

export interface IInstance {
    instanceId: string
    accessKey: AccessKey
    configData: IFilemanConfig
    paused: boolean
    assets: IAsset[]
}

interface IExecutionResult {
    metadata: Record<string, any>,
    status: ExecutionStatus,
    message: string,
    reason?: string,
    details?: {  causes: Record<string, any>[] },
    code?: number
}

enum ExecutionStatus {
    SUCCESS = 'Success',
    FAILURE = 'Failure'
}

interface IDirectoryEntry {
    name: string,
    type: number,
    time: number,
    size: string,
    target?: string,
    owner: string,
    group: string,
    userPermissions: { read: boolean, write: boolean, exec: boolean },
    groupPermissions: { read: boolean, write: boolean, exec: boolean },
    otherPermissions: { read: boolean, write: boolean, exec: boolean }
}

class FilemanChannel implements IChannel {
    clusterInfo : ClusterInfo
    webSockets: {
        ws:WebSocket,
        lastRefresh: number,
        instances: IInstance[] 
    }[] = []

    constructor (clusterInfo:ClusterInfo) {
        this.clusterInfo = clusterInfo
    }

    getChannelData = (): BackChannelData => {
        return {
            id: 'fileman',
            routable: false,
            pauseable: false,
            modifyable: false,
            reconnectable: true,
            metrics: false,
            //events: false,
            providers: [],
            sources: [ ClusterTypeEnum.KUBERNETES, ClusterTypeEnum.DOCKER ],
            endpoints: [
                { name: 'download', methods: ['GET'], requiresAccessKey: true },
                { name: 'upload', methods: ['POST'], requiresAccessKey: true } 
            ],
            websocket: false,
            cluster: false
        }
    }

    getChannelScopeLevel = (scope: string): number => {
        return ['', 'fileman$read', 'fileman$write', 'cluster'].indexOf(scope)
    }

    startChannel = async () =>  {
    }

    processProviderEvent(providerId:string, obj:any) : void {
    }

    // +++ review expired keys mangement (user is receiving no message)
    async endpointRequest(endpoint:string, req:Request, res:Response, accessKey:AccessKey) : Promise<void> {
        console.log('Received endpointRequest:', endpoint, req.method, req.url)

        let instanceId=req.query['key'] as string
        let socket = this.webSockets.find(ws => ws.instances.some(i => i.accessKey.id === accessKey.id && i.instanceId === instanceId))
        if (!socket) {
            res.status(400).send('Inexistent socket with accessKey ' + accessKey.id + ' and instance ' + instanceId )
            return
        }

        let instance = socket.instances.find(i => i.instanceId === instanceId)!

        switch (endpoint){
            case 'download':
                let filename=req.query['filename'] as string
                if (!filename) {
                    res.status(400).send()
                    return
                }

                let [srcNamespace,srcPod,srcContainer] = filename.split('/').slice(1)
                let filepath = '/' + filename.split('/').slice(4).join('/')

                let fileInfo  = await this.getFileInfo(filename)
                let encodedFilename = encodeURIComponent(filename.split('/').slice(-1)[0])
                if (fileInfo) {
                    if (fileInfo.type === 0 || fileInfo.type === 2) {
                        let result = await this.downloadFile(srcNamespace, srcPod, srcContainer, filepath)
                        let tmpName=result.metadata.filename as string
                        if (result.status === ExecutionStatus.SUCCESS) {
                            res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"`)
                            res.status(200).send(fs.readFileSync(tmpName))
                        }
                        else {
                            res.status(400).send(result.message)
                        }

                        try {
                            fs.unlinkSync(tmpName)
                        }
                        catch {}
                    }
                    else if (fileInfo.type === 1) {
                        try {
                            let tmpName='/tmp/'+uuid()
                            await this.downloadFolder(srcNamespace, srcPod, srcContainer, filepath, tmpName)
                            res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}.tar.gz"`)
                            res.status(200).send(fs.readFileSync(tmpName))
                            fs.unlinkSync(tmpName)
                        }
                        catch (err) {
                            console.log('error downloading folder')
                            console.log(err)
                            this.sendSignalMessage(socket.ws, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.UNSOLICITED, ESignalMessageLevel.ERROR, instance.instanceId, 'Error building tar for download: '+err)
                        }
                    }
                    else {
                        console.error('Unmanaged fileInfo/Type', fileInfo.type)
                        this.sendSignalMessage(socket.ws, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.UNSOLICITED, ESignalMessageLevel.ERROR, instance.instanceId, 'File type not supported')
                    }
                }
                else {
                    console.error('No fileInfo/Type', fileInfo)
                    this.sendSignalMessage(socket.ws, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.UNSOLICITED, ESignalMessageLevel.ERROR, instance.instanceId, 'Could not get file type')
                }
                break
            case 'upload': {
                const filedata = req.files!.file  as fileUpload.UploadedFile
                const filename = req.body.filename as string

                let tmpName='/tmp/'+uuid()
                fs.writeFileSync(tmpName, filedata.data)
                let [dstNamespace,dstPod,dstContainer] = filename.split('/').slice(1)
                let dstLocalPath = '/' + filename.split('/').slice(4).join('/')
                let executionResult = await this.uploadFile(dstNamespace, dstPod, dstContainer, tmpName, dstLocalPath)
                if (executionResult.status === ExecutionStatus.FAILURE) {
                    this.sendSignalMessage(socket.ws, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.UNSOLICITED, ESignalMessageLevel.ERROR, instance.instanceId, executionResult.message)
                    res.status(400).send()
                }
                else {
                    let size = fs.statSync(tmpName).size
                    let result = { metadata: { object:filename, type:0, time: Date.now(), size: size }, status: ExecutionStatus.SUCCESS}
                    let resp: IFilemanMessageResponse = {
                        action: EInstanceMessageAction.COMMAND,
                        flow: EInstanceMessageFlow.UNSOLICITED,
                        channel: 'fileman',
                        instance: instance.instanceId,
                        type: EInstanceMessageType.DATA,
                        id: '1',
                        command: EFilemanCommand.CREATE,
                        namespace: '',
                        group: '',
                        pod: '',
                        container: '',
                        data: JSON.stringify(result),
                        msgtype: 'filemanmessageresponse'
                    }
                    socket.ws.send(JSON.stringify(resp))
                    res.status(200).send()
                }
                break
            }
        } 
    }

    async websocketRequest(newWebSocket:WebSocket) : Promise<void> {
    }  

    containsInstance = (instanceId: string): boolean => {
        return this.webSockets.some(socket => socket.instances.find(i => i.instanceId === instanceId))
    }

    containsAsset = (webSocket:WebSocket, podNamespace:string, podName:string, containerName:string): boolean => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            let instances = socket.instances
            if (instances) return instances.some(i => i.assets.some(a => a.podNamespace===podNamespace && a.podName===podName && a.containerName===containerName))
        }
        return false
    }
    
    processCommand = async (webSocket:WebSocket, instanceMessage:IInstanceMessage) : Promise<boolean> => {
        if (instanceMessage.flow === EInstanceMessageFlow.IMMEDIATE) {
            return false
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
            let filemanMessage = instanceMessage as IFilemanMessage
            let resp = await this.executeCommand(webSocket, instance, filemanMessage)
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
                configData: instanceConfig.data,
                paused: false,
                assets: []
            }
            instances.push(instance)
        }
        let asset:IAsset = {
            podNamespace,
            podName,
            containerName
        }
        instance.assets.push(asset)
        return true
    }

    deleteObject = async (webSocket:WebSocket, instanceConfig:IInstanceConfig, podNamespace:string, podName:string, containerName:string) : Promise<boolean> => {
        let instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            instance.assets = instance.assets.filter(a => a.podNamespace!==podNamespace && a.podName!==podName && a.containerName!==containerName)
            return true
        }
        else {
            this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceConfig.instance, `Fileman instance not found`)
            return false
        }
    }

    pauseContinueInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig, action: EInstanceMessageAction): void => {
        console.log('Pause/Continue not supported')
    }

    modifyInstance = (webSocket:WebSocket, instanceConfig: IInstanceConfig): void => {
        console.log('Modify not supported')
    }

    stopInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig): void => {
        let instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            this.removeInstance(webSocket, instanceConfig.instance)
            this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instanceConfig.instance, 'Fileman instance stopped')
        }
        else {
            this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceConfig.instance, `Fileman instance not found`)
        }
    }

    removeInstance = (webSocket: WebSocket, instanceId: string): void => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            let instances = socket.instances
            if (instances) {
                let pos = instances.findIndex(t => t.instanceId === instanceId)
                if (pos>=0) {
                    let instance = instances[pos]
                    for (let asset of instance.assets) {
                    }
                    instances.splice(pos,1)
                }
                else {
                    console.log(`Instance ${instanceId} not found, cannot delete`)
                }
            }
            else {
                console.log('There are no Fileman Instances on websocket')
            }
        }
        else {
            console.log('WebSocket not found on Fileman')
        }
    }

    containsConnection = (webSocket:WebSocket): boolean => {
        return Boolean (this.webSockets.find(s => s.ws === webSocket))
    }

    removeConnection = (webSocket: WebSocket): void => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            for (let instance of socket.instances) {
                this.removeInstance (webSocket, instance.instanceId)
            }
            let pos = this.webSockets.findIndex(s => s.ws === webSocket)
            this.webSockets.splice(pos,1)
        }
        else {
            console.log('WebSocket not found on Fileman for remove')
        }
    }

    refreshConnection = (webSocket: WebSocket): boolean => {
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

    updateConnection = (newWebSocket: WebSocket, instanceId: string): boolean => {
        for (let entry of this.webSockets) {
            let exists = entry.instances.find(i => i.instanceId === instanceId)
            if (exists) {
                entry.ws = newWebSocket
                for (let instance of entry.instances) {
                    for (let asset of instance.assets) {
                    }
                }
                return true
            }
        }
        return false
    }

    // *************************************************************************************
    // PRIVATE
    // *************************************************************************************

    private sendUnsolicitedMessage = (webSocket:WebSocket, instanceId:string, command: EFilemanCommand, data:any): void => {
        let resp: IFilemanMessageResponse = {
            action: EInstanceMessageAction.COMMAND,
            flow: EInstanceMessageFlow.UNSOLICITED,
            channel: 'fileman',
            instance: instanceId,
            type: EInstanceMessageType.DATA,
            id: '1',
            command,
            namespace: '',
            group: '',
            pod: '',
            container: '',
            data,
            msgtype: 'filemanmessageresponse'
        }
        webSocket.send(JSON.stringify(resp))
    }

    private sendSignalMessage = (ws:WebSocket, action:EInstanceMessageAction, flow: EInstanceMessageFlow, level: ESignalMessageLevel, instanceId:string, text:string): void => {
        var resp:ISignalMessage = {
            action,
            flow,
            channel: 'fileman',
            instance: instanceId,
            type: EInstanceMessageType.SIGNAL,
            text,
            level
        }
        ws.send(JSON.stringify(resp))
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
    
    private async executeCommand (webSocket:WebSocket, instance:IInstance, filemanMessage:IFilemanMessage) : Promise<IFilemanMessageResponse | undefined> {
        let execResponse: IFilemanMessageResponse = {
            action: filemanMessage.action,
            flow: EInstanceMessageFlow.RESPONSE,
            type: EInstanceMessageType.SIGNAL,
            channel: filemanMessage.channel,
            instance: filemanMessage.instance,
            command: filemanMessage.command,
            id: filemanMessage.id,
            namespace: filemanMessage.namespace,
            group: filemanMessage.group,
            pod: filemanMessage.pod,
            container: filemanMessage.container,
            msgtype: 'filemanmessageresponse'
        }

        if (!filemanMessage.command) {
            execResponse.data = 'No command received in data'
            return execResponse
        }

        switch (filemanMessage.command) {
            case EFilemanCommand.HOME: {
                console.log(`Get HOME`)
                execResponse.data = instance.assets.map(a => `${a.podNamespace}/${a.podName}/${a.containerName}`)
                execResponse.type = EInstanceMessageType.DATA
                return execResponse
            }
            case EFilemanCommand.DIR: {
                console.log(`Get DIR from '${filemanMessage.params![0]}' to ${filemanMessage.namespace}/${filemanMessage.pod}/${filemanMessage.container}`)
                let asset = instance.assets.find (a => a.podNamespace === filemanMessage.namespace && a.podName === filemanMessage.pod && a.containerName === filemanMessage.container)
                if (!asset) {
                    console.log(`Asset ${filemanMessage.namespace}/${filemanMessage.pod}/${filemanMessage.container} not found`)
                    execResponse.data = `Asset ${filemanMessage.namespace}/${filemanMessage.pod}/${filemanMessage.container} not found`
                    return execResponse
                }
                this.executeDir(webSocket, instance, filemanMessage.params![0])
                return
            }
            case EFilemanCommand.RENAME: {
                console.log(`Do RENAME '${filemanMessage.params![0]}' to '${filemanMessage.params![1]}' on ${filemanMessage.namespace}/${filemanMessage.pod}/${filemanMessage.container}`)
                let asset = instance.assets.find (a => a.podNamespace === filemanMessage.namespace && a.podName === filemanMessage.pod && a.containerName === filemanMessage.container)
                if (!asset) {
                    console.log(`Asset ${filemanMessage.namespace}/${filemanMessage.pod}/${filemanMessage.container} not found`)
                    execResponse.data = `Asset ${filemanMessage.namespace}/${filemanMessage.pod}/${filemanMessage.container} not found`
                    return execResponse
                }
                let srcClusterPath = filemanMessage.params![0]
                let srcHomeDir = srcClusterPath.split('/').slice(0,4).join('/')
                let srcLocalPath = '/' + srcClusterPath.split('/').slice(4,-1).join('/')
                let fname = srcClusterPath.split('/').slice(-1)[0]
                let [srcNamespace,srcPod,srcContainer] = srcHomeDir.split('/').slice(1)

                try {
                    let fileInfo = await this.getFileInfo(srcClusterPath)
                    if (fileInfo) {
                        let result = await this.launchCommand(srcNamespace, srcPod, srcContainer, ['mv', srcLocalPath+'/'+fname, srcLocalPath+'/'+filemanMessage.params![1]])
                        if (result.stdend.status===ExecutionStatus.SUCCESS) {
                            this.sendUnsolicitedMessage(webSocket, instance.instanceId, EFilemanCommand.CREATE, JSON.stringify({ metadata: { object: srcHomeDir + srcLocalPath + '/' + filemanMessage.params![1], type:fileInfo.type, time:fileInfo.time, size:fileInfo.size }, status: ExecutionStatus.SUCCESS}))
                            this.sendUnsolicitedMessage(webSocket, instance.instanceId, EFilemanCommand.DELETE, JSON.stringify({ metadata: { object: srcClusterPath }, status: ExecutionStatus.SUCCESS}))
                        }
                        else {
                            this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.stdout + result.stderr)
                        }
                    }
                    else {
                        this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, 'Cannot get fileInfo for '+srcClusterPath)
                    }
                }
                catch (err) {
                    console.log(err)
                }
                return
            }
            case EFilemanCommand.CREATE: {
                console.log(`Do CREATE in '${filemanMessage.params![0]}' in ${filemanMessage.namespace}/${filemanMessage.pod}/${filemanMessage.container}`)
                let asset = instance.assets.find (a => a.podNamespace === filemanMessage.namespace && a.podName === filemanMessage.pod && a.containerName === filemanMessage.container)
                if (!asset) {
                    console.log(`Asset ${filemanMessage.namespace}/${filemanMessage.pod}/${filemanMessage.container} not found`)
                    execResponse.data = `Asset ${filemanMessage.namespace}/${filemanMessage.pod}/${filemanMessage.container} not found`
                    return execResponse
                }
                this.executeCreate(webSocket, instance, filemanMessage.params![0])
                return
            }
            case EFilemanCommand.COPY:
            case EFilemanCommand.MOVE: {
                console.log(`Do ${filemanMessage.command.toUpperCase()} ${filemanMessage.params![0]} to ${filemanMessage.params![1]}  in ${filemanMessage.namespace}/${filemanMessage.pod}/${filemanMessage.container}`)
                let srcAsset = instance.assets.find (a => a.podNamespace === filemanMessage.namespace && a.podName === filemanMessage.pod && a.containerName === filemanMessage.container)
                let dstAsset = instance.assets.find (a => a.podNamespace === filemanMessage.namespace && a.podName === filemanMessage.pod && a.containerName === filemanMessage.container)
                if (!srcAsset || !dstAsset) {
                    console.log(`Asset src or dst not found`)
                    execResponse.data = `Asset src or dst not found`
                    return execResponse
                }
                this.executeCopyOrMove(webSocket, filemanMessage.command, instance, filemanMessage.params![0], filemanMessage.params![1])
                return
            }
            case EFilemanCommand.DELETE: {
                console.log(`Do DELETE ${filemanMessage.params![0]} in ${filemanMessage.namespace}/${filemanMessage.pod}/${filemanMessage.container}`)
                let asset = instance.assets.find (a => a.podNamespace === filemanMessage.namespace && a.podName === filemanMessage.pod && a.containerName === filemanMessage.container)
                if (!asset) {
                    console.log(`Asset ${filemanMessage.namespace}/${filemanMessage.pod}/${filemanMessage.container} not found`)
                    execResponse.data = `Asset ${filemanMessage.namespace}/${filemanMessage.pod}/${filemanMessage.container} not found`
                    return execResponse
                }
                this.executeDelete(webSocket, instance, '1', filemanMessage.params![0])
                return
            }

            default:
                execResponse.data = `Invalid command '${filemanMessage.command}'. Valid commands are: ${Object.keys(EFilemanCommand)}`
                break
        }
        return execResponse
    }

    private async executeDir (webSocket:WebSocket, instance:IInstance, dir:string) {
        let homeDir = dir.split('/').slice(0,4).join('/')
        let localDir = "/" + dir.split('/').slice(4).join('/')
        let [srcNamespace,srcPod,srcContainer] = homeDir.split('/').slice(1)

        let result = await this.launchCommand(srcNamespace, srcPod, srcContainer, ['ls', '-l', localDir])
        if (result.stdend.status===ExecutionStatus.SUCCESS) {
            if (result.stderr==='') {
                let arr:IDirectoryEntry[] = []
                ParseListing.parseEntries(result.stdout, (err:any, entryArray:IDirectoryEntry[]) => { entryArray.map(e => arr.push(e)) })
                arr.map(e => e.name = homeDir + localDir + e.name)
                this.sendUnsolicitedMessage(webSocket, instance.instanceId, EFilemanCommand.DIR, JSON.stringify({ metadata: { object: arr }, status: ExecutionStatus.SUCCESS}))
            }
            else {
                this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.stderr)
            }
        }
        else {
            this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.stdend.message)
        }

    }

    downloadFolder = async (srcNamespace:string, srcPod:string, srcContainer:string, remotePath: string, localPath: string) => {
        const writeStream = fs.createWriteStream(localPath)
        let ready=false

        await this.clusterInfo.execApi.exec(
            srcNamespace,
            srcPod,
            srcContainer,
            ['tar', '-czf', '-', '-C', path.dirname(remotePath), path.basename(remotePath)],
            writeStream,
            process.stderr,  // +++
            null,
            false,
            async (status) => {
                writeStream.end()
                while (!writeStream.closed) {
                    await new Promise ( (resolve) => { setTimeout(resolve, 5)})
                }
                ready=true
            }
        )

        while (!ready) {
            await new Promise ( (resolve) => { setTimeout(resolve, 5)})
        }
    }

    private launchCommand (ns:string, pod:string, c:string, cmd:string[]): Promise<{stdout:string, stderr:string, stdend:IExecutionResult}> {
        return new Promise( async (resolve, reject) => {
            let accumulatedOut: Buffer = Buffer.alloc(0)
            let accumulatedErr: Buffer = Buffer.alloc(0)
            let accumulatedEnd: Buffer = Buffer.alloc(0)
            let stdout = new Writable({})
            let stderr = new Writable({})
            let stdin = new Readable({ read() {} })
            let shellSocket = await this.clusterInfo.execApi.exec(ns, pod, c, cmd, stdout, stderr, stdin, false, (st) => { console.log('launchcommand st',st) })
            shellSocket.on('end', () => console.log('launchcommand end'))
            shellSocket.onmessage = (event) => {
                let data = event.data as Buffer
                if (data[0]===1) accumulatedOut = Buffer.concat([accumulatedOut, data.slice(1)])
                if (data[0]===2) accumulatedErr = Buffer.concat([accumulatedErr, data.slice(1)])
                if (data[0]===3) accumulatedEnd = Buffer.concat([accumulatedEnd, data.slice(1)])
            }
            shellSocket.onclose = (event) => {
                if (accumulatedEnd.toString('utf8') !== '') {
                    let result:IExecutionResult = JSON.parse(accumulatedEnd.toString('utf8'))
                    if (result.status!==ExecutionStatus.SUCCESS) {
                        console.error(JSON.stringify(result))
                    }
                }
                resolve({ stdout: accumulatedOut.toString('utf8'), stderr: accumulatedErr.toString('utf8'), stdend: JSON.parse(accumulatedEnd.toString('utf8'))})
            }
            shellSocket.onerror = (event) => {
                console.log('lauchCommand error', event)
                reject('error')
            }
        })
    }    

    downloadFile = async (srcNamespace:string, srcPod:string, srcContainer:string, remotePath: string) : Promise<IExecutionResult> => {
        try {
            let accumulatedErr: Buffer = Buffer.alloc(0)
            let accumulatedEnd: Buffer = Buffer.alloc(0)
            let stdout = new Writable({})
            let stderr = new Writable({})
            const tmpDir = os.tmpdir()
            const localPath = path.join(tmpDir, uuid())
            let ws = fs.createWriteStream(localPath)
            let ended = false

            let shellSocket = await this.clusterInfo.execApi.exec(
                srcNamespace,
                srcPod,
                srcContainer,
                ['cat', remotePath],
                stdout,
                stderr,
                null, 
                false
            )
            shellSocket.onmessage = (event) => {
                let data = event.data as Buffer
                if (data[0]===1) {
                    ws.write(data.slice(1))
                }
                if (data[0]===2) accumulatedErr = Buffer.concat([accumulatedErr, data.slice(1)])
                if (data[0]===3) accumulatedEnd = Buffer.concat([accumulatedEnd, data.slice(1)])
            }
            shellSocket.onclose = (event) => {
                ws.end()
                ended=true
            }
            shellSocket.onerror = (event) => {
                console.log('lauchCommand error', event)
                return { metadata: {}, message: 'Error '+event, status: ExecutionStatus.FAILURE }
            }
            while (!ended) {
                await new Promise ( (resolve) => { setTimeout(resolve, 10)})
            }
            let result:IExecutionResult = JSON.parse(accumulatedEnd.toString('utf8'))
            return { metadata: { filename: localPath}, message: result.message, status: result.status }
        }
        catch (err:any) {
            console.log(err)
            return { metadata: {}, message: err.toString(), status: ExecutionStatus.FAILURE }
        }
    }

    uploadFile = async (ns: string, pod: string, c: string, localPath: string, remotePath: string) : Promise<IExecutionResult> => {
        try {
            let accumulatedErr: Buffer = Buffer.alloc(0)
            let accumulatedEnd: Buffer = Buffer.alloc(0)
            let stdout = new Writable({})
            let stderr = new Writable({})
            const fs = require('fs')
            const readStream = fs.createReadStream(localPath)
            let ended = false
            let srclen = fs.statSync(localPath).size

            readStream.on('error', (err:any) => {
                console.error('Error al leer el archivo local:', err)
                console.log('err')
            })

            let parentFolder = remotePath.split('/').slice(0,-1).join('/').trim()
            if (parentFolder !== '') {
                let mkdir = ['mkdir', '-p', parentFolder]

                let mkresult = await this.launchCommand(ns,pod,c, mkdir)
                if (mkresult.stdend.status!== ExecutionStatus.SUCCESS) {
                    return { metadata: {}, message: 'Cannot create dir: '+mkresult.stdend.message, status: ExecutionStatus.FAILURE }
                }
            }

            let shellSocket = await this.clusterInfo.execApi.exec(
                ns,
                pod,
                c,
                ['sh', '-c', `cat > "${remotePath}" && exit`],
                stdout,
                stderr,
                readStream,
                false
            )

            shellSocket.onmessage = (event) => {
                let data = event.data as Buffer
                //+++ stdout should send a \n when the copy is finished, since the cat is redirected. we should try this way and forget '&& exit'
                if (data[0]===2) accumulatedErr = Buffer.concat([accumulatedErr, data.slice(1)])
                if (data[0]===3) accumulatedEnd = Buffer.concat([accumulatedEnd, data.slice(1)])
            }
            shellSocket.onclose = (event) => {
                ended=true
            }

            // wait for 'cat' end
            let retries = 10 * 15  // 15 seconds
            while (!ended && retries>0) {
                console.log(accumulatedEnd.toString('utf8'))
                console.log(accumulatedErr.toString('utf8'))
                retries--
                await new Promise ( (resolve) => { setTimeout(resolve, 100)})
            }
            let result = JSON.parse(accumulatedEnd.toString('utf8'))
            console.log('result', result)
            if (result.status!=='Success') {
                console.log('Error on cat:', accumulatedErr.toString('utf8'))
                return { metadata: {}, message: result.message + '\n' + accumulatedErr, status: ExecutionStatus.FAILURE }
            }
            
            // exec api with the sh and the > returns immediately, so we add a '&& exit'
            // when executing this way, we dont receive 'channel 3' messages (where a json with the result should be present)
            let dstPath = '/'+ns+'/'+pod+'/'+c+remotePath
            let len = (await this.getFileInfo(dstPath))?.size
            while ((!len || +len!==srclen) && (retries>0)) {
                retries--
                await new Promise ( (resolve) => { setTimeout(resolve, 100)})
                len = (await this.getFileInfo(dstPath))?.size
            }
            if (retries>0) {
                return { metadata: {}, message: '', status: ExecutionStatus.SUCCESS }
            }
            else {
                return { metadata: {}, message: 'Error copying temp file to dest file', status: ExecutionStatus.FAILURE }
            }
        }
        catch (err:any) {
            console.log(err)
            return { metadata: {}, message: err.toString(), status: ExecutionStatus.FAILURE }
        }
    }
    
    clusterCopyOrMove = async (operation:EFilemanCommand, srcNamespace:string, srcPod:string, srcContainer:string, srcLocalPath:string, dstNamespace:string, dstPod:string, dstContainer:string, dstLocalPath:string) : Promise<IExecutionResult> => {
        let result = await this.downloadFile(srcNamespace, srcPod, srcContainer, srcLocalPath)
        let tempLocalFile = result.metadata.filename
        if (result.status !== ExecutionStatus.SUCCESS) return result            

        try {
            await this.uploadFile(dstNamespace, dstPod, dstContainer, tempLocalFile, dstLocalPath)
        }
        catch (err) {
            return { metadata:{}, message: 'Cannot upload file: '+JSON.stringify(err), status:ExecutionStatus.FAILURE }
        }

        try {
            await fs.unlinkSync(tempLocalFile)
        }
        catch (err) {
            console.log('Error removing temp file')
            return { metadata:{}, message: 'Error removing temp file '+JSON.stringify(err), status: ExecutionStatus.FAILURE}
        }

        try {
            if (operation === EFilemanCommand.MOVE) {
                let result = await this.launchCommand(srcNamespace, srcPod, srcContainer, ['rm', '-r', srcLocalPath])
                if (result.stdend.status===ExecutionStatus.SUCCESS) {
                    if (result.stderr!=='') {
                        return { metadata: {}, message: result.stderr, status:ExecutionStatus.FAILURE }
                    }
                }
                else {
                    return { metadata: {}, message: result.stdend.message, status:ExecutionStatus.FAILURE }
                }
            }
        }
        catch(err) {
            console.log('Error removing source file')
            return { metadata:{}, message: 'Error removing source file '+JSON.stringify(err), status: ExecutionStatus.FAILURE}
        }

        return { metadata:{}, message: '', status: ExecutionStatus.SUCCESS}
    }

    private async getFileInfo(clusterPath:string) {
        let [namespace,pod,container] = clusterPath.split('/').slice(1)
        let localPath = '/' + clusterPath.split('/').slice(4,-1).join('/')
        let fname = clusterPath.split('/').slice(-1)[0]
        let result = await this.launchCommand(namespace, pod, container, ['ls', '-l', localPath])
        if (result.stdend.status===ExecutionStatus.SUCCESS) {
            if (result.stderr==='') {
                let arr :IDirectoryEntry[] = []
                ParseListing.parseEntries(result.stdout, (err:any, entryArray:IDirectoryEntry[]) => { entryArray.map(e => arr.push(e)) })
                let srcMetadata = arr.find(e => e.name === fname)
                if (arr.length===0 || !srcMetadata) return undefined
                return srcMetadata
            }
            else {
                console.log('launchCommand error', result.stderr)
                return undefined
            }
        }
        else {
            console.log('launchCommand end', result.stdend)
            return undefined
        }
    }
    
    private async executeCopyOrMove (webSocket:WebSocket, operation:EFilemanCommand, instance:IInstance, srcClusterPath:string, dstClusterPath:string) {
        if (srcClusterPath.endsWith('/')) srcClusterPath = srcClusterPath.substring(0, srcClusterPath.length-1)
        if (dstClusterPath.endsWith('/')) dstClusterPath = dstClusterPath.substring(0, dstClusterPath.length-1)
        
        let srcHomeDir = srcClusterPath.split('/').slice(0,4).join('/')
        let [srcNamespace,srcPod,srcContainer] = srcHomeDir.split('/').slice(1)
        let srcLocalPath = '/' + srcClusterPath.split('/').slice(4,-1).join('/')

        let p = srcLocalPath.split('/')
        let parent = '/'+p.slice(1).join('/')

        let fname = srcClusterPath.split('/').slice(-1)[0]

        let dstHomeDir = dstClusterPath.split('/').slice(0,4).join('/')
        let [dstNamespace,dstPod,dstContainer] = dstHomeDir.split('/').slice(1)
        let dstLocalPath = '/' + dstClusterPath.split('/').slice(4).join('/')

        let linuxCommand = (operation === EFilemanCommand.MOVE? ['mv'] : ['cp', '-r'])

        if (srcHomeDir===dstHomeDir) {
            // copy/move on same container
            let fileInfo = await this.getFileInfo(srcClusterPath)
            if (fileInfo) {
                let result = await this.launchCommand(srcNamespace, srcPod, srcContainer, [ ...linuxCommand, srcLocalPath+'/'+fname, dstLocalPath])
                if (result.stdend.status===ExecutionStatus.SUCCESS && result.stderr==='') {
                    this.sendUnsolicitedMessage(webSocket, instance.instanceId, EFilemanCommand.CREATE, JSON.stringify({ metadata: { object:dstClusterPath + '/' + fname, type:fileInfo.type, time:fileInfo.time, size:fileInfo.size }, status: ExecutionStatus.SUCCESS}))
                    if (operation === EFilemanCommand.MOVE) this.sendUnsolicitedMessage(webSocket, instance.instanceId, EFilemanCommand.DELETE, JSON.stringify({ metadata: { object:srcClusterPath }, status: ExecutionStatus.SUCCESS}))
                }
                else {
                    this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.stdend.message + result.stderr)
                }
            }
            else {
                this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, 'Cannot get fileInfo for '+srcClusterPath)
            }
        }
        else {
            console.log('Perform cluster-wide copy')

            let result = await this.launchCommand(srcNamespace, srcPod, srcContainer, ['ls', '-l', parent])
            if (result.stdend.status===ExecutionStatus.SUCCESS) {
                if (result.stderr!=='') {
                    this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.stderr)
                    return
                }
            }
            else {
                this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.stdend.message)
                return
            }

            let arr:IDirectoryEntry[] = []
            ParseListing.parseEntries(result.stdout, (err:any, entryArray:IDirectoryEntry[]) => { entryArray.map(e => arr.push(e)) })
            let srcMetadata = arr.find(e => e.name === fname)
            if (arr.length===0 || !srcMetadata) {
                console.log('**********NO CONTENT************ ', fname)
                return
            }

            switch(srcMetadata.type) {
                case 0: {
                    let result = await this.clusterCopyOrMove(operation, srcNamespace, srcPod, srcContainer, srcLocalPath + '/' + fname, dstNamespace, dstPod, dstContainer, dstLocalPath + '/' + fname)
                    if (result.status === ExecutionStatus.SUCCESS) {
                        let fileInfo = await this.getFileInfo(srcClusterPath)
                        if (fileInfo)  {
                            this.sendUnsolicitedMessage(webSocket, instance.instanceId, EFilemanCommand.CREATE, JSON.stringify({ metadata: { object:dstClusterPath + '/' + fname, type:fileInfo.type, time:fileInfo.time, size:fileInfo.size }, status: ExecutionStatus.SUCCESS}))
                        }
                        if (operation === EFilemanCommand.MOVE) this.sendUnsolicitedMessage(webSocket, instance.instanceId, EFilemanCommand.DELETE, JSON.stringify({ metadata: { object:srcClusterPath }, status: ExecutionStatus.SUCCESS}))
                    }
                    else {
                        this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.message)
                    }
                    } break
                case 1:
                    let result = await this.launchCommand(srcNamespace, srcPod, srcContainer, ['ls', '-l', srcLocalPath + '/' + fname])
                    if (result.stdend.status===ExecutionStatus.SUCCESS) {
                        if (result.stderr!=='') {
                            this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.stderr)
                            return
                        }
                    }
                    else {
                        this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.stdend.message)
                        return
                    }

                    let fileList:IDirectoryEntry[] = []
                    ParseListing.parseEntries(result.stdout, (err:any, entryArray:IDirectoryEntry[]) => { entryArray.map(e => fileList.push(e)) })
                    for (var e of fileList) {
                        switch(e.type) {
                            case 0: {
                                let result = await this.clusterCopyOrMove(operation, srcNamespace, srcPod, srcContainer, srcLocalPath + '/' + fname+'/' + e.name, dstNamespace, dstPod, dstContainer, dstLocalPath + '/' + fname + '/' + e.name)
                                if (result.status === ExecutionStatus.SUCCESS) {
                                    let src = '/' + [srcNamespace, srcPod, srcContainer, srcLocalPath, fname, e.name].join('/')
                                    let fileInfo = await this.getFileInfo(src)
                                    if (fileInfo)  {
                                        this.sendUnsolicitedMessage(webSocket, instance.instanceId, EFilemanCommand.CREATE, JSON.stringify({ metadata: { object:'/'+[dstNamespace, dstPod, dstContainer, dstLocalPath, fname, e.name].join('/'), type:fileInfo.type, time:fileInfo.time, size:fileInfo.size }, status: ExecutionStatus.SUCCESS}))
                                    }
                                    if (operation === EFilemanCommand.MOVE) this.sendUnsolicitedMessage(webSocket, instance.instanceId, EFilemanCommand.DELETE, JSON.stringify({ metadata: { object:src }, status: ExecutionStatus.SUCCESS}))
                                }
                                else {
                                    this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.message)
                                }
                                } break
                            case 1: {
                                await this.executeCopyOrMove(webSocket, operation, instance, srcHomeDir + '/' + fname + '/' + e.name, dstHomeDir + dstLocalPath + '/' + fname)
                                } break
                            case 2: {
                                let srcPath = srcLocalPath + '/' + fname + '/' + e.target
                                if (e.target && e.target.startsWith('/')) srcPath = e.target
                                let result = await this.clusterCopyOrMove(operation, srcNamespace, srcPod, srcContainer, srcPath, dstNamespace, dstPod, dstContainer, dstLocalPath + '/' + fname + '/'+e.name)
                                if (result.status === ExecutionStatus.SUCCESS) {
                                    let src = '/' + [srcNamespace, srcPod, srcContainer, srcPath].join('/')
                                    let fileInfo = await this.getFileInfo(src)
                                    if (fileInfo)  {
                                        this.sendUnsolicitedMessage(webSocket, instance.instanceId, EFilemanCommand.CREATE, JSON.stringify({ metadata: { object:'/'+[dstNamespace, dstPod, dstContainer, dstLocalPath, fname, e.name].join('/'), type:fileInfo.type, time:fileInfo.time, size:fileInfo.size }, status: ExecutionStatus.SUCCESS}))
                                    }
                                    if (operation === EFilemanCommand.MOVE) this.sendUnsolicitedMessage(webSocket, instance.instanceId, EFilemanCommand.DELETE, JSON.stringify({ metadata: { object:src }, status: ExecutionStatus.SUCCESS}))
                                }
                                else {
                                    this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.message)
                                }
                                } break
                            default: {
                                console.error(`Invalid type ${e.type} working with ${e.name}`)
                            }
                            break
                                
                        }
                    }
                    break
                case 2:
                    let src = '/' + [srcNamespace, srcPod, srcContainer, srcMetadata.target].join('/')
                    if (srcMetadata.target) {
                        let result = await this.clusterCopyOrMove(operation, srcNamespace, srcPod, srcContainer, srcMetadata.target, dstNamespace, dstPod, dstContainer, dstLocalPath + fname)
                        if (result.status === ExecutionStatus.SUCCESS) {
                            let fileInfo = await this.getFileInfo(src)
                            if (fileInfo)  {
                                this.sendUnsolicitedMessage(webSocket, instance.instanceId, EFilemanCommand.CREATE, JSON.stringify({ metadata: { object:'/'+[dstNamespace, dstPod, dstContainer, dstLocalPath + fname].join('/'), type:fileInfo.type, time:fileInfo.time, size:fileInfo.size }, status: ExecutionStatus.SUCCESS}))
                            }
                            if (operation === EFilemanCommand.MOVE) this.sendUnsolicitedMessage(webSocket, instance.instanceId, EFilemanCommand.DELETE, JSON.stringify({ metadata: { object:src }, status: ExecutionStatus.SUCCESS}))
                        }
                        else {
                            this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.message)
                        }
                    }
                    else {
                        this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, 'Invalid target for '+src)
                    }
                    break
                default:
                    console.error('COPY/MOVE invalid file type:', srcMetadata.type)
                    break
            }
        }
    }
    
    private async executeDelete (webSocket:WebSocket, instance:IInstance, id:string, srcPath:string) {
        let srcHomeDir = srcPath.split('/').slice(0,4).join('/')
        let srcLocalPath = '/' + srcPath.split('/').slice(4).join('/')
        let [srcNamespace,srcPod,srcContainer] = srcHomeDir.split('/').slice(1)

        let result = await this.launchCommand(srcNamespace, srcPod, srcContainer, ['rm', '-r', srcLocalPath])
        if (result.stdend.status===ExecutionStatus.SUCCESS) {
            if (result.stderr==='')
                this.sendUnsolicitedMessage(webSocket, instance.instanceId, EFilemanCommand.DELETE, JSON.stringify({ metadata: { object:srcPath, type:0 }, status: ExecutionStatus.SUCCESS}))
            else
                this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.stderr)
        }
        else {
            this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.stdend.message)
        }
        
    }

    private async executeCreate (webSocket:WebSocket, instance:IInstance, srcPath:string) {
        let srcHomeDir = srcPath.split('/').slice(0,4).join('/')
        let srcLocalPath = '/' + srcPath.split('/').slice(4).join('/')

        let [srcNamespace,srcPod,srcContainer] = srcHomeDir.split('/').slice(1)
        let result = await this.launchCommand(srcNamespace, srcPod, srcContainer, ['mkdir', srcLocalPath])
        if (result.stdend.status===ExecutionStatus.SUCCESS) {
            if (result.stderr==='')
                this.sendUnsolicitedMessage(webSocket, instance.instanceId, EFilemanCommand.CREATE, JSON.stringify({ metadata: { object:srcPath, type:1, time:Date.now(), size:4096 }, status: ExecutionStatus.SUCCESS}))
            else
                this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.stderr)
        }
        else {
            this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.stdend.message)
        }

    }

}

export { FilemanChannel }