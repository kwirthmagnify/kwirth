import { IInstanceConfig, ISignalMessage, IInstanceMessage, AccessKey, accessKeyDeserialize, parseResources, BackChannelData, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel, EInstanceMessageChannel, EInstanceMessageType, EClusterType, IBackChannelObject, IBackChannelRequirements } from '@kwirthmagnify/kwirth-common'
import { Request, Response } from 'express'
import { applyAllResources, deleteAllResources, createCrdInformer, ICrdInformerHandlers } from '@kwirthmagnify/kwirth-common-back'
import { ETrivyCommand, IKnown, ITrivyMessage, ITrivyMessageResponse, IUnknown } from './TrivyTypes'
import zlib from 'zlib'
// @ts-ignore
import trivyOperatorYamlGz from './trivy-operator-0.30.1.yaml'

const trivyOperatorYaml = zlib.gunzipSync(Buffer.from(trivyOperatorYamlGz, 'base64')).toString('utf-8')

const TRIVY_API_VERSION = 'v1alpha1'
const TRIVY_API_GROUP = 'aquasecurity.github.io'
const TRIVY_API_VULN_PLURAL = 'vulnerabilityreports'
const TRIVY_API_AUDIT_PLURAL = 'configauditreports'
const TRIVY_API_SBOM_PLURAL = 'sbomreports'
const TRIVY_API_EXPOSED_PLURAL = 'exposedsecretreports'

export interface IAsset {
    podNamespace: string
    podName: string
    containerName: string
}

export interface IInstance {
    instanceId: string
    accessKey: AccessKey
    assets: IAsset[]
    maxCritical: number
    maxHigh: number
    maxMedium: number
    maxLow: number
}

class TrivyChannel {
    readonly channelId = 'trivy'
    readonly requirements: IBackChannelRequirements = { storage: false, providers: [] }
    clusterInfo: any
    backChannelObject: IBackChannelObject
    informers: Map<string, any> = new Map()
    webSockets: { ws: WebSocket, lastRefresh: number, instances: IInstance[] }[] = []

    constructor(clusterInfo: any, backChannelObject: IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
    }

    getChannelData = (): BackChannelData => ({
        id: this.channelId, routable: false, pauseable: false, modifiable: false, reconnectable: false,
        metrics: false, sources: [EClusterType.KUBERNETES],
        endpoints: [{ name: 'operator', methods: ['GET'], requiresAccessKey: true }],
        websocket: false, cluster: false, resourced: true
    })

    getChannelScopeLevel = (scope: string): number => ['', 'trivy$workload', 'trivy$kubernetes', 'cluster'].indexOf(scope)

    startChannel = async () => { }
    processProviderEvent(_providerId: string, _obj: any): void { }

    async endpointRequest(endpoint: string, req: Request, res: Response): Promise<void> {
        console.log(`[trivy] endpointRequest: ${endpoint} ${req.method} ${req.url}`)
        const action = req.query['action']
        switch (action) {
            case 'install':
                try {
                    await applyAllResources(trivyOperatorYaml, this.clusterInfo)
                    res.status(200).send('ok')
                } catch (err) { res.status(500).send(err) }
                break
            case 'remove':
                try {
                    await deleteAllResources(trivyOperatorYaml, this.clusterInfo)
                    res.status(200).send()
                } catch (err) { res.status(500).send(err) }
                break
            case 'status':
                try {
                    const cm = await this.clusterInfo.coreApi?.readNamespacedConfigMap({ name: 'trivy-operator-trivy-config', namespace: 'trivy-system' })
                    if (!cm.data) {
                        res.status(404).send(`No Trivy config map exist on namespace 'trivy-system', Trivy seems not to be installed.`)
                    } else {
                        res.status(200).send(`Installed [${cm.data['trivy.command']}, 0.30.1]`)
                    }
                } catch (err) {
                    res.status(200).send(`Not installed (Trivy configMap not found in 'trivy-system')`)
                }
                break
            default:
                res.status(500).send('Invalid action ' + action)
        }
    }

    async websocketRequest(_newWebSocket: WebSocket): Promise<void> { }

