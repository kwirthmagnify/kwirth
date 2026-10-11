import {
    IInstanceConfig, ISignalMessage, IInstanceConfigResponse, IInstanceMessage, InstanceConfigScopeEnum, parseResources, accessKeyDeserialize,
    BackChannelData, EInstanceMessageFlow, EInstanceConfigObject, EInstanceConfigView, EInstanceMessageAction, EInstanceMessageType,
    ESignalMessageLevel, EInstanceMessageChannel, EClusterType, IBackChannelRequirements, IChannelInstances
} from '@kwirthmagnify/kwirth-common'
import { IBackChannelObject, IChannel } from '@kwirthmagnify/kwirth-common-back'
import { Request, Response } from 'express'
import { EMetricsConfigMode, IMetricsAssets, IMetricsInstanceConfig, IMetricsMessageResponse } from '../common/MetricsTypes'
import { IMetricsCluster, IMetricsNode, IMetricsValue } from './MetricsProviderTypes'

interface IAssetData {
    podNode: string
    podNamespace: string
    podGroup?: string
    podName: string
    containerName: string
}

interface IInstance {
    instanceId: string
    timeout?: NodeJS.Timeout
    working: boolean
    paused: boolean
    assets: IAssetData[]
    instanceConfig: IInstanceConfig
    interval: number
}

// The slice of a pod this channel reads (where it runs and who owns it)
interface IMetricsPod {
    metadata?: { ownerReferences?: { controller?: boolean, kind: string, name: string }[] }
    spec?: { nodeName?: string }
}

// The slice of clusterInfo this channel reads. Structural, since a plugin cannot import the core's ClusterInfo.
interface IMetricsClusterInfo {
    coreApi: { readNamespacedPod(params: { name: string, namespace: string }): Promise<IMetricsPod> }
    addSubscriber(providerId: string, subscriber: unknown, data: unknown): void
    removeSubscriber(providerId: string, subscriber: unknown): void
}

// 'implements IChannel' is what makes the compiler hold this class to the contract: without it, a method
// the core requires (getInstances, for instance) can be missing and the build still passes.
class MetricsChannel implements IChannel {
    readonly channelId = 'metrics'
    readonly requirements: IBackChannelRequirements = {
        storage: false,
        providers: ['metrics']
    }
    clusterInfo: IMetricsClusterInfo
    backChannelObject: IBackChannelObject
    metricsCluster: IMetricsCluster[] = []
    // list of intervals (and its associated metrics) that produce metrics streams
    webSockets: {
        ws:WebSocket,
        lastRefresh: number,
        instances: IInstance[]
    }[] = []

    constructor (clusterInfo:IMetricsClusterInfo, backChannelObject:IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
    }

    getChannelData(): BackChannelData {
        return {
            id: 'metrics',
            routable: false,
            pauseable: true,
            modifiable: true,
            reconnectable: true,
            metrics: true,
            sources: [ EClusterType.KUBERNETES ],
            endpoints: [],
            websocket: false,
            cluster: false,
            resourced: true
        }
    }

    getChannelScopeLevel(scope: string): number {
        return ['','snapshot','stream','cluster'].indexOf(scope)
    }

    startChannel = async () =>  {
        this.clusterInfo.addSubscriber('metrics', this, {})
    }

    // Called by the core before replacing this instance (hot reload) or uninstalling the plugin: drop the
    // provider subscription and every running interval, so the old instance does not keep working.
    cleanup = (): void => {
        try { this.clusterInfo.removeSubscriber('metrics', this) } catch { /* provider already gone */ }
        for (const socket of this.webSockets) {
            for (const instance of socket.instances) {
                if (instance.timeout) clearInterval(instance.timeout)
            }
        }
        this.webSockets = []
        this.metricsCluster = []
    }

    async processProviderEvent(providerId:string, event:unknown) : Promise<void> {
        switch(providerId) {
            case 'metrics':
                this.metricsCluster.push(event as IMetricsCluster)
                if (this.metricsCluster.length>100) this.metricsCluster.shift()
                break
            default:
                this.backChannelObject.logError?.(`Ignored provider event from ${providerId} to channel ${this.getChannelData().id}`)
        }
    }

    async endpointRequest(_endpoint:string, _req:Request, _res:Response) : Promise<void> {
    }

    async websocketRequest(_newWebSocket:WebSocket) : Promise<void> {
    }

