import { IInstanceConfig, ISignalMessage, IInstanceMessage, AccessKey, accessKeyDeserialize, parseResources, BackChannelData, ClusterTypeEnum, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel, EInstanceMessageChannel, EInstanceMessageType } from '@kwirthmagnify/kwirth-common';
import { ClusterInfo } from '../../model/ClusterInfo'
import { IBackChannelRequirements, IChannel } from '../IChannel'
import { Informer, KubernetesObject, makeInformer, ObjectCache } from '@kubernetes/client-node'
import { Request, Response } from 'express'
import { applyAllResources, deleteAllResources, restartController } from '../../tools/KubernetesTools'
import { ETrivyCommand, IKnown, ITrivyMessage, ITrivyMessageResponse, IUnknown } from './TrivyModel'
import * as path from 'path'
const fs = require('fs')

const TRIVY_API_VERSION = 'v1alpha1'
const TRIVY_API_GROUP = 'aquasecurity.github.io'
const TRIVY_API_VULN_PLURAL = 'vulnerabilityreports'
const TRIVY_API_AUDIT_PLURAL = 'configauditreports'
const TRIVY_API_SBOM_PLURAL = 'sbomreports'
const TRIVY_API_EXPOSED_PLURAL = 'exposedsecretreports'

type TInformer = (Informer<KubernetesObject> & ObjectCache<KubernetesObject>) | undefined

export interface IAsset {
    podNamespace: string
    podName: string
    containerName: string
}

export interface IInstance {
    instanceId: string
    accessKey: AccessKey
    assets: IAsset[]
    maxCritical:number
    maxHigh:number
    maxMedium:number
    maxLow:number
}

class TrivyChannel implements IChannel {
    readonly channelId = 'trivy'
    readonly requirements: IBackChannelRequirements = {
        storage: false
    }
    clusterInfo : ClusterInfo
    informers: Map<string, TInformer> = new Map()
    webSockets: {
        ws:WebSocket,
        lastRefresh: number,
        instances: IInstance[] 
    }[] = []

    constructor (clusterInfo:ClusterInfo) {
        this.clusterInfo = clusterInfo
    }

    getChannelData = (): BackChannelData => {
        return {
            id: this.channelId,
            routable: false,
            pauseable: false,
            modifiable: false,
            reconnectable: false,
            metrics: false,
            //events: false, 
            providers: [],
            sources: [ ClusterTypeEnum.KUBERNETES ],
            endpoints: [ {
                name: 'operator',
                methods: [ 'GET' ],
                requiresAccessKey: true
            } ],
            websocket: false,
            cluster: false
        }
    }

    getChannelScopeLevel = (scope: string): number => {
        return ['', 'trivy$workload', 'trivy$kubernetes', 'cluster'].indexOf(scope)
    }

    startChannel = async () =>  {
    }

    processProviderEvent(providerId:string, obj:any) : void {
    }

