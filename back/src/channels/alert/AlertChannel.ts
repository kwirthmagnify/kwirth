import { IInstanceConfig, ISignalMessage, EClusterType, IInstanceConfigResponse, IInstanceMessage, BackChannelData, EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageChannel, EInstanceMessageType, ESignalMessageLevel } from '@kwirthmagnify/kwirth-common'
import * as stream from 'stream'
import { PassThrough } from 'stream'
import { ClusterInfo } from '../../model/ClusterInfo'
import { IBackChannelObject, IBackChannelRequirements } from '@kwirthmagnify/kwirth-common'
import { IChannel } from '../IChannel'
import { Request, Response } from 'express'
import { EAlertSeverity, IAlertInstanceConfig, IAlertMessage, IAlertMetricRule, TAlertMetricOperator } from './AlertTypes'
import { IMetricsCluster } from '../../providers/metrics/IMetricsModel'

const evaluateMetricRule = (actual: number, operator: TAlertMetricOperator, threshold: number): boolean => {
    switch (operator) {
        case '<':  return actual < threshold
        case '<=': return actual <= threshold
        case '>':  return actual > threshold
        case '>=': return actual >= threshold
        case '==': return actual === threshold
        case '!=': return actual !== threshold
        default:   return false
    }
}

interface IAsset {
    podNamespace:string,
    podName:string,
    containerName:string,
    passThroughStream?:PassThrough,
    readableStream?: NodeJS.ReadableStream,
    buffer: string
}        

interface IAlertState {
    firing: boolean
    lastFired: number
}

interface IInstance {
    instanceId:string,
    assets: IAsset[]
    regExps: Map<EAlertSeverity, RegExp[]>
    metricRules: IAlertMetricRule[]
    alertStates: Map<string, IAlertState>
    paused:boolean
}

class AlertChannel implements IChannel {    
    readonly channelId = 'alert'
    readonly requirements: IBackChannelRequirements = {
        storage: false,
        providers: ['metrics']
    }
    clusterInfo : ClusterInfo
    backChannelObject: IBackChannelObject
    webSockets: {
        ws: WebSocket,
        lastRefresh: number,
        instances: IInstance[] 
    }[] = []

    constructor (clusterInfo:ClusterInfo, backChannelObject:IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
    }
    
    getChannelData(): BackChannelData {
        return {
            id: 'alert',
            routable: false,
            pauseable: true,
            modifiable: false,
            reconnectable: true,
            metrics: false,
            sources: [ EClusterType.DOCKER, EClusterType.KUBERNETES ],
            endpoints: [],
            websocket: false,
            cluster: false,
            resourced: true
        }
    }

    getChannelScopeLevel(scope: string): number {
        return ['','view','create','cluster'].indexOf(scope)
    }

    startChannel = async () =>  {
        this.clusterInfo.addSubscriber('metrics', this, {})
    }

    processProviderEvent(providerId:string, obj:any) : void {
        if (providerId !== 'metrics') return
        const event = obj as IMetricsCluster
        for (const socketObj of this.webSockets) {
            for (const instance of socketObj.instances) {
                if (instance.paused || instance.metricRules.length === 0) continue
                for (const asset of instance.assets) {
                    for (const rule of instance.metricRules) {
                        const stateKey = `${asset.podName}/${asset.containerName}/${rule.metric}`
                        for (const node of event.nodes) {
                            const containerKey = `${asset.podNamespace}/${asset.podName}/${asset.containerName}/${rule.metric}`
                            const containerEntry = node.containerMetricValues.get(containerKey)
                            const podEntry = containerEntry === undefined
                                ? node.podMetricValues.get(`${asset.podNamespace}/${asset.podName}/${rule.metric}`)
                                : undefined
                            const resolved = containerEntry?.value ?? podEntry?.value
                            if (resolved !== undefined) {
                                const triggered = evaluateMetricRule(resolved, rule.operator, rule.value)
                                const state = instance.alertStates.get(stateKey) ?? { firing: false, lastFired: 0 }
                                if (triggered) {
                                    let shouldFire = false
                                    if (rule.mode === 'leading-edge') {
                                        shouldFire = !state.firing
                                    } else if (rule.mode === 'cooldown') {
                                        const elapsed = Date.now() - state.lastFired
                                        shouldFire = state.lastFired === 0 || elapsed >= rule.cooldown * 1000
                                    } else {
                                        shouldFire = true
                                    }
                                    if (shouldFire) {
                                        this.sendMetricAlert(socketObj.ws, asset.podNamespace, asset.podName, asset.containerName, rule.severity,
                                            `Metric ${rule.metric} = ${resolved.toFixed(2)} ${rule.operator} ${rule.value}`, instance.instanceId)
                                        state.lastFired = Date.now()
                                    }
                                }
                                state.firing = triggered
                                instance.alertStates.set(stateKey, state)
                                break
                            }
                        }
                    }
                }
            }
        }
    }

