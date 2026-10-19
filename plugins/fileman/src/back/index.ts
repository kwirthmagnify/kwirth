import { IChannelInstances, IInstanceConfig, ISignalMessage, IInstanceMessage, AccessKey, accessKeyDeserialize, BackChannelData, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, ESignalMessageLevel, EClusterType, IBackChannelRequirements, IExtensionScope } from '@kwirthmagnify/kwirth-common'
import { IBackChannelObject, IChannel, keyMatchesResource, scopeAllows } from '@kwirthmagnify/kwirth-common-back'
import { Readable, Writable } from 'stream'
import { Request, Response } from 'express'
import { v4 as uuid } from 'uuid'
import fs from 'fs'
import path from 'path'
import fileUpload from 'express-fileupload'
import os from 'os'
const ParseListing = require('@jfvilas/parse-listing')
import { EFilemanCommand, EFilemanScope, FILEMAN_SCOPES, FILEMAN_SCOPE_LADDER, IFilemanMessage, IFilemanMessageResponse } from '../common/FilemanTypes'

/*
    The scope check lives in common-back (`scopeAllows`) since 0.6.7. It was written here, in excubitor
    and in trivy — three copies of the same security check, which is three chances for one of them to
    drift.

    What it answers, and what it does not: it reads what the key was GRANTED, never what the client
    asked for in `instanceConfig.scope`, which is an unsigned field the browser composes. And it
    answers about the VERB, not about the target: a key with write in one namespace passes for any
    namespace. Checking the target is plans/fileman-target/PLAN.md.

    The core applies the same criterion at ONE point only —`checkAkr`, when an object is attached to
    the stream— and nothing re-evaluates it afterwards, which is why a session opened with read could
    delete, rename and upload until 0.2.27.
*/

export interface IAsset {
    podNamespace: string
    podName: string
    containerName: string
}

export interface IInstance {
    instanceId: string
    accessKey: AccessKey
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

class FilemanChannel implements IChannel {
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
        id: 'fileman',
        routable: false,
        pauseable: false,
        modifiable: false,
        reconnectable: true,
        metrics: false,
        sources: [EClusterType.KUBERNETES],
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

    getChannelScopeLevel = (scope: string): number => FILEMAN_SCOPE_LADDER.indexOf(scope)

    /** The scopes the security editor offers. Without this nobody could be granted them (GET /core/scopes). */
    getScopeCatalog = (): IExtensionScope[] => FILEMAN_SCOPES

    /** Whether this key was granted enough for an operation that needs `required`. See `scopeAllows`. */
    private allows = (accessKey: AccessKey, required: string): boolean =>
        scopeAllows(accessKey.resources, required, this.getChannelScopeLevel)

    /*
        `res.send()` of an object yields the string '[object Object]', which is what the user saw instead
        of the reason their request failed — the message of a failed exec is not always a string.
    */
    private reasonOf = (message: unknown): string =>
        typeof message === 'string' ? message : (message === undefined || message === null ? 'the operation failed' : JSON.stringify(message))

    /*
        🔴 The OTHER half of the check, and the one that was missing until now.

        Every path File Manager works with is `/<namespace>/<pod>/<container>/<path inside>`, and it
        comes from the CLIENT — the query string of an endpoint, or a command's parameters. The scope
        gate says whether this key may read or write; this says whether it may do so THERE.

        Without it the two were independent: a key granted on one namespace, with File Manager open on a
        pod it was allowed, read `/etc/group` from a pod in `kwirth-system` by changing the path in the
        request. Exploited on dev on 2026-10-17.

        ⚠️ The matching is the core's, unanchored: a key on 'kwirth' DOES reach 'kwirth-system'. That is
        deliberate —see `matchesResource`— and the security editor now says so, so that whoever wants one
        namespace writes '^kwirth$'.
    */
    private mayReach = (accessKey: AccessKey, clusterPath: string | undefined): boolean => {
        if (!clusterPath) return true          // nothing to check; the handler answers 400 on its own
        const [namespace, pod, container] = clusterPath.split('/').slice(1)
        return keyMatchesResource(accessKey, { namespace, pod, container })
    }

    startChannel = async () => { }

    processProviderEvent(_providerId: string, _obj: any): void { }