    async endpointRequest(endpoint:string,req:Request, res:Response) : Promise<void> {
        console.log('Received endpointRequest:', endpoint, req.method, req.url)
        let action = req.query['action']
        console.log('Action: ', action)

        switch (action) {
            case 'install':
                try {
                    const yaml = fs.readFileSync(path.join(__dirname, 'trivy-operator-0.30.1.yaml')) 
                    await applyAllResources(yaml, this.clusterInfo)
                    res.status(200).send('ok')
                    return
                }
                catch (err) {
                    res.status(500).send(err)
                    return
                }
            // case 'configfs':
            //     try {
            //         let cttoconfig = await this.clusterInfo.coreApi?.readNamespacedConfigMap({ name: cmNameOperatorConfig, namespace: ns })
            //         if (cttoconfig.data===undefined) {
            //             res.status(500).send('No Trivy config map exist')
            //             return
            //         }
            //         else {
            //             let cmtoconfig = cttoconfig
            //             cmtoconfig.data!['trivy.command'] = 'filesystem'
            //             cmtoconfig.data!['trivy.ignoreUnfixed'] = 'true'
            //             await this.clusterInfo.coreApi?.replaceNamespacedConfigMap({name: cmNameOperatorConfig, namespace: ns, body: cmtoconfig})

            //             let ctto = await this.clusterInfo.coreApi?.readNamespacedConfigMap({name: cmNameOperator, namespace: ns})
            //             let cmto = ctto
            //             cmto.data!['scanJob.podTemplateContainerSecurityContext'] = `{"allowPrivilegeEscalation":false,"capabilities":{"drop":["ALL"]},"privileged":false,"readOnlyRootFilesystem":true,"runAsUser":0}`
            //             cmto.data!['trivyOperator.scanJobPodTemplateContainerSecurityContext.runAsUser'] = '0'
            //             await this.clusterInfo.coreApi?.replaceNamespacedConfigMap({ name: cmNameOperator, namespace: ns, body: cmto})

            //             restartController('trivy-system', 'Deployment', 'trivy-operator', this.clusterInfo)

            //             res.status(200).send('ok')
            //             return
            //         }
            //     }
            //     catch (err) {
            //         res.status(500).send(err)
            //         return
            //     }
            // case 'configimg':
            //     try {
            //         let ct = await this.clusterInfo.coreApi?.readNamespacedConfigMap({ name: cmNameOperatorConfig, namespace: ns })
            //         if (ct.data===undefined) {
            //             res.status(500).send('No Trivy config map exist')
            //             return
            //         }
            //         else {
            //             let cmtoconfig = ct
            //             cmtoconfig.data!['trivy.command'] = 'image'
            //             if (cmtoconfig.data && cmtoconfig.data['trivy.ignoreUnfixed']) delete cmtoconfig.data['trivy.ignoreUnfixed']
            //             await this.clusterInfo.coreApi?.replaceNamespacedConfigMap({ name: cmNameOperatorConfig, namespace: ns, body: cmtoconfig })

            //             let ctto = await this.clusterInfo.coreApi?.readNamespacedConfigMap({ name: cmNameOperator, namespace: ns })
            //             let cmto = ctto
            //             if (cmto.data && cmto.data['scanJob.podTemplateContainerSecurityContext']) delete cmto.data['scanJob.podTemplateContainerSecurityContext']
            //             await this.clusterInfo.coreApi?.replaceNamespacedConfigMap({ name: cmNameOperator, namespace: ns, body:  cmto })

            //             restartController('trivy-system', 'Deployment', 'trivy-operator', this.clusterInfo)

            //             res.status(200).send('ok')
            //             return
            //         }
            //     }
            //     catch (err) {
            //         res.status(500).send(err)
            //         return
            //     }
            case 'remove':
                try {
                    const yaml = fs.readFileSync(path.join(__dirname, 'trivy-operator-0.30.1.yaml')) 
                    await deleteAllResources(yaml, this.clusterInfo)
                    res.status(200).send()
                }
                catch (err) {
                    res.status(500).send(err)
                    return
                }
                break
            case 'status':
                try {
                    let cmTrivyOperatorConfig = await this.clusterInfo.coreApi?.readNamespacedConfigMap({ name: 'trivy-operator-trivy-config', namespace: 'trivy-system' })
                    if (cmTrivyOperatorConfig.data===undefined) {
                        res.status(404).send(`No Trivy config map exist on namespace 'trivy-system', Trivy seems not to be installed.`)
                        return
                    }
                    else {
                        let trivyScanMode = cmTrivyOperatorConfig.data!['trivy.command']
                        res.status(200).send(`Installed [${trivyScanMode}, 0.30.1]`)
                        return 
                    }
                }
                catch (err) {
                    res.status(200).send(`Not installed (Trivy configMap not found in 'trivy-system')`)
                    return
                }
                break
            default:
                res.status(500).send('Invalid action '+req.query.action)
                return
        }
    }

