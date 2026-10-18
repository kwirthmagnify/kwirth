import { IInstanceConfig, ISignalMessage, IInstanceMessage, AccessKey, accessKeyDeserialize, BackChannelData, EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType, ESignalMessageLevel, EClusterType, IExtensionScope} from '@kwirthmagnify/kwirth-common'
import { IBackChannelRequirements, IChannelInstances } from '@kwirthmagnify/kwirth-common'
import { EMagnifyScope, MAGNIFY_SCOPES, MAGNIFY_SCOPE_LADDER } from '../common/MagnifyScopes'
import { allows, canSee, canSeeAnyOf, filterItems, needsFiltering } from '../common/MagnifyAuth'
import { IBackChannelObject, IChannel, IProvider, IProviderHandle, IProviderSubscriber } from '@kwirthmagnify/kwirth-common-back'
import { Request, Response } from 'express'
// Types only: at runtime every Kubernetes client is the core's, reached through clusterInfo.
import type {
    AdmissionregistrationV1Api, ApiextensionsV1Api, AppsV1Api, AutoscalingV2Api, BatchV1Api, CoordinationV1Api, CoreV1Api,
    CustomObjectsApi, KubernetesObjectApi, NetworkingV1Api, NodeV1Api, PolicyV1Api, RbacAuthorizationV1Api, SchedulingV1Api,
    StorageV1Api, V1APIResource, V1APIResourceList, VersionApi
} from '@kubernetes/client-node'
import { applyResource, cronJobStatus, cronJobTrigger, imageDelete, nodeCordon, nodeDrain, nodeShell, nodeUnCordon, podEvict, podWork, restartController, scaleController, setIngressClassAsDefault, throttleExcute } from '@kwirthmagnify/kwirth-common-back'
import { IMagnifyClusterUsage, IMetricsClusterUsage } from './MagnifyMetricsTypes'
const yaml = require('js-yaml')

/*
    What Magnify uses of the core's ClusterInfo. A plugin cannot import the core's class, so it describes
    the part it touches (the same structural pattern as spectrum and metrics): the Kubernetes clients, the
    providers, and the two ways of reaching one.
*/
interface IMagnifyClusterInfo {
    coreApi: CoreV1Api
    versionApi: VersionApi
    appsApi: AppsV1Api
    crdApi: CustomObjectsApi
    rbacApi: RbacAuthorizationV1Api
    extensionApi: ApiextensionsV1Api
    storageApi: StorageV1Api
    networkApi: NetworkingV1Api
    batchApi: BatchV1Api
    autoscalingApi: AutoscalingV2Api
    schedulingApi: SchedulingV1Api
    coordinationApi: CoordinationV1Api
    admissionApi: AdmissionregistrationV1Api
    policyApi: PolicyV1Api
    nodeApi: NodeV1Api
    objectsApi: KubernetesObjectApi
    providers: IProvider[]
    addSubscriber(providerId: string, subscriber: IProviderSubscriber, data: unknown): void
    getProvider(providerId: string, consumer: unknown): IProviderHandle | undefined
}

export interface IMagnifyConfig {
}

export enum EMagnifyCommand {
    CREATE = 'create',
    APPLY = 'apply',
    DELETE = 'delete',
    LIST = 'list',
    SUBSCRIBE = 'subscribe',
    CLUSTERINFO = 'clusterinfo',
    LISTCRD = 'listcrd',
    WATCH = 'watch',
    EVENTS = 'events',
    K8EVENT = 'k8event',
    USAGE = 'usage',
    CRONJOB = 'CronJob',
    INGRESSCLASS = 'IngressClass',
    POD = 'Pod',
    NODE = 'Node',
    IMAGE = 'Image',
    CONTROLLER = 'Controller',
    LOGSEARCH = 'logsearch',
    LOGSEARCH_STOP = 'logsearchstop',
}

export interface IMagnifyMessage extends IInstanceMessage {
    msgtype: 'magnifymessage'
    id: string
    accessKey: string
    instance: string
    namespace: string
    group: string
    pod: string
    container: string
    command: EMagnifyCommand
    params?: string[]
}

export interface IMagnifyMessageResponse extends IInstanceMessage {
    msgtype: 'magnifymessageresponse'
    id: string
    command: EMagnifyCommand
    namespace: string
    group: string
    pod: string
    container: string
    event?: string
    data?: any
}

/*
    The commands that change the cluster, as opposed to looking at it. They are the ones gated by
    `magnify$write`; everything else only reads.

    POD, NODE, CONTROLLER, IMAGE, CRONJOB and INGRESSCLASS each carry an action in their parameters, and
    every one of those actions mutates — evict, drain, cordon, shell, scale, restart, delete an image,
    trigger a cron job, make an IngressClass the default. There is no read-only use of them, so the whole
    command is listed rather than each of its actions.
*/
const MUTATING_COMMANDS = new Set<string>([
    EMagnifyCommand.CREATE, EMagnifyCommand.APPLY, EMagnifyCommand.DELETE,
    EMagnifyCommand.POD, EMagnifyCommand.NODE, EMagnifyCommand.CONTROLLER,
    EMagnifyCommand.IMAGE, EMagnifyCommand.CRONJOB, EMagnifyCommand.INGRESSCLASS
])

