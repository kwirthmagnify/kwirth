import { IInstanceConfig, ISignalMessage, IInstanceMessage, AccessKey, ClusterTypeEnum, BackChannelData, KwirthData, EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType, ESignalMessageLevel} from '@kwirthmagnify/kwirth-common'
import { ClusterInfo } from '../../model/ClusterInfo'
import { IChannel } from '../IChannel'
import { Request, Response } from 'express'
import { CoreV1EventList, V1APIResource, V1APIResourceList } from '@kubernetes/client-node'
import { applyResource, cronJobStatus, cronJobTrigger, imageDelete, nodeCordon, nodeDrain, nodeShell, nodeUnCordon, podEvict, podWork, restartController, scaleController, setIngressClassAsDefault, throttleExcute } from '../../tools/KubernetesTools'
const yaml = require('js-yaml')

export interface IMagnifyConfig {
    //interval: number
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

export interface IInstance {
    instanceId: string
}

class MagnifyChannel implements IChannel {
    kwirthData : KwirthData
    clusterInfo : ClusterInfo
    webSockets: {
        ws:WebSocket,
        lastRefresh: number,
        instances: IInstance[] 
    }[] = []

    // +++ convert to abstract and implement common code like this
    /*

        abstract class BaseChannel implements IChannel {
            // 1. Constructor forzado para todos
            constructor(
                protected clusterInfo: ClusterInfo, 
                protected kwirthData: KwirthData
            ) {}

            // 2. Función COMÚN con implementación por defecto
            // Si a la clase hija le vale este código, no tiene que escribir nada.
            containsConnection(webSocket: WebSocket): boolean {
                console.log("Ejecutando lógica común de verificación...");
                // Supongamos una lógica estándar que sirva para casi todos
                return true; 
            }

            // 3. Método que el hijo PUEDE sobrescribir opcionalmente
            removeConnection(webSocket: WebSocket): void {
                console.log("Conexión eliminada de forma estándar");
            }

            // 4. Métodos que el hijo DEBE implementar sí o sí
            abstract getChannelData(): BackChannelData;
            abstract processEvent(type: string, obj: any): void;
            
            // ... el resto de métodos de IChannel marcados como abstract
        }

    */

    // +++ add dispose/destroy (conterpart of initChannel) to IChannel (and implement in this channel a remove from "events subscription")

    constructor (clusterInfo:ClusterInfo, kwirthData : KwirthData) {
        this.clusterInfo = clusterInfo
        this.kwirthData = kwirthData
    }

    getChannelData = (): BackChannelData => {
        return {
            id: 'magnify',
            routable: false,
            pauseable: false,
            modifyable: false,
            reconnectable: true,
            metrics: true,
            //events: true,
            providers: [],
            sources: [ ClusterTypeEnum.KUBERNETES ],
            endpoints: [],
            websocket: false,
            cluster: true
        }
    }

    getChannelScopeLevel = (scope: string): number => {
        return ['', 'magnify$read', 'cluster'].indexOf(scope)
    }

    startChannel = async () =>  {
    }

    processProviderEvent(providerId:string, obj:any) : void {
        switch(providerId) {
            case 'events':
                for (let socket of this.webSockets) {
                    for (let instance of socket.instances) {
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
                console.log(`Ignored provider event from ${providerId} to channel ${this.getChannelData().id}`)
        }
    }

    async endpointRequest(endpoint:string, req:Request, res:Response, accessKey:AccessKey) : Promise<void> {
    }

    async websocketRequest(newWebSocket:WebSocket) : Promise<void> {
    }

    containsInstance = (instanceId: string): boolean => {
        return this.webSockets.some(socket => socket.instances.find(i => i.instanceId === instanceId))
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
                let magnifyMessage = instanceMessage as IMagnifyMessage
                let resp = await this.executeCommand(webSocket, instance, magnifyMessage)
                if (resp) webSocket.send(JSON.stringify(resp))
                return Boolean(resp)
            }
        }
        catch (err) {
            console.log('Error processing magnify command')
            return false
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
                instanceId: instanceConfig.instance,
            }
            instances.push(instance)
        }
        return true
    }