    async processCommand (webSocket:WebSocket, instanceMessage:IInstanceMessage) : Promise<boolean> {
        // we treat IMMEDIATE same as REQUEST
        if (instanceMessage.flow === EInstanceMessageFlow.IMMEDIATE) {
            let resp = await this.executeImmediateCommand(instanceMessage)
            if (resp) webSocket.send(JSON.stringify(resp))
            return Boolean(resp)
        }
        else {
            return false
        }
    }

    private async executeImmediateCommand (instanceMessage:IInstanceMessage) : Promise<IMetricsMessageResponse> {
        this.backChannelObject.logInfo?.('Immediate request received')
        // we create a dummy instance for executing command, and we add the asset referenced in the immediate command received
        let iconfig:IInstanceConfig = {
            objects: EInstanceConfigObject.PODS,
            accessKey: '',
            scope: '',
            view: EInstanceConfigView.NONE,
            namespace: '',
            group: '',
            pod: '',
            container: '',
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.IMMEDIATE,
            type: EInstanceMessageType.DATA,
            channel: '',
            instance: ''
        }
        let instance: IInstance  = {
            instanceId: instanceMessage.instance,
            timeout: undefined,
            working: false,
            paused: false,
            assets: [],
            instanceConfig: iconfig,
            interval: 0
        }

        // we prepare a base response message
        let metricsMessageResponse:IMetricsMessageResponse = {
            msgtype: 'metricsmessageresponse',
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            channel: EInstanceMessageChannel.METRICS,
            type: EInstanceMessageType.DATA,
            instance: iconfig.instance,
            assets: [],
            namespace: iconfig.namespace,
            group: '',
            pod: iconfig.pod,
            timestamp: Date.now(),
            container: ''
        }
        this.fillData(iconfig, instance, metricsMessageResponse)
        return metricsMessageResponse
    }

