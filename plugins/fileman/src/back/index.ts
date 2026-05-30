import { IInstanceConfig, ISignalMessage, IInstanceMessage, AccessKey, accessKeyDeserialize, BackChannelData, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, ESignalMessageLevel, EClusterType, IBackChannelObject, IBackChannelRequirements } from '@kwirthmagnify/kwirth-common'
import { Readable, Writable } from 'stream'
import { Request, Response } from 'express'
import { v4 as uuid } from 'uuid'
import fs from 'fs'
import path from 'path'
import fileUpload from 'express-fileupload'
import os from 'os'
const ParseListing = require('@jfvilas/parse-listing')

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
    id: string
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
    metadata: Record<string, any>
    status: ExecutionStatus
    message: string
    reason?: string
    details?: { causes: Record<string, any>[] }
    code?: number
}

enum ExecutionStatus {
    SUCCESS = 'Success',
    FAILURE = 'Failure'
}

interface IDirectoryEntry {
    name: string
    type: number
    time: number
    size: string
    target?: string
    owner: string
    group: string
    userPermissions: { read: boolean, write: boolean, exec: boolean }
    groupPermissions: { read: boolean, write: boolean, exec: boolean }
    otherPermissions: { read: boolean, write: boolean, exec: boolean }
}

class FilemanChannel {
    readonly channelId = 'fileman'
    readonly requirements: IBackChannelRequirements = {
        storage: false,
        providers: []
    }
    clusterInfo: any
    backChannelObject: IBackChannelObject
    webSockets: { ws: WebSocket, lastRefresh: number, instances: IInstance[] }[] = []

    constructor(clusterInfo: any, backChannelObject: IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
    }

    getChannelData = (): BackChannelData => ({
        id: 'fileman',
        routable: false,
        pauseable: false,
        modifiable: false,
        reconnectable: true,
        metrics: false,
        sources: [EClusterType.KUBERNETES, EClusterType.DOCKER],
        endpoints: [
            { name: 'download', methods: ['GET'], requiresAccessKey: true },
            { name: 'upload', methods: ['POST'], requiresAccessKey: true },
            { name: 'read', methods: ['GET'], requiresAccessKey: true },
            { name: 'write', methods: ['POST'], requiresAccessKey: true }
        ],
        websocket: false,
        cluster: false,
        resourced: true
    })

    getChannelScopeLevel = (scope: string): number => {
        return ['', 'fileman$read', 'fileman$write', 'cluster'].indexOf(scope)
    }

    startChannel = async () => { }

    processProviderEvent(_providerId: string, _obj: any): void { }