export interface IInstance {
    instanceId: string
    /*
        🔴 The key the instance was opened with, and the only thing this channel authorises from. It is
        read from the instanceConfig the CORE validated, never from what a later message carries: a
        message is composed by the browser, and a channel that believed it would let anybody grant
        themselves whatever they typed.
    */
    accessKey: AccessKey
}

class MagnifyChannel implements IChannel {
    readonly channelId = 'magnify'
    /*
        Every line goes through the core's logger for channels, which prefixes it with this channel's id
        ('[chan] [INFO] [magnify] ...'), as it did when Magnify was part of the core. Read on each call:
        backChannelObject is set by the constructor, after the fields are initialised.
    */
    private log = {
        info: (message: unknown) => this.backChannelObject.logInfo?.(message),
        warning: (message: unknown) => this.backChannelObject.logWarning?.(message),
        error: (message: unknown) => this.backChannelObject.logError?.(message)
    }
    readonly requirements: IBackChannelRequirements = {
        storage: false,
        providers: [ 'events', 'metrics' ]
    }
    clusterUsage: IMetricsClusterUsage = {
        vcpus: 0,
        memory: 0,
        cpuUsage: 0,
        memoryUsage: 0,
        txmbps: 0,
        rxmbps: 0,
        pods: 0,
        maxPods: 0
    }
    clusterInfo : IMagnifyClusterInfo
    backChannelObject: IBackChannelObject
    cancelledSearches: Set<string> = new Set()
    webSockets: {
        ws:WebSocket,
        lastRefresh: number,
        instances: IInstance[] 
    }[] = []

    // +++ add dispose/destroy (conterpart of initChannel) to IChannel (and implement in this channel a remove from "events subscription")

    constructor (clusterInfo:IMagnifyClusterInfo, backChannelObject:IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
    }

    getChannelData = (): BackChannelData => {
        return {
            id: 'magnify',
            routable: false,
            pauseable: false,
            modifiable: false,
            reconnectable: true,
            metrics: true,
            sources: [ EClusterType.KUBERNETES ],
            endpoints: [],
            websocket: false,
            cluster: true,
            resourced: false
        }
    }

    getChannelScopeLevel = (scope: string): number => MAGNIFY_SCOPE_LADDER.indexOf(scope)

    /*
        What the security editor offers for Magnify. Until this existed the editor showed nothing of this
        channel, so the only way to grant it was `cluster` — admin-level over the whole product — and
        there was no way to say 'look but do not touch' or 'only this namespace'.
    */
    getScopeCatalog = (): IExtensionScope[] => MAGNIFY_SCOPES

    startChannel = async () =>  {
        this.clusterInfo.addSubscriber('metrics', this, {})
    }

    processProviderEvent(providerId:string, obj:any) : void {
        switch(providerId) {
            case 'metrics':
                this.clusterUsage = obj.cluster
                break
            case 'events':
                for (let socket of this.webSockets) {
                    for (let instance of socket.instances) {
                        /*
                            🔴 The other way out, and the one that is easy to forget: a Secret hidden from
                            the listing would still have arrived here the moment somebody changed it.
                            A permission that holds until the cluster moves is not a permission.
                        */
                        if (!canSee(instance.accessKey, obj.obj?.kind, obj.obj?.metadata?.namespace)) continue
                        let magnifyMessage:IMagnifyMessageResponse = {
                            msgtype: 'magnifymessageresponse',
                            id: '1',
                            command: EMagnifyCommand.K8EVENT,
                            namespace: '',
                            group: '',
                            pod: '',
                            container: '',
                            action: EInstanceMessageAction.COMMAND,
                            flow: EInstanceMessageFlow.UNSOLICITED,
                            type: EInstanceMessageType.DATA,
                            channel: 'magnify',
                            instance: instance.instanceId,
                            event: obj.type,
                            data: obj.obj
                        }
                        socket.ws.send(JSON.stringify(magnifyMessage))
                    }
                }
                break
            default:
                this.log.info(`Ignored provider event from ${providerId} to channel ${this.getChannelData().id}`)
        }
    }

    async endpointRequest(endpoint:string, req:Request, res:Response, accessKey:AccessKey) : Promise<void> {
    }

    async websocketRequest(newWebSocket:WebSocket) : Promise<void> {
    }

    containsInstance = (instanceId: string): boolean => {
        return this.webSockets.some(socket => socket.instances.find(i => i.instanceId === instanceId))
    }

    // A connection counts while it carries an instance: one left with none is on its way out.
    getInstances = (): IChannelInstances => {
        const carrying = this.webSockets.filter(s => s.instances.length > 0)
        return { instances: carrying.reduce((n, s) => n + s.instances.length, 0), connections: carrying.length }
    }

    containsAsset = (webSocket:WebSocket, podNamespace:string, podName:string, containerName:string): boolean => {
        // magnify doesn't work with asseets, initially it works with the whole cluster
        return false
    }
    