    containsAsset = (webSocket:WebSocket, podNamespace:string, podName:string, containerName:string): boolean => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            let instances = socket.instances
            if (instances) return instances.some(i => i.assets.some(a => a.podNamespace===podNamespace && a.podName===podName && a.containerName===containerName))
        }
        return false
    }

    // A connection counts while it carries an instance: one left with none is on its way out.
    getInstances(): IChannelInstances {
        const carrying = this.webSockets.filter(s => s.instances.length > 0)
        return { instances: carrying.reduce((n, s) => n + s.instances.length, 0), connections: carrying.length }
    }

    containsInstance(instanceId: string): boolean {
        for (var socket of this.webSockets) {
            var exists = socket.instances.find(i => i.instanceId === instanceId)
            if (exists) return true
        }
        return false
    }

    checkScopes = (instanceConfig:IInstanceConfig, scope: InstanceConfigScopeEnum) => {
        let resources = parseResources (accessKeyDeserialize(instanceConfig.accessKey).resources)
        let requiredLevel = this.getChannelScopeLevel(scope)
        let canPerform = resources.some(r => r.scopes.split(',').some(sc => this.getChannelScopeLevel(sc)>= requiredLevel))
        return canPerform
    }

    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> => {
        try {
            const podResponse = await this.clusterInfo.coreApi.readNamespacedPod({ name:podName, namespace:podNamespace })
            const owner = podResponse.metadata?.ownerReferences?.find(owner => owner.controller)
            const podNode = podResponse.spec?.nodeName
            let podGroup = undefined
            if (owner) {
                // group type is one of: replicationcontroller, replicaset, daemonset or statefulset (this is never 'deployment', since owner of pod is replicaset)
                podGroup = owner.kind.toLocaleLowerCase() + '+' + owner.name
            }
            else {
                this.backChannelObject.logInfo?.(`No owner found for ${podName}, assume pod/container without controller`)
            }

            switch ((instanceConfig.data as IMetricsInstanceConfig).mode) {
                case EMetricsConfigMode.SNAPSHOT: {
                    if (!this.checkScopes(instanceConfig, InstanceConfigScopeEnum.SNAPSHOT)) {
                        this.backChannelObject.logInfo?.('Insufficient scope for SNAPSHOT')
                        this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, 'Insufficient scope for SNAPSHOT', instanceConfig)
                        return false
                    }
                    if (podNode) {
                        this.backChannelObject.logInfo?.(`Send snapshot metrics for ${podNode}/${podNamespace}/${podGroup}/${podName}/${containerName}`)

                        let socket = this.webSockets.find(entry => entry.ws === webSocket)
                        if (!socket) {
                            this.backChannelObject.logInfo?.('No socket found for startInstance snapshot')
                            return false
                        }
                        let instances = socket.instances
                        let instance = instances?.find((instance) => instance.instanceId === instanceConfig.instance)
                        if (instance) {
                            this.sendMetricsDataInstance(webSocket, instanceConfig.instance, false)
                            return true
                        }
                        else {
                            this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Instance ${instanceConfig.instance} not found`, instanceConfig)
                            return false
                        }
                    }
                }
                case EMetricsConfigMode.STREAM: {
                    if (!this.checkScopes(instanceConfig, InstanceConfigScopeEnum.STREAM)) {
                        this.backChannelObject.logInfo?.('Insufficient scope for STREAM')
                        this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, 'Insufficient scope for STREAM', instanceConfig)
                        return false
                    }

                    if (podNode) {
                        this.backChannelObject.logInfo?.(`Start pod metrics for ${podNode}/${podNamespace}/${podGroup}/${podName}/${containerName}`)
                        let socket = this.webSockets.find(entry => entry.ws === webSocket)
                        let metricsConfig = instanceConfig.data as IMetricsInstanceConfig
                        let interval = (metricsConfig.interval || 15) * 1000
                        if (socket) {
                            let instances = socket.instances
                            let instance = instances?.find((instance) => instance.instanceId === instanceConfig.instance)
                            if (!instance) {
                                // new instance for an existing websocket
                                let timeout = setInterval((w:WebSocket, i:string, s:boolean) => this.sendMetricsDataInstance(w,i,s), interval, webSocket,instanceConfig.instance, false)
                                instances?.push( {
                                    instanceId: instanceConfig.instance,
                                    working:false,
                                    paused:false,
                                    timeout,
                                    interval,
                                    assets:[{podNode, podNamespace, podGroup, podName, containerName}],
                                    instanceConfig: instanceConfig
                                })
                                this.sendMetricsDataInstance(webSocket,instanceConfig.instance, true)
                                return true
                            }

                            if (instanceConfig.view === EInstanceConfigView.CONTAINER) {
                                instance.assets.push ({podNode, podNamespace, podGroup, podName, containerName})
                                this.sendMetricsDataInstance(webSocket,instanceConfig.instance, true)
                                return true
                            }
                            else {
                                if (!instance.assets.find(asset => asset.podName === podName && asset.containerName === containerName)) {
                                    instance.assets.push ({podNode, podNamespace, podGroup, podName, containerName})
                                    this.sendMetricsDataInstance(webSocket,instanceConfig.instance, true)
                                    return true
                                }
                            }
                            return false
                        }
                        else {
                            this.webSockets.push( {ws:webSocket, lastRefresh: Date.now(), instances:[]} )
                            let timeout = setInterval((w:WebSocket, i:string,s:boolean) => this.sendMetricsDataInstance(w,i,s), interval, webSocket,instanceConfig.instance, false)
                            let instances = this.webSockets.find(entry => entry.ws === webSocket)?.instances
                            instances?.push({
                                instanceId:instanceConfig.instance,
                                working:false,
                                paused:false,
                                timeout,
                                assets:[{podNode, podNamespace, podGroup, podName, containerName}],
                                instanceConfig: instanceConfig,
                                interval
                            })
                            this.sendMetricsDataInstance(webSocket,instanceConfig.instance, true)
                            return true
                        }
                    }
                    else {
                        this.backChannelObject.logInfo?.(`Cannot determine node for ${podNamespace}/${podName}, will not be added`)
                        return false
                    }
                }
                default:
                    this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Invalid mode: ${(instanceConfig.data as IMetricsInstanceConfig).mode}`, instanceConfig)
                    return false
            }
        }
        catch (err) {
            this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, (err as Error)?.stack ?? String(err), instanceConfig)
            this.backChannelObject.logError?.('Generic error starting metrics instance')
            this.backChannelObject.logError?.(err)
            return false
        }
    }

    deleteObject = async (webSocket:WebSocket, instanceConfig:IInstanceConfig, podNamespace:string, podName:string, containerName:string) : Promise<boolean> => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        const instance = socket?.instances.find(i => i.instanceId === instanceConfig.instance)
        if (instance) {
            instance.assets = instance.assets.filter(a => !(a.podNamespace===podNamespace && a.podName===podName && (containerName==='' || a.containerName===containerName)))
        }
        return true
    }

    stopInstance (webSocket: WebSocket, instanceConfig: IInstanceConfig): void {
        let instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            this.removeInstance (webSocket,instanceConfig.instance)
            this.sendInstanceConfigMessage(webSocket,EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, EInstanceMessageChannel.METRICS, instanceConfig, 'Metrics instance stopped')
        }
        else {
            this.sendInstanceConfigMessage(webSocket,EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, EInstanceMessageChannel.METRICS, instanceConfig, 'Instance not found')
        }
    }

    modifyInstance (webSocket:WebSocket, instanceConfig: IInstanceConfig): void {
        let instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            // only modifiable properties of the metrics config
            let destConfig = instance.instanceConfig.data as IMetricsInstanceConfig
            destConfig.metrics = (instanceConfig.data as IMetricsInstanceConfig).metrics
            destConfig.interval = (instanceConfig.data as IMetricsInstanceConfig).interval
            destConfig.aggregate = (instanceConfig.data as IMetricsInstanceConfig).aggregate
            this.sendInstanceConfigMessage(webSocket,EInstanceMessageAction.MODIFY, EInstanceMessageFlow.RESPONSE, EInstanceMessageChannel.METRICS, instanceConfig, 'Metrics modified')
        }
        else {
            this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Instance ${instanceConfig.instance} not found`, instanceConfig)
        }
    }

    pauseContinueInstance(webSocket: WebSocket, instanceConfig: IInstanceConfig, action: EInstanceMessageAction): void {
        let instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            if (action === EInstanceMessageAction.PAUSE) {
                instance.paused = true
                this.sendInstanceConfigMessage(webSocket, EInstanceMessageAction.PAUSE, EInstanceMessageFlow.RESPONSE, EInstanceMessageChannel.METRICS, instanceConfig, 'Metrics paused')
            }
            if (action === EInstanceMessageAction.CONTINUE) {
                instance.paused = false
                this.sendInstanceConfigMessage(webSocket,EInstanceMessageAction.CONTINUE, EInstanceMessageFlow.RESPONSE, EInstanceMessageChannel.METRICS, instanceConfig, 'Metrics continued')
            }
        }
        else {
            this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Instance ${instanceConfig.instance} not found`, instanceConfig)
        }
    }

    removeInstance(webSocket: WebSocket, instanceId: string): void {
        let socket = this.webSockets.find(entry => entry.ws === webSocket)
        if (socket) {
            let instances = socket.instances
            if (instances) {
                let instanceIndex = instances.findIndex(t => t.instanceId === instanceId)
                if (instanceIndex>=0) {
                    if (instances[instanceIndex].timeout) clearInterval(instances[instanceIndex].timeout)
                    instances.splice(instanceIndex,1)
                }
                else{
                    this.backChannelObject.logInfo?.('Instance not found, cannot delete')
                }
            }
            else {
                this.backChannelObject.logInfo?.('There are no Instances on websocket')
            }
        }
        else {
            this.backChannelObject.logInfo?.('WebSocket not found on intervals')
        }
    }

    containsConnection (webSocket:WebSocket) : boolean {
        return Boolean (this.webSockets.find(s => s.ws === webSocket))
    }

    refreshConnection(webSocket: WebSocket): boolean {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            socket.lastRefresh = Date.now()
            return true
        }
        else {
            this.backChannelObject.logInfo?.('WebSocket not found')
            return false
        }
    }

    updateConnection(newWebSocket: WebSocket, instanceId: string): boolean {
        for (let entry of this.webSockets) {
            var exists = entry.instances.find(i => i.instanceId === instanceId)
            if (exists) {
                entry.ws = newWebSocket
                for (var instance of entry.instances) {
                    if (instance.timeout) clearInterval(instance.timeout)
                    instance.timeout = setInterval((w:WebSocket,i:string, s:boolean) => this.sendMetricsDataInstance(w,i,s), instance.interval, newWebSocket, instanceId, false)
                }
                return true
            }
        }
        return false
    }

    removeConnection(webSocket: WebSocket): void {
        let socket = this.webSockets.find(entry => entry.ws === webSocket)
        if (socket) {
            const ids = socket.instances.map(i => i.instanceId)
            for (const id of ids) {
                this.backChannelObject.logInfo?.(`Interval for instance ${id} has been removed`)
                this.removeInstance(webSocket, id)
            }
            var pos = this.webSockets.findIndex(s => s.ws === webSocket)
            this.webSockets.splice(pos,1)
        }
    }

    // *************************************************************************************
    // PRIVATE
    // *************************************************************************************

    getInstance(webSocket:WebSocket, instanceId: string) : IInstance | undefined{
        let socket = this.webSockets.find(entry => entry.ws === webSocket)
        if (socket) {
            let instances = socket.instances
            if (instances) {
                let instanceIndex = instances.findIndex(t => t.instanceId === instanceId)
                if (instanceIndex>=0) return instances[instanceIndex]
                this.backChannelObject.logInfo?.('Instance not found')
            }
            else {
                this.backChannelObject.logInfo?.('There are no Instances on websocket')
            }
        }
        else {
            this.backChannelObject.logInfo?.('WebSocket not found')
        }
        return undefined
    }

    public extractContainerMetrics = (podMetricsSet:Map<string,IMetricsValue>, containerMetricsSet:Map<string,IMetricsValue>, requestedMetricName:string, view:EInstanceConfigView, node:IMetricsNode, asset:IAssetData): {value:number, timestamp:number|undefined }=> {
        if (view === EInstanceConfigView.CONTAINER) {
            let metricName = asset.podNamespace + '/' + asset.podName + '/' + asset.containerName + '/' + requestedMetricName
            let value = containerMetricsSet.get(metricName)?.value
            if (value !== undefined) {
                return  { value, timestamp: node.timestamp }
            }
            else {
                return  { value: 0, timestamp: node.timestamp }
            }
        }
        else {
            // iterate directly without Array.from to avoid large temporary array allocations
            const prefix = asset.podNamespace + '/' + asset.podName + '/'
            const suffix = '/' + requestedMetricName
            let accum = 0
            let found = false
            for (const [k, v] of containerMetricsSet) {
                if (k.startsWith(prefix) && k.endsWith(suffix)) {
                    accum += v.value
                    found = true
                }
            }
            if (!found) {
                const podValue = podMetricsSet.get(asset.podNamespace + '/' + asset.podName + '/' + requestedMetricName)?.value
                return { value: podValue ?? 0, timestamp: node.timestamp }
            }
            return { value: accum, timestamp: node.timestamp }
        }
    }

    getAssetMetrics = (instanceConfig:IInstanceConfig, assets:IAssetData[], usePrevMetricSet:boolean): IMetricsAssets|undefined => {
        if (this.metricsCluster.length<2) {
            return undefined
        }

        let assetMetrics:IMetricsAssets = { assetName: this.getAssetMetricName(instanceConfig, assets), values: [] }
        let newAssets:IAssetData[] = []

        if (instanceConfig.view=== EInstanceConfigView.CONTAINER) {
            newAssets = assets
        }
        else {
            for (let a of assets) {
                if (!newAssets.find(newAsset => newAsset.podName === a.podName)) {
                    newAssets.push({
                        podNode: a.podNode,
                        podNamespace: a.podNamespace,
                        podGroup: a.podGroup,
                        podName: a.podName,
                        containerName: ''
                    })
                }
            }
        }

        for (let metricName of (instanceConfig.data as IMetricsInstanceConfig).metrics) {
            if (metricName.startsWith('kwirth_cluster_')) {
                const lastRead = this.metricsCluster[this.metricsCluster.length - 1]
                const clusterValue = lastRead.clusterMetricValues?.get(metricName)?.value ?? 0
                assetMetrics.values.push({ metricName, metricValue: clusterValue })
                continue
            }

            let sourceMetricName = metricName
            if (metricName === 'kwirth_container_memory_percentage') sourceMetricName = 'container_memory_working_set_bytes'
            if (metricName === 'kwirth_container_cpu_percentage') sourceMetricName = 'container_cpu_usage_seconds_total'

            if (metricName === 'kwirth_container_transmit_percentage') sourceMetricName = 'container_network_transmit_bytes_total'
            if (metricName === 'kwirth_container_receive_percentage') sourceMetricName = 'container_network_receive_bytes_total'

            if (metricName === 'kwirth_container_transmit_mbps') sourceMetricName = 'container_network_transmit_bytes_total'
            if (metricName === 'kwirth_container_receive_mbps') sourceMetricName = 'container_network_receive_bytes_total'

            if (metricName === 'kwirth_container_write_mbps') sourceMetricName = 'container_fs_writes_bytes_total'
            if (metricName === 'kwirth_container_read_mbps') sourceMetricName = 'container_fs_reads_bytes_total'

            if (metricName === 'kwirth_container_random_counter' || metricName === 'kwirth_container_random_gauge') sourceMetricName = 'container_cpu_system_seconds_total'

            let uniqueValues:number[] = []

            for (let asset of newAssets) {
                let lastRead = this.metricsCluster[this.metricsCluster.length-1]
                let prevRead = this.metricsCluster[this.metricsCluster.length-2]
                let lastNode = lastRead.nodes.find(n => n.name === asset.podNode)
                let prevNode = prevRead.nodes.find(n => n.name === asset.podNode)
                if (!lastNode || !prevNode) {
                    // The node may have left the cluster (or not be in the reading yet). This used to be a
                    // process.exit(1), which inside a plugin takes the whole Kwirth down: skip the asset instead.
                    this.backChannelObject.logError?.(`No node '${asset.podNode}' found for calculating metric value of ${asset.podNamespace}/${asset.podName}, asset skipped`)
                    continue
                }
                let metric
                if (usePrevMetricSet)
                    metric = this.extractContainerMetrics(prevNode.podMetricValues, prevNode.containerMetricValues, sourceMetricName, instanceConfig.view, prevNode, asset)
                else
                    metric = this.extractContainerMetrics(lastNode.podMetricValues, lastNode.containerMetricValues, sourceMetricName, instanceConfig.view, lastNode, asset)
                uniqueValues.push(metric.value)
            }

            let metricValue = uniqueValues.reduce((acc,value) => acc + value, 0)
            assetMetrics.values.push ({ metricName, metricValue })
        }

        for (var i=0; i<assetMetrics.values.length; i++) {
            let m = assetMetrics.values[i]

            switch(m.metricName) {
                case 'kwirth_container_memory_percentage':
                    let clusterMemory = Number.MAX_VALUE
                    if (this.metricsCluster.length>0) {
                        clusterMemory = this.metricsCluster[this.metricsCluster.length-1].cluster.memory
                    }
                    m.metricValue = Math.round(m.metricValue/clusterMemory*100*100)/100
                    break
                case 'kwirth_container_cpu_percentage':
                    if (!usePrevMetricSet) {
                        // we perform a recursive call if-and-only-if we are not extracting prev values
                        let prevValues = this.getAssetMetrics(instanceConfig, newAssets, true)

                        let prev = prevValues?.values.find(prevMetric => prevMetric.metricName === m.metricName)
                        if (prev) {
                            m.metricValue -= prev.metricValue
                            if (m.metricValue < 0) {  // this may happen when pod restarts take place
                                m.metricValue = prev.metricValue
                            }
                            else {
                                let totalSecs = 1
                                if (this.metricsCluster.length>0) {
                                    totalSecs = this.metricsCluster[this.metricsCluster.length-1].metricsInterval * this.metricsCluster[this.metricsCluster.length-1].cluster.vcpus
                                    m.metricValue = Math.round(m.metricValue/totalSecs*100*100)/100
                                }
                                else {
                                    m.metricValue = prev.metricValue
                                }
                            }
                        }
                        else {
                            this.backChannelObject.logWarning?.(`No previous value [CPU] found for ${m.metricName}`)
                        }
                    }
                    break
                case 'kwirth_container_random_counter':
                    m.metricValue = Date.now() % (Math.random()*32*1000000)
                    break
                case 'kwirth_container_random_gauge':
                    m.metricValue = Math.round(Math.random()*100)/100
                    break
                case 'kwirth_container_transmit_percentage':
                case 'kwirth_container_receive_percentage':
                    // get total transmit/receive bytes
                    let totalBytes:number = 0
                    for (let node of this.metricsCluster[this.metricsCluster.length-1].nodes) {
                        let sourceMetricName = m.metricName==='kwirth_container_transmit_percentage'? 'container_network_transmit_bytes_total':'container_network_receive_bytes_total'
                        let nodeMetrics = Array.from(node.podMetricValues.keys()).filter(k => k.endsWith('/'+sourceMetricName))
                        nodeMetrics.map ( m => {
                            totalBytes += node.podMetricValues.get(m)?.value ?? 0
                        })
                    }
                    m.metricValue = Math.round(m.metricValue/totalBytes*100*100)/100
                    break
                case 'kwirth_container_write_mbps':
                case 'kwirth_container_read_mbps':
                case 'kwirth_container_transmit_mbps':
                case 'kwirth_container_receive_mbps':
                    if (!usePrevMetricSet) {
                        // we perform a recursive call if-and-only-if we are not extracting prev values
                        var prevValues = this.getAssetMetrics(instanceConfig, newAssets, true)
                        let prev = prevValues?.values.find(prevMetric => prevMetric.metricName === m.metricName)

                        if (prev) {
                            m.metricValue -= prev.metricValue // we get the value of bytes sent/received on the last period
                            m.metricValue *= 8  // we convert into bits
                            m.metricValue /= (1024*1024)  // we convert into Mbits
                            let totalSecs = this.metricsCluster[0].metricsInterval // we assume same metricsInterval for all nodes
                            // Mbits per second, rounded to 2 decimal positions. It used to be multiplied by 100 on
                            // top (copied from the CPU percentage), so every Mbps chart read 100 times too high.
                            m.metricValue = Math.round(m.metricValue/totalSecs*100)/100
                        }
                        else {
                            this.backChannelObject.logInfo?.(`No previous value found for ${m.metricName}`)
                        }
                    }
                    break
            }
        }
        return assetMetrics
    }

    getAssetMetricName = (instanceConfig:IInstanceConfig, assets:IAssetData[]): string => {
        switch (instanceConfig.view) {
            case EInstanceConfigView.NAMESPACE:
                return [...new Set (assets.map (a => a.podNamespace))].join(',')
            case EInstanceConfigView.GROUP:
                let requestedGroups = instanceConfig.group.split(',')
                return [...new Set (assets.map (a => {
                    if (!a.podGroup) return undefined  // pods without controller
                    if (requestedGroups.includes(a.podGroup)) {
                        return a.podGroup
                    }
                    else {
                        // we assume deployment name is derived from replicaset name prefix
                        let deploymentName = a.podGroup.substring(0, a.podGroup.lastIndexOf('-'))
                        let x = deploymentName.replace(/replicaset\+/g,'deployment+')
                        if (requestedGroups.includes(x)) {
                            return x
                        }
                        else {
                            return undefined
                        }
                    }
                }))].join(',')
            case EInstanceConfigView.POD:
                return [...new Set (assets.map (a => a.podName))].join(',')
            case EInstanceConfigView.CONTAINER:
                return [...new Set (assets.map (a => a.podName+'['+a.containerName+']'))].join(',')
            default:
                return 'unnamedView'
        }
    }

    fillData = (instanceConfig:IInstanceConfig, instance:IInstance, responseMessage:IMetricsMessageResponse) => {
        switch(instanceConfig.view) {
            case EInstanceConfigView.NAMESPACE:
                if ((instanceConfig.data as IMetricsInstanceConfig).aggregate) {
                    let assetMetrics = this.getAssetMetrics(instanceConfig, instance.assets, false)
                    if (assetMetrics) responseMessage.assets.push(assetMetrics)
                }
                else {
                    const namespaces = [...new Set(instance.assets.map(item => item.podNamespace))]
                    for (let namespace of namespaces) {
                        let assets = instance.assets.filter(a => a.podNamespace === namespace)
                        let assetMetrics = this.getAssetMetrics(instanceConfig, assets, false)
                        if (assetMetrics) responseMessage.assets.push(assetMetrics)
                    }

                }
                break
            case EInstanceConfigView.GROUP:
                if ((instanceConfig.data as IMetricsInstanceConfig).aggregate) {
                    var assetMetrics = this.getAssetMetrics(instanceConfig, instance.assets, false)
                    if (assetMetrics) responseMessage.assets.push(assetMetrics)
                }
                else {
                    const groupNames = [...new Set(instance.assets.map(item => item.podGroup))]
                    for (let groupName of groupNames) {
                        let assets=instance.assets.filter(a => a.podGroup === groupName)
                        let assetMetrics = this.getAssetMetrics(instanceConfig, assets, false)
                        if (assetMetrics) responseMessage.assets.push(assetMetrics)
                    }
                }
                break
            case EInstanceConfigView.POD:
                if ((instanceConfig.data as IMetricsInstanceConfig).aggregate) {
                    var assetMetrics = this.getAssetMetrics(instanceConfig, instance.assets, false)
                    if (assetMetrics) responseMessage.assets.push(assetMetrics)
                }
                else {
                    const uniquePodNames = [...new Set(instance.assets.map(asset => asset.podName))]
                    for (var podName of uniquePodNames) {
                        var assets = instance.assets.filter(a => a.podName === podName)
                        var assetMetrics = this.getAssetMetrics(instanceConfig, assets, false)
                        if (assetMetrics) responseMessage.assets.push(assetMetrics)
                    }
                }
                break
            case EInstanceConfigView.CONTAINER:
                if ((instanceConfig.data as IMetricsInstanceConfig).aggregate) {
                    var assetMetrics = this.getAssetMetrics(instanceConfig, instance.assets, false)
                    if (assetMetrics) responseMessage.assets.push(assetMetrics)
                }
                else {
                    for (var asset of instance.assets) {
                        var assetMetrics = this.getAssetMetrics(instanceConfig, [asset], false)
                        if (assetMetrics) responseMessage.assets.push(assetMetrics)
                    }
                }
                break
            default:
                this.backChannelObject.logWarning?.(`Invalid view:` + instanceConfig.view)
        }
    }

    sendMetricsDataInstance = (webSocket:WebSocket, instanceId:string, initial:boolean): void => {
        let socket = this.webSockets.find(entry => entry.ws === webSocket)
        if (!socket) {
            this.backChannelObject.logInfo?.('No socket found for sendMetricsData')
            return
        }
        let instances = socket.instances

        if (!instances) {
            this.backChannelObject.logInfo?.('No instances found for sendMetricsData')
            return
        }
        var instance = instances.find (i => i.instanceId === instanceId)
        if (!instance) {
            this.backChannelObject.logInfo?.(`No instance found for sendMetricsData instance ${instanceId}`)
            return
        }
        if (instance.working) {
            this.backChannelObject.logInfo?.(`Previous instance of ${instanceId} is still running`)
            return
        }
        if (instance.paused) {
            this.backChannelObject.logInfo?.(`Instance ${instanceId} is paused, no SMD performed`)
            return
        }

        instance.working=true
        let instanceConfig = instance.instanceConfig

        try {
            let metricsMessageResponse:IMetricsMessageResponse = {
                msgtype: 'metricsmessageresponse',
                action: EInstanceMessageAction.NONE,
                flow: EInstanceMessageFlow.UNSOLICITED,
                channel: EInstanceMessageChannel.METRICS,
                type: EInstanceMessageType.DATA,
                instance: instanceConfig.instance,
                assets: [],
                namespace: instanceConfig.namespace,
                group: '',
                pod: instanceConfig.pod,
                timestamp: initial ? 0 : Date.now(),
                container: ''
            }

            this.fillData(instanceConfig, instance, metricsMessageResponse)
            if (metricsMessageResponse.assets.length>0) {
                try {
                    webSocket.send(JSON.stringify(metricsMessageResponse))
                }
                catch (err) {
                    this.backChannelObject.logInfo?.('Socket error, we should forget interval')
                }
            }
            instance.working=false
        }
        catch (err) {
            this.sendChannelSignal(webSocket, ESignalMessageLevel.WARNING, `Cannot read metrics for instance ${instanceId}`, instanceConfig)
            this.backChannelObject.logError?.('Error reading metrics')
            this.backChannelObject.logError?.(err)
        }
    }

    sendInstanceConfigMessage = (ws:WebSocket, action:EInstanceMessageAction, flow: EInstanceMessageFlow, channel: EInstanceMessageChannel, instanceConfig:IInstanceConfig, text:string): void => {
        var resp:IInstanceConfigResponse = {
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
        var signalMessage:ISignalMessage = {
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.RESPONSE,
            type: EInstanceMessageType.SIGNAL,
            level,
            channel: instanceConfig.channel,
            instance: instanceConfig.instance,
            text
        }
        webSocket.send(JSON.stringify(signalMessage))
    }

}

export { MetricsChannel }