    async endpointRequest(endpoint: string, req: Request, res: Response, accessKey: AccessKey): Promise<void> {
        /*
            The scope each endpoint needs. Until now NONE of them checked anything: the core's
            `processHttpChannelRequest` only validates that the key is authentic (`getKey` is
            authentication, not authorization) and the ladder declared above was never read, so any
            holder of a valid key with an open fileman session could write files through `upload`.

            It goes BEFORE looking the session up, on purpose: a caller who may not do this gets a 403
            whether or not a session exists, so the answer stops telling them which it was.
        */
        const ENDPOINT_SCOPE: Record<string, string> = {
            download: EFilemanScope.READ,
            read: EFilemanScope.READ,
            upload: EFilemanScope.WRITE,
            write: EFilemanScope.WRITE
        }
        const required = ENDPOINT_SCOPE[endpoint]
        if (required && !this.allows(accessKey, required)) {
            this.backChannelObject.logWarning?.(`Denied '${endpoint}' to key ${accessKey.id}: '${required}' required`)
            res.status(403).send(`'${required}' scope required`)
            return
        }

        /*
            And WHERE, checked once for the four endpoints instead of once per branch. They all act on a
            `filename` the caller sends —three in the query string, `upload` in the body— so the target
            is read from both and contrasted with the key BEFORE the session is looked up.

            Checked here and not inside each case for the same reason as the scope above: four copies of
            a security check is three chances to forget one, and the one forgotten is the hole.
        */
        const target = (req.query['filename'] ?? req.body?.filename) as string | undefined
        if (!this.mayReach(accessKey, target)) {
            this.backChannelObject.logWarning?.(`Denied '${endpoint}' to key ${accessKey.id}: '${target}' is outside its resources`)
            res.status(403).send('That container is not in your permissions')
            return
        }

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
                            res.status(400).send(this.reasonOf(result.message))
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
                            this.backChannelObject.logError?.(`error downloading folder: ${err}`)
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
                    res.status(400).send(this.reasonOf(result.message))
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
                    res.status(400).send(this.reasonOf(result.message))
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
        if (!socket) { this.backChannelObject.logWarning?.('Socket not found'); return false }
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
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) {
            let len = this.webSockets.push({ ws: webSocket, lastRefresh: Date.now(), instances: [] })
            socket = this.webSockets[len - 1]
        }
        let instances = socket.instances
        let instance = instances.find(i => i.instanceId === instanceConfig.instance)
        if (!instance) {
            instance = { accessKey: accessKeyDeserialize(instanceConfig.accessKey), instanceId: instanceConfig.instance, paused: false, assets: [] }
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
        this.backChannelObject.logInfo?.('Pause/Continue not supported')
    }

    modifyInstance = (_webSocket: WebSocket, _instanceConfig: IInstanceConfig): void => {
        this.backChannelObject.logInfo?.('Modify not supported')
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
                else this.backChannelObject.logWarning?.(`Instance ${instanceId} not found, cannot delete`)
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

        /*
            Navigating is free: being able to open fileman against a container is what authorises HOME
            and DIR, and the core already decided that when the object was attached (`checkAkr`).

            Everything that TOUCHES the filesystem needs write. Gating only the HTTP endpoints would
            have been worse than not gating at all: these commands mutate just as much, and a fix that
            closes one door while leaving the other open buys false confidence. UPLOAD and DOWNLOAD are
            not here because they are signalling only — the transfer itself is the HTTP endpoint, which
            is gated above.
        */
        const WRITE_COMMANDS: string[] = [
            EFilemanCommand.CREATE, EFilemanCommand.RENAME, EFilemanCommand.DELETE,
            EFilemanCommand.MOVE, EFilemanCommand.COPY
        ]
        if (WRITE_COMMANDS.includes(filemanMessage.command) && !this.allows(instance.accessKey, EFilemanScope.WRITE)) {
            this.backChannelObject.logWarning?.(`Denied '${filemanMessage.command}' to key ${instance.accessKey.id}: '${EFilemanScope.WRITE}' required`)
            /*
                Reported through sendSignalMessage, NOT by filling execResponse.data: the front notifies
                from `signalMessage.text` + `level` and ignores `data` on a COMMAND response, so putting
                the reason in `data` made the denial SILENT — the operation did not happen and nobody was
                told why, which is the one thing a refusal must never do. It is the same path the
                channel's other errors already take ('Instance not found' above).
            */
            this.sendSignalMessage(webSocket, filemanMessage.action, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR,
                instance.instanceId, `Not allowed: '${EFilemanScope.WRITE}' scope is required to modify files`)
            return undefined
        }

        /*
            🔴 And WHERE each command acts, which is the half the write gate above does not cover: it
            says this key may modify files, not that it may modify THESE.

            Which parameter carries a cluster path is declared rather than guessed, because they are not
            uniform: COPY and MOVE take a path in both, while RENAME's second parameter is the new NAME.
            Walking `params` blindly would reject a rename for not looking like a path.

            🔴 Navigating is not exempt. The scope lets somebody browse —that was decided when the verb
            gate went in— but browsing a container the key does not grant is enumerating somebody else's
            filesystem, and DIR takes its path from the client like all the rest.
        */
        const PATH_PARAMS: Record<string, number[]> = {
            [EFilemanCommand.DIR]: [0],
            [EFilemanCommand.CREATE]: [0],
            [EFilemanCommand.DELETE]: [0],
            [EFilemanCommand.RENAME]: [0],
            [EFilemanCommand.COPY]: [0, 1],
            [EFilemanCommand.MOVE]: [0, 1]
        }
        for (const index of PATH_PARAMS[filemanMessage.command] ?? []) {
            const path = filemanMessage.params?.[index]
            if (this.mayReach(instance.accessKey, path)) continue
            this.backChannelObject.logWarning?.(`Denied '${filemanMessage.command}' to key ${instance.accessKey.id}: '${path}' is outside its resources`)
            this.sendSignalMessage(webSocket, filemanMessage.action, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR,
                instance.instanceId, 'Not allowed: that container is not in your permissions')
            return undefined
        }

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
                } catch (err) { this.backChannelObject.logError?.(`${err}`) }
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