    processCommand = async (webSocket:WebSocket, instanceMessage:IInstanceMessage) : Promise<boolean> => {
        try {
            if (instanceMessage.flow === EInstanceMessageFlow.IMMEDIATE) {
                return false
            }
            else {
                let socket = this.webSockets.find(s => s.ws === webSocket)
                if (!socket) {
                    this.log.info('Socket not found')
                    return false
                }

                let instances = socket.instances
                let instance = instances.find(i => i.instanceId === instanceMessage.instance)
                if (!instance) {
                    this.sendSignalMessage(webSocket, instanceMessage.action, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceMessage.instance, `Instance not found`)
                    this.log.info(`Instance ${instanceMessage.instance} not found`)
                    return false
                }
                let magnifyMessage = instanceMessage as IMagnifyMessage
                let resp = await this.executeCommand(webSocket, instance, magnifyMessage)
                if (resp) webSocket.send(JSON.stringify(resp))
                return Boolean(resp)
            }
        }
        catch (err) {
            this.log.info('Error processing magnify command')
            return false
        }
    }

    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> => {
        this.log.info(`Start instance ${instanceConfig.instance} ${podNamespace}/${podName}/${containerName} (view: ${instanceConfig.view})`)

        /*
            🔴 The door, and it is checked BEFORE anything is registered. The core does not guard it:
            Magnify is a cluster channel, so `checkAkr` is never called for it and until now ANY key that
            reached the channel got the whole cluster.

            Checking first is not tidiness: refusing after pushing the socket left an entry with no
            instances in it for the rest of the connection's life.

            The view still has to be CLUSTER for the channel to start at all — that is the core's part —
            but what is checked here is the scope, the same way agora, excubitor and trivy do it.
        */
        const accessKey = accessKeyDeserialize(instanceConfig.accessKey)
        if (!allows(accessKey, EMagnifyScope.USER)) {
            this.log.warning(`Denied instance ${instanceConfig.instance} to key ${accessKey?.id}: '${EMagnifyScope.USER}' required`)
            this.sendSignalMessage(webSocket, EInstanceMessageAction.START, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceConfig.instance,
                `You don't have permission to use Magnify. Opening it requires the '${EMagnifyScope.USER}' scope — ask an administrator.`)
            return false
        }

        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) {
            let len = this.webSockets.push( {ws:webSocket, lastRefresh: Date.now(), instances:[]} )
            socket = this.webSockets[len-1]
        }