    websocketRequest(newWebSocket: WebSocket, instanceId: string, instanceConfig: IInstanceConfig): void {
    }

    async endpointRequest(endpoint:string, req:Request, res:Response) : Promise<void> {
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
        for (let socket of this.webSockets) {
            let exists = socket.instances.find(i => i.instanceId === instanceId)
            if (exists) return true
        }
        return false
    }

    async startDockerStream (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string, regExps: Map<EAlertSeverity, RegExp[]>, metricRules: IAlertMetricRule[]): Promise<void> {
        try {
            let id = await this.clusterInfo.dockerTools.getContainerId(podName, containerName)
            if (!id) {
                this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Cannot obtain Id for container ${podName}/${containerName}`,instanceConfig)
                return
            }
                             
            let socket = this.webSockets.find(s => s.ws === webSocket)
            if (!socket) {
                let len = this.webSockets.push( {ws:webSocket, lastRefresh: Date.now(), instances:[]} )
                socket = this.webSockets[len-1]
            }

            let instances = socket.instances
            let instance = instances.find(i => i.instanceId === instanceConfig.instance)
            if (!instance) {
                let len = socket?.instances.push ({
                    instanceId: instanceConfig.instance,
                    regExps,
                    metricRules,
                    alertStates: new Map(),
                    paused:false,
                    assets:[]
                })
                instance = socket?.instances[len-1]
            }

            let asset:IAsset = {
                podNamespace,
                podName,
                containerName: '',
                buffer: ''
            }
            instance.assets.push( asset )

            let container = this.clusterInfo.dockerApi.getContainer(id)
            asset.readableStream = await container.logs({
                follow: true,
                stdout: true,
                stderr: true,
                //timestamps: (instanceConfig.data as AlertConfig).timestamp as boolean,
                //...(instanceConfig.data.fromStart? {} : {since: Date.now()-1800})
            })
            asset.readableStream.on('data', chunk => {
                var text:string=chunk.toString('utf8')
                this.sendBlock(webSocket, instanceConfig.instance, asset, text)
                //if (global.gc) global.gc()
            })
        }
        catch (err) {
            console.log('Generic error starting docker pod alert log', err)
            this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, err as string, instanceConfig)
        }
    }

    async startKubernetesStream (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string, regExps:Map<EAlertSeverity, RegExp[]>, metricRules: IAlertMetricRule[]): Promise<void> {
        try {
            let socket = this.webSockets.find(s => s.ws === webSocket)
            if (!socket) {
                let len = this.webSockets.push( {ws:webSocket, lastRefresh: Date.now(), instances:[]} )
                socket = this.webSockets[len-1]
            }

            let instances = socket.instances
            let instance = instances.find(i => i.instanceId === instanceConfig.instance)
            if (!instance) {
                let len = socket?.instances.push ({
                    instanceId: instanceConfig.instance,
                    regExps,
                    metricRules,
                    alertStates: new Map(),
                    paused:false,
                    assets:[]
                })
                instance = socket?.instances[len-1]
            }

            let asset:IAsset = {
                podNamespace,
                podName,
                containerName,
                buffer: ''
            }
            instance.assets.push( asset )

            asset.passThroughStream = new stream.PassThrough()
            asset.passThroughStream.on('data', chunk => {
                var text:string=chunk.toString('utf8')
                this.sendBlock(webSocket, instanceConfig.instance, asset, text)
                //if (global.gc) global.gc()
            })

            let streamConfig = { 
                follow: true, 
                pretty: false,
                //timestamps: instanceConfig.data.timestamp,
                //previous: Boolean(instanceConfig.data.previous),
                //...(instanceConfig.data.fromStart? {} : {sinceSeconds:1800})
            }
            await this.clusterInfo.logApi.log(podNamespace, podName, containerName, asset.passThroughStream, streamConfig)
        }
        catch (err:unknown) {
            console.log('Generic error starting pod alert log', err)
            this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, err as string, instanceConfig)
        }
    }

    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> => {
        let regexes: Map<EAlertSeverity, RegExp[]> = new Map()

        let regExps: RegExp[] = []
        for (let regStr of (instanceConfig.data as IAlertInstanceConfig).regexInfo)
            regExps.push(new RegExp (regStr))
        regexes.set(EAlertSeverity.INFO, regExps)

        regExps = []
        for (let regStr of (instanceConfig.data as IAlertInstanceConfig).regexWarning)
            regExps.push(new RegExp (regStr))
        regexes.set(EAlertSeverity.WARNING, regExps)

        regExps = []
        for (let regStr of (instanceConfig.data as IAlertInstanceConfig).regexError)
            regExps.push(new RegExp (regStr))
        regexes.set(EAlertSeverity.ERROR, regExps)

        const metricRules: IAlertMetricRule[] = (instanceConfig.data as IAlertInstanceConfig).metricRules ?? []

        if (this.clusterInfo.type === EClusterType.DOCKER) {
            this.startDockerStream(webSocket, instanceConfig, podNamespace, podName, containerName, regexes, metricRules)
            return true
        }
        else if (this.clusterInfo.type === EClusterType.KUBERNETES) {
            this.startKubernetesStream(webSocket, instanceConfig, podNamespace, podName, containerName, regexes, metricRules)
            return true
        }
        else {
            console.log('Unsuppoprted source')
            return false
        }
    }

    deleteObject = async (webSocket:WebSocket, instanceConfig:IInstanceConfig, podNamespace:string, podName:string, containerName:string) : Promise<boolean> => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        const instance = socket?.instances.find(i => i.instanceId === instanceConfig.instance)
        if (instance) {
            const matchesPod = (a: IAsset) => a.podNamespace===podNamespace && a.podName===podName
            const toRemove = instance.assets.filter((a: IAsset) => matchesPod(a) && (containerName==='' || a.containerName===containerName))
            for (const asset of toRemove) {
                asset.passThroughStream?.destroy()
                ;(asset.readableStream as stream.Readable | undefined)?.destroy()
            }
            instance.assets = instance.assets.filter((a: IAsset) => !(matchesPod(a) && (containerName==='' || a.containerName===containerName)))
        }
        return true
    }
    
    pauseContinueInstance(webSocket: WebSocket, instanceConfig: IInstanceConfig, action: EInstanceMessageAction): void {
        var socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) {
            console.log('No socket found for pci')
            return
        }
        let instances = socket.instances

        let instance = instances.find(i => i.instanceId === instanceConfig.instance)
        if (instance) {
            if (action === EInstanceMessageAction.PAUSE) {
                instance.paused = true
                this.sendInstanceConfigMessage(webSocket, EInstanceMessageAction.PAUSE, EInstanceMessageFlow.RESPONSE, EInstanceMessageChannel.ALERT, instanceConfig, 'Alert paused')
            }
            if (action === EInstanceMessageAction.CONTINUE) {
                instance.paused = false
                this.sendInstanceConfigMessage(webSocket, EInstanceMessageAction.CONTINUE, EInstanceMessageFlow.RESPONSE, EInstanceMessageChannel.ALERT, instanceConfig, 'Alert continued')
            }
        }
        else {
            this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Instance ${instanceConfig.instance} not found`, instanceConfig)
        }
    }

