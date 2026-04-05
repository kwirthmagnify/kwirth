import { FC } from 'react'
import { EChannelRefreshAction, IChannel, IChannelMessageAction, IChannelObject, IChannelRequirements, IContentProps, ISetupProps } from '../IChannel'
import { MagnifyInstanceConfig, MagnifyConfig } from './MagnifyConfig'
import { MagnifySetup, MagnifyIcon } from './MagnifySetup'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType, ESignalMessageEvent, IInstanceMessage, ISignalMessage } from "@jfvilas/kwirth-common"
import { EMagnifyCommand, MagnifyData, IMagnifyMessageResponse, IMagnifyData } from './MagnifyData'
import { MagnifyTabContent } from './MagnifyTabContent'
import { v4 as uuid } from 'uuid'
import { ENotifyLevel } from '../../tools/Global'
import { IFileObject } from '@jfvilas/react-file-manager'
import { convertSizeToBytes, coresToNumber, objectEqual } from './Tools'
import { MagnifyUserPreferences } from './components/MagnifyUserPreferences'

interface IMagnifyMessage extends IInstanceMessage {
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
    data?: any
}

class MagnifyChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = MagnifySetup
    TabContent: FC<IContentProps> = MagnifyTabContent
    channelId = 'magnify'
    tasks: number[] = []
    
    requirements:IChannelRequirements = {
        accessString: true,
        clusterUrl: true,
        clusterInfo: true,
        exit: true,
        frontChannels: true,
        metrics: true,
        notifier: true,
        notifications: true,
        setup: false,
        settings: false,
        palette: true,
        userSettings: true,
        webSocket: true,
    }
    
    getScope() { return 'magnify$read'}
    getChannelIcon(): JSX.Element { return MagnifyIcon }

    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility:boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        // very important: modifying 'files' re-renders, so it is important to decide if it os necesary (it depends on current view in file manager)

        let msg:IMagnifyMessage = JSON.parse(wsEvent.data)
        let magnifyData:IMagnifyData = channelObject.data

        if (magnifyData.userPreferences.tracing) {
            console.warn(new Date().toTimeString())
            console.log(JSON.parse(wsEvent.data))
        }
        // Implement commandAsync responses management
        if (msg.id && magnifyData.pendingWebSocketRequests.has(msg.id)) {
            const resolve = magnifyData.pendingWebSocketRequests.get(msg.id)
            resolve!(wsEvent.data)
            magnifyData.pendingWebSocketRequests.delete(msg.id)
            return {
                action: EChannelRefreshAction.NONE
            }
        }

        // general message management
        switch (msg.type) {
            case EInstanceMessageType.DATA: {
                let response = JSON.parse(wsEvent.data) as IMagnifyMessageResponse
                switch(response.action) {
                    case EInstanceMessageAction.COMMAND: {
                        switch(response.command) {
                            case EMagnifyCommand.CLUSTERINFO:
                                let cInfo = JSON.parse(response.data)
                                magnifyData.clusterInfo = cInfo
                                break
                            case EMagnifyCommand.USAGE:
                                let usageData = JSON.parse(response.data)
                                usageData.timestamp = new Date().toLocaleTimeString('en-GB')
                                magnifyData.metricsCluster.push(usageData)
                                if (magnifyData.metricsCluster.length>50) magnifyData.metricsCluster.shift()
                                channelObject.data?.refreshUsage?.()                                
                                break
                            case EMagnifyCommand.POD:
                                let podData = JSON.parse(response.data) as string[]
                                switch(podData[0]) {
                                    case 'work':
                                        // response should be received when pod is in running phase
                                        // so we will launch shell from 'poddata[1]'
                                        // +++  we are now testing status in front (reviewing files for specific classes)
                                        break
                                }
                                break
                            case EMagnifyCommand.LIST:
                            case EMagnifyCommand.LISTCRD:
                                let content = JSON.parse(response.data)
                                if (content.kind.endsWith('List')) {
                                    if (content.items && content.items.forEach) {
                                        content.items.forEach( (item:any) => this.loadObject('NONE', channelObject, content.kind.replace('List',''), magnifyData, item) )
                                    }
                                    else {
                                        console.log(content)
                                    }
                                }
                                else {
                                    channelObject.notify?.(this.channelId, ENotifyLevel.ERROR, 'Unexpected list: '+ content.kind)
                                }
                                magnifyData.files = [...magnifyData.files]
                                return {
                                    action: EChannelRefreshAction.REFRESH
                                }
                            case EMagnifyCommand.EVENTS:
                                let result:{type:string, events:any} = JSON.parse(response.data)
                                if (result.type==='cluster' && result.events) {
                                    for (let event of result.events) {
                                        let exist = false
                                        for (let existingEvent of magnifyData.clusterEvents) {
                                            if (objectEqual(existingEvent, event)) {
                                                exist = true
                                                break
                                            }
                                        }
                                        if (!exist) {
                                            magnifyData.clusterEvents.push(event)
                                            magnifyData.clusterEvents = magnifyData.clusterEvents.sort( (a:any,b:any) => Date.parse(b.eventTime||b.lastTimestamp||b.firstTimestamp)-Date.parse(a.eventTime||a.lastTimestamp||a.firstTimestamp))
                                        }
                                    }
                                }
                                else {
                                    if (result.events) {
                                        result.events = result.events.sort( (a:any,b:any) => Date.parse(b.eventTime||b.lastTimestamp||b.firstTimestamp)-Date.parse(a.eventTime||a.lastTimestamp||a.firstTimestamp))
                                        for (let event of result.events) {
                                            let path = buildPath(event.involvedObject.kind, event.involvedObject.name, event.involvedObject.namespace)
                                            let obj = magnifyData.files.find(f => f.path === path)
                                            if ((obj && obj?.data.origin.metadata.namespace === event.involvedObject.namespace) || (obj && !event.involvedObject.namespace)) {
                                                if (!obj.data.events) {
                                                    obj.data.events = {}
                                                    obj.data.events.list = []
                                                }
                                                obj.data.events.list.push(event)
                                            }
                                        }
                                        magnifyData.files = [...magnifyData.files]
                                    }
                                }
                                return {
                                    action: EChannelRefreshAction.REFRESH
                                }
                            case EMagnifyCommand.K8EVENT:
                                switch(response.event) {
                                    case 'ADDED':
                                    case 'MODIFIED':
                                        this.loadObject(response.event, channelObject, response.data.kind, magnifyData, response.data)
                                        magnifyData.files = [...magnifyData.files]
                                        break
                                    case 'DELETED':
                                        if (response.data.kind==='Namespace' && magnifyData.updateNamespaces) magnifyData.updateNamespaces('DELETED', response.data.metadata.name)
                                        let path = buildPath(response.data.kind, response.data.metadata.name, response.data.metadata.namespace)
                                        if (path.startsWith('//')) {
                                            // no top level section found (like custom, workload, network...), so this could be a CRDi
                                            magnifyData.files = magnifyData.files.filter(f => f.path !== '/custom/'+response.data.kind+'/'+response.data.metadata.name + (response.data.metadata.namespace? ':'+response.data.metadata.namespace : ''))
                                        }
                                        else {
                                            magnifyData.files = magnifyData.files.filter (f => f.path !== path)
                                            if (path.startsWith('/custom/CustomResourceDefinition/')) {
                                                let kind = response.data?.spec?.names?.kind
                                                if (kind) {
                                                    magnifyData.files = magnifyData.files.filter(f => !f.path.startsWith(`/custom/${kind}/`))
                                                    magnifyData.files = magnifyData.files.filter(f => f.path !== `/custom/${kind}`)
                                                }
                                            }
                                        }
                                        break
                                }
                                return {
                                    action: EChannelRefreshAction.REFRESH
                                }
                            case EMagnifyCommand.DELETE: {
                                console.log('DEL', response.data)
                                let content = JSON.parse(response.data)
                                if (content.status==='Success') {
                                    // let fname = content.metadata.object
                                    // magnifyData.files = magnifyData.files.filter(f => f.path !== fname)
                                    // magnifyData.files = magnifyData.files.filter(f => !f.path.startsWith(fname+'/'))
                                }
                                else {
                                    channelObject.notify?.(this.channelId, ENotifyLevel.ERROR, 'ERROR: '+ (content.text || content.message))
                                }
                                return {
                                    action: EChannelRefreshAction.REFRESH
                                }
                            }
                            case EMagnifyCommand.CREATE: {
                                let content = JSON.parse(response.data)
                                if (content.status==='Success') {
                                    channelObject.notify?.(this.channelId, ENotifyLevel.INFO, 'Created: '+ (content.text || content.message))
                                }
                                else {
                                    channelObject.notify?.(this.channelId, ENotifyLevel.ERROR, 'ERROR: '+ (content.text || content.message))
                                }
                                return {
                                    action: EChannelRefreshAction.REFRESH
                                }
                            }
                        }
                    }
                }
                return {
                    action: EChannelRefreshAction.NONE
                }
            }
            case EInstanceMessageType.SIGNAL:
                let signalMessage = JSON.parse(wsEvent.data) as ISignalMessage
                if (signalMessage.flow === EInstanceMessageFlow.RESPONSE) {
                    if (signalMessage.action === EInstanceMessageAction.START) {
                        channelObject.instanceId = signalMessage.instance
                        // +++ improve setTimeout mechanism (find something better!!!)
                        setTimeout( () => {
                            requestClusterInfo(channelObject)
                            requestList(channelObject)
                            subscribe(channelObject)
                        }, 300)
                    }
                    else if (signalMessage.action === EInstanceMessageAction.COMMAND) {
                        if (signalMessage.text) channelObject.notify?.(this.channelId, signalMessage.level as any as ENotifyLevel, signalMessage.text)
                    }
                }
                else if (signalMessage.flow === EInstanceMessageFlow.UNSOLICITED) {
                    if (signalMessage.event === ESignalMessageEvent.ADD) {
                    }
                    else if (signalMessage.event === ESignalMessageEvent.DELETE) {
                    }
                    else {
                        if (signalMessage.text) channelObject.notify?.(this.channelId, signalMessage.level as any as ENotifyLevel, signalMessage.text)
                    }
                }
                return {
                    action: EChannelRefreshAction.REFRESH
                }
            default:
                console.log(`Invalid message type ${msg.type}`)
                return {
                    action: EChannelRefreshAction.NONE
                }
        }
    }

    async initChannel(channelObject:IChannelObject): Promise<boolean> {
        let config = new MagnifyConfig()
        //config.notify = this.notify

        channelObject.instanceConfig = new MagnifyInstanceConfig()
        channelObject.config = config
        channelObject.data = new MagnifyData() as IMagnifyData
        if (channelObject.readChannelUserPreferences) channelObject.data.userPreferences = await channelObject.readChannelUserPreferences(this.channelId)
        if (!channelObject.data.userPreferences) channelObject.data.userPreferences = new MagnifyUserPreferences()

        return false
    }

    startChannel(channelObject:IChannelObject): boolean {
        let magnifyData:IMagnifyData = channelObject.data
        magnifyData.paused = false
        magnifyData.started = true
        magnifyData.files = magnifyData.files.filter(f => f.isDirectory && f.path.split('/').length-1 <= 2)
        magnifyData.files = magnifyData.files.filter(f => f.class!=='crdGroup')
        magnifyData.currentPath='/overview'
        this.launchTasks(channelObject)
        return true
    }

    pauseChannel(channelObject:IChannelObject): boolean {
        let magnifyData:IMagnifyData = channelObject.data
        magnifyData.paused = true
        return false
    }

    continueChannel(channelObject:IChannelObject): boolean {
        let magnifyData:IMagnifyData = channelObject.data
        magnifyData.paused = false
        return true
    }

    stopChannel(channelObject: IChannelObject): boolean {
        let magnifyData:IMagnifyData = channelObject.data
        magnifyData.paused = false
        magnifyData.started = false
        this.tasks.forEach( (id) => clearInterval(id))
        return true
    }

    socketDisconnected(channelObject: IChannelObject): boolean {
        return false
    }
    
    socketReconnect(channelObject: IChannelObject): boolean {
        return false
    }

    //*************************************************************************************************
    //*************************************************************************************************
    //*************************************************************************************************

    launchTasks = (channelObject:IChannelObject) => {

        this.tasks.push (window.setInterval( (c:IChannelObject) => {
            let magnifyMessage:IMagnifyMessage = {
                msgtype: 'magnifymessage',
                accessKey: channelObject.accessString!,
                instance: channelObject.instanceId,
                id: uuid(),
                namespace: '',
                group: '',
                pod: '',
                container: '',
                command: EMagnifyCommand.USAGE,
                action: EInstanceMessageAction.COMMAND,
                flow: EInstanceMessageFlow.REQUEST,
                type: EInstanceMessageType.DATA,
                channel: this.channelId,
                params: [ 'cluster' ]
            }
            if (channelObject.webSocket) channelObject.webSocket.send(JSON.stringify( magnifyMessage ))

        }, 15000, channelObject))

        
        // pod cpu/mem & cluster cpu/mem
        this.tasks.push(window.setInterval( (c:IChannelObject) => {
            let magnifyMessage:IMagnifyMessage = {
                msgtype: 'magnifymessage',
                accessKey: channelObject.accessString!,
                instance: channelObject.instanceId,
                id: uuid(),
                namespace: '',
                group: '',
                pod: '',
                container: '',
                command: EMagnifyCommand.LIST,
                action: EInstanceMessageAction.COMMAND,
                flow: EInstanceMessageFlow.REQUEST,
                type: EInstanceMessageType.DATA,
                channel: this.channelId,
                params: [ 'PodMetrics', 'NodeMetrics' ]
            }
            if (channelObject.webSocket) channelObject.webSocket.send(JSON.stringify( magnifyMessage ))
        }, 30000, channelObject))

        // request cluster events
        this.tasks.push (window.setInterval ( (c:IChannelObject) => {
            let magnifyMessage:IMagnifyMessage = {
                msgtype: 'magnifymessage',
                accessKey: c.accessString!,
                instance: c.instanceId,
                id: uuid(),
                namespace: '',
                group: '',
                pod: '',
                container: '',
                command: EMagnifyCommand.EVENTS,
                action: EInstanceMessageAction.COMMAND,
                flow: EInstanceMessageFlow.REQUEST,
                type: EInstanceMessageType.DATA,
                channel: this.channelId,
                params: [ 'cluster', '', '', '', '25']
            }
            if (c.webSocket) c.webSocket.send(JSON.stringify( magnifyMessage ))
        }, 10000, channelObject))

    }

    loadObject (event:string, channelObject:IChannelObject, kind:string, magnifyData:IMagnifyData, obj:any): void {
        if (obj.metadata?.managedFields) {
            if (!magnifyData.userPreferences.dataManagedFields) delete obj.metadata.managedFields
        }
        if (kind==='Pod') this.loadPod(magnifyData, obj)
        else if (kind==='ConfigMap') this.loadConfigMap(magnifyData, obj)
        else if (kind==='Secret') this.loadSecret(magnifyData, obj)
        else if (kind==='ResourceQuota') this.loadResourceQuota(magnifyData, obj)
        else if (kind==='LimitRange') this.loadLimitRange(magnifyData, obj)
        else if (kind==='HorizontalPodAutoscaler') this.loadHorizontalPodAutoscaler(magnifyData, obj)
        else if (kind==='PodDisruptionBudget') this.loadPodDisruptionBudget(magnifyData, obj)
        else if (kind==='PriorityClass') this.loadPriorityClass(magnifyData, obj)
        else if (kind==='RuntimeClass') this.loadRuntimeClass(magnifyData, obj)
        else if (kind==='Lease') this.loadLease(magnifyData, obj)
        else if (kind==='ValidatingWebhookConfiguration') this.loadValidatingWebhookConfiguration(magnifyData, obj)
        else if (kind==='MutatingWebhookConfiguration') this.loadMutatingWebhookConfiguration(magnifyData, obj)
        else if (kind==='Namespace') this.loadNamespace(magnifyData, obj)
        else if (kind==='Node') this.loadNode(magnifyData, obj)
        else if (kind==='Service') this.loadService(magnifyData, obj)
        else if (kind==='Endpoints') this.loadEndpoints(magnifyData, obj)
        else if (kind==='Ingress') this.loadIngress(magnifyData, obj)
        else if (kind==='IngressClass') this.loadIngressClass(magnifyData, obj)
        else if (kind==='NetworkPolicy') this.loadNetworkPolicy(magnifyData, obj)
        else if (kind==='Deployment') this.loadDeployment(magnifyData, obj)
        else if (kind==='DaemonSet') this.loadDaemonSet(magnifyData, obj)
        else if (kind==='ReplicaSet') this.loadReplicaSet(magnifyData, obj)
        else if (kind==='ReplicationController') this.loadReplicationController(magnifyData, obj)
        else if (kind==='StatefulSet') this.loadStatefulSet(magnifyData, obj)
        else if (kind==='Job') this.loadJob(magnifyData, obj)
        else if (kind==='CronJob') this.loadCronJob(magnifyData, obj)
        else if (kind==='PersistentVolumeClaim') this.loadPersistentVolumeClaim(magnifyData, obj)
        else if (kind==='PersistentVolume') this.loadPersistentVolume(magnifyData, obj)
        else if (kind==='StorageClass') this.loadStorageClass(magnifyData, obj)
        else if (kind==='VolumeAttachment') this.loadVolumeAttachment(magnifyData, obj)
        else if (kind==='CSIDriver') this.loadCSIDriver(magnifyData, obj)
        else if (kind==='CSINode') this.loadCSINode(magnifyData, obj)
        else if (kind==='CSIStorageCapacity') this.loadCSIStorageCapacity(magnifyData, obj)
        else if (kind==='ServiceAccount') this.loadServiceAccount(magnifyData, obj)
        else if (kind==='ClusterRole') this.loadClusterRole(magnifyData, obj)
        else if (kind==='Role') this.loadRole(magnifyData, obj)
        else if (kind==='ClusterRoleBinding') this.loadClusterRoleBinding(magnifyData, obj)
        else if (kind==='RoleBinding') this.loadRoleBinding(magnifyData, obj)
        else if (kind==='V1APIResource') this.loadApiResource(magnifyData, obj)
        else if (kind==='CustomResourceDefinition') this.loadCustomResourceDefinition(channelObject, magnifyData, obj)
        else if (kind==='PodMetrics') this.loadPodMetrics(magnifyData, obj)
        else if (kind==='NodeMetrics') this.loadNodeMetrics(magnifyData, obj)
        else if (kind==='ComponentStatus') this.loadComponentStatus(magnifyData, obj)
        else {
            if (!this.loadCustomResourceDefinitionInstance(magnifyData, obj)) {
                console.log('*** ERR INVALID Kind:', kind)
            }
        }
    }

    upsertObject(magnifyData:IMagnifyData, obj:IFileObject): void {
        let i=magnifyData.files.findIndex(f => f.path === obj.path)
        if (i>=0)
            magnifyData.files[i]=obj
        else
            magnifyData.files.push(obj)
    }

    loadNamespace(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'v1'
        obj.kind = 'Namespace'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name,
            isDirectory: false,
            path: buildPath('Namespace', obj.metadata.name, undefined),
            class: 'Namespace',
            data: {
                creationTimestamp: obj.metadata.creationTimestamp,
                status: obj.status?.phase,
                origin: obj
            }
        })
        if (magnifyData.updateNamespaces) magnifyData.updateNamespaces('ADD', obj.metadata.name)
    }

    loadConfigMap(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'v1'
        obj.kind = 'ConfigMap'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('ConfigMap', obj.metadata.name, obj.metadata.namespace),
            class: 'ConfigMap',
            data: {
                namespace: obj.metadata.namespace,
                keys: obj.data? Object.keys(obj.data).join(', ') : '',
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadSecret(magnifyData:IMagnifyData, obj:any): void {
        if (!magnifyData.userPreferences.dataHelm) {
            if (obj.metadata.name.startsWith('sh.helm.release.')) return
        }
        obj.apiVersion = 'v1'
        obj.kind = 'Secret'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('Secret', obj.metadata.name, obj.metadata.namespace),
            class: 'Secret',
            data: {
                namespace: obj.metadata.namespace,
                keys: obj.data? Object.keys(obj.data).join(', ') : '',
                creationTimestamp: obj.metadata.creationTimestamp,
                type: obj.type,
                origin: obj
            }
        })
    }

    loadResourceQuota(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'v1'
        obj.kind = 'ResourceQuota'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('ResourceQuota', obj.metadata.name, obj.metadata.namespace),
            class: 'ResourceQuota',
            data: {
                namespace: obj.metadata.namespace,
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadLimitRange(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'v1'
        obj.kind = 'LimitRange'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('LimitRange', obj.metadata.name, obj.metadata.namespace),
            class: 'LimitRange',
            data: {
                namespace: obj.metadata.namespace,
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadHorizontalPodAutoscaler(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'autoscaling/v2'
        obj.kind = 'HorizontalPodAutoscaler'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('HorizontalPodAutoscaler', obj.metadata.name, obj.metadata.namespace),
            class: 'HorizontalPodAutoscaler',
            data: {
                namespace: obj.metadata.namespace,
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadPodDisruptionBudget(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'policy/v1'
        obj.kind = 'PodDisruptionBudget'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('PodDisruptionBudget', obj.metadata.name, obj.metadata.namespace),
            class: 'PodDisruptionBudget',
            data: {
                namespace: obj.metadata.namespace,
                minAvailable: obj.spec.minAvailable || '',
                maxUnavailable: obj.spec.maxUnavailable || '',
                currentHealthy: obj.status.currentHealthy,
                desiredHealthy: obj.status.desiredHealthy,
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadPriorityClass(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'scheduling.k8s.io/v1'
        obj.kind = 'PriorityClass'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('PriorityClass', obj.metadata.name, obj.metadata.namespace),
            class: 'PriorityClass',
            data: {
                namespace: obj.metadata.namespace,
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadRuntimeClass(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'node.k8s.io/v1'
        obj.kind = 'RuntimeClass'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('RuntimeClass', obj.metadata.name, obj.metadata.namespace),
            class: 'RuntimeClass',
            data: {
                namespace: obj.metadata.namespace,
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadLease(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'node.k8s.io/v1'
        obj.kind = 'Lease'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('Lease', obj.metadata.name, obj.metadata.namespace),
            class: 'Lease',
            data: {
                namespace: obj.metadata.namespace,
                holder: obj.spec.holderIdentity,
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadValidatingWebhookConfiguration(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'admissionregistration.k8s.io/v1'
        obj.kind = 'ValidatingWebhookConfiguration'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name,
            isDirectory: false,
            path: buildPath('ValidatingWebhookConfiguration', obj.metadata.name, undefined),
            class: 'ValidatingWebhookConfiguration',
            data: {
                webhooks: obj.webhooks.length,
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadMutatingWebhookConfiguration(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'admissionregistration.k8s.io/v1'
        obj.kind = 'MutatingWebhookConfiguration'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name,
            isDirectory: false,
            path: buildPath('MutatingWebhookConfiguration', obj.metadata.name, undefined),
            class: 'MutatingWebhookConfiguration',
            data: {
                webhooks: obj.webhooks.length,
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadNode(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'v1'
        obj.kind = 'Node'
        let roles:string[] = []
        Object.keys(obj.metadata.labels).forEach(c => {
            if (c.startsWith('node-role.kubernetes.io')) {
                if (obj.metadata.labels[c]==='true') roles.push(c.substring(24))
            }
        })
        obj.status.capacity.cpu = coresToNumber(obj.status.capacity.cpu)
        obj.status.allocatable.cpu = coresToNumber(obj.status.allocatable.cpu)
        obj.status.capacity.memory = convertSizeToBytes(obj.status.capacity.memory)
        obj.status.allocatable.memory = convertSizeToBytes(obj.status.allocatable.memory)
        this.upsertObject(magnifyData, {
            name: obj.metadata.name,
            isDirectory: false,
            path: buildPath('Node', obj.metadata.name, undefined),
            class: 'Node',
            data: {
                creationTimestamp: obj.metadata.creationTimestamp,
                taints: obj.spec.taints? obj.spec.taints.length : 0,
                roles: roles.join(','),
                conditions: obj.spec.unschedulable === true? 'Unschedulable' : obj.status.conditions.filter((c:any) => c.status==='True').map((c:any) => c.type).join(' '),
                version: obj.status.nodeInfo.kubeletVersion,
                origin: obj
            }
        })

        // we first remove all references from images to this node
        for (let image of magnifyData.files.filter(f => f.class==='Image')){
            let i = image.data.origin.nodes.indexOf(obj.metadata.name)
            if (i>=0) (image.data.origin.nodes as string[]).splice(i, 1)
        }
        magnifyData.files = magnifyData.files.filter(f => !(f.class==='Image' && f.data.origin.nodes.length===0))

        // we then add all images in this node
        for (let image of obj.status?.images) {
            let size = image.sizeBytes
            let names:string[] = []

            if (image.names) {
                names = image.names.filter((n:any) => !n.includes('@'))
                if (names.length===0) names = image.names
            }
            else {
                names = ['unnamed-image']
            }

            let existing = magnifyData.files.find(f => f.path === '/cluster/Image/'+names[0])
            if (existing) {
                if (!existing.data.origin.nodes.includes(obj.metadata.name)) existing.data.origin.nodes.push(obj.metadata.name)
            }
            else {
                let registry = undefined
                let imageName = undefined
                let tag = undefined
                let sha = undefined
                const regex = /^(?:((?:[a-z0-9-]+\.)+[a-z0-9]+(?::\d+)?)\/)?((?:[a-z0-9._-]+\/)*[a-z0-9._-]+)(?::([a-z0-9._-]+))?(?:@(sha256:[a-f0-9]{64}))?$/i
                if (image.names) {
                    for (let x of image.names) {
                        const match = x.match(regex)
                        if (match) {
                            if (!registry) registry = match[1]
                            if (!imageName) imageName = match[2]
                            if (!tag) tag = match[3]
                            if (!sha) sha = match[4]
                        }
                    }
                }
                let newImage:IFileObject = {
                    name: names[0],
                    displayName: imageName,
                    isDirectory: false,
                    path: '/cluster/Image/'+names[0],
                    class: 'Image',
                    data: {
                        size: size,
                        tag: tag,
                        origin: {
                            kind: 'Image',
                            metadata: {
                                name: names[0]
                            },
                            name: names[0],
                            displayName: names[0],
                            registry,
                            tag,
                            sha,
                            names: image.names,
                            nodes: [obj.metadata.name],
                        }
                    }
                }
                magnifyData.files.push(newImage)
            }
        }
    }

    loadNodeMetrics(magnifyData:IMagnifyData, obj:any): void {
        let nodeName = obj.metadata?.name
        let node = magnifyData.files.find(f => f.class==='Node' && f.data.origin.metadata.name === nodeName)
        if (node) {
            let cores = node.data.origin.status.capacity.cpu  // converted to number when loading node
            node.data.cpu = (coresToNumber(obj.usage.cpu)/cores*100).toFixed(2)+'%'
            node.data.memory = (convertSizeToBytes(obj.usage.memory)/node.data.origin.status.capacity.memory*100).toFixed(2)+'%'
        }
    }

    loadService(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'v1'
        obj.kind = 'Service'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('Service', obj.metadata.name, obj.metadata.namespace),
            class: 'Service',
            data: {
                namespace: obj.metadata.namespace,
                type: obj.spec.type,
                clusterIp: obj.spec.clusterIP,
                ports: obj.spec?.ports?.map((p:any) => p.port+'/'+p.protocol).join(',') || '-',
                externalIp: obj.status?.loadBalancer?.ingress?.map((x:any) => x.ip).join(',') || '-',
                selector: '#',
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadEndpoints(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'v1'
        obj.kind = 'Endpoints'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('Endpoints', obj.metadata.name, obj.metadata.namespace),
            class: 'Endpoints',
            data: {
                namespace: obj.metadata.namespace,
                endpoints: obj.subsets ? obj.subsets?.map((subset:any) => subset.addresses?.map((a:any) => subset.ports?.map((p:any) => a.ip+':'+p.port)).join(',')) :'',
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadIngress(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'networking.k8s.io/v1'
        obj.kind = 'Ingress'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('Ingress', obj.metadata.name, obj.metadata.namespace),
            class: 'Ingress',
            data: {
                namespace: obj.metadata.namespace,
                loadBalancers: obj.status?.loadBalancer?.ingress?.map((x:any)=> x.ip).join(','),
                rules: '#',
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadIngressClass(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'networking.k8s.io/v1'
        obj.kind = 'IngressClass'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('IngressClass', obj.metadata.name, obj.metadata.namespace),
            class: 'IngressClass',
            data: {
                namespace: obj.metadata.namespace,
                controller: obj.spec.controller,
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadNetworkPolicy(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'networking.k8s.io/v1'
        obj.kind = 'NetworkPolicy'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('NetworkPolicy', obj.metadata.name, obj.metadata.namespace),
            class: 'NetworkPolicy',
            data: {
                namespace: obj.metadata.namespace,
                policyTypes: obj.spec.policyTypes?obj.spec.policyTypes.join(',') : '',
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadDeployment(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'apps/v1'
        obj.kind = 'Deployment'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('Deployment', obj.metadata.name, obj.metadata.namespace),
            class: 'Deployment',
            data: {
                namespace: obj.metadata.namespace,
                pods: (obj.status.readyReplicas || 0) + '/' + (obj.status.replicas || 0),
                replicas: obj.status.replicas || 0,
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadDaemonSet(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'apps/v1'
        obj.kind = 'DaemonSet'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('DaemonSet', obj.metadata.name, obj.metadata.namespace),
            class: 'DaemonSet',
            data: {
                namespace: obj.metadata.namespace,
                desired: obj.status.desiredNumberScheduled,
                current: obj.status.currentNumberScheduled,
                ready: obj.status.numberReady,
                upToDate: obj.status.updatedNumberScheduled,
                available: obj.status.numberAvailable,
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadReplicaSet(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'apps/v1'
        obj.kind = 'ReplicaSet'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('ReplicaSet', obj.metadata.name, obj.metadata.namespace),
            class: 'ReplicaSet',
            data: {
                namespace: obj.metadata.namespace,
                desired: obj.status.replicas || 0,
                current: obj.status.availableReplicas || 0,
                ready: obj.status.readyReplicas || 0,
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadReplicationController(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'v1'
        obj.kind = 'ReplicationController'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('ReplicationController', obj.metadata.name, obj.metadata.namespace),
            class: 'ReplicationController',
            data: {
                namespace: obj.metadata.namespace,
                replicas: obj.status.replicas || 0,
                desired: obj.spec.replicas || 0,
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadStatefulSet(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'apps/v1'
        obj.kind = 'StatefulSet'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('StatefulSet', obj.metadata.name, obj.metadata.namespace),
            class: 'StatefulSet',
            data: {
                namespace: obj.metadata.namespace,
                pods: (obj.status.readyReplicas || 0) + '/' + (obj.status.replicas || 0), 
                replicas: obj.spec.replicas || 0,
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadJob(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'batch/v1'
        obj.kind = 'Job'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('Job', obj.metadata.name, obj.metadata.namespace),
            class: 'Job',
            data: {
                namespace: obj.metadata.namespace,
                completions: obj.spec.completions + '/' + obj.spec.parallelism,
                conditions: obj.status.conditions? obj.status.conditions.filter((c:any) => c.status.toLowerCase()==='true').map ((c:any) => c.name): '-',
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadCronJob(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'batch/v1'
        obj.kind = 'CronJob'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('CronJob', obj.metadata.name, obj.metadata.namespace),
            class: 'CronJob',
            data: {
                namespace: obj.metadata.namespace,
                schedule: obj.spec.schedule,
                suspend: obj.spec.suspend || '-',
                active: '-',
                lastSchedule: obj.status.lastScheduleTime,
                nextExecution: '-',
                timezone: '-',
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadPersistentVolumeClaim(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'v1'
        obj.kind = 'PersistentVolumeClaim'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('PersistentVolumeClaim', obj.metadata.name, obj.metadata.namespace),
            class: 'PersistentVolumeClaim',
            data: {
                namespace: obj.metadata.namespace,
                storageClass: obj.spec.storageClassName,
                size: obj.status?.capacity?.storage? convertSizeToBytes(obj.status?.capacity?.storage): 0,
                creationTimestamp: obj.metadata.creationTimestamp,
                status: obj.status.phase,
                origin: obj
            }
        })
    }

    loadPersistentVolume(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'v1'
        obj.kind = 'PersistentVolume'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name,
            isDirectory: false,
            path: buildPath('PersistentVolume', obj.metadata.name, undefined),
            class: 'PersistentVolume',
            data: {
                storageClass: obj.spec?.storageClassName,
                size: obj.status?.capacity?.storage? convertSizeToBytes(obj.status?.capacity?.storage): 0,
                claim: obj.spec?.claimRef?.name,
                creationTimestamp: obj.metadata?.creationTimestamp,
                status: obj.status?.phase,
                origin: obj
            }
        })
    }

    loadStorageClass(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'storage.k8s.io/v1'
        obj.kind = 'StorageClass'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name,
            isDirectory: false,
            path: buildPath('StorageClass', obj.metadata.name, undefined),
            class: 'StorageClass',
            data: {
                provisioner: obj.provisioner,
                reclaimPolicy: obj.reclaimPolicy,
                default: (obj.metadata?.annotations && obj.metadata.annotations['storageclass.kubernetes.io/is-default-class'] === 'true'? 'Yes':'') || '',
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadVolumeAttachment(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'storage.k8s.io/v1'
        obj.kind = 'VolumeAttachment'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name,
            isDirectory: false,
            path: buildPath('VolumeAttachment', obj.metadata.name, undefined),
            class: 'VolumeAttachment',
            data: {
                attacher: obj.spec.attacher,
                nodeName: obj.spec.nodeName,
                source: obj.spec.source?.persistentVolumeName||'',
                status: obj.status.attached? 'attached' : 'n/a',
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadCSIDriver(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'storage.k8s.io/v1'
        obj.kind = 'CSIDriver'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name,
            isDirectory: false,
            path: buildPath('CSIDriver', obj.metadata.name, undefined),
            class: 'CSIDriver',
            data: {
                attachRequired: obj.spec.attachRequired? 'Yes':'No',
                storageCapacity: obj.spec.storageCapacity? 'Yes':'No',
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadCSINode(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'storage.k8s.io/v1'
        obj.kind = 'CSINode'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name,
            isDirectory: false,
            path: buildPath('CSINode', obj.metadata.name, undefined),
            class: 'CSINode',
            data: {
                drivers: obj.spec.drivers?.map((d:any) => d.name).join(','),
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadCSIStorageCapacity(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'storage.k8s.io/v1'
        obj.kind = 'CSIStorageCapacity'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name,
            isDirectory: false,
            path: buildPath('CSIStorageCapacity', obj.metadata.name, undefined),
            class: 'CSIStorageCapacity',
            data: {
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadServiceAccount(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'v1'
        obj.kind = 'ServiceAccount'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('ServiceAccount', obj.metadata.name, obj.metadata.namespace),
            class: 'ServiceAccount',
            data: {
                namespace: obj.metadata.namespace,
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadClusterRole(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'rbac.authorization.k8s.io/v1'
        obj.kind = 'ClusterRole'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name,
            isDirectory: false,
            path: buildPath('ClusterRole', obj.metadata.name, undefined),
            class: 'ClusterRole',
            data: {
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadRole(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'rbac.authorization.k8s.io/v1'
        obj.kind = 'Role'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('Role', obj.metadata.name, obj.metadata.namespace),
            class: 'Role',
            data: {
                namespace: obj.metadata.namespace,
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadClusterRoleBinding(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'rbac.authorization.k8s.io/v1'
        obj.kind = 'ClusterRoleBinding'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name,
            isDirectory: false,
            path: buildPath('ClusterRoleBinding', obj.metadata.name, undefined),
            class: 'ClusterRoleBinding',
            data: {
                bindings: obj.subjects? obj.subjects.map((s:any) => s.name).join(',') : 'n/a',
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadRoleBinding(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'rbac.authorization.k8s.io/v1'
        obj.kind = 'RoleBinding'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('RoleBinding', obj.metadata.name, obj.metadata.namespace),
            class: 'RoleBinding',
            data: {
                namespace: obj.metadata.namespace,
                bindings: obj.subjects? obj.subjects.map((s:any) => s.name).join(',') : 'n/a',
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
    }

    loadApiResource(magnifyData:IMagnifyData, obj:any): void {
        obj.kindName = obj.kind
        obj.metadata = {
            name: obj.kind
        }
        obj.apiVersion = 'v1'
        obj.kind = 'V1APIResource'
        this.upsertObject(magnifyData, {
            name: obj.name,
            isDirectory: false,
            path: buildPath('V1APIResource', obj.name, undefined),
            class: 'V1APIResource',
            data: {
                kind: obj.kindName,
                singular: obj.singularName,
                namespaced: obj.namespaced? 'Yes':'',
                origin: obj
            }
        })
    }

    loadPod(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'v1'
        obj.kind = 'Pod'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name+':'+obj.metadata.namespace,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('Pod', obj.metadata.name, obj.metadata.namespace),
            class: 'Pod',
            data: {
                namespace: obj.metadata.namespace,
                controller: obj.metadata.ownerReferences && obj.metadata.ownerReferences.length>0? obj.metadata.ownerReferences[0].kind : '-',
                node: obj.spec.nodeName,
                startTime: obj.status.startTime,
                status: obj.metadata.deletionTimestamp? 'Terminating' : obj.status.phase,
                restartCount: obj.status.containerStatuses?.reduce((ac:number,c:any) => ac+=c.restartCount, 0) || 0,
                origin: obj
            }
        })
    }

    loadPodMetrics(magnifyData:IMagnifyData, obj:any): void {
        let podName = obj.metadata.name
        let podNamespace = obj.metadata.namespace
        let pod = magnifyData.files.find(f => f.class==='Pod' && f.data.origin.metadata.name === podName && f.data.origin.metadata.namespace === podNamespace)
        if (pod) {
            pod.data.metrics = obj
            pod.data.cpu = obj.containers.reduce ( (a:any,c:any) => a + coresToNumber(c.usage.cpu) , 0) as number
            pod.data.cpu = pod.data.cpu.toFixed(3)
            pod.data.memory = obj.containers.reduce ( (a:any,c:any) => a + convertSizeToBytes(c.usage.memory),0)
        }
    }

    loadComponentStatus(magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'v1'
        obj.kind = 'ComponentStatus'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name,
            isDirectory: false,
            path: buildPath('ComponentStatus', obj.metadata.name, undefined),
            class: 'ComponentStatus',
            data: {
                status: obj.conditions[0].status,
                message: obj.conditions[0].message,
                origin: obj
            }
        })
    }

    loadCustomResourceDefinition(channelObject:IChannelObject, magnifyData:IMagnifyData, obj:any): void {
        obj.apiVersion = 'apiextensions.k8s.io/v1'
        obj.kind = 'CustomResourceDefinition'
        let version = obj.spec.versions && obj.spec.versions.length>0? obj.spec.versions[0].name : '-'
        this.upsertObject(magnifyData, {
            name: obj.metadata.name,
            displayName: obj.metadata.name,
            isDirectory: false,
            path: buildPath('CustomResourceDefinition', obj.metadata.name, obj.metadata.namespace),
            class: 'CustomResourceDefinition',
            data: {
                group: obj.spec.group,
                version: version,
                scope: obj.spec.scope,
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })

        // for each CRD, we create an entry in the navigation pane for each resource type
        let file:IFileObject = {
            name: obj.spec.names.kind,
            isDirectory: true,
            path: '/custom/' + obj.spec.names.kind,
            class: 'crdGroup',
                children: 'crdInstance'
        }
        if (obj.spec.scope === 'Namespaced') {
            file.categories = ['namespace']
            file.children = 'crdNamespacedInstance'
        }
        this.upsertObject(magnifyData, file)
        
        // for each CRD, we request the exsistent objects in that CRD (these are the CRD instances)
        // this is an initial sync. objects created afterward will be automatically synced
        if (obj.spec.versions && obj.spec.versions.length>0) {
            let magnifyMessage:IMagnifyMessage = {
                msgtype: 'magnifymessage',
                accessKey: channelObject.accessString!,
                instance: channelObject.instanceId,
                id: uuid(),
                namespace: '',
                group: '',
                pod: '',
                container: '',
                command: EMagnifyCommand.LISTCRD,
                action: EInstanceMessageAction.COMMAND,
                flow: EInstanceMessageFlow.REQUEST,
                type: EInstanceMessageType.DATA,
                channel: this.channelId,
                params: [ obj.spec.group, obj.spec.versions[0].name, obj.spec.names.plural ]
            }
            channelObject.webSocket!.send(JSON.stringify( magnifyMessage ))
        }
    }

    loadCustomResourceDefinitionInstance(magnifyData:IMagnifyData, obj:any): boolean {
        this.upsertObject(magnifyData, {
            name: obj.metadata.name  + (obj.metadata.namespace? ':'+obj.metadata.namespace : ''),
            displayName: obj.metadata.name,
            isDirectory: false,
            path: '/custom/' + obj.kind + '/' + obj.metadata.name + (obj.metadata.namespace? ':'+obj.metadata.namespace : ''),
            class: 'crdInstance',
            data: {
                namespace: obj.metadata.namespace,
                source: obj.spec?.source,
                checksum: obj.spec?.checksum,
                creationTimestamp: obj.metadata.creationTimestamp,
                origin: obj
            }
        })
        return true
    }

}    

const buildPath = (kind:string, name:string, namespace:string|undefined) => {
    let section=''
    if (' V1APIResource Node Namespace ComponentStatus Image '.includes(' '+kind+' ')) section='cluster'
    if (' Pod Deployment DaemonSet ReplicaSet ReplicationController StatefulSet Job CronJob '.includes(' '+kind+' ')) section='workload'
    if (' ConfigMap Secret ResourceQuota LimitRange HorizontalPodAutoscaler PodDisruptionBudget PriorityClass RuntimeClass Lease ValidatingWebhookConfiguration MutatingWebhookConfiguration '.includes(' '+kind+' ')) section='config'
    if (' Service Endpoints Ingress IngressClass NetworkPolicy '.includes(' '+kind+' ')) section='network'
    if (' PersistentVolumeClaim PersistentVolume StorageClass VolumeAttachment CSINode CSIDriver CSIStorageCapacity '.includes(' '+kind+' ')) section='storage'
    if (' ServiceAccount ClusterRole Role ClusterRoleBinding RoleBinding '.includes(' '+kind+' ')) section='access'
    if (' CustomResourceDefinition '.includes(' '+kind+' ')) section='custom'
    if (' V1APIResource Node Namespace V1APIResource Image ComponentStatus ValidatingWebhookConfiguration MutatingWebhookConfiguration PersistentVolume StorageClass VolumeAttachment CSINode CSIDriver CSIStorageCapacity ClusterRole ClusterRoleBinding CustomResourceDefinition '.includes(' '+kind+' ')) 
        return '/'+section+'/'+kind+'/'+name
    else
        return '/'+section+'/'+kind+'/'+name+':'+namespace
}

const requestClusterInfo = (channelObject: IChannelObject) => {
    let magnifyMessage:IMagnifyMessage = {
        msgtype: 'magnifymessage',
        accessKey: channelObject.accessString!,
        instance: channelObject.instanceId,
        id: uuid(),
        namespace: '',
        group: '',
        pod: '',
        container: '',
        command: EMagnifyCommand.CLUSTERINFO,
        action: EInstanceMessageAction.COMMAND,
        flow: EInstanceMessageFlow.REQUEST,
        type: EInstanceMessageType.DATA,
        channel: channelObject.channelId,
        params: []
    }
    channelObject.webSocket!.send(JSON.stringify( magnifyMessage ))
}

const requestList = async (channelObject: IChannelObject) => {
    for (let i = 1;i<10;i++) {
        let magnifyData:IMagnifyData = channelObject.data
        let params = magnifyData.userPreferences?.dataConfig?.source.filter(k => k.priority===i).map(k => k.name)
        if (params.length===0) break
        let magnifyMessage:IMagnifyMessage = {
            msgtype: 'magnifymessage',
            accessKey: channelObject.accessString!,
            instance: channelObject.instanceId,
            id: uuid(),
            namespace: '',
            group: '',
            pod: '',
            container: '',
            command: EMagnifyCommand.LIST,
            action: EInstanceMessageAction.COMMAND,
            flow: EInstanceMessageFlow.REQUEST,
            type: EInstanceMessageType.DATA,
            channel: channelObject.channelId,
            params: [ ...params ]
        }
        channelObject.webSocket!.send(JSON.stringify( magnifyMessage ))
        await new Promise(resolve => setTimeout(resolve, 250))
    }
}

const subscribe = (channelObject: IChannelObject) => {
    let magnifyData:IMagnifyData = channelObject.data
    let magnifyMessage:IMagnifyMessage = {
        msgtype: 'magnifymessage',
        accessKey: channelObject.accessString!,
        instance: channelObject.instanceId,
        id: uuid(),
        namespace: '',
        group: '',
        pod: '',
        container: '',
        command: EMagnifyCommand.SUBSCRIBE,
        action: EInstanceMessageAction.COMMAND,
        flow: EInstanceMessageFlow.REQUEST,
        type: EInstanceMessageType.DATA,
        channel: channelObject.channelId,
        params: magnifyData.userPreferences?.dataConfig?.sync.map(k => k.name)
    }
    channelObject.webSocket!.send(JSON.stringify( magnifyMessage ))
}

export { MagnifyChannel, buildPath, requestList }