    deleteObject = async (webSocket:WebSocket, instanceConfig:IInstanceConfig, podNamespace:string, podName:string, containerName:string) : Promise<boolean> => {
        return true
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
                    console.log(`Instance ${instanceId} not found, cannot delete`)
                }
            }
            else {
                console.log('There are no Magnify Instances on websocket')
            }
        }
        else {
            console.log('WebSocket not found on Magnify')
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
            console.log('WebSocket not found on Magnify for remove')
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
                return true
            }
        }
        return false
    }

    // *************************************************************************************
    // PRIVATE
    // *************************************************************************************

    private sendDataMessage = (webSocket:WebSocket, instance:IInstance, id:string, command: EMagnifyCommand, data:any): void => {
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

            switch (magnifyMessage.command) {
                case EMagnifyCommand.LIST: {
                    console.log(`Get LIST`)
                    if (!magnifyMessage.params || magnifyMessage.params.length<1) {
                        execResponse.data = `Insufficent parameters`
                        return execResponse
                    }
                    this.executeList(webSocket, instance, magnifyMessage)
                    return
                }
                
                case EMagnifyCommand.SUBSCRIBE: {
                    console.log(`Do SUBSCRIBE`)
                    this.clusterInfo.addSubscriber('events', this, { kinds: magnifyMessage.params!, syncInstances:Boolean(magnifyMessage.params?.includes('CRD Instances'))} )
                    return
                }
                
                case EMagnifyCommand.CLUSTERINFO:
                    this.sendDataMessage(webSocket, instance, '1', EMagnifyCommand.CLUSTERINFO, JSON.stringify((await this.clusterInfo.versionApi.getCode())))
                    break

                case EMagnifyCommand.USAGE:
                    this.sendDataMessage(webSocket, instance, '1', EMagnifyCommand.USAGE, JSON.stringify(await this.getUsage(magnifyMessage.params![0])))
                    break

                case EMagnifyCommand.POD:
                    switch (magnifyMessage.params![0]) {
                        case 'evict':
                            await podEvict(this.clusterInfo.coreApi, magnifyMessage.params![1], magnifyMessage.params![2])
                            break
                        case 'work':
                            // +++ this is expected to be used for KubeWorks
                            let podName = await podWork(this.clusterInfo.coreApi, magnifyMessage.params![1])
                            this.sendDataMessage(webSocket, instance, '1', EMagnifyCommand.POD, JSON.stringify(['work',podName]))
                            break
                    }
                    break

                case EMagnifyCommand.INGRESSCLASS:
                    switch (magnifyMessage.params![0]) {
                        case 'default':
                            await setIngressClassAsDefault(this.clusterInfo.networkApi, magnifyMessage.params![1])
                            break
                    }
                    break

                case EMagnifyCommand.IMAGE:
                    switch (magnifyMessage.params![0]) {
                        case 'delete':
                            for (let imageName of magnifyMessage.params!.slice(1)) {
                                await imageDelete(this.clusterInfo.appsApi, imageName)
                            }
                            console.log('notify-delete-ended')
                            throttleExcute('image-delete-node', async () => {
                                this.sendDataMessage(webSocket, instance, magnifyMessage.id, EMagnifyCommand.LIST, JSON.stringify(await this.clusterInfo.coreApi.listNode()))
                            })
                            break
                    }
                    break

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
                    }
                    break

                case EMagnifyCommand.LISTCRD: {
                    console.log(`Get LISTCRD`)
                    if (!magnifyMessage.params || magnifyMessage.params.length<1) {
                        execResponse.data = `Insufficent parameters`
                        return execResponse
                    }
                    this.executeListCrd(webSocket, instance, magnifyMessage)
                    return
                }

                case EMagnifyCommand.CREATE: {
                    console.log(`Do CREATE`)
                    this.executeCreate(webSocket, instance, magnifyMessage.params!)
                    return
                }
                case EMagnifyCommand.EVENTS: {
                    console.log(`Do EVENT`)
                    this.executeEvents(webSocket, instance, magnifyMessage)
                    return
                }
                case EMagnifyCommand.APPLY: {
                    console.log(`Do APPLY`)
                    this.executeApply(webSocket, instance, magnifyMessage.params!)
                    return
                }
                case EMagnifyCommand.DELETE: {
                    console.log(`Do DELETE`)
                    this.executeDelete(webSocket, instance, magnifyMessage.params!)
                    return
                }
                case EMagnifyCommand.CONTROLLER: {
                    console.log(`Do RESTART`)
                    switch(magnifyMessage.params?.[0]) {
                        case 'restart':
                            restartController(magnifyMessage.params[1], magnifyMessage.params[2], magnifyMessage.params[3], this.clusterInfo)
                        break
                        case 'scale':
                            scaleController(magnifyMessage.params[1], magnifyMessage.params[2], magnifyMessage.params[3], +magnifyMessage.params[4], this.clusterInfo)
                        break
                    }
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
                    }
                    break
                }

                default:
                    let text = `Invalid command '${magnifyMessage.command}'. Valid commands are: ${Object.keys(EMagnifyCommand)}`
                    this.sendSignalMessage( webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, text)
                    break
            }
            return execResponse
        }
        catch (err) {
            console.log('Error executing magnify command')
            console.log(err)
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
                    console.log('Invalid class received:', param)
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
            console.error("Error:", err);
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
            console.log(err)
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
                    console.log(err)
                    this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instance.instanceId, JSON.stringify(err.body))
                }
            }
        }
        catch (err) {
            console.log('Error executing delete')
            console.log(err)
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
            console.log('Error executing create')
            console.log(err)
        }
    }

    private async executeApply (webSocket:WebSocket, instance:IInstance, params:string[]) {
        try {
            console.log(params)
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
            console.log('Error executing apply')
            console.log(err)
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
            console.log('Error executing events')
            console.log(err)
        }
    }

    private getUsage = async (scope:string) => {
        switch(scope) {
            case 'cluster':
                if (this.clusterInfo.metrics)
                    return this.clusterInfo.metrics.getClusterUsage()
                else
                    return {
                        cpu:0,
                        memory:0,
                        txmbps:0,
                        rxmbps:0
                    }
            default:
                console.log('Invalid scope por getUsage:', scope)
        }
        return {}
    }

    private getEventsForObject = async (command:string, namespace:string,  objectKind:string, objectName:string, limit:number) => {
        try {
            let res: CoreV1EventList = {
                items: []
            }
            switch(command) {
                case 'cluster':
                    res = await this.clusterInfo.coreApi.listEventForAllNamespaces()
                    break
                case 'object':
                    if (namespace!=='') {
                        res = await this.clusterInfo.coreApi.listNamespacedEvent( {
                            namespace: namespace,
                            fieldSelector: `involvedObject.name=${objectName},involvedObject.kind=${objectKind}`
                        })
                    }
                    else {
                        res = await this.clusterInfo.coreApi.listEventForAllNamespaces( {
                            fieldSelector: `involvedObject.name=${objectName},involvedObject.kind=${objectKind}`
                        })
                    }
                    break
            }

            res.items = res.items.sort( (a:any,b:any) => Date.parse(b.eventTime||b.lastTimestamp||b.firstTimestamp)-Date.parse(a.eventTime||a.lastTimestamp||a.firstTimestamp))
            if (limit>0) {
                return res.items.slice(0, limit)
            }
            else {
                return res.items
            }
        }
        catch (err) {
            console.error('Error getting events:', err);
        }
    }

}

export { MagnifyChannel }