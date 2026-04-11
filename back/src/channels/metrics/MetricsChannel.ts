import { IInstanceConfig, InstanceConfigViewEnum, InstanceMessageTypeEnum, ISignalMessage, SignalMessageLevelEnum, IInstanceConfigResponse, InstanceMessageFlowEnum, InstanceMessageActionEnum, InstanceMessageChannelEnum, IInstanceMessage, MetricsConfig, MetricsConfigModeEnum, InstanceConfigScopeEnum, parseResources, accessKeyDeserialize, BackChannelData, ClusterTypeEnum, IMetricsMessageResponse, IMetricsAssets, MetricsMessage, IMetricsMessage, InstanceConfigObjectEnum, EInstanceMessageFlow, EInstanceConfigObject, EInstanceConfigView, EInstanceMessageAction, EInstanceMessageType, ESignalMessageLevel, EInstanceMessageChannel } from '@kwirthmagnify/kwirth-common'
import { ClusterInfo } from '../../model/ClusterInfo'
import { AssetData } from '../../tools/MetricsTools'
import { IChannel } from '../IChannel'
import { Request, Response } from 'express'

interface IInstance {
    instanceId: string
    timeout?: NodeJS.Timeout
    working: boolean
    paused: boolean
    assets: AssetData[]
    instanceConfig: IInstanceConfig
    interval: number
}

class MetricsChannel implements IChannel {
    clusterInfo: ClusterInfo

