import { IInstanceConfig, ISignalMessage, EClusterType, IInstanceConfigResponse, IInstanceMessage, BackChannelData, EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageChannel, EInstanceMessageType, ESignalMessageLevel, IBackChannelRequirements } from '@kwirthmagnify/kwirth-common'
import { IBackChannelObject } from '@kwirthmagnify/kwirth-common-back'
import * as stream from 'stream'
import { PassThrough } from 'stream'
import { Request, Response } from 'express'
import { EAlertSeverity, IAlertInstanceConfig, IAlertMessage, IAlertMetricRule, IMetricsCluster, TAlertMetricOperator } from './AlertTypes'

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
    podNamespace: string
    podName: string
    containerName: string
    passThroughStream?: PassThrough
    readableStream?: NodeJS.ReadableStream
    buffer: string
}

interface IAlertState {
    firing: boolean
    lastFired: number
}

interface IInstance {
    instanceId: string
    assets: IAsset[]
    regExps: Map<EAlertSeverity, RegExp[]>
    metricRules: IAlertMetricRule[]
    alertStates: Map<string, IAlertState>
    paused: boolean
    senderId?: string
    senderConfigName?: string
}

class AlertChannel {
    readonly channelId = 'alert'
    readonly requirements: IBackChannelRequirements = { storage: false, providers: ['metrics'] }
    clusterInfo: any
    backChannelObject: IBackChannelObject
    webSockets: { ws: WebSocket, lastRefresh: number, instances: IInstance[] }[] = []

    constructor(clusterInfo: any, backChannelObject: IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
    }

    getChannelData(): BackChannelData {
        return {
            id: 'alert', routable: false, pauseable: true, modifiable: false, reconnectable: true,
            metrics: false, sources: [EClusterType.DOCKER, EClusterType.KUBERNETES],
            endpoints: [], websocket: false, cluster: false, resourced: true
        }
    }

    getChannelScopeLevel(scope: string): number { return ['', 'view', 'create', 'cluster'].indexOf(scope) }

    startChannel = async () => { this.clusterInfo.addSubscriber('metrics', this, {}) }