    modifyInstance (webSocket:WebSocket, instanceConfig: IInstanceConfig): void {

    }

    stopInstance(webSocket: WebSocket, instanceConfig: IInstanceConfig): void {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return

        if (socket.instances.find(i => i.instanceId === instanceConfig.instance)) {
            this.removeInstance(webSocket, instanceConfig.instance)
            this.sendInstanceConfigMessage(webSocket,EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, EInstanceMessageChannel.ALERT, instanceConfig, 'Alert channel instance stopped')
        }
        else {
            this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Instance not found`, instanceConfig)
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
                    for (const asset of instance.assets) {
                        asset.passThroughStream?.destroy()
                        ;(asset.readableStream as stream.Readable | undefined)?.destroy()
                    }
                    instances.splice(pos,1)
                }
                else {
                    console.log(`Instance ${instanceId} not found, cannot delete`)
                }
            }
            else {
                console.log('There are no alert instances on websocket')
            }
        }
        else {
            console.log('WebSocket not found on alerts')
        }
    }

    async processCommand (webSocket:WebSocket, instanceMessage:IInstanceMessage) : Promise<boolean> {
        return false
    }

    containsConnection (webSocket:WebSocket) : boolean {
        return Boolean (this.webSockets.find(s => s.ws === webSocket))
    }

    removeConnection(webSocket: WebSocket): void {
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
            console.log('WebSocket not found on alerts for remove')
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
        for (let entry of this.webSockets) {
            var exists = entry.instances.find(i => i.instanceId === instanceId)
            if (exists) {
                entry.ws = newWebSocket
                for (var instance of entry.instances) {
                    if (this.clusterInfo.type === EClusterType.DOCKER) {
                        for (let asset of instance.assets) {
                            if (asset.readableStream) {
                                asset.readableStream.removeAllListeners('data')
                                asset.readableStream.on('data', (chunk:any) => {
                                    try {
                                        var text:string=chunk.toString('utf8')
                                        this.sendBlock(newWebSocket, instance.instanceId, asset, text)
                                    }
                                    catch (err) {
                                        console.log(err)
                                    }
                                })    
                            }        
                        }
                    }
                    else if (this.clusterInfo.type === EClusterType.KUBERNETES) {
                        for (let asset of instance.assets) {
                            console.log(`found ${asset.podNamespace}/${asset.podName}/${asset.containerName}`)
                            if (asset.passThroughStream) {
                                console.log(`found stream ${asset.podNamespace}/${asset.podName}/${asset.containerName}`)

                                asset.passThroughStream.removeAllListeners('data')
                                asset.passThroughStream.on('data', (chunk:any) => {
                                    try {
                                        var text:string=chunk.toString('utf8')
                                        this.sendBlock(newWebSocket, instance.instanceId, asset, text)
                                    }
                                    catch (err) {
                                        console.log(err)
                                    }
                                })
                            }
                        }
                    }
                    else {
                        console.log('Unsuppoprted source')
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
            level,
            channel: instanceConfig.channel,
            instance: instanceConfig.instance,
            type: EInstanceMessageType.SIGNAL,
            text
        }
        webSocket.send(JSON.stringify(signalMessage))
    }

    sendAlert = (webSocket:WebSocket, podNamespace:string, podName:string, containerName:string, alertSeverity:EAlertSeverity, line:string, instanceId: string): void => {
        // line includes timestamp at front (beacuse of log stream configuration when starting logstream)
        let i = line.indexOf(' ')
        let alertMessage: IAlertMessage = {
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            instance: instanceId,
            type: EInstanceMessageType.DATA,
            namespace: podNamespace,
            pod: podName,
            container: containerName,
            channel: EInstanceMessageChannel.ALERT,
            text: line.substring(i + 1),
            timestamp: new Date(line.substring(0, i)),
            severity: alertSeverity,
            msgtype: 'alertmessage'
        }
        webSocket.send(JSON.stringify(alertMessage))   
    }

    sendMetricAlert = (webSocket: WebSocket, podNamespace: string, podName: string, containerName: string, severity: EAlertSeverity, text: string, instanceId: string): void => {
        let alertMessage: IAlertMessage = {
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            instance: instanceId,
            type: EInstanceMessageType.DATA,
            namespace: podNamespace,
            pod: podName,
            container: containerName,
            channel: EInstanceMessageChannel.ALERT,
            text,
            timestamp: new Date(),
            severity,
            msgtype: 'alertmessage'
        }
        webSocket.send(JSON.stringify(alertMessage))
    }

    processAlertSeverity = (webSocket:WebSocket, asset:IAsset, alertSeverity:EAlertSeverity, regexes:RegExp[], line:string, instaceId:string): void => {
        for (var regex of regexes) {
            var i = line.indexOf(' ')
            if (regex.test(line.substring(i))) {
                this.sendAlert(webSocket, asset.podNamespace, asset.podName, asset.containerName, alertSeverity, line, instaceId)
            }
        }
    }

    sendAlertLines = (webSocket:WebSocket, instanceId:string, asset:IAsset, text:string): boolean => {
        var socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) {
            return false
        }

        let instances = socket.instances
        if (!instances) {
            console.log('No instances found for sendAlertData')
            return false
        }
        var instance = instances.find (i => i.instanceId === instanceId)
        if (!instance) {
            console.log(`No instance found for sendAlertData instance ${instanceId}`)
            return false
        }

        if (instance.paused) return true

        const logLines = text.split('\n')
        for (var line of logLines) {
            if (line.trim() !== '') {
                this.processAlertSeverity(webSocket, asset, EAlertSeverity.INFO, instance.regExps.get(EAlertSeverity.INFO)!, line, instanceId)
                this.processAlertSeverity(webSocket, asset, EAlertSeverity.WARNING, instance.regExps.get(EAlertSeverity.WARNING)!, line, instanceId)
                this.processAlertSeverity(webSocket, asset, EAlertSeverity.ERROR, instance.regExps.get(EAlertSeverity.ERROR)!, line, instanceId)
            }
        }
        return true
    }

    sendBlock (webSocket: WebSocket, instanceId: string, asset: IAsset, text:string)  {
        if (asset.buffer!=='') {
            // if we have some text from a previous incompleted chunk, we prepend it now
            text = asset.buffer + text
            asset.buffer = ''
        }
        if (!text.endsWith('\n')) {
            // it's an incomplete chunk, we cut on the last complete line and store the rest of data for prepending it to next chunk
            var i=text.lastIndexOf('\n')
            var next=text.substring(i)
            asset.buffer = next
            text = text.substring(0,i)
        }
        if (! this.sendAlertLines(webSocket, instanceId, asset, text)) {
            // we do nothing, cause if there is an error maybe client reconnects later
        }
    }

}

export { AlertChannel }