        let instances = socket.instances
        let instance = instances.find(i => i.instanceId === instanceConfig.instance)
        if (!instance) {
            instance = {
                instanceId: instanceConfig.instance,
                accessKey
            }
            instances.push(instance)
        }
        return true
    }

    deleteObject = async (webSocket:WebSocket, instanceConfig:IInstanceConfig, podNamespace:string, podName:string, containerName:string) : Promise<boolean> => {
        return true
    }

    pauseContinueInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig, action: EInstanceMessageAction): void => {
        this.log.info('Pause/Continue not supported')
    }

    modifyInstance = (webSocket:WebSocket, instanceConfig: IInstanceConfig): void => {
        this.log.info('Modify not supported')
    }

    stopInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig): void => {
        let instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            this.removeInstance(webSocket, instanceConfig.instance)
            this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instanceConfig.instance, 'Magnify instance stopped')
        }
        else {
            this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceConfig.instance, `Magnify instance not found`)
        }
    }

    removeInstance = (webSocket: WebSocket, instanceId: string): void => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            let instances = socket.instances
            if (instances) {
                let pos = instances.findIndex(t => t.instanceId === instanceId)
                if (pos>=0) {
                    instances.splice(pos,1)
                }
                else {
                    this.log.info(`Instance ${instanceId} not found, cannot delete`)
                }
            }
            else {
                this.log.info('There are no Magnify Instances on websocket')
            }
        }
        else {
            this.log.info('WebSocket not found on Magnify')
        }
    }

    containsConnection = (webSocket:WebSocket): boolean => {
        return Boolean (this.webSockets.find(s => s.ws === webSocket))
    }

    removeConnection = (webSocket: WebSocket): void => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            const ids = socket.instances.map(i => i.instanceId)
            for (const id of ids) {
                this.removeInstance(webSocket, id)
            }
            let pos = this.webSockets.findIndex(s => s.ws === webSocket)
            this.webSockets.splice(pos,1)
        }
        else {
            this.log.info('WebSocket not found on Magnify for remove')
        }
    }

    refreshConnection = (webSocket: WebSocket): boolean => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            socket.lastRefresh = Date.now()
            return true
        }
        else {
            this.log.info('WebSocket not found')
            return false
        }
    }

    updateConnection = (newWebSocket: WebSocket, instanceId: string): boolean => {
        for (let entry of this.webSockets) {
            let exists = entry.instances.find(i => i.instanceId === instanceId)
            if (exists) {
                entry.ws = newWebSocket
                return true
            }
        }
        return false
    }

    // *************************************************************************************
    // PRIVATE
    // *************************************************************************************

    /*
        🔴 Where a listing is cut down to what the key may see, and the ONLY place it happens.

        It is done here, on the serialised body, and not in each of the forty-odd branches of
        `executeList`: a filter that has to be remembered in forty places is a filter that will be
        missing from one of them, and the one it is missing from is a kind somebody can read and should
        not. Everything Magnify lists leaves through this method.

        A key that narrows nothing does no work at all.
    */
    private filterListPayload = (accessKey:AccessKey, data:any): any => {
        if (typeof data !== 'string') return data
        try {
            const body = JSON.parse(data)
            if (!Array.isArray(body?.items)) return data
            // Kubernetes answers a listing with its own kind: 'PodList', 'SecretList', 'PodMetricsList'.
            const kind = typeof body.kind === 'string' && body.kind.endsWith('List') ? body.kind.slice(0, -4) : undefined
            if (!kind) {
                /*
                    Without the kind there is no way to decide, and the key HAS limits — so nothing goes
                    out. It is said out loud because an empty list is indistinguishable from a cluster
                    with nothing in it, and somebody will report it as a bug.
                */
                this.log.warning(`A listing with no kind reached a limited key: nothing is sent (${String(data).slice(0, 80)})`)
                return JSON.stringify({ ...body, items: [] })
            }
            return JSON.stringify({ ...body, items: filterItems(accessKey, kind, body.items) })
        }
        catch (err) {
            this.log.warning(`A listing could not be read to be filtered, so nothing is sent: ${err}`)
            return JSON.stringify({ items: [] })
        }
    }

    private sendDataMessage = (webSocket:WebSocket, instance:IInstance, id:string, command: EMagnifyCommand, data:any): void => {
        if (command === EMagnifyCommand.LIST && needsFiltering(instance.accessKey)) data = this.filterListPayload(instance.accessKey, data)
        let resp: IMagnifyMessageResponse = {
            action: EInstanceMessageAction.COMMAND,
            flow: EInstanceMessageFlow.RESPONSE,
            channel: 'magnify',
            instance: instance.instanceId,
            type: EInstanceMessageType.DATA,
            id,
            command,
            namespace: '',
            group: '',
            pod: '',
            container: '',
            data,
            msgtype: 'magnifymessageresponse'
        }
        webSocket.send(JSON.stringify(resp))
    }

    private sendSignalMessage = (ws:WebSocket, action:EInstanceMessageAction, flow: EInstanceMessageFlow, level: ESignalMessageLevel, instanceId:string, text:string): void => {
        var resp:ISignalMessage = {
            action,
            flow,
            channel: 'magnify',
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
                this.log.info('Instance not found')
            }
            else {
                this.log.info('There are no Instances on websocket')
            }
        }
        else {
            this.log.info('WebSocket not found')
        }
        return undefined
    }
    
    private async executeCommand (webSocket:WebSocket, instance:IInstance, magnifyMessage:IMagnifyMessage) : Promise<IMagnifyMessageResponse | undefined> {
        let execResponse: IMagnifyMessageResponse = {
            action: magnifyMessage.action,
            flow: EInstanceMessageFlow.RESPONSE,
            type: EInstanceMessageType.SIGNAL,
            channel: magnifyMessage.channel,
            instance: magnifyMessage.instance,
            command: magnifyMessage.command,
            id: magnifyMessage.id,
            namespace: magnifyMessage.namespace,
            group: magnifyMessage.group,
            pod: magnifyMessage.pod,
            container: magnifyMessage.container,
            msgtype: 'magnifymessageresponse'
        }
        try {
            if (!magnifyMessage.command) {
                execResponse.data = 'No command received in data'
                return execResponse
            }

            /*
                🔴 Everything that CHANGES the cluster, behind one door.

                Listed by command and not by a flag on each branch, so that adding a mutating command
                without adding it here is visible: the list is what this channel calls writing, and it is
                read next to the switch that serves them.

                `cluster` and `admin` sit above WRITE in the ladder, so an administrator is unaffected.
            */
            if (MUTATING_COMMANDS.has(magnifyMessage.command) && !allows(instance.accessKey, EMagnifyScope.WRITE)) {
                this.log.warning(`Denied '${magnifyMessage.command}' to key ${instance.accessKey?.id}: '${EMagnifyScope.WRITE}' required`)
                this.sendSignalMessage(webSocket, magnifyMessage.action, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId,
                    `You don't have permission to change the cluster from Magnify — that requires the '${EMagnifyScope.WRITE}' scope.`)
                return undefined
            }

            switch (magnifyMessage.command) {
                case EMagnifyCommand.LIST: {
                    this.log.info(`Get LIST`)
                    if (!magnifyMessage.params || magnifyMessage.params.length<1) {
                        execResponse.data = `Insufficent parameters`
                        return execResponse
                    }
                    this.executeList(webSocket, instance, magnifyMessage)
                    return
                }
                
                case EMagnifyCommand.SUBSCRIBE: {
                    this.log.info(`Do SUBSCRIBE`)
                    this.clusterInfo.addSubscriber('events', this, { kinds: magnifyMessage.params!, syncInstances:Boolean(magnifyMessage.params?.includes('CRD Instances'))} )
                    return
                }
                
                case EMagnifyCommand.CLUSTERINFO:
                    this.sendDataMessage(webSocket, instance, '1', EMagnifyCommand.CLUSTERINFO, JSON.stringify((await this.clusterInfo.versionApi.getCode())))
                    return

                case EMagnifyCommand.USAGE:
                    this.sendDataMessage(webSocket, instance, '1', EMagnifyCommand.USAGE, JSON.stringify(await this.getUsage(magnifyMessage.params![0])))
                    return

                case EMagnifyCommand.POD:
                    switch (magnifyMessage.params![0]) {
                        case 'evict':
                            await podEvict(this.clusterInfo.coreApi, magnifyMessage.params![1], magnifyMessage.params![2])
                            this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instance.instanceId, `Pod '${magnifyMessage.params![1]}/${magnifyMessage.params![2]}' successfully evicted`)
                            return
                        case 'work':
                            // +++ this is expected to be used for KubeWorks
                            let podName = await podWork(this.clusterInfo.coreApi, magnifyMessage.params![1])
                            this.sendDataMessage(webSocket, instance, '1', EMagnifyCommand.POD, JSON.stringify(['work',podName]))
                            return
                        default:
                            this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, 'Invalid POD command')
                            console.error('Invalid POD command')
                            return
                    }

                case EMagnifyCommand.INGRESSCLASS:
                    switch (magnifyMessage.params![0]) {
                        case 'default':
                            await setIngressClassAsDefault(this.clusterInfo.networkApi, magnifyMessage.params![1])
                            this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instance.instanceId, `Ingress class '${magnifyMessage.params![1]}}' successfully set`)
                            return
                        default:
                            this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, 'Invalid IngressClass command')
                            console.error('Invalid IngressClass command')
                            return
                    }

                case EMagnifyCommand.IMAGE:
                    switch (magnifyMessage.params![0]) {
                        case 'delete':
                            for (let imageName of magnifyMessage.params!.slice(1)) {
                                await imageDelete(this.clusterInfo.appsApi, imageName)
                            }
                            this.log.info('notify-delete-ended')
                            throttleExcute('image-delete-node', async () => {
                                this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.coreApi.listNode()))
                            })
                            return
                        default:
                            this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, 'Invalid Image command')
                            console.error('Invalid Image command')
                            return
                    }

                case EMagnifyCommand.NODE:
                    switch (magnifyMessage.params![0]) {
                        case 'shell':
                            await nodeShell(this.clusterInfo.coreApi, magnifyMessage.params![1], magnifyMessage.params![2], magnifyMessage.params![3])
                            break
                        case 'cordon':
                            await nodeCordon(this.clusterInfo.coreApi, magnifyMessage.params![1])
                            break
                        case 'uncordon':
                            await nodeUnCordon(this.clusterInfo.coreApi, magnifyMessage.params![1])
                            break
                        case 'drain':
                            await nodeDrain(this.clusterInfo.coreApi, magnifyMessage.params![1])
                            break
                        default:
                            this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, 'Invalid node command')
                            console.error('Invalid node command')
                            return
                    }
                    this.sendDataMessage(webSocket, instance, '1', EMagnifyCommand.NODE, `Node successfully ${magnifyMessage.params![0]}`)
                    break

                case EMagnifyCommand.LISTCRD: {
                    this.log.info(`Get LISTCRD`)
                    if (!magnifyMessage.params || magnifyMessage.params.length<1) {
                        execResponse.data = `Insufficent parameters`
                        return execResponse
                    }
                    this.executeListCrd(webSocket, instance, magnifyMessage)
                    return
                }

                case EMagnifyCommand.CREATE: {
                    this.log.info(`Do CREATE`)
                    this.executeCreate(webSocket, instance, magnifyMessage.params!)
                    return
                }
                case EMagnifyCommand.EVENTS: {
                    this.log.info(`Do EVENT`)
                    this.executeEvents(webSocket, instance, magnifyMessage)
                    return
                }
                case EMagnifyCommand.APPLY: {
                    this.log.info(`Do APPLY`)
                    this.executeApply(webSocket, instance, magnifyMessage.params!)
                    return
                }
                case EMagnifyCommand.DELETE: {
                    this.log.info(`Do DELETE`)
                    this.executeDelete(webSocket, instance, magnifyMessage.params!)
                    return
                }
                case EMagnifyCommand.CONTROLLER: {
                    this.log.info(`Do RESTART`)
                    switch(magnifyMessage.params?.[0]) {
                        case 'restart':
                            restartController(magnifyMessage.params[1], magnifyMessage.params[2], magnifyMessage.params[3], this.clusterInfo)
                            break
                        case 'scale':
                            scaleController(magnifyMessage.params[1], magnifyMessage.params[2], magnifyMessage.params[3], +magnifyMessage.params[4], this.clusterInfo)
                            break
                        default:
                            this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, 'Invalid controller command')
                            console.error('Invalid node command')
                            return
                    }
                    this.sendDataMessage(webSocket, instance, '1', EMagnifyCommand.NODE, `Controller successfully ${magnifyMessage.params![0]}`)
                    return
                }
                case EMagnifyCommand.CRONJOB: {
                    switch (magnifyMessage.params![0]) {
                        case 'trigger':
                            await cronJobTrigger(magnifyMessage.params![1], magnifyMessage.params![2], this.clusterInfo.batchApi)
                            break
                        case 'suspend':
                            await cronJobStatus(magnifyMessage.params![1], magnifyMessage.params![2], true, this.clusterInfo.batchApi)
                            break
                        case 'resume':
                            await cronJobStatus(magnifyMessage.params![1], magnifyMessage.params![2], false, this.clusterInfo.batchApi)
                            break
                        default:
                            this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, 'Invalid cronjon command')
                            console.error('Invalid node command')
                            return
                    }
                    this.sendDataMessage(webSocket, instance, '1', EMagnifyCommand.NODE, `CronJob successfully ${magnifyMessage.params![0]}`)
                    return
                }

                case EMagnifyCommand.LOGSEARCH: {
                    const { query, namespaces, pods, tailLines, caseSensitive, useRegex } = JSON.parse(magnifyMessage.params![0]) as {
                        query: string, namespaces?: string[], pods?: string[], tailLines?: number, caseSensitive?: boolean, useRegex?: boolean
                    }
                    const lines = tailLines ?? 5000
                    const cs = caseSensitive ?? false
                    const rx = useRegex ?? false
                    const tester = (line: string) => {
                        try {
                            if (rx) return new RegExp(query, cs ? '' : 'i').test(line)
                            return cs ? line.includes(query) : line.toLowerCase().includes(query.toLowerCase())
                        } catch { return false }
                    }

                    // Build container list
                    type TContainer = { namespace: string, pod: string, container: string }
                    const containers: TContainer[] = []
                    if (pods && pods.length > 0) {
                        for (const podRef of pods) {
                            const [ns, podName] = podRef.split('/')
                            try {
                                const pod = await this.clusterInfo.coreApi.readNamespacedPod({ name: podName, namespace: ns })
                                for (const c of pod.spec?.containers ?? []) containers.push({ namespace: ns, pod: podName, container: c.name })
                            } catch {}
                        }
                    } else {
                        const nsList = namespaces && namespaces.length > 0 ? namespaces : (await this.clusterInfo.coreApi.listNamespace()).items.map((n: any) => n.metadata.name as string)
                        for (const ns of nsList) {
                            try {
                                const podList = await this.clusterInfo.coreApi.listNamespacedPod({ namespace: ns })
                                for (const pod of podList.items) {
                                    const podName = pod.metadata?.name!
                                    for (const c of pod.spec?.containers ?? []) containers.push({ namespace: ns, pod: podName, container: c.name })
                                }
                            } catch {}
                        }
                    }

                    // Search in batches of 5
                    const BATCH = 5
                    const searchId = magnifyMessage.id
                    for (let i = 0; i < containers.length; i += BATCH) {
                        if (this.cancelledSearches.has(searchId)) break
                        await Promise.all(containers.slice(i, i + BATCH).map(async ({ namespace, pod, container }) => {
                            if (this.cancelledSearches.has(searchId)) return
                            try {
                                const log = await this.clusterInfo.coreApi.readNamespacedPodLog({ name: pod, namespace, container, tailLines: lines })
                                const matched = (typeof log === 'string' ? log : String(log)).split('\n').filter(l => l && tester(l))
                                if (matched.length > 0) {
                                    this.sendDataMessage(webSocket, instance, searchId, EMagnifyCommand.LOGSEARCH, JSON.stringify({ type: 'result', namespace, pod, container, lines: matched }))
                                }
                            } catch {}
                        }))
                    }
                    this.cancelledSearches.delete(searchId)
                    this.sendDataMessage(webSocket, instance, searchId, EMagnifyCommand.LOGSEARCH, JSON.stringify({ type: 'done' }))
                    return
                }

                case EMagnifyCommand.LOGSEARCH_STOP: {
                    const { searchId } = JSON.parse(magnifyMessage.params![0]) as { searchId: string }
                    this.cancelledSearches.add(searchId)
                    return
                }

                default:
                    let text = `Invalid command '${magnifyMessage.command}'. Valid commands are: ${Object.keys(EMagnifyCommand)}`
                    this.sendSignalMessage( webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, text)
                    break
            }
            return execResponse
        }
        catch (err) {
            this.log.info('Error executing magnify command')
            this.log.info(err)
            return undefined
        }
    }

    cleanLimitRange = (obj: any): void => {
        // maybe this is needed for other resources
        if (obj !== null && typeof obj === 'object') {
            
            if (Array.isArray(obj)) {
                for (const item of obj)
                    this.cleanLimitRange(item)
            }
            else {
                if (obj['_default'] !== undefined) {
                    obj['default'] = obj['_default']
                    delete obj['_default']
                }
                for (const key of Object.keys(obj))
                    this.cleanLimitRange(obj[key])
            }
        }
    }
    
    private async executeList (webSocket:WebSocket, instance:IInstance, magnifyMessage:IMagnifyMessage) {
        for (let param of magnifyMessage.params!) {
            /*
                A kind nobody holding this key can see is not even asked of Kubernetes. Two things are
                settled here that filtering the answer would not: a hidden kind never leaves the cluster,
                and a key limited to namespaces does not get the cluster-scoped kinds, which have no
                namespace to be filtered by.
            */
            if (!canSeeAnyOf(instance.accessKey, param)) {
                this.log.info(`Not listing '${param}' for key ${instance.accessKey?.id}: not granted`)
                continue
            }
            switch (param) {
                case 'ComponentStatus':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.coreApi.listComponentStatus()))
                    })
                    break
                case 'Pod':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.coreApi.listPodForAllNamespaces()))
                    })
                    break
                case 'PodMetrics':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.crdApi.listCustomObjectForAllNamespaces({ group: 'metrics.k8s.io', version: 'v1beta1', plural: 'pods' })))
                    })
                    break
                case 'Node':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.coreApi.listNode()))
                    })
                    break
                case 'NodeMetrics':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.crdApi.listCustomObjectForAllNamespaces({ group: 'metrics.k8s.io', version: 'v1beta1', plural: 'nodes' })))
                    })
                    break
                case 'Namespace':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.coreApi.listNamespace()))
                    })
                    break
                case 'ConfigMap':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.coreApi.listConfigMapForAllNamespaces()))
                    })
                    break
                case 'Secret':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.coreApi.listSecretForAllNamespaces()))
                    })
                    break
                case 'ResourceQuota':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.coreApi.listResourceQuotaForAllNamespaces()))
                    })
                    break
                case 'LimitRange':
                    throttleExcute(param, async () => {
                        let result = await this.clusterInfo.coreApi.listLimitRangeForAllNamespaces()
                        result.items.map(item => this.cleanLimitRange(item))
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(result))
                    })
                    break
                case 'HorizontalPodAutoscaler':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify((await this.clusterInfo.autoscalingApi.listHorizontalPodAutoscalerForAllNamespaces())))
                    })
                    break
                case 'PodDisruptionBudget':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.policyApi.listPodDisruptionBudgetForAllNamespaces()))
                    })
                    break
                case 'PriorityClass':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.schedulingApi.listPriorityClass()))
                    })
                    break
                case 'RuntimeClass':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.nodeApi.listRuntimeClass()))
                    })
                    break
                case 'Lease':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.coordinationApi.listLeaseForAllNamespaces()))
                    })
                    break
                case 'ValidatingWebhookConfiguration':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.admissionApi.listValidatingWebhookConfiguration()))
                    })
                    break
                case 'MutatingWebhookConfiguration':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.admissionApi.listMutatingWebhookConfiguration()))
                    })
                    break
                case 'Service':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.coreApi.listServiceForAllNamespaces()))
                    })
                    break
                case 'Endpoints':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.coreApi.listEndpointsForAllNamespaces()))
                    })
                    break
                case 'Ingress':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.networkApi.listIngressForAllNamespaces()))
                    })
                    break
                case 'IngressClass':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.networkApi.listIngressClass()))
                    })
                    break
                case 'NetworkPolicy':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.networkApi.listNetworkPolicyForAllNamespaces()))
                    })
                    break
                case 'Deployment':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.appsApi.listDeploymentForAllNamespaces()))
                    })
                    break
                case 'DaemonSet':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.appsApi.listDaemonSetForAllNamespaces()))
                    })
                    break
                case 'ReplicaSet':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.appsApi.listReplicaSetForAllNamespaces()))
                    })
                    break
                case 'ReplicationController':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.coreApi.listReplicationControllerForAllNamespaces()))
                    })
                    break
                case 'StatefulSet':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.appsApi.listStatefulSetForAllNamespaces()))
                    })
                    break
                case 'Job':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.batchApi.listJobForAllNamespaces()))
                    })
                    break
                case 'CronJob':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.batchApi.listCronJobForAllNamespaces()))
                    })
                    break
                case 'PersistentVolumeClaim':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.coreApi.listPersistentVolumeClaimForAllNamespaces()))
                    })
                    break
                case 'PersistentVolume':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.coreApi.listPersistentVolume()))
                    })
                    break
                case 'VolumeAttachment':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.storageApi.listVolumeAttachment()))
                    })
                    break
                case 'CSIDriver':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.storageApi.listCSIDriver()))
                    })
                    break
                case 'CSINode':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.storageApi.listCSINode()))
                    })
                    break
                case 'CSIStorageCapacity':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.storageApi.listCSIStorageCapacityForAllNamespaces()))
                    })
                    break
                case 'StorageClass':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.storageApi.listStorageClass()))
                    })
                    break
                case 'ServiceAccount':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.coreApi.listServiceAccountForAllNamespaces()))
                    })
                    break
                case 'ClusterRole':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.rbacApi.listClusterRole()))
                    })
                    break
                case 'Role':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.rbacApi.listRoleForAllNamespaces()))
                    })
                    break
                case 'ClusterRoleBinding':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.rbacApi.listClusterRoleBinding()))
                    })
                    break
                case 'RoleBinding':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.rbacApi.listRoleBindingForAllNamespaces()))
                    })
                    break
                case 'CustomResourceDefinition':
                    throttleExcute(param, async () => {
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.extensionApi.listCustomResourceDefinition()))
                    })
                    break
                case 'V1APIResource':
                        let data = await this.getApiResources()
                        this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(data))
                    break
                case 'CRD Instances':
                    // we ignore LIST for CRDi, only SYNC is needed
                    break
                default:
                    this.log.warning('Invalid class received: ' + param)
                    this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, 'Invalid class: '+param)
                    break
            }
        }
    }

    getResources = (res:V1APIResourceList) => {
        let result:V1APIResource[]=[]
        res.resources.forEach(r => {
            if (!r.name.includes('/')) result.push(r)
        })
        return result
    }
    
    getApiResources = async () => {
        try {
            const allResources:V1APIResource[] = [];
            allResources.push(...this.getResources(await this.clusterInfo.admissionApi.getAPIResources()))
            allResources.push(...this.getResources(await this.clusterInfo.autoscalingApi.getAPIResources()))
            allResources.push(...this.getResources(await this.clusterInfo.appsApi.getAPIResources()))
            allResources.push(...this.getResources(await this.clusterInfo.batchApi.getAPIResources()))
            allResources.push(...this.getResources(await this.clusterInfo.coordinationApi.getAPIResources()))
            allResources.push(...this.getResources(await this.clusterInfo.coreApi.getAPIResources()))
            allResources.push(...this.getResources(await this.clusterInfo.extensionApi.getAPIResources()))
            allResources.push(...this.getResources(await this.clusterInfo.networkApi.getAPIResources()))
            allResources.push(...this.getResources(await this.clusterInfo.nodeApi.getAPIResources()))
            allResources.push(...this.getResources(await this.clusterInfo.storageApi.getAPIResources()))
            allResources.push(...this.getResources(await this.clusterInfo.schedulingApi.getAPIResources()))
            allResources.push(...this.getResources(await this.clusterInfo.policyApi.getAPIResources()))
            allResources.push(...this.getResources(await this.clusterInfo.rbacApi.getAPIResources()))
            return {
                kind: 'V1APIResourceList',
                apiVersion: 'v1',
                items: allResources                
            }
        }
        catch (err) {
            this.log.error("Error:")
            this.log.error(err)
            return {
                kind: 'V1APIResourceList',
                apiVersion: 'v0',
                items: []
            }
        }
    }    

    private async executeListCrd (webSocket:WebSocket, instance:IInstance, magnifyMessage:IMagnifyMessage) {
        try {
            let params = magnifyMessage.params!
            throttleExcute('listcrd', async () => {
                let resp = await this.clusterInfo.crdApi.listCustomObjectForAllNamespaces({
                    group: params[0],
                    version: params[1],
                    plural: params[2]
                })
                this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LISTCRD, JSON.stringify(resp))
            })
        }
        catch (err:any) {
            this.log.info(err)
            this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, JSON.stringify(err.body))
        }
    }

    private async executeDelete (webSocket:WebSocket, instance:IInstance, params:string[]) {
        try {
            for (let obj of params) {
                try {
                    await this.clusterInfo.objectsApi.delete(yaml.load(obj))
                }
                catch (err:any) {
                    this.log.info(err)
                    this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, JSON.stringify(err.body))
                }
            }
        }
        catch (err) {
            this.log.info('Error executing delete')
            this.log.info(err)
        }
    }

    private async executeCreate (webSocket:WebSocket, instance:IInstance, params:string[]) {
        try {
            for (let param of params) {
                try {
                    this.clusterInfo.objectsApi.create(yaml.load(param))
                }
                catch (err:any) {
                    this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, JSON.stringify(err))
                }
            }
        }
        catch (err) {
            this.log.info('Error executing create')
            this.log.info(err)
        }
    }

    private async executeApply (webSocket:WebSocket, instance:IInstance, params:string[]) {
        try {
            for (let param of params) {
                try {
                    const res = yaml.load(param)
                    let result = await applyResource(res, this.clusterInfo)
                    this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instance.instanceId, result)
                }
                catch (err:any) {
                    this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, JSON.stringify(err))
                }
            }
        }
        catch (err) {
            this.log.info('Error executing apply')
            this.log.info(err)
        }
    }

    private async executeEvents (webSocket:WebSocket, instance:IInstance, magnifyMessage:IMagnifyMessage) {
        try {
            let params = magnifyMessage.params!
            let result = {
                type: params[0],
                events: await this.getEventsForObject(params[0], params[1],params[2],params[3], params.length>4? +params[4] : 0)
            }
            this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.EVENTS, JSON.stringify(result))
        }
        catch (err) {
            this.log.info('Error executing events')
            this.log.info(err)
        }
    }

    getUsage = async (scope:string) => {
        switch(scope) {
            case 'cluster': {
                // the provider is an installable extension: say whether it is installed, so the front can tell
                // "not installed" from "nothing read yet"
                const providers = this.clusterInfo.providers ?? []
                const usage: IMagnifyClusterUsage = { ...this.clusterUsage, metricsProvider: providers.some(p => p.id === 'metrics'), eventsProvider: providers.some(p => p.id === 'events') }
                return usage
            }
            default:
                this.log.warning('Invalid scope por getUsage: ' + scope)
        }
        return {}
    }

    private getEventsForObject = async (command:string, namespace:string,  objectKind:string, objectName:string, limit:number) => {
        try {
            /*
                Read from the 'events' provider through the contract's one-off read (getData), asked for with
                a handle like any subscription. It used to look the provider up and call a method of its own
                (getEvents), which bypassed the registry and would break in silence the day it was renamed;
                the provider is an installable extension now.
            */
            const events = this.clusterInfo.getProvider('events', this)
            if (!events) return []
            switch(command) {
                case 'cluster':
                    return await events.getData({ limit })
                case 'object':
                    return await events.getData({ namespace, kind: objectKind, name: objectName, limit })
                default:
                    return []
            }
        }
        catch (err) {
            this.log.error('Error getting events:')
            this.log.error(err)
            return []
        }
    }

}

export { MagnifyChannel }