    // list of intervals (and its associated metrics) that produce metrics streams    
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
            id: 'metrics',
            routable: false,
            pauseable: true,
            modifyable: true,
            reconnectable: true,
            metrics: true,
            //events: false,
            providers: [],
            sources: [ ClusterTypeEnum.KUBERNETES ],
            endpoints: [],
            websocket: false,
            cluster: false
        }
    }

    getChannelScopeLevel(scope: string): number {
        return ['','snapshot','stream','cluster'].indexOf(scope)
    }

    startChannel = async () =>  {
    }

    processProviderEvent(providerId:string, obj:any) : void {
    }

    async endpointRequest(endpoint:string,req:Request, res:Response) : Promise<void> {
    }

    async websocketRequest(newWebSocket:WebSocket) : Promise<void> {
    }

    async processCommand (webSocket:WebSocket, instanceMessage:IInstanceMessage) : Promise<boolean> {
        // we treart IMMEDIATE same as REQUEST
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
        console.log('Immediate request received')
        // we create a dummy instance for executnig command, and we add the asset refrenced in the immediate command received
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
                console.log(`No owner found for ${podName}, assume pod/container without controller`)
            }
            
            switch ((instanceConfig.data as MetricsConfig).mode) {
                case MetricsConfigModeEnum.SNAPSHOT:
                    {
                        if (!this.checkScopes(instanceConfig, InstanceConfigScopeEnum.SNAPSHOT)) {
                            console.log('Insufficient scope for SNAPSHOT')
                            this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, 'Insufficient scope for SNAPSHOT', instanceConfig) 
                            return false
                        }
                        if (podNode) {
                            console.log(`Send snapshot metrics for ${podNode}/${podNamespace}/${podGroup}/${podName}/${containerName}`)

                            let socket = this.webSockets.find(entry => entry.ws === webSocket)
                            if (!socket) {
                                console.log('No socket found for startInstance snapshot')
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
                case MetricsConfigModeEnum.STREAM:
                    {
                        if (!this.checkScopes(instanceConfig, InstanceConfigScopeEnum.STREAM)) {
                            console.log('Insufficient scope for STREAM')
                            this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, 'Insufficient scope for STREAM', instanceConfig) 
                            return false
                        }

                        if (podNode) {
                            console.log(`Start pod metrics for ${podNode}/${podNamespace}/${podGroup}/${podName}/${containerName}`)
                            let socket = this.webSockets.find(entry => entry.ws === webSocket)
                            let metricsConfig = instanceConfig.data as MetricsConfig
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
                            console.log(`Cannot determine node for ${podNamespace}/${podName}}, will not be added`)
                            return false
                        }
                    }
                default:
                    this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Invalid mode: ${(instanceConfig.data as MetricsConfig).mode}`, instanceConfig)
                    return false
            }
        }
        catch (err:any) {
            this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, err.stack, instanceConfig)
            console.log('Generic error starting metrics instance', err)
            return false
        }
    }

    deleteObject = async (webSocket:WebSocket, instanceConfig:IInstanceConfig, podNamespace:string, podName:string, containerName:string) : Promise<boolean> => {
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
            let destConfig = instance.instanceConfig.data as MetricsConfig
            destConfig.metrics = (instanceConfig.data as MetricsConfig).metrics
            destConfig.interval = (instanceConfig.data as MetricsConfig).interval
            destConfig.aggregate = (instanceConfig.data as MetricsConfig).aggregate
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
                    if (instances[instanceIndex].timeout) instances[instanceIndex].timeout.close()
                    instances.splice(instanceIndex,1)
                }
                else{
                    console.log('Instance not found, cannot delete')
                }
            }
            else {
                console.log('There are no Instances on websocket')
            }
        }
        else {
            console.log('WebSocket not found on intervals')
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
            console.log('WebSocket not found')
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
            let instances = socket.instances
            if (instances) {
                for (var i=0;i<instances.length;i++) {
                    console.log(`Interval for instance ${instances[i].instanceId} has been removed`)
                    this.removeInstance(webSocket, instances[i].instanceId)
                }
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

    getAssetMetrics = (instanceConfig:IInstanceConfig, assets:AssetData[], usePrevMetricSet:boolean): IMetricsAssets => {
        var assetMetrics:IMetricsAssets = { assetName: this.getAssetMetricName(instanceConfig, assets), values: [] }

        var newAssets:AssetData[] = []
        if (instanceConfig.view=== EInstanceConfigView.CONTAINER) {
            newAssets = assets
        }
        else {
            for (var a of assets) {
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

        for (let metricName of (instanceConfig.data as MetricsConfig).metrics) {
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
                let total=0
                let node = this.clusterInfo.nodes.get(asset.podNode)
                if (node) {
                    let metric
                    if (usePrevMetricSet)
                        metric = this.clusterInfo.metrics.extractContainerMetrics(this.clusterInfo, node.prevPodMetricValues, node.prevContainerMetricValues, sourceMetricName, instanceConfig.view, node, asset)
                    else
                        metric = this.clusterInfo.metrics.extractContainerMetrics(this.clusterInfo, node.podMetricValues, node.containerMetricValues, sourceMetricName, instanceConfig.view, node, asset)
                    total = metric.value
                }
                else {
                    console.log('No node found for calculating pod metric value', asset)
                }
                uniqueValues.push(total)
            }

            let metricValue = uniqueValues.reduce((acc,value) => acc + value, 0)
            assetMetrics.values.push ({ metricName, metricValue })
        }

        for (var i=0; i<assetMetrics.values.length; i++) {
            let m = assetMetrics.values[i]

            switch(m.metricName) {
                case 'kwirth_container_memory_percentage':
                    let clusterMemory = this.clusterInfo.memory
                    if (Number.isNaN(this.clusterInfo.memory)) clusterMemory=Number.MAX_VALUE
                    m.metricValue = Math.round(m.metricValue/clusterMemory*100*100)/100
                    break
                case 'kwirth_container_cpu_percentage':
                    if (!usePrevMetricSet) {
                        // we perform a recursive call if-and-only-if we are not extracting prev values
                        let prevValues = this.getAssetMetrics(instanceConfig, newAssets, true)
    
                        let prev = prevValues.values.find(prevMetric => prevMetric.metricName === m.metricName)
                        if (prev) {
                            m.metricValue -= prev.metricValue
                            if (m.metricValue < 0) {  // this may happen when pod restarts take place
                                m.metricValue = prev.metricValue
                            }
                            else {
                                let totalSecs = this.clusterInfo.metricsInterval * this.clusterInfo.vcpus
                                m.metricValue = Math.round(m.metricValue/totalSecs*100*100)/100
                            }
                        }
                        else {
                            console.log(`No previous value  [CPU] found for ${m.metricName}`)
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
                    for (var node of this.clusterInfo.nodes.values()) {
                        let sourceMetricName = m.metricName==='kwirth_container_transmit_percentage'? 'container_network_transmit_bytes_total':'container_network_receive_bytes_total'
                        let nodeMetrics = Array.from(node.podMetricValues.keys()).filter(k => k.endsWith('/'+sourceMetricName))
                        nodeMetrics.map ( m => {
                            totalBytes += node.podMetricValues.get(m)?.value!
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
                        let prev = prevValues.values.find(prevMetric => prevMetric.metricName === m.metricName)

                        if (prev) {
                            m.metricValue -= prev.metricValue // we get the value of bytes sent/received on the last period
                            m.metricValue *= 8  // we convert into bits
                            m.metricValue /= (1024*1024)  // we convert into Mbits
                            let totalSecs = this.clusterInfo.metricsInterval
                            m.metricValue = Math.round(m.metricValue/totalSecs*100*100)/100   // we build a percentage with 2 decimal positions
                        }
                        else {
                            console.log(`No previous value found for ${m.metricName}`)
                        }
                    }
                    break
            }
        }
        return assetMetrics
    }

    getAssetMetricName = (instanceConfig:IInstanceConfig, assets:AssetData[]): string => {
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
                        let x = deploymentName.replaceAll('replicaset+','deployment+')
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
                if ((instanceConfig.data as MetricsConfig).aggregate) {
                    let assetMetrics = this.getAssetMetrics(instanceConfig, instance.assets, false)
                    responseMessage.assets.push(assetMetrics)
                }
                else {
                    const namespaces = [...new Set(instance.assets.map(item => item.podNamespace))]
                    for (let namespace of namespaces) {
                        let assets = instance.assets.filter(a => a.podNamespace === namespace)
                        let assetMetrics = this.getAssetMetrics(instanceConfig, assets, false)
                        responseMessage.assets.push(assetMetrics)
                    }

                }
                break
            case EInstanceConfigView.GROUP:
                if ((instanceConfig.data as MetricsConfig).aggregate) {
                    var assetMetrics = this.getAssetMetrics(instanceConfig, instance.assets, false)
                    responseMessage.assets.push(assetMetrics)
                }
                else {
                    const groupNames = [...new Set(instance.assets.map(item => item.podGroup))]
                    for (let groupName of groupNames) {
                        let assets=instance.assets.filter(a => a.podGroup === groupName)
                        let assetMetrics = this.getAssetMetrics(instanceConfig, assets, false)
                        responseMessage.assets.push(assetMetrics)
                    }
                }
                break
            case EInstanceConfigView.POD:
                if ((instanceConfig.data as MetricsConfig).aggregate) {
                    var assetMetrics = this.getAssetMetrics(instanceConfig, instance.assets, false)
                    responseMessage.assets.push(assetMetrics)
                }
                else {
                    const uniquePodNames = [...new Set(instance.assets.map(asset => asset.podName))]
                    for (var podName of uniquePodNames) {
                        var assets = instance.assets.filter(a => a.podName === podName)
                        var assetMetrics = this.getAssetMetrics(instanceConfig, assets, false)
                        responseMessage.assets.push(assetMetrics)
                    }
                }
                break
            case EInstanceConfigView.CONTAINER:
                if ((instanceConfig.data as MetricsConfig).aggregate) {
                    var assetMetrics = this.getAssetMetrics(instanceConfig, instance.assets, false)
                    responseMessage.assets.push(assetMetrics)
                }
                else {
                    for (var asset of instance.assets) {
                        var assetMetrics = this.getAssetMetrics(instanceConfig, [asset], false)
                        responseMessage.assets.push(assetMetrics)
                    }
                }
                break
            default:
                console.log(`Invalid view:`, instanceConfig.view)
        }
    }

    sendMetricsDataInstance = (webSocket:WebSocket, instanceId:string, initial:boolean): void => {
        let socket = this.webSockets.find(entry => entry.ws === webSocket)
        if (!socket) {
            console.log('No socket found for sendLogData')
            return
        }
        let instances = socket.instances

        if (!instances) {
            console.log('No instances found for sendMetricsData')
            return
        }
        var instance = instances.find (i => i.instanceId === instanceId)
        if (!instance) {
            console.log(`No instance found for sendMetricsData instance ${instanceId}`)
            return
        }
        if (instance.working) {
            console.log(`Previous instance of ${instanceId} is still running`)
            return
        }
        if (instance.paused) {
            console.log(`Instance ${instanceId} is paused, no SMD performed`)
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
            
            try {
                webSocket.send(JSON.stringify(metricsMessageResponse))
            }
            catch (err) {
                console.log('Socket error, we should forget interval')
            }
            instance.working=false
        }
        catch (err) {
            this.sendChannelSignal(webSocket, ESignalMessageLevel.WARNING, `Cannot read metrics for instance ${instanceId}`, instanceConfig)
            console.log('Error reading metrics', err)
        }
    }

    // sendMetricsDataInstance = (webSocket:WebSocket, instanceId:string, initial:boolean): void => {
    //     let socket = this.webSockets.find(entry => entry.ws === webSocket)
    //     if (!socket) {
    //         console.log('No socket found for sendLogData')
    //         return
    //     }
    //     let instances = socket.instances

    //     if (!instances) {
    //         console.log('No instances found for sendMetricsData')
    //         return
    //     }
    //     var instance = instances.find (i => i.instanceId === instanceId)
    //     if (!instance) {
    //         console.log(`No instance found for sendMetricsData instance ${instanceId}`)
    //         return
    //     }
    //     if (instance.working) {
    //         console.log(`Previous instance of ${instanceId} is still running`)
    //         return
    //     }
    //     if (instance.paused) {
    //         console.log(`Instance ${instanceId} is paused, no SMD performed`)
    //         return
    //     }
    
    //     instance.working=true
    //     let instanceConfig = instance.instanceConfig
    
    //     try {
    //         let metricsMessage:IMetricsMessageResponse = {
    //             msgtype: 'metricsmessageresponse',
    //             action: EInstanceMessageAction.NONE,
    //             flow: EInstanceMessageFlow.UNSOLICITED,
    //             channel: EInstanceMessageChannel.METRICS,
    //             type: EInstanceMessageType.DATA,
    //             instance: instanceConfig.instance,
    //             assets: [],
    //             namespace: instanceConfig.namespace,
    //             group: '',
    //             pod: instanceConfig.pod,
    //             timestamp: initial ? 0 : Date.now(),
    //             container: ''
    //         }
    
    //         switch(instanceConfig.view) {
    //             case EInstanceConfigView.NAMESPACE:
    //                 if ((instanceConfig.data as MetricsConfig).aggregate) {
    //                     let assetMetrics = this.getAssetMetrics(instanceConfig, instance.assets, false)
    //                     metricsMessage.assets.push(assetMetrics)
    //                 }
    //                 else {
    //                     const namespaces = [...new Set(instance.assets.map(item => item.podNamespace))]
    //                     for (let namespace of namespaces) {
    //                         let assets = instance.assets.filter(a => a.podNamespace === namespace)
    //                         let assetMetrics = this.getAssetMetrics(instanceConfig, assets, false)
    //                         metricsMessage.assets.push(assetMetrics)
    //                     }

    //                 }
    //                 break
    //             case EInstanceConfigView.GROUP:
    //                 if ((instanceConfig.data as MetricsConfig).aggregate) {
    //                     var assetMetrics = this.getAssetMetrics(instanceConfig, instance.assets, false)
    //                     metricsMessage.assets.push(assetMetrics)
    //                 }
    //                 else {
    //                     const groupNames = [...new Set(instance.assets.map(item => item.podGroup))]
    //                     for (let groupName of groupNames) {
    //                         let assets=instance.assets.filter(a => a.podGroup === groupName)
    //                         let assetMetrics = this.getAssetMetrics(instanceConfig, assets, false)
    //                         metricsMessage.assets.push(assetMetrics)
    //                     }
    //                 }
    //                 break
    //             case EInstanceConfigView.POD:
    //                 if ((instanceConfig.data as MetricsConfig).aggregate) {
    //                     var assetMetrics = this.getAssetMetrics(instanceConfig, instance.assets, false)
    //                     metricsMessage.assets.push(assetMetrics)
    //                 }
    //                 else {
    //                     const uniquePodNames = [...new Set(instance.assets.map(asset => asset.podName))]
    //                     for (var podName of uniquePodNames) {
    //                         var assets = instance.assets.filter(a => a.podName === podName)
    //                         var assetMetrics = this.getAssetMetrics(instanceConfig, assets, false)
    //                         metricsMessage.assets.push(assetMetrics)
    //                     }
    //                 }
    //                 break
    //             case EInstanceConfigView.CONTAINER:
    //                 if ((instanceConfig.data as MetricsConfig).aggregate) {
    //                     var assetMetrics = this.getAssetMetrics(instanceConfig, instance.assets, false)
    //                     metricsMessage.assets.push(assetMetrics)
    //                 }
    //                 else {
    //                     for (var asset of instance.assets) {
    //                         var assetMetrics = this.getAssetMetrics(instanceConfig, [asset], false)
    //                         metricsMessage.assets.push(assetMetrics)
    //                     }
    //                 }
    //                 break
    //             default:
    //                 console.log(`Invalid view:`, instanceConfig.view)
    //         }
    
    //         try {
    //             webSocket.send(JSON.stringify(metricsMessage))
    //         }
    //         catch (err) {
    //             console.log('Socket error, we should forget interval')
    //         }
    //         instance.working=false
    //     }
    //     catch (err) {
    //         this.sendChannelSignal(webSocket, ESignalMessageLevel.WARNING, `Cannot read metrics for instance ${instanceId}`, instanceConfig)
    //         console.log('Error reading metrics', err)
    //     }
    // }
    
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

    // private sendSignalMessage = (ws:WebSocket, action:EInstanceMessageAction, flow: EInstanceMessageFlow, level: ESignalMessageLevel, instanceId:string, text:string): void => {
    //     var resp:ISignalMessage = {
    //         action,
    //         flow,
    //         channel: 'metrics',
    //         instance: instanceId,
    //         type: EInstanceMessageType.SIGNAL,
    //         text,
    //         level
    //     }
    //     ws.send(JSON.stringify(resp))
    // }

}

export { MetricsChannel }