    containsAsset = (webSocket: WebSocket, podNamespace: string, podName: string, containerName: string): boolean => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        return socket?.instances.some(i => i.assets.some(a => a.podNamespace === podNamespace && a.podName === podName && a.containerName === containerName)) ?? false
    }

    containsInstance = (instanceId: string): boolean => this.webSockets.some(s => s.instances.find(i => i.instanceId === instanceId))

    processCommand = async (webSocket: WebSocket, instanceMessage: IInstanceMessage): Promise<boolean> => {
        if (instanceMessage.flow === EInstanceMessageFlow.IMMEDIATE) return false
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return false
        const instance = socket.instances.find(i => i.instanceId === instanceMessage.instance)
        if (!instance) {
            this.sendSignalMessage(webSocket, instanceMessage.action, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceMessage.instance, `Instance not found`)
            return false
        }
        const resp = await this.executeCommand(instanceMessage as ITrivyMessage, instance)
        if (resp) webSocket.send(JSON.stringify(resp))
        return Boolean(resp)
    }

    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) {
            const len = this.webSockets.push({ ws: webSocket, lastRefresh: Date.now(), instances: [] })
            socket = this.webSockets[len - 1]
        }
        let instance = socket.instances.find(i => i.instanceId === instanceConfig.instance)
        if (!instance) {
            instance = { accessKey: accessKeyDeserialize(instanceConfig.accessKey), instanceId: instanceConfig.instance, assets: [], maxCritical: 0, maxHigh: 0, maxMedium: 0, maxLow: 0 }
            socket.instances.push(instance)
        }
        const ic = instanceConfig.data
        if (ic) { instance.maxCritical = ic.maxCritical; instance.maxHigh = ic.maxHigh; instance.maxMedium = ic.maxMedium; instance.maxLow = ic.maxLow }
        const asset: IAsset = { podNamespace, podName, containerName }

        const sendIfKnown = (result: any) => {
            if (!result.known) return
            const payload: ITrivyMessageResponse = {
                msgtype: 'trivymessageresponse', msgsubtype: 'add', id: '', namespace: asset.podNamespace, group: '',
                pod: asset.podName, container: asset.containerName, action: EInstanceMessageAction.NONE,
                flow: EInstanceMessageFlow.UNSOLICITED, type: EInstanceMessageType.DATA, channel: EInstanceMessageChannel.TRIVY, instance: instance!.instanceId
            }
            payload.data = result
            webSocket.send(JSON.stringify(payload))
        }

        sendIfKnown(await this.getAssetVulnReport(instance, asset))
        sendIfKnown(await this.getAssetAuditReport(instance, asset))
        sendIfKnown(await this.getAssetSbomReport(instance, asset))
        sendIfKnown(await this.getAssetExposedReport(instance, asset))
        instance.assets.push(asset)

        for (const plural of [TRIVY_API_VULN_PLURAL, TRIVY_API_AUDIT_PLURAL, TRIVY_API_SBOM_PLURAL, TRIVY_API_EXPOSED_PLURAL]) {
            if (!this.informers.has(plural)) {
                const informer = this.createInformer(webSocket, instance, plural)
                this.informers.set(plural, informer)
                informer.start()
            }
        }
        return true
    }

    deleteObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        const instance = socket?.instances.find(i => i.instanceId === instanceConfig.instance)
        if (instance) instance.assets = instance.assets.filter(a => !(a.podNamespace === podNamespace && a.podName === podName && (containerName === '' || a.containerName === containerName)))
        return true
    }

    pauseContinueInstance(_webSocket: WebSocket, _instanceConfig: IInstanceConfig, _action: EInstanceMessageAction): void { }
    modifyInstance(_webSocket: WebSocket, _instanceConfig: IInstanceConfig): void { }

    stopInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig): void => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket?.instances.find(i => i.instanceId === instanceConfig.instance)) {
            this.removeInstance(webSocket, instanceConfig.instance)
            this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instanceConfig.instance, 'Trivy instance stopped')
        } else {
            this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceConfig.instance, `Trivy instance not found`)
        }
    }

    removeInstance = (webSocket: WebSocket, instanceId: string): void => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            const pos = socket.instances.findIndex(t => t.instanceId === instanceId)
            if (pos >= 0) socket.instances.splice(pos, 1)
        }
        if (!this.webSockets.some(s => s.instances.length > 0)) {
            for (const informer of this.informers.values()) {
                try { informer.stop() } catch {}
            }
            this.informers.clear()
        }
    }

    containsConnection = (webSocket: WebSocket): boolean => Boolean(this.webSockets.find(s => s.ws === webSocket))

    removeConnection = (webSocket: WebSocket): void => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            for (const id of socket.instances.map(i => i.instanceId)) this.removeInstance(webSocket, id)
            const pos = this.webSockets.findIndex(s => s.ws === webSocket)
            this.webSockets.splice(pos, 1)
        }
    }

    refreshConnection = (webSocket: WebSocket): boolean => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) { socket.lastRefresh = Date.now(); return true }
        return false
    }

    updateConnection = (_newWebSocket: WebSocket, _instanceId: string): boolean => false

    // ─── PRIVATE ────────────────────────────────────────────────────────────────

    private sendSignalMessage = (ws: WebSocket, action: EInstanceMessageAction, flow: EInstanceMessageFlow, level: ESignalMessageLevel, instanceId: string, text: string): void => {
        ws.send(JSON.stringify({ action, flow, channel: EInstanceMessageChannel.TRIVY, instance: instanceId, type: EInstanceMessageType.SIGNAL, text, level } as ISignalMessage))
    }

    private checkScopes = (instance: IInstance, scope: string) => {
        const resources = parseResources(instance.accessKey.resources)
        const requiredLevel = this.getChannelScopeLevel(scope)
        return resources.some((r: any) => r.scopes.split(',').some((sc: string) => this.getChannelScopeLevel(sc) >= requiredLevel))
    }

    createInformer = (webSocket: WebSocket, instance: IInstance, plural: string) => {
        const handlers: ICrdInformerHandlers = {
            onAdd:    (obj: any) => this.processInformerEvent(webSocket, instance, plural, 'add', obj),
            onUpdate: (obj: any) => this.processInformerEvent(webSocket, instance, plural, 'update', obj),
            onDelete: (obj: any) => this.processInformerEvent(webSocket, instance, plural, 'delete', obj),
            onError:  (err: any) => {
                try {
                    console.error('[trivy] Informer error:', err)
                    if (err['HTTP-Code'] === '404' || err.statusCode === 404)
                        console.log('[trivy] CRD not found, informer will not restart')
                    else
                        setTimeout(() => { informer.start(); console.log('[trivy] Informer restarted') }, 5000)
                } catch (e) { console.error('[trivy] Error managing informer error:', e) }
            }
        }
        const informer = createCrdInformer(this.clusterInfo, TRIVY_API_GROUP, TRIVY_API_VERSION, plural, handlers)
        return informer
    }

    private async getReport(plural: string, instance: IInstance, asset: IAsset, withContainer: boolean): Promise<{ resource: string, known?: IKnown, unknown?: IUnknown }> {
        try {
            const crdName = await this.getCrdName(asset.podNamespace, asset.podName, withContainer ? asset.containerName : undefined)
            if (crdName) {
                try {
                    const crdObject = await this.clusterInfo.crdApi.getNamespacedCustomObject({ group: TRIVY_API_GROUP, version: TRIVY_API_VERSION, namespace: asset.podNamespace, plural, name: crdName })
                    return { resource: plural, known: { container: asset.containerName, name: asset.podName, namespace: asset.podNamespace, report: crdObject.report } }
                } catch (err: any) {
                    return { resource: plural, unknown: { container: asset.containerName, name: asset.podName, namespace: asset.podNamespace, statusCode: 0, statusMessage: err.toString() } }
                }
            }
            return { resource: plural, unknown: { container: asset.containerName, name: asset.podName, namespace: asset.podNamespace, statusCode: 999, statusMessage: 'Cannot get CRD name' } }
        } catch (err: any) {
            console.error('[trivy] Caught error:', err)
            return { resource: plural, unknown: { container: asset.containerName, name: asset.podName, namespace: asset.podNamespace, statusCode: 999, statusMessage: err } }
        }
    }

    getAssetVulnReport = (instance: IInstance, asset: IAsset) => this.getReport(TRIVY_API_VULN_PLURAL, instance, asset, true)
    getAssetAuditReport = (instance: IInstance, asset: IAsset) => this.getReport(TRIVY_API_AUDIT_PLURAL, instance, asset, false)
    getAssetSbomReport = (instance: IInstance, asset: IAsset) => this.getReport(TRIVY_API_SBOM_PLURAL, instance, asset, true)
    getAssetExposedReport = (instance: IInstance, asset: IAsset) => this.getReport(TRIVY_API_EXPOSED_PLURAL, instance, asset, true)

    removeReport = async (plural: string, trivyMessage: ITrivyMessage): Promise<string | undefined> => {
        const crdName = await this.getCrdName(trivyMessage.namespace, trivyMessage.pod, trivyMessage.container)
        if (crdName) {
            try {
                await this.clusterInfo.crdApi.deleteNamespacedCustomObject({ group: TRIVY_API_GROUP, version: TRIVY_API_VERSION, namespace: trivyMessage.namespace, plural, name: crdName })
                return undefined
            } catch (err) { return `Error removing ${plural}: ` + err }
        }
        return `Couldn't get CRD name`
    }

    executeCommand = async (trivyMessage: ITrivyMessage, instance: IInstance): Promise<ITrivyMessageResponse> => {
        const resp: ITrivyMessageResponse = {
            msgtype: 'trivymessageresponse', id: '', namespace: trivyMessage.namespace, group: trivyMessage.group,
            pod: trivyMessage.pod, container: trivyMessage.container, action: trivyMessage.action,
            flow: EInstanceMessageFlow.RESPONSE, type: EInstanceMessageType.DATA, channel: trivyMessage.channel, instance: trivyMessage.instance
        }
        if (trivyMessage.command === ETrivyCommand.RESCAN) {
            const errors = await Promise.all([TRIVY_API_VULN_PLURAL, TRIVY_API_AUDIT_PLURAL, TRIVY_API_EXPOSED_PLURAL, TRIVY_API_SBOM_PLURAL].map(p => this.removeReport(p, trivyMessage)))
            const err = errors.find(Boolean)
            if (err) resp.data = err
        }
        return resp
    }

    private processInformerEvent = async (webSocket: WebSocket, instance: IInstance, plural: string, event: string, obj: any) => {
        const asset = instance.assets.find(a =>
            'Pod' === obj.metadata.labels['trivy-operator.resource.kind'] &&
            a.containerName === obj.metadata.labels['trivy-operator.container.name'] &&
            a.podNamespace === obj.metadata.labels['trivy-operator.resource.namespace'] &&
            a.podName.startsWith(obj.metadata.labels['trivy-operator.resource.name'])
        )
        if (!asset) return
        const payload: ITrivyMessageResponse = {
            msgtype: 'trivymessageresponse', msgsubtype: event, id: '', namespace: asset.podNamespace, group: '',
            pod: asset.podName, container: asset.containerName, action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED, type: EInstanceMessageType.DATA, channel: EInstanceMessageChannel.TRIVY, instance: instance.instanceId
        }
        if (event === 'add' || event === 'update') {
            switch (plural) {
                case TRIVY_API_VULN_PLURAL: payload.data = await this.getAssetVulnReport(instance, asset); break
                case TRIVY_API_AUDIT_PLURAL: payload.data = await this.getAssetAuditReport(instance, asset); break
                case TRIVY_API_SBOM_PLURAL: payload.data = await this.getAssetSbomReport(instance, asset); break
                case TRIVY_API_EXPOSED_PLURAL: payload.data = await this.getAssetExposedReport(instance, asset); break
            }
        } else {
            payload.data = { known: { name: asset.podName, namespace: asset.podNamespace, container: asset.containerName, report: undefined } satisfies IKnown }
        }
        payload.data.resource = plural
        webSocket.send(JSON.stringify(payload))
    }

    getCrdName = async (namespace: string, podName: string, containerName?: string): Promise<string | undefined> => {
        try {
            const podData = await this.clusterInfo.coreApi.readNamespacedPod({ name: podName, namespace })
            const ctrl = podData.metadata?.ownerReferences?.find((or: any) => or.controller)
            if (ctrl) return `${ctrl.kind.toLowerCase()}-${ctrl.name}${containerName ? '-' + containerName : ''}`
            return `pod-${podName}${containerName ? '-' + containerName : ''}`
        } catch (err) {
            console.error('[trivy] Cannot get CRD name:', err)
            return undefined
        }
    }
}

export { TrivyChannel }