    async websocketRequest(newWebSocket:WebSocket) : Promise<void> {
    }

    containsAsset = (webSocket:WebSocket, podNamespace:string, podName:string, containerName:string): boolean => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            let instances = socket.instances
            if (instances) return instances.some(i => i.assets.some(a => a.podNamespace===podNamespace && a.podName===podName && a.containerName===containerName))
        }
        return false
    }

    containsInstance = (instanceId: string): boolean => {
        return this.webSockets.some(socket => socket.instances.find(i => i.instanceId === instanceId))
    }

    processCommand = async (webSocket:WebSocket, instanceMessage:IInstanceMessage) : Promise<boolean> => {
        if (instanceMessage.flow === EInstanceMessageFlow.IMMEDIATE) return false

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
        let resp = await this.executeCommand(instanceMessage as ITrivyMessage, instance)
        if (resp) webSocket.send(JSON.stringify(resp))
        return Boolean(resp)
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
                accessKey: accessKeyDeserialize(instanceConfig.accessKey),
                instanceId: instanceConfig.instance,
                assets: [],
                maxCritical: 0,
                maxHigh: 0,
                maxMedium: 0,
                maxLow: 0,
            }
            instances.push(instance)
        }
        let ic = instanceConfig.data  // must match instanceConfig on Front
        instance.maxCritical = ic.maxCritical
        instance.maxHigh = ic.maxHigh
        instance.maxMedium = ic.maxMedium
        instance.maxLow = ic.maxLow
        let asset:IAsset = {
            podNamespace,
            podName,
            containerName,
        }

        // send vuln report
        let resultVuln = await this.getAssetVulnReport(instance, asset)
        if (resultVuln.known) {
            let payload:ITrivyMessageResponse = {
                msgtype: 'trivymessageresponse',
                msgsubtype: 'add',
                id: '',
                namespace: asset.podNamespace,
                group: '',
                pod: asset.podName,
                container: asset.containerName,
                action: EInstanceMessageAction.NONE,
                flow: EInstanceMessageFlow.UNSOLICITED,
                type: EInstanceMessageType.DATA,
                channel: EInstanceMessageChannel.TRIVY,
                instance: instance.instanceId
            }
            payload.data = resultVuln
            webSocket.send(JSON.stringify(payload))
        }

        let resultAudit = await this.getAssetAuditReport(instance, asset)
        if (resultAudit.known) {
            let payload:ITrivyMessageResponse = {
                msgtype: 'trivymessageresponse',
                msgsubtype: 'add',
                id: '',
                namespace: asset.podNamespace,
                group: '',
                pod: asset.podName,
                container: asset.containerName,
                action: EInstanceMessageAction.NONE,
                flow: EInstanceMessageFlow.UNSOLICITED,
                type: EInstanceMessageType.DATA,
                channel: EInstanceMessageChannel.TRIVY,
                instance: instance.instanceId
            }
            payload.data = resultAudit
            webSocket.send(JSON.stringify(payload))
        }

        let resultSbom = await this.getAssetSbomReport(instance, asset)
        if (resultSbom.known) {
            let payload:ITrivyMessageResponse = {
                msgtype: 'trivymessageresponse',
                msgsubtype: 'add',
                id: '',
                namespace: asset.podNamespace,
                group: '',
                pod: asset.podName,
                container: asset.containerName,
                action: EInstanceMessageAction.NONE,
                flow: EInstanceMessageFlow.UNSOLICITED,
                type: EInstanceMessageType.DATA,
                channel: EInstanceMessageChannel.TRIVY,
                instance: instance.instanceId
            }
            payload.data = resultSbom
            webSocket.send(JSON.stringify(payload))
        }

        let resultExposed = await this.getAssetExposedReport(instance, asset)
        if (resultExposed.known) {
            let payload:ITrivyMessageResponse = {
                msgtype: 'trivymessageresponse',
                msgsubtype: 'add',
                id: '',
                namespace: asset.podNamespace,
                group: '',
                pod: asset.podName,
                container: asset.containerName,
                action: EInstanceMessageAction.NONE,
                flow: EInstanceMessageFlow.UNSOLICITED,
                type: EInstanceMessageType.DATA,
                channel: EInstanceMessageChannel.TRIVY,
                instance: instance.instanceId
            }
            payload.data = resultExposed
            webSocket.send(JSON.stringify(payload))
        }
        
        instance.assets.push(asset)

        if (!this.informers.has(TRIVY_API_VULN_PLURAL)) {
            let informer = this.createInformer(webSocket, instance, TRIVY_API_VULN_PLURAL)
            this.informers.set(TRIVY_API_VULN_PLURAL, informer)
            informer.start()
        }
        if (!this.informers.has(TRIVY_API_AUDIT_PLURAL)) {
            let informer = this.createInformer(webSocket, instance, TRIVY_API_AUDIT_PLURAL)
            this.informers.set(TRIVY_API_AUDIT_PLURAL, informer)
            informer.start()
        }
        if (!this.informers.has(TRIVY_API_SBOM_PLURAL)) {
            let informer = this.createInformer(webSocket, instance, TRIVY_API_SBOM_PLURAL)
            this.informers.set(TRIVY_API_SBOM_PLURAL, informer)
            informer.start()
        }
        if (!this.informers.has(TRIVY_API_EXPOSED_PLURAL)) {
            let informer = this.createInformer(webSocket, instance, TRIVY_API_EXPOSED_PLURAL)
            this.informers.set(TRIVY_API_EXPOSED_PLURAL, informer)
            informer.start()
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
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return

        if (socket.instances.find(i => i.instanceId === instanceConfig.instance)) {
            this.removeInstance(webSocket, instanceConfig.instance)
            this.sendSignalMessage(webSocket,EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instanceConfig.instance, 'Trivy instance stopped')
        }
        else {
            this.sendSignalMessage(webSocket,EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceConfig.instance, `Trivy instance not found`)
        }
    }

    removeInstance = (webSocket: WebSocket, instanceId: string): void => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            var instances = socket.instances
            if (instances) {
                let pos = instances.findIndex(t => t.instanceId === instanceId)
                if (pos>=0) {
                    let instance = instances[pos]
                    for (let asset of instance.assets) {
                        //asset.informer?.stop()
                    }
                    instances.splice(pos,1)
                }
                else {
                    console.log(`Instance ${instanceId} not found, cannot delete`)
                }
            }
            else {
                console.log('There are no trivy Instances on websocket')
            }
        }
        else {
            console.log('WebSocket not found on trivy')
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
            console.log('WebSocket not found on trivy for remove')
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
        console.log('updateConnection not supported')
        return false
    }

    // *************************************************************************************
    // PRIVATE
    // *************************************************************************************

    private sendSignalMessage = (ws:WebSocket, action:EInstanceMessageAction, flow: EInstanceMessageFlow, level: ESignalMessageLevel, instanceId:string, text:string): void => {
        var resp:ISignalMessage = {
            action,
            flow,
            channel: EInstanceMessageChannel.TRIVY,
            instance: instanceId,
            type: EInstanceMessageType.SIGNAL,
            text,
            level
        }
        ws.send(JSON.stringify(resp))
    }

    private checkScopes = (instance:IInstance, scope: string) => {
        let resources = parseResources (instance.accessKey.resources)
        let requiredLevel = this.getChannelScopeLevel(scope)
        let canPerform = resources.some(r => r.scopes.split(',').some(sc => this.getChannelScopeLevel(sc)>= requiredLevel))
        return canPerform
    }

    createInformer = (webSocket:WebSocket, instance:IInstance, plural:string) => {
        const path = `/apis/${TRIVY_API_GROUP}/${TRIVY_API_VERSION}/${plural}`

        const listFunction = () =>
            this.clusterInfo.crdApi.listCustomObjectForAllNamespaces({ group: TRIVY_API_GROUP, version: TRIVY_API_VERSION, plural }).then((res) => {
                const typedBody = res as { items:KubernetesObject[] }
                return typedBody
            })
        const informer = makeInformer(this.clusterInfo.kubeConfig, path, listFunction )
        informer.on('add', (obj:any) => this.processInformerEvent(webSocket, instance, plural, 'add', obj))
        informer.on('update', (obj:any) => this.processInformerEvent(webSocket, instance, plural, 'update', obj))
        informer.on('delete', (obj:any) => this.processInformerEvent(webSocket, instance, plural, 'delete', obj))
        informer.on('error', (err:any) => {
            try {
                console.error('Error in informer')
                console.log(err.Error)
                if (err['HTTP-Code']==='404' || err.statusCode===404)
                    console.log('CRD not found, informer will not restart')
                else
                    setTimeout(() => { informer.start(); console.log('Informer restarted')}, 5000)
            }
            catch (err) {
                console.log('Error managing informer error:')
                console.log(err)
            }
        })
        return informer
    }

    getAssetVulnReport = async (instance:IInstance, asset:IAsset): Promise<{ resource: string, known?: IKnown, unknown?: IUnknown }> => {
        let known:IKnown = {
            name: '',
            namespace: '',
            container: '',
            report: undefined
        }
        let unknown:IUnknown = {
            name: '',
            namespace: '',
            container: '',
            statusCode: 0,
            statusMessage: ''
        }
        let score = 0
        try {
            let crdName = await this.getCrdName(asset.podNamespace, asset.podName, asset.containerName)
            if (crdName) {
                try {
                    let crdObject = await this.clusterInfo.crdApi.getNamespacedCustomObject({ group: TRIVY_API_GROUP, version: TRIVY_API_VERSION, namespace: asset.podNamespace, plural: TRIVY_API_VULN_PLURAL, name: crdName })
                    
                    let summary = crdObject.report.summary
                    score +=
                        (instance.maxCritical>=0? summary.criticalCount*4 : 0) +
                        (instance.maxHigh>=0? summary.highCount*3 : 0) +
                        (instance.maxMedium>=0? summary.mediumCount*2 : 0) +
                        (instance.maxLow>=0? summary.lowCount*1 : 0)
                    known = {
                        container: asset.containerName,
                        name: asset.podName,
                        namespace: asset.podNamespace,
                        report: crdObject.report
                    }
                    return {resource: TRIVY_API_VULN_PLURAL, known, unknown:undefined}
                }
                catch(err:any) {
                    console.log(`VulnReport not found for ${crdName}`)
                    unknown = {
                        container: asset.containerName,
                        name: asset.podName,
                        namespace: asset.podNamespace,
                        statusCode: 0,
                        statusMessage: err.toString()
                    }
                    return {resource: TRIVY_API_VULN_PLURAL, known:undefined, unknown}
                }
            }
            else {
                return {resource: TRIVY_API_VULN_PLURAL, known:undefined, 
                    unknown: {
                        container: asset.containerName,
                        name: asset.podName,
                        namespace: asset.podNamespace,
                        statusCode: 999,
                        statusMessage: 'Cannot get CRD name'
                    }
                }
            }
        }
        catch (err:any){
            unknown = {
                container: asset.containerName,
                name: asset.podName,
                namespace: asset.podNamespace,
                statusCode: 999,
                statusMessage: err
            }
            console.log('Caught Trivy error', err)
            return {resource: TRIVY_API_VULN_PLURAL, known:undefined, unknown}
        }
    }

    getAssetAuditReport = async (instance:IInstance, asset:IAsset): Promise<{resource: string, known?: IKnown, unknown?: IUnknown }> => {
        let known:IKnown = {
            name: '',
            namespace: '',
            container: '',
            report: undefined
        }
        let unknown:IUnknown = {
            name: '',
            namespace: '',
            container: '',
            statusCode: 0,
            statusMessage: ''
        }
        try {
            let crdName = await this.getCrdName(asset.podNamespace, asset.podName)
            if (crdName) {
                try {
                    let crdObject = await this.clusterInfo.crdApi.getNamespacedCustomObject({ group: TRIVY_API_GROUP, version: TRIVY_API_VERSION, namespace: asset.podNamespace, plural: TRIVY_API_AUDIT_PLURAL, name: crdName })
                    
                    known = {
                        container: asset.containerName,
                        name: asset.podName,
                        namespace: asset.podNamespace,
                        report: crdObject.report
                    }
                    return {resource: TRIVY_API_AUDIT_PLURAL, known, unknown:undefined}
                }
                catch(err:any) {
                    console.log(`AuditReport not found for ${crdName}`)
                    unknown = {
                        container: asset.containerName,
                        name: asset.podName,
                        namespace: asset.podNamespace,
                        statusCode: 0,
                        statusMessage: err.toString()
                    }
                    return {resource: TRIVY_API_AUDIT_PLURAL, known:undefined, unknown}
                }
            }
            else {
                return {resource: TRIVY_API_AUDIT_PLURAL, known:undefined, 
                    unknown: {
                        container: asset.containerName,
                        name: asset.podName,
                        namespace: asset.podNamespace,
                        statusCode: 999,
                        statusMessage: 'Cannot get CRD name'
                    }
                }
            }
        }
        catch (err:any){
            unknown = {
                container: asset.containerName,
                name: asset.podName,
                namespace: asset.podNamespace,
                statusCode: 999,
                statusMessage: err
            }
            console.log('Caught Trivy error', err)
            return {resource: TRIVY_API_AUDIT_PLURAL, known:undefined, unknown}
        }
    }

    getAssetSbomReport = async (instance:IInstance, asset:IAsset): Promise<{resource: string, known?: IKnown, unknown?: IUnknown }> => {
        let known:IKnown = {
            name: '',
            namespace: '',
            container: '',
            report: undefined
        }
        let unknown:IUnknown = {
            name: '',
            namespace: '',
            container: '',
            statusCode: 0,
            statusMessage: ''
        }
        try {
            let crdName = await this.getCrdName(asset.podNamespace, asset.podName, asset.containerName)
            if (crdName) {
                try {
                    let crdObject = await this.clusterInfo.crdApi.getNamespacedCustomObject({ group: TRIVY_API_GROUP, version: TRIVY_API_VERSION, namespace: asset.podNamespace, plural: TRIVY_API_SBOM_PLURAL, name: crdName })
                    
                    known = {
                        container: asset.containerName,
                        name: asset.podName,
                        namespace: asset.podNamespace,
                        report: crdObject.report
                    }
                    return {resource: TRIVY_API_SBOM_PLURAL, known, unknown:undefined}
                }
                catch(err:any) {
                    console.log(`SobmReport not found for ${crdName}`)
                    unknown = {
                        container: asset.containerName,
                        name: asset.podName,
                        namespace: asset.podNamespace,
                        statusCode: 0,
                        statusMessage: err.toString()
                    }
                    return {resource: TRIVY_API_SBOM_PLURAL, known:undefined, unknown}
                }
            }
            else {
                return {resource: TRIVY_API_SBOM_PLURAL, known:undefined, 
                    unknown: {
                        container: asset.containerName,
                        name: asset.podName,
                        namespace: asset.podNamespace,
                        statusCode: 999,
                        statusMessage: 'Cannot get CRD name'
                    }
                }
            }
        }
        catch (err:any){
            unknown = {
                container: asset.containerName,
                name: asset.podName,
                namespace: asset.podNamespace,
                statusCode: 999,
                statusMessage: err
            }
            console.log('Caught Trivy error', err)
            return {resource: TRIVY_API_SBOM_PLURAL, known:undefined, unknown}
        }
    }

    getAssetExposedReport = async (instance:IInstance, asset:IAsset): Promise<{resource: string, known?: IKnown, unknown?: IUnknown }> => {
        let known:IKnown = {
            name: '',
            namespace: '',
            container: '',
            report: undefined
        }
        let unknown:IUnknown = {
            name: '',
            namespace: '',
            container: '',
            statusCode: 0,
            statusMessage: ''
        }
        try {
            let crdName = await this.getCrdName(asset.podNamespace, asset.podName, asset.containerName)
            if (crdName) {
                try {
                    let crdObject = await this.clusterInfo.crdApi.getNamespacedCustomObject({ group: TRIVY_API_GROUP, version: TRIVY_API_VERSION, namespace: asset.podNamespace, plural: TRIVY_API_EXPOSED_PLURAL, name: crdName })
                    
                    console.log('Got exposed report for', crdName)
                    known = {
                        container: asset.containerName,
                        name: asset.podName,
                        namespace: asset.podNamespace,
                        report: crdObject.report
                    }
                    return {resource: TRIVY_API_EXPOSED_PLURAL, known, unknown:undefined}
                }
                catch(err:any) {
                    console.log(`ExposedSecretsReport not found for ${crdName}`)
                    unknown = {
                        container: asset.containerName,
                        name: asset.podName,
                        namespace: asset.podNamespace,
                        statusCode: 0,
                        statusMessage: err.toString()
                    }
                    return {resource: TRIVY_API_EXPOSED_PLURAL, known:undefined, unknown}
                }
            }
            else {
                return {resource: TRIVY_API_EXPOSED_PLURAL, known:undefined, 
                    unknown: {
                        container: asset.containerName,
                        name: asset.podName,
                        namespace: asset.podNamespace,
                        statusCode: 999,
                        statusMessage: 'Cannot get CRD name'
                    }
                }
            }
        }
        catch (err:any){
            unknown = {
                container: asset.containerName,
                name: asset.podName,
                namespace: asset.podNamespace,
                statusCode: 999,
                statusMessage: err
            }
            console.log('Caught Trivy error', err)
            return {resource: TRIVY_API_EXPOSED_PLURAL, known:undefined, unknown}
        }
    }

    // private calculateScore = async (instance: IInstance) => {
    //     let score = 0
    //     let maxScore =
    //         (instance.maxCritical>=0? instance.maxCritical*4 : 0) +
    //         (instance.maxHigh>=0? instance.maxHigh*3 : 0) +
    //         (instance.maxMedium>=0? instance.maxMedium*2 : 0) +
    //         (instance.maxLow>=0? instance.maxLow*1 : 0)
    //     let totalMaxScore = instance.assets.length * maxScore

    //     for (let asset of instance.assets) {
    //         let result = await this.getAssetVulnReport(instance, asset)
    //         score += result.score
    //     }
    //     score = (1.0 - (score / totalMaxScore)) * 100.0
    //     return score
    // }

    removeReport = async(plural:string, trivyMessage:ITrivyMessage) : Promise<string|undefined> => {
        let crdName = await this.getCrdName(trivyMessage.namespace, trivyMessage.pod, trivyMessage.container)
        if (crdName) {
            try {
                await this.clusterInfo.crdApi.deleteNamespacedCustomObject({ group:TRIVY_API_GROUP, version:TRIVY_API_VERSION, namespace:trivyMessage.namespace, plural, name:crdName })
                return undefined
            }
            catch (err) {
                console.log(err)
                return `Error removing vulnerability report: `+err
            }
        }
        else {
            return `Couldn't get CRD name`
        }
    }

    executeCommand = async (trivyMessage: ITrivyMessage, instance:IInstance): Promise<ITrivyMessageResponse>=> {
        let resp:ITrivyMessageResponse = {
            msgtype: 'trivymessageresponse',
            id: '',
            namespace: trivyMessage.namespace,
            group: trivyMessage.group,
            pod: trivyMessage.pod,
            container: trivyMessage.container,
            action: trivyMessage.action,
            flow: EInstanceMessageFlow.RESPONSE,
            type: EInstanceMessageType.DATA,
            channel: trivyMessage.channel,
            instance: trivyMessage.instance,
            data: undefined
        }

        switch (trivyMessage.command) {
            case ETrivyCommand.RESCAN: //+++ TEST
                let resultVuln = await this.removeReport(TRIVY_API_VULN_PLURAL, trivyMessage)
                let resultAudit = await this.removeReport(TRIVY_API_AUDIT_PLURAL, trivyMessage)
                let resultExposed = await this.removeReport(TRIVY_API_EXPOSED_PLURAL, trivyMessage)
                let resultSbom = await this.removeReport(TRIVY_API_SBOM_PLURAL, trivyMessage)
                if (resultVuln || resultAudit || resultExposed || resultSbom) {
                    resp.data = resultVuln || resultAudit || resultExposed || resultSbom
                    return resp
                }
                break
            default:
                console.log('Invalid command received:', trivyMessage.command)
        }
        return resp
    }

    private processInformerEvent = async (webSocket:WebSocket, instance:IInstance, plural:string, event:string, obj:any) => {
        let asset = instance.assets.find (a =>
            'Pod' === obj.metadata.labels['trivy-operator.resource.kind'] &&
            a.containerName === obj.metadata.labels['trivy-operator.container.name'] &&
            a.podNamespace === obj.metadata.labels['trivy-operator.resource.namespace'] &&
            a.podName.startsWith(obj.metadata.labels['trivy-operator.resource.name'])
        )
        if (!asset) {
            console.log('Asset not found for', event, plural)
            return
        }
        let payload:ITrivyMessageResponse = {
            msgtype: 'trivymessageresponse',
            msgsubtype: event,
            id: '',
            namespace: asset.podNamespace,
            group: '',
            pod: asset.podName,
            container: asset.containerName,
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA,
            channel: EInstanceMessageChannel.TRIVY,
            instance: instance.instanceId
        }
        if (event==='add' || event==='update') {
            switch (plural) {
                case TRIVY_API_VULN_PLURAL:
                    payload.data = await this.getAssetVulnReport(instance, asset)
                    break
                case TRIVY_API_AUDIT_PLURAL:
                    payload.data = await this.getAssetAuditReport(instance, asset)
                    break
                case TRIVY_API_SBOM_PLURAL:
                    payload.data = await this.getAssetSbomReport(instance, asset)
                    break
                case TRIVY_API_EXPOSED_PLURAL:
                    payload.data = await this.getAssetExposedReport(instance, asset)
                    break
            }
        }
        else {
            // +++ is this needed?
            switch (plural) {
                case TRIVY_API_VULN_PLURAL:
                case TRIVY_API_AUDIT_PLURAL:
                case TRIVY_API_SBOM_PLURAL:
                case TRIVY_API_EXPOSED_PLURAL:
                    payload.data = {
                        known: {
                            name: asset.podName,
                            namespace: asset.podNamespace,
                            container: asset.containerName,
                            report: undefined
                        } satisfies IKnown
                    }
                    break
            }
        }
        payload.data.resource = plural
        webSocket.send(JSON.stringify(payload))
    }

    getCrdName = async (namespace:string, podName:string, containerName?:string) : Promise<string|undefined> => {
        try {
            let crdName
            let podData = (await this.clusterInfo.coreApi.readNamespacedPod({ name:podName, namespace:namespace }))
            let ctrl = podData.metadata?.ownerReferences?.find(or => or.controller)
            if (ctrl) {
                let kind = ctrl?.kind.toLowerCase()
                crdName = `${kind}-${ctrl?.name}${containerName? '-'+containerName : ''}`
            }
            else {
                crdName = `pod-${podName}${containerName? '-'+containerName : ''}`
            }
            return crdName
        }
        catch (err) {
            console.log('Cannot get CRD name from namespaced pod:', err)
        }
        return undefined
    }

}

export { TrivyChannel }