    async endpointRequest(endpoint: string, req: Request, res: Response, accessKey: AccessKey): Promise<void> {
        let instanceId = req.query['key'] as string
        let socket = this.webSockets.find(ws => ws.instances.some(i => i.accessKey.id === accessKey.id && i.instanceId === instanceId))
        if (!socket) {
            res.status(400).send('Inexistent socket with accessKey ' + accessKey.id + ' and instance ' + instanceId)
            return
        }

        let instance = socket.instances.find(i => i.instanceId === instanceId)!

        switch (endpoint) {
            case 'download': {
                let filename = req.query['filename'] as string
                if (!filename) { res.status(400).send(); return }
                let [srcNamespace, srcPod, srcContainer] = filename.split('/').slice(1)
                let filepath = '/' + filename.split('/').slice(4).join('/')
                let fileInfo = await this.getFileInfo(filename)
                let encodedFilename = encodeURIComponent(filename.split('/').slice(-1)[0])
                if (fileInfo) {
                    if (fileInfo.type === 0 || fileInfo.type === 2) {
                        let result = await this.downloadFile(srcNamespace, srcPod, srcContainer, filepath)
                        let tmpName = result.metadata.filename as string
                        if (result.status === ExecutionStatus.SUCCESS) {
                            res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"`)
                            res.status(200).send(fs.readFileSync(tmpName))
                        } else {
                            res.status(400).send(result.message)
                        }
                        try { fs.unlinkSync(tmpName) } catch {}
                    } else if (fileInfo.type === 1) {
                        try {
                            let tmpName = '/tmp/' + uuid()
                            await this.downloadFolder(srcNamespace, srcPod, srcContainer, filepath, tmpName)
                            res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}.tar.gz"`)
                            res.status(200).send(fs.readFileSync(tmpName))
                            fs.unlinkSync(tmpName)
                        } catch (err) {
                            console.error('[fileman] error downloading folder', err)
                            this.sendSignalMessage(socket.ws, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.UNSOLICITED, ESignalMessageLevel.ERROR, instance.instanceId, 'Error building tar for download: ' + err)
                        }
                    } else {
                        this.sendSignalMessage(socket.ws, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.UNSOLICITED, ESignalMessageLevel.ERROR, instance.instanceId, 'File type not supported')
                    }
                } else {
                    this.sendSignalMessage(socket.ws, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.UNSOLICITED, ESignalMessageLevel.ERROR, instance.instanceId, 'Could not get file type')
                }
                break
            }
            case 'upload': {
                const filedata = req.files!.file as fileUpload.UploadedFile
                const filename = req.body.filename as string
                let tmpName = '/tmp/' + uuid()
                fs.writeFileSync(tmpName, filedata.data)
                let [dstNamespace, dstPod, dstContainer] = filename.split('/').slice(1)
                let dstLocalPath = '/' + filename.split('/').slice(4).join('/')
                let executionResult = await this.uploadFile(dstNamespace, dstPod, dstContainer, tmpName, dstLocalPath)
                if (executionResult.status === ExecutionStatus.FAILURE) {
                    this.sendSignalMessage(socket.ws, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.UNSOLICITED, ESignalMessageLevel.ERROR, instance.instanceId, executionResult.message)
                    res.status(400).send()
                } else {
                    let size = fs.statSync(tmpName).size
                    let result = { metadata: { object: filename, type: 0, time: Date.now(), size }, status: ExecutionStatus.SUCCESS }
                    let resp: IFilemanMessageResponse = {
                        action: EInstanceMessageAction.COMMAND, flow: EInstanceMessageFlow.UNSOLICITED, channel: 'fileman',
                        instance: instance.instanceId, type: EInstanceMessageType.DATA, id: '1',
                        command: EFilemanCommand.CREATE, namespace: '', group: '', pod: '', container: '',
                        data: JSON.stringify(result), msgtype: 'filemanmessageresponse'
                    }
                    socket.ws.send(JSON.stringify(resp))
                    res.status(200).send()
                }
                break
            }
            case 'read': {
                const filename = req.query['filename'] as string
                if (!filename) { res.status(400).send('filename required'); return }
                const [rns, rpod, rcont] = filename.split('/').slice(1)
                const rpath = '/' + filename.split('/').slice(4).join('/')
                const result = await this.downloadFile(rns, rpod, rcont, rpath)
                if (result.status === ExecutionStatus.SUCCESS) {
                    const tmpName = result.metadata.filename as string
                    const content = fs.readFileSync(tmpName, 'utf-8')
                    try { fs.unlinkSync(tmpName) } catch {}
                    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
                    res.status(200).send(content)
                } else {
                    res.status(400).send(result.message)
                }
                break
            }
            case 'write': {
                const filename = req.query['filename'] as string
                if (!filename) { res.status(400).send('filename required'); return }
                const { content } = req.body as { content: string }
                if (content === undefined) { res.status(400).send('content required'); return }
                const tmpName = path.join(os.tmpdir(), uuid())
                fs.writeFileSync(tmpName, content, 'utf-8')
                const [wns, wpod, wcont] = filename.split('/').slice(1)
                const wpath = '/' + filename.split('/').slice(4).join('/')
                const result = await this.uploadFile(wns, wpod, wcont, tmpName, wpath)
                try { fs.unlinkSync(tmpName) } catch {}
                if (result.status === ExecutionStatus.FAILURE) {
                    res.status(400).send(result.message)
                } else {
                    res.status(200).send()
                }
                break
            }
        }
    }

    async websocketRequest(_newWebSocket: WebSocket): Promise<void> { }

    containsInstance = (instanceId: string): boolean => {
        return this.webSockets.some(socket => socket.instances.find(i => i.instanceId === instanceId))
    }

    containsAsset = (webSocket: WebSocket, podNamespace: string, podName: string, containerName: string): boolean => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            let instances = socket.instances
            if (instances) return instances.some(i => i.assets.some(a => a.podNamespace === podNamespace && a.podName === podName && a.containerName === containerName))
        }
        return false
    }

    processCommand = async (webSocket: WebSocket, instanceMessage: IInstanceMessage): Promise<boolean> => {
        if (instanceMessage.flow === EInstanceMessageFlow.IMMEDIATE) return false
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) { console.log('[fileman] Socket not found'); return false }
        let instances = socket.instances
        let instance = instances.find(i => i.instanceId === instanceMessage.instance)
        if (!instance) {
            this.sendSignalMessage(webSocket, instanceMessage.action, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceMessage.instance, `Instance not found`)
            return false
        }
        let filemanMessage = instanceMessage as IFilemanMessage
        let resp = await this.executeCommand(webSocket, instance, filemanMessage)
        if (resp) webSocket.send(JSON.stringify(resp))
        return Boolean(resp)
    }

    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> => {
        console.log(`[fileman] Start instance ${instanceConfig.instance} ${podNamespace}/${podName}/${containerName}`)
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) {
            let len = this.webSockets.push({ ws: webSocket, lastRefresh: Date.now(), instances: [] })
            socket = this.webSockets[len - 1]
        }
        let instances = socket.instances
        let instance = instances.find(i => i.instanceId === instanceConfig.instance)
        if (!instance) {
            instance = { accessKey: accessKeyDeserialize(instanceConfig.accessKey), instanceId: instanceConfig.instance, configData: instanceConfig.data, paused: false, assets: [] }
            instances.push(instance)
        }
        instance.assets.push({ podNamespace, podName, containerName })
        return true
    }

    deleteObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> => {
        let instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            const matchesPod = (a: IAsset) => a.podNamespace === podNamespace && a.podName === podName
            instance.assets = instance.assets.filter(a => !(matchesPod(a) && (containerName === '' || a.containerName === containerName)))
            return true
        }
        this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceConfig.instance, `Fileman instance not found`)
        return false
    }

    pauseContinueInstance = (_webSocket: WebSocket, _instanceConfig: IInstanceConfig, _action: EInstanceMessageAction): void => {
        console.log('[fileman] Pause/Continue not supported')
    }

    modifyInstance = (_webSocket: WebSocket, _instanceConfig: IInstanceConfig): void => {
        console.log('[fileman] Modify not supported')
    }

    stopInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig): void => {
        let instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            this.removeInstance(webSocket, instanceConfig.instance)
            this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instanceConfig.instance, 'Fileman instance stopped')
        } else {
            this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceConfig.instance, `Fileman instance not found`)
        }
    }

    removeInstance = (webSocket: WebSocket, instanceId: string): void => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            let instances = socket.instances
            if (instances) {
                let pos = instances.findIndex(t => t.instanceId === instanceId)
                if (pos >= 0) instances.splice(pos, 1)
                else console.log(`[fileman] Instance ${instanceId} not found, cannot delete`)
            }
        }
    }

    containsConnection = (webSocket: WebSocket): boolean => {
        return Boolean(this.webSockets.find(s => s.ws === webSocket))
    }

    removeConnection = (webSocket: WebSocket): void => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            const ids = socket.instances.map(i => i.instanceId)
            for (const id of ids) this.removeInstance(webSocket, id)
            let pos = this.webSockets.findIndex(s => s.ws === webSocket)
            this.webSockets.splice(pos, 1)
        }
    }

    refreshConnection = (webSocket: WebSocket): boolean => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) { socket.lastRefresh = Date.now(); return true }
        return false
    }

    updateConnection = (newWebSocket: WebSocket, instanceId: string): boolean => {
        for (let entry of this.webSockets) {
            let exists = entry.instances.find(i => i.instanceId === instanceId)
            if (exists) { entry.ws = newWebSocket; return true }
        }
        return false
    }

    // ─── PRIVATE ────────────────────────────────────────────────────────────────

    private sendUnsolicitedMessage = (webSocket: WebSocket, instanceId: string, command: EFilemanCommand, data: any): void => {
        let resp: IFilemanMessageResponse = {
            action: EInstanceMessageAction.COMMAND, flow: EInstanceMessageFlow.UNSOLICITED, channel: 'fileman',
            instance: instanceId, type: EInstanceMessageType.DATA, id: '1',
            command, namespace: '', group: '', pod: '', container: '', data, msgtype: 'filemanmessageresponse'
        }
        webSocket.send(JSON.stringify(resp))
    }

    private sendSignalMessage = (ws: WebSocket, action: EInstanceMessageAction, flow: EInstanceMessageFlow, level: ESignalMessageLevel, instanceId: string, text: string): void => {
        var resp: ISignalMessage = { action, flow, channel: 'fileman', instance: instanceId, type: EInstanceMessageType.SIGNAL, text, level }
        ws.send(JSON.stringify(resp))
    }

    getInstance(webSocket: WebSocket, instanceId: string): IInstance | undefined {
        let socket = this.webSockets.find(entry => entry.ws === webSocket)
        if (socket) {
            let instances = socket.instances
            if (instances) {
                let idx = instances.findIndex(t => t.instanceId === instanceId)
                if (idx >= 0) return instances[idx]
            }
        }
        return undefined
    }

    private async executeCommand(webSocket: WebSocket, instance: IInstance, filemanMessage: IFilemanMessage): Promise<IFilemanMessageResponse | undefined> {
        let execResponse: IFilemanMessageResponse = {
            action: filemanMessage.action, flow: EInstanceMessageFlow.RESPONSE, type: EInstanceMessageType.SIGNAL,
            channel: filemanMessage.channel, instance: filemanMessage.instance, command: filemanMessage.command,
            id: filemanMessage.id, namespace: filemanMessage.namespace, group: filemanMessage.group,
            pod: filemanMessage.pod, container: filemanMessage.container, msgtype: 'filemanmessageresponse'
        }

        if (!filemanMessage.command) { execResponse.data = 'No command received in data'; return execResponse }

        switch (filemanMessage.command) {
            case EFilemanCommand.HOME: {
                execResponse.data = instance.assets.map(a => `${a.podNamespace}/${a.podName}/${a.containerName}`)
                execResponse.type = EInstanceMessageType.DATA
                return execResponse
            }
            case EFilemanCommand.DIR: {
                let asset = instance.assets.find(a => a.podNamespace === filemanMessage.namespace && a.podName === filemanMessage.pod && a.containerName === filemanMessage.container)
                if (!asset) { execResponse.data = `Asset not found`; return execResponse }
                this.executeDir(webSocket, instance, filemanMessage.params![0])
                return
            }
            case EFilemanCommand.RENAME: {
                let asset = instance.assets.find(a => a.podNamespace === filemanMessage.namespace && a.podName === filemanMessage.pod && a.containerName === filemanMessage.container)
                if (!asset) { execResponse.data = `Asset not found`; return execResponse }
                let srcClusterPath = filemanMessage.params![0]
                let srcHomeDir = srcClusterPath.split('/').slice(0, 4).join('/')
                let srcLocalPath = '/' + srcClusterPath.split('/').slice(4, -1).join('/')
                let fname = srcClusterPath.split('/').slice(-1)[0]
                let [srcNamespace, srcPod, srcContainer] = srcHomeDir.split('/').slice(1)
                try {
                    let fileInfo = await this.getFileInfo(srcClusterPath)
                    if (fileInfo) {
                        let result = await this.launchCommand(srcNamespace, srcPod, srcContainer, ['mv', srcLocalPath + '/' + fname, srcLocalPath + '/' + filemanMessage.params![1]])
                        if (result.stdend.status === ExecutionStatus.SUCCESS) {
                            this.sendUnsolicitedMessage(webSocket, instance.instanceId, EFilemanCommand.CREATE, JSON.stringify({ metadata: { object: srcHomeDir + srcLocalPath + '/' + filemanMessage.params![1], type: fileInfo.type, time: fileInfo.time, size: fileInfo.size }, status: ExecutionStatus.SUCCESS }))
                            this.sendUnsolicitedMessage(webSocket, instance.instanceId, EFilemanCommand.DELETE, JSON.stringify({ metadata: { object: srcClusterPath }, status: ExecutionStatus.SUCCESS }))
                        } else {
                            this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.stdout + result.stderr)
                        }
                    } else {
                        this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, 'Cannot get fileInfo for ' + srcClusterPath)
                    }
                } catch (err) { console.log('[fileman]', err) }
                return
            }
            case EFilemanCommand.CREATE: {
                let asset = instance.assets.find(a => a.podNamespace === filemanMessage.namespace && a.podName === filemanMessage.pod && a.containerName === filemanMessage.container)
                if (!asset) { execResponse.data = `Asset not found`; return execResponse }
                this.executeCreate(webSocket, instance, filemanMessage.params![0])
                return
            }
            case EFilemanCommand.COPY:
            case EFilemanCommand.MOVE: {
                let srcAsset = instance.assets.find(a => a.podNamespace === filemanMessage.namespace && a.podName === filemanMessage.pod && a.containerName === filemanMessage.container)
                let dstAsset = instance.assets.find(a => a.podNamespace === filemanMessage.namespace && a.podName === filemanMessage.pod && a.containerName === filemanMessage.container)
                if (!srcAsset || !dstAsset) { execResponse.data = `Asset src or dst not found`; return execResponse }
                this.executeCopyOrMove(webSocket, filemanMessage.command, instance, filemanMessage.params![0], filemanMessage.params![1])
                return
            }
            case EFilemanCommand.DELETE: {
                let asset = instance.assets.find(a => a.podNamespace === filemanMessage.namespace && a.podName === filemanMessage.pod && a.containerName === filemanMessage.container)
                if (!asset) { execResponse.data = `Asset not found`; return execResponse }
                this.executeDelete(webSocket, instance, '1', filemanMessage.params![0])
                return
            }
            default:
                execResponse.data = `Invalid command '${filemanMessage.command}'`
                break
        }
        return execResponse
    }

    private async executeDir(webSocket: WebSocket, instance: IInstance, dir: string) {
        let homeDir = dir.split('/').slice(0, 4).join('/')
        let localDir = '/' + dir.split('/').slice(4).join('/')
        let [srcNamespace, srcPod, srcContainer] = homeDir.split('/').slice(1)
        let result = await this.launchCommand(srcNamespace, srcPod, srcContainer, ['ls', '-l', localDir])
        if (result.stdend.status === ExecutionStatus.SUCCESS) {
            if (result.stderr === '') {
                let arr: IDirectoryEntry[] = []
                ParseListing.parseEntries(result.stdout, (_err: any, entryArray: IDirectoryEntry[]) => { entryArray.map(e => arr.push(e)) })
                arr.map(entry => entry.name = homeDir + localDir + entry.name)
                this.sendUnsolicitedMessage(webSocket, instance.instanceId, EFilemanCommand.DIR, JSON.stringify({ metadata: { object: arr }, status: ExecutionStatus.SUCCESS }))
            } else {
                this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.stderr)
            }
        } else {
            this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.stdend.message)
        }
    }

    downloadFolder = async (srcNamespace: string, srcPod: string, srcContainer: string, remotePath: string, localPath: string) => {
        const writeStream = fs.createWriteStream(localPath)
        let ready = false
        await this.clusterInfo.execApi.exec(srcNamespace, srcPod, srcContainer, ['tar', '-czf', '-', '-C', path.dirname(remotePath), path.basename(remotePath)], writeStream, process.stderr, null, false,
            async (_status: any) => { writeStream.end(); while (!writeStream.closed) { await new Promise(r => setTimeout(r, 5)) }; ready = true })
        while (!ready) { await new Promise(r => setTimeout(r, 5)) }
    }

    private launchCommand(ns: string, pod: string, c: string, cmd: string[]): Promise<{ stdout: string, stderr: string, stdend: IExecutionResult }> {
        return new Promise(async (resolve, reject) => {
            let accumulatedOut: Buffer = Buffer.alloc(0)
            let accumulatedErr: Buffer = Buffer.alloc(0)
            let accumulatedEnd: Buffer = Buffer.alloc(0)
            let stdout = new Writable({})
            let stderr = new Writable({})
            let stdin = new Readable({ read() { } })
            let shellSocket = await this.clusterInfo.execApi.exec(ns, pod, c, cmd, stdout, stderr, stdin, false, (_st: any) => { })
            shellSocket.on('end', () => { })
            shellSocket.onmessage = (event: any) => {
                let data = event.data as Buffer
                if (data[0] === 1) accumulatedOut = Buffer.concat([accumulatedOut, data.slice(1)])
                if (data[0] === 2) accumulatedErr = Buffer.concat([accumulatedErr, data.slice(1)])
                if (data[0] === 3) accumulatedEnd = Buffer.concat([accumulatedEnd, data.slice(1)])
            }
            shellSocket.onclose = (_event: any) => {
                resolve({ stdout: accumulatedOut.toString('utf8'), stderr: accumulatedErr.toString('utf8'), stdend: JSON.parse(accumulatedEnd.toString('utf8')) })
            }
            shellSocket.onerror = (_event: any) => { reject('error') }
        })
    }

    downloadFile = async (srcNamespace: string, srcPod: string, srcContainer: string, remotePath: string): Promise<IExecutionResult> => {
        try {
            let accumulatedErr: Buffer = Buffer.alloc(0)
            let accumulatedEnd: Buffer = Buffer.alloc(0)
            let stdout = new Writable({})
            let stderr = new Writable({})
            const localPath = path.join(os.tmpdir(), uuid())
            let ws = fs.createWriteStream(localPath)
            let ended = false
            let shellSocket = await this.clusterInfo.execApi.exec(srcNamespace, srcPod, srcContainer, ['cat', remotePath], stdout, stderr, null, false)
            shellSocket.onmessage = (event: any) => {
                let data = event.data as Buffer
                if (data[0] === 1) ws.write(data.slice(1))
                if (data[0] === 2) accumulatedErr = Buffer.concat([accumulatedErr, data.slice(1)])
                if (data[0] === 3) accumulatedEnd = Buffer.concat([accumulatedEnd, data.slice(1)])
            }
            shellSocket.onclose = (_event: any) => { ws.end(); ended = true }
            shellSocket.onerror = (_event: any) => { return { metadata: {}, message: 'Error', status: ExecutionStatus.FAILURE } }
            while (!ended) { await new Promise(r => setTimeout(r, 10)) }
            let result: IExecutionResult = JSON.parse(accumulatedEnd.toString('utf8'))
            return { metadata: { filename: localPath }, message: result.message, status: result.status }
        } catch (err: any) {
            return { metadata: {}, message: err.toString(), status: ExecutionStatus.FAILURE }
        }
    }

    uploadFile = async (ns: string, pod: string, c: string, localPath: string, remotePath: string): Promise<IExecutionResult> => {
        try {
            let accumulatedErr: Buffer = Buffer.alloc(0)
            let accumulatedEnd: Buffer = Buffer.alloc(0)
            let stdout = new Writable({})
            let stderr = new Writable({})
            const readStream = fs.createReadStream(localPath)
            let ended = false
            let srclen = fs.statSync(localPath).size
            let parentFolder = remotePath.split('/').slice(0, -1).join('/').trim()
            if (parentFolder !== '') {
                let mkresult = await this.launchCommand(ns, pod, c, ['mkdir', '-p', parentFolder])
                if (mkresult.stdend.status !== ExecutionStatus.SUCCESS) return { metadata: {}, message: 'Cannot create dir: ' + mkresult.stdend.message, status: ExecutionStatus.FAILURE }
            }
            let shellSocket = await this.clusterInfo.execApi.exec(ns, pod, c, ['sh', '-c', `cat > "${remotePath}" && exit`], stdout, stderr, readStream, false)
            shellSocket.onmessage = (event: any) => {
                let data = event.data as Buffer
                if (data[0] === 2) accumulatedErr = Buffer.concat([accumulatedErr, data.slice(1)])
                if (data[0] === 3) accumulatedEnd = Buffer.concat([accumulatedEnd, data.slice(1)])
            }
            shellSocket.onclose = (_event: any) => { ended = true }
            let retries = 150
            while (!ended && retries > 0) { retries--; await new Promise(r => setTimeout(r, 100)) }
            let result = JSON.parse(accumulatedEnd.toString('utf8'))
            if (result.status !== 'Success') return { metadata: {}, message: result.message + '\n' + accumulatedErr, status: ExecutionStatus.FAILURE }
            let dstPath = '/' + ns + '/' + pod + '/' + c + remotePath
            let len = (await this.getFileInfo(dstPath))?.size
            while ((!len || +len !== srclen) && retries > 0) { retries--; await new Promise(r => setTimeout(r, 100)); len = (await this.getFileInfo(dstPath))?.size }
            return retries > 0 ? { metadata: {}, message: '', status: ExecutionStatus.SUCCESS } : { metadata: {}, message: 'Error copying temp file to dest file', status: ExecutionStatus.FAILURE }
        } catch (err: any) {
            return { metadata: {}, message: err.toString(), status: ExecutionStatus.FAILURE }
        }
    }

    clusterCopyOrMove = async (operation: EFilemanCommand, srcNamespace: string, srcPod: string, srcContainer: string, srcLocalPath: string, dstNamespace: string, dstPod: string, dstContainer: string, dstLocalPath: string): Promise<IExecutionResult> => {
        let result = await this.downloadFile(srcNamespace, srcPod, srcContainer, srcLocalPath)
        let tempLocalFile = result.metadata.filename
        if (result.status !== ExecutionStatus.SUCCESS) return result
        try { await this.uploadFile(dstNamespace, dstPod, dstContainer, tempLocalFile, dstLocalPath) } catch (err) { return { metadata: {}, message: 'Cannot upload file: ' + JSON.stringify(err), status: ExecutionStatus.FAILURE } }
        try { await fs.unlinkSync(tempLocalFile) } catch (err) { return { metadata: {}, message: 'Error removing temp file ' + JSON.stringify(err), status: ExecutionStatus.FAILURE } }
        if (operation === EFilemanCommand.MOVE) {
            let del = await this.launchCommand(srcNamespace, srcPod, srcContainer, ['rm', '-r', srcLocalPath])
            if (del.stdend.status === ExecutionStatus.SUCCESS && del.stderr !== '') return { metadata: {}, message: del.stderr, status: ExecutionStatus.FAILURE }
            if (del.stdend.status !== ExecutionStatus.SUCCESS) return { metadata: {}, message: del.stdend.message, status: ExecutionStatus.FAILURE }
        }
        return { metadata: {}, message: '', status: ExecutionStatus.SUCCESS }
    }

    private async getFileInfo(clusterPath: string) {
        let [namespace, pod, container] = clusterPath.split('/').slice(1)
        let localPath = '/' + clusterPath.split('/').slice(4, -1).join('/')
        let fname = clusterPath.split('/').slice(-1)[0]
        let result = await this.launchCommand(namespace, pod, container, ['ls', '-l', localPath])
        if (result.stdend.status === ExecutionStatus.SUCCESS && result.stderr === '') {
            let arr: IDirectoryEntry[] = []
            ParseListing.parseEntries(result.stdout, (_err: any, entryArray: IDirectoryEntry[]) => { entryArray.map(e => arr.push(e)) })
            return arr.find(entry => entry.name === fname)
        }
        return undefined
    }

    private async executeCopyOrMove(webSocket: WebSocket, operation: EFilemanCommand, instance: IInstance, srcClusterPath: string, dstClusterPath: string) {
        if (srcClusterPath.endsWith('/')) srcClusterPath = srcClusterPath.slice(0, -1)
        if (dstClusterPath.endsWith('/')) dstClusterPath = dstClusterPath.slice(0, -1)
        let srcHomeDir = srcClusterPath.split('/').slice(0, 4).join('/')
        let [srcNamespace, srcPod, srcContainer] = srcHomeDir.split('/').slice(1)
        let srcLocalPath = '/' + srcClusterPath.split('/').slice(4, -1).join('/')
        let fname = srcClusterPath.split('/').slice(-1)[0]
        let dstHomeDir = dstClusterPath.split('/').slice(0, 4).join('/')
        let [dstNamespace, dstPod, dstContainer] = dstHomeDir.split('/').slice(1)
        let dstLocalPath = '/' + dstClusterPath.split('/').slice(4).join('/')
        let linuxCommand = (operation === EFilemanCommand.MOVE ? ['mv'] : ['cp', '-r'])

        if (srcHomeDir === dstHomeDir) {
            let fileInfo = await this.getFileInfo(srcClusterPath)
            if (fileInfo) {
                let result = await this.launchCommand(srcNamespace, srcPod, srcContainer, [...linuxCommand, srcLocalPath + '/' + fname, dstLocalPath])
                if (result.stdend.status === ExecutionStatus.SUCCESS && result.stderr === '') {
                    this.sendUnsolicitedMessage(webSocket, instance.instanceId, EFilemanCommand.CREATE, JSON.stringify({ metadata: { object: dstClusterPath + '/' + fname, type: fileInfo.type, time: fileInfo.time, size: fileInfo.size }, status: ExecutionStatus.SUCCESS }))
                    if (operation === EFilemanCommand.MOVE) this.sendUnsolicitedMessage(webSocket, instance.instanceId, EFilemanCommand.DELETE, JSON.stringify({ metadata: { object: srcClusterPath }, status: ExecutionStatus.SUCCESS }))
                } else {
                    this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.stdend.message + result.stderr)
                }
            } else {
                this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, 'Cannot get fileInfo for ' + srcClusterPath)
            }
        } else {
            let result = await this.launchCommand(srcNamespace, srcPod, srcContainer, ['ls', '-l', srcLocalPath + '/' + fname])
            if (result.stdend.status !== ExecutionStatus.SUCCESS || result.stderr !== '') {
                this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.stderr || result.stdend.message)
                return
            }
            let arr: IDirectoryEntry[] = []
            ParseListing.parseEntries(result.stdout, (_err: any, entryArray: IDirectoryEntry[]) => { entryArray.map(e => arr.push(e)) })
            for (let e of arr) {
                switch (e.type) {
                    case 0: {
                        let r = await this.clusterCopyOrMove(operation, srcNamespace, srcPod, srcContainer, srcLocalPath + '/' + fname + '/' + e.name, dstNamespace, dstPod, dstContainer, dstLocalPath + '/' + fname + '/' + e.name)
                        if (r.status === ExecutionStatus.SUCCESS) {
                            let fi = await this.getFileInfo('/' + [srcNamespace, srcPod, srcContainer, srcLocalPath, fname, e.name].join('/'))
                            if (fi) this.sendUnsolicitedMessage(webSocket, instance.instanceId, EFilemanCommand.CREATE, JSON.stringify({ metadata: { object: '/' + [dstNamespace, dstPod, dstContainer, dstLocalPath, fname, e.name].join('/'), type: fi.type, time: fi.time, size: fi.size }, status: ExecutionStatus.SUCCESS }))
                            if (operation === EFilemanCommand.MOVE) this.sendUnsolicitedMessage(webSocket, instance.instanceId, EFilemanCommand.DELETE, JSON.stringify({ metadata: { object: '/' + [srcNamespace, srcPod, srcContainer, srcLocalPath, fname, e.name].join('/') }, status: ExecutionStatus.SUCCESS }))
                        } else {
                            this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, r.message)
                        }
                        break
                    }
                    case 1:
                        await this.executeCopyOrMove(webSocket, operation, instance, srcHomeDir + '/' + fname + '/' + e.name, dstHomeDir + dstLocalPath + '/' + fname)
                        break
                }
            }
        }
    }

    private async executeDelete(webSocket: WebSocket, instance: IInstance, _id: string, srcPath: string) {
        let srcHomeDir = srcPath.split('/').slice(0, 4).join('/')
        let srcLocalPath = '/' + srcPath.split('/').slice(4).join('/')
        let [srcNamespace, srcPod, srcContainer] = srcHomeDir.split('/').slice(1)
        let result = await this.launchCommand(srcNamespace, srcPod, srcContainer, ['rm', '-r', srcLocalPath])
        if (result.stdend.status === ExecutionStatus.SUCCESS) {
            if (result.stderr === '')
                this.sendUnsolicitedMessage(webSocket, instance.instanceId, EFilemanCommand.DELETE, JSON.stringify({ metadata: { object: srcPath, type: 0 }, status: ExecutionStatus.SUCCESS }))
            else
                this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.stderr)
        } else {
            this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.stdend.message)
        }
    }

    private async executeCreate(webSocket: WebSocket, instance: IInstance, srcPath: string) {
        let srcHomeDir = srcPath.split('/').slice(0, 4).join('/')
        let srcLocalPath = '/' + srcPath.split('/').slice(4).join('/')
        let [srcNamespace, srcPod, srcContainer] = srcHomeDir.split('/').slice(1)
        let result = await this.launchCommand(srcNamespace, srcPod, srcContainer, ['mkdir', srcLocalPath])
        if (result.stdend.status === ExecutionStatus.SUCCESS) {
            if (result.stderr === '')
                this.sendUnsolicitedMessage(webSocket, instance.instanceId, EFilemanCommand.CREATE, JSON.stringify({ metadata: { object: srcPath, type: 1, time: Date.now(), size: 4096 }, status: ExecutionStatus.SUCCESS }))
            else
                this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.stderr)
        } else {
            this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, result.stdend.message)
        }
    }
}

export { FilemanChannel }