    processProviderEvent(providerId: string, obj: any): void {
        if (providerId !== 'metrics') return
        const event = obj as IMetricsCluster
        for (const socketObj of this.webSockets) {
            for (const instance of socketObj.instances) {
                if (instance.paused || instance.metricRules.length === 0) continue
                for (const asset of instance.assets) {
                    for (const rule of instance.metricRules) {
                        const stateKey = `${asset.podName}/${asset.containerName}/${rule.metric}`
                        const clusterEntry = event.clusterMetricValues?.get(rule.metric)
                        if (clusterEntry !== undefined) {
                            const triggered = evaluateMetricRule(clusterEntry.value, rule.operator, rule.value)
                            const state = instance.alertStates.get(stateKey) ?? { firing: false, lastFired: 0 }
                            if (triggered) {
                                let shouldFire = false
                                if (rule.mode === 'leading-edge') shouldFire = !state.firing
                                else if (rule.mode === 'cooldown') { const elapsed = Date.now() - state.lastFired; shouldFire = state.lastFired === 0 || elapsed >= rule.cooldown * 1000 }
                                else shouldFire = true
                                if (shouldFire) {
                                    this.sendMetricAlert(socketObj.ws, asset.podNamespace, asset.podName, asset.containerName, rule.severity, `Metric ${rule.metric} = ${clusterEntry.value.toFixed(2)} ${rule.operator} ${rule.value}`, instance.instanceId)
                                    state.lastFired = Date.now()
                                }
                            }
                            state.firing = triggered
                            instance.alertStates.set(stateKey, state)
                            continue
                        }
                        for (const node of event.nodes) {
                            const containerKey = `${asset.podNamespace}/${asset.podName}/${asset.containerName}/${rule.metric}`
                            const containerEntry = node.containerMetricValues.get(containerKey)
                            const podEntry = containerEntry === undefined ? node.podMetricValues.get(`${asset.podNamespace}/${asset.podName}/${rule.metric}`) : undefined
                            const resolved = containerEntry?.value ?? podEntry?.value
                            if (resolved !== undefined) {
                                const triggered = evaluateMetricRule(resolved, rule.operator, rule.value)
                                const state = instance.alertStates.get(stateKey) ?? { firing: false, lastFired: 0 }
                                if (triggered) {
                                    let shouldFire = false
                                    if (rule.mode === 'leading-edge') shouldFire = !state.firing
                                    else if (rule.mode === 'cooldown') { const elapsed = Date.now() - state.lastFired; shouldFire = state.lastFired === 0 || elapsed >= rule.cooldown * 1000 }
                                    else shouldFire = true
                                    if (shouldFire) {
                                        this.sendMetricAlert(socketObj.ws, asset.podNamespace, asset.podName, asset.containerName, rule.severity, `Metric ${rule.metric} = ${resolved.toFixed(2)} ${rule.operator} ${rule.value}`, instance.instanceId)
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

    websocketRequest(_newWebSocket: WebSocket, _instanceId: string, _instanceConfig: IInstanceConfig): void { }
    async endpointRequest(_endpoint: string, _req: Request, _res: Response): Promise<void> { }

    containsAsset = (webSocket: WebSocket, podNamespace: string, podName: string, containerName: string): boolean => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        return socket?.instances.some(i => i.assets.some(a => a.podNamespace === podNamespace && a.podName === podName && a.containerName === containerName)) ?? false
    }

    containsInstance(instanceId: string): boolean {
        return this.webSockets.some(s => s.instances.find(i => i.instanceId === instanceId))
    }

    async startDockerStream(webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string, regExps: Map<EAlertSeverity, RegExp[]>, metricRules: IAlertMetricRule[], senderId?: string, senderConfigName?: string): Promise<void> {
        try {
            const id = await this.clusterInfo.dockerTools.getContainerId(podName, containerName)
            if (!id) { this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Cannot obtain Id for container ${podName}/${containerName}`, instanceConfig); return }
            let socket = this.webSockets.find(s => s.ws === webSocket)
            if (!socket) { const len = this.webSockets.push({ ws: webSocket, lastRefresh: Date.now(), instances: [] }); socket = this.webSockets[len - 1] }
            let instance = socket.instances.find(i => i.instanceId === instanceConfig.instance)
            if (!instance) {
                const len = socket.instances.push({ instanceId: instanceConfig.instance, regExps, metricRules, alertStates: new Map(), paused: false, assets: [], senderId, senderConfigName })
                instance = socket.instances[len - 1]
            }
            const asset: IAsset = { podNamespace, podName, containerName: '', buffer: '' }
            instance.assets.push(asset)
            const container = this.clusterInfo.dockerApi.getContainer(id)
            asset.readableStream = await container.logs({ follow: true, stdout: true, stderr: true })
            asset.readableStream!.on('data', (chunk: any) => { this.sendBlock(webSocket, instanceConfig.instance, asset, chunk.toString('utf8')) })
        } catch (err) {
            console.error('[alert] Error starting docker stream:', err)
            this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, err as string, instanceConfig)
        }
    }

    async startKubernetesStream(webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string, regExps: Map<EAlertSeverity, RegExp[]>, metricRules: IAlertMetricRule[], senderId?: string, senderConfigName?: string): Promise<void> {
        try {
            let socket = this.webSockets.find(s => s.ws === webSocket)
            if (!socket) { const len = this.webSockets.push({ ws: webSocket, lastRefresh: Date.now(), instances: [] }); socket = this.webSockets[len - 1] }
            let instance = socket.instances.find(i => i.instanceId === instanceConfig.instance)
            if (!instance) {
                const len = socket.instances.push({ instanceId: instanceConfig.instance, regExps, metricRules, alertStates: new Map(), paused: false, assets: [], senderId, senderConfigName })
                instance = socket.instances[len - 1]
            }
            const asset: IAsset = { podNamespace, podName, containerName, buffer: '' }
            instance.assets.push(asset)
            asset.passThroughStream = new stream.PassThrough()
            asset.passThroughStream.on('data', (chunk: any) => { this.sendBlock(webSocket, instanceConfig.instance, asset, chunk.toString('utf8')) })
            await this.clusterInfo.logApi.log(podNamespace, podName, containerName, asset.passThroughStream, { follow: true, pretty: false })
        } catch (err) {
            console.error('[alert] Error starting k8s stream:', err)
            this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, err as string, instanceConfig)
        }
    }

    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> => {
        const data = instanceConfig.data as IAlertInstanceConfig
        const regexes: Map<EAlertSeverity, RegExp[]> = new Map()
        regexes.set(EAlertSeverity.INFO, (data.regexInfo ?? []).map(r => new RegExp(r)))
        regexes.set(EAlertSeverity.WARNING, (data.regexWarning ?? []).map(r => new RegExp(r)))
        regexes.set(EAlertSeverity.ERROR, (data.regexError ?? []).map(r => new RegExp(r)))
        const metricRules = data.metricRules ?? []
        if (this.clusterInfo.type === EClusterType.DOCKER) {
            this.startDockerStream(webSocket, instanceConfig, podNamespace, podName, containerName, regexes, metricRules, data.senderId, data.senderConfigName)
        } else if (this.clusterInfo.type === EClusterType.KUBERNETES) {
            this.startKubernetesStream(webSocket, instanceConfig, podNamespace, podName, containerName, regexes, metricRules, data.senderId, data.senderConfigName)
        } else {
            console.log('[alert] Unsupported source')
            return false
        }
        return true
    }

    deleteObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        const instance = socket?.instances.find(i => i.instanceId === instanceConfig.instance)
        if (instance) {
            const toRemove = instance.assets.filter(a => a.podNamespace === podNamespace && a.podName === podName && (containerName === '' || a.containerName === containerName))
            for (const asset of toRemove) {
                for (const rule of instance.metricRules) instance.alertStates.delete(`${asset.podName}/${asset.containerName}/${rule.metric}`)
                asset.passThroughStream?.destroy()
                ;(asset.readableStream as stream.Readable | undefined)?.destroy()
            }
            instance.assets = instance.assets.filter(a => !(a.podNamespace === podNamespace && a.podName === podName && (containerName === '' || a.containerName === containerName)))
        }
        return true
    }

    pauseContinueInstance(webSocket: WebSocket, instanceConfig: IInstanceConfig, action: EInstanceMessageAction): void {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        const instance = socket?.instances.find(i => i.instanceId === instanceConfig.instance)
        if (instance) {
            if (action === EInstanceMessageAction.PAUSE) { instance.paused = true; this.sendInstanceConfigMessage(webSocket, EInstanceMessageAction.PAUSE, EInstanceMessageFlow.RESPONSE, EInstanceMessageChannel.ALERT, instanceConfig, 'Alert paused') }
            if (action === EInstanceMessageAction.CONTINUE) { instance.paused = false; this.sendInstanceConfigMessage(webSocket, EInstanceMessageAction.CONTINUE, EInstanceMessageFlow.RESPONSE, EInstanceMessageChannel.ALERT, instanceConfig, 'Alert continued') }
        } else {
            this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Instance ${instanceConfig.instance} not found`, instanceConfig)
        }
    }

    modifyInstance(_webSocket: WebSocket, _instanceConfig: IInstanceConfig): void { }

    stopInstance(webSocket: WebSocket, instanceConfig: IInstanceConfig): void {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return
        if (socket.instances.find(i => i.instanceId === instanceConfig.instance)) {
            this.removeInstance(webSocket, instanceConfig.instance)
            this.sendInstanceConfigMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, EInstanceMessageChannel.ALERT, instanceConfig, 'Alert channel instance stopped')
        } else {
            this.sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Instance not found`, instanceConfig)
        }
    }

    removeInstance(webSocket: WebSocket, instanceId: string): void {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            const pos = socket.instances.findIndex(t => t.instanceId === instanceId)
            if (pos >= 0) {
                for (const asset of socket.instances[pos].assets) { asset.passThroughStream?.destroy(); (asset.readableStream as stream.Readable | undefined)?.destroy() }
                socket.instances.splice(pos, 1)
            }
        }
    }

    async processCommand(_webSocket: WebSocket, _instanceMessage: IInstanceMessage): Promise<boolean> { return false }
    containsConnection(webSocket: WebSocket): boolean { return Boolean(this.webSockets.find(s => s.ws === webSocket)) }

    removeConnection(webSocket: WebSocket): void {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            for (const id of socket.instances.map(i => i.instanceId)) this.removeInstance(webSocket, id)
            const pos = this.webSockets.findIndex(s => s.ws === webSocket)
            this.webSockets.splice(pos, 1)
        }
    }

    refreshConnection(webSocket: WebSocket): boolean {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) { socket.lastRefresh = Date.now(); return true }
        return false
    }

    updateConnection(newWebSocket: WebSocket, instanceId: string): boolean {
        for (const entry of this.webSockets) {
            if (entry.instances.find(i => i.instanceId === instanceId)) {
                entry.ws = newWebSocket
                for (const instance of entry.instances) {
                    if (this.clusterInfo.type === EClusterType.DOCKER) {
                        for (const asset of instance.assets) {
                            if (asset.readableStream) {
                                asset.readableStream.removeAllListeners('data')
                                asset.readableStream.on('data', (chunk: any) => { try { this.sendBlock(newWebSocket, instance.instanceId, asset, chunk.toString('utf8')) } catch (err) { console.log(err) } })
                            }
                        }
                    } else if (this.clusterInfo.type === EClusterType.KUBERNETES) {
                        for (const asset of instance.assets) {
                            if (asset.passThroughStream) {
                                asset.passThroughStream.removeAllListeners('data')
                                asset.passThroughStream.on('data', (chunk: any) => { try { this.sendBlock(newWebSocket, instance.instanceId, asset, chunk.toString('utf8')) } catch (err) { console.log(err) } })
                            }
                        }
                    }
                }
                return true
            }
        }
        return false
    }

    // ─── PRIVATE ────────────────────────────────────────────────────────────────

    private sendInstanceConfigMessage = (ws: WebSocket, action: EInstanceMessageAction, flow: EInstanceMessageFlow, channel: EInstanceMessageChannel, instanceConfig: IInstanceConfig, text: string): void => {
        ws.send(JSON.stringify({ action, flow, channel, instance: instanceConfig.instance, type: EInstanceMessageType.SIGNAL, text } as IInstanceConfigResponse))
    }

    private sendChannelSignal(webSocket: WebSocket, level: ESignalMessageLevel, text: string, instanceConfig: IInstanceConfig): void {
        webSocket.send(JSON.stringify({ action: EInstanceMessageAction.NONE, flow: EInstanceMessageFlow.RESPONSE, level, channel: instanceConfig.channel, instance: instanceConfig.instance, type: EInstanceMessageType.SIGNAL, text } as ISignalMessage))
    }

    private sendAlert = (webSocket: WebSocket, podNamespace: string, podName: string, containerName: string, alertSeverity: EAlertSeverity, line: string, instanceId: string): void => {
        const i = line.indexOf(' ')
        const text = line.substring(i + 1)
        const alertMessage: IAlertMessage = {
            action: EInstanceMessageAction.NONE, flow: EInstanceMessageFlow.UNSOLICITED, instance: instanceId,
            type: EInstanceMessageType.DATA, namespace: podNamespace, pod: podName, container: containerName,
            channel: EInstanceMessageChannel.ALERT, text, timestamp: new Date(line.substring(0, i)), severity: alertSeverity, msgtype: 'alertmessage'
        }
        webSocket.send(JSON.stringify(alertMessage))
        this.fireSender(webSocket, instanceId, alertSeverity, `${podNamespace}/${podName}/${containerName}: ${text}`)
    }

    private sendMetricAlert = (webSocket: WebSocket, podNamespace: string, podName: string, containerName: string, severity: EAlertSeverity, text: string, instanceId: string): void => {
        const alertMessage: IAlertMessage = {
            action: EInstanceMessageAction.NONE, flow: EInstanceMessageFlow.UNSOLICITED, instance: instanceId,
            type: EInstanceMessageType.DATA, namespace: podNamespace, pod: podName, container: containerName,
            channel: EInstanceMessageChannel.ALERT, text, timestamp: new Date(), severity, msgtype: 'alertmessage'
        }
        webSocket.send(JSON.stringify(alertMessage))
        this.fireSender(webSocket, instanceId, severity, `${podNamespace}/${podName}/${containerName}: ${text}`)
    }

    private fireSender = (webSocket: WebSocket, instanceId: string, severity: EAlertSeverity, text: string): void => {
        const instance = this.webSockets.find(s => s.ws === webSocket)?.instances.find(i => i.instanceId === instanceId)
        if (!instance?.senderId || !instance.senderConfigName) return
        this.backChannelObject.senders?.send(instance.senderId, instance.senderConfigName, { subject: `Alert [${severity}]`, body: text, level: severity })
    }

    private processAlertSeverity = (webSocket: WebSocket, asset: IAsset, alertSeverity: EAlertSeverity, regexes: RegExp[], line: string, instanceId: string): void => {
        for (const regex of regexes) {
            const i = line.indexOf(' ')
            if (regex.test(line.substring(i))) this.sendAlert(webSocket, asset.podNamespace, asset.podName, asset.containerName, alertSeverity, line, instanceId)
        }
    }

    private sendAlertLines = (webSocket: WebSocket, instanceId: string, asset: IAsset, text: string): boolean => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return false
        const instance = socket.instances.find(i => i.instanceId === instanceId)
        if (!instance) return false
        if (instance.paused) return true
        for (const line of text.split('\n')) {
            if (line.trim() !== '') {
                this.processAlertSeverity(webSocket, asset, EAlertSeverity.INFO, instance.regExps.get(EAlertSeverity.INFO)!, line, instanceId)
                this.processAlertSeverity(webSocket, asset, EAlertSeverity.WARNING, instance.regExps.get(EAlertSeverity.WARNING)!, line, instanceId)
                this.processAlertSeverity(webSocket, asset, EAlertSeverity.ERROR, instance.regExps.get(EAlertSeverity.ERROR)!, line, instanceId)
            }
        }
        return true
    }

    private sendBlock(webSocket: WebSocket, instanceId: string, asset: IAsset, text: string): void {
        if (asset.buffer !== '') { text = asset.buffer + text; asset.buffer = '' }
        if (!text.endsWith('\n')) { const i = text.lastIndexOf('\n'); asset.buffer = text.substring(i); text = text.substring(0, i) }
        this.sendAlertLines(webSocket, instanceId, asset, text)
    }
}

export { AlertChannel }
