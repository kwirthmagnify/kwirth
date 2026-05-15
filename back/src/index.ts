import 'dotenv/config';
import { ApisApi, CoreV1Api, AppsV1Api, KubeConfig, KubernetesObjectApi, Log, Watch, Exec, V1Pod, CustomObjectsApi, RbacAuthorizationV1Api, ApiextensionsV1Api, VersionApi, NetworkingV1Api, StorageV1Api, BatchV1Api, AutoscalingV2Api, NodeV1Api, SchedulingV1Api, CoordinationV1Api, AdmissionregistrationV1Api, PolicyV1Api, V1ConfigMap } from '@kubernetes/client-node'
//import Docker from 'dockerode'
import { ConfigApi } from './api/ConfigApi'
import { KubernetesSecrets } from './tools/KubernetesSecrets'
import { KubernetesConfigMaps } from './tools/KubernetesConfigMaps'
import { VERSION } from './version'
import { getLastKwirthVersion, showLogo } from './tools/branding/Branding'

// HTTP server for serving front, api and websockets
import { StoreApi } from './api/StoreApi'
import { UserApi } from './api/UserApi'
import { ApiKeyApi } from './api/ApiKeyApi'
import { LoginApi } from './api/LoginApi'

// HTTP server & websockets
import { WebSocketServer } from 'ws'
import { ManageKwirthApi } from './api/ManageKwirthApi'
import { accessKeyDeserialize, accessKeySerialize, parseResources, ResourceIdentifier, IInstanceConfig, ISignalMessage, IInstanceConfigResponse, IInstanceMessage, KwirthData, IRouteMessage, EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType, ESignalMessageLevel, ESignalMessageEvent, EInstanceConfigView, EClusterType, ApiKey, AccessKey, accessKeyBuild } from '@kwirthmagnify/kwirth-common'
import { ManageClusterApi } from './api/ManageClusterApi'
import { AuthorizationManagement } from './tools/AuthorizationManagement'

import express, { NextFunction, Request, Response} from 'express'
import cookieParser from 'cookie-parser'
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware'
import { ClusterInfo } from './model/ClusterInfo'
import { ServiceAccountToken } from './tools/ServiceAccountToken'
import { v4 as uuid } from 'uuid'
import { ISecrets } from './tools/ISecrets'
import { IConfigMaps } from './tools/IConfigMap'
import { DockerSecrets } from './tools/DockerSecrets'
import { DockerConfigMaps } from './tools/DockerConfigMaps'

// Channels +++ convert into plugin
import { IBackChannelObject, IChannel, createChannelInstance, TChannelConstructor } from './channels/IChannel'
import { LogChannel } from './channels/log/LogChannel'
import { AlertChannel } from './channels/alert/AlertChannel'
import { MetricsChannel } from './channels/metrics/MetricsChannel'
import { OpsChannel } from './channels/ops/OpsChannel'
import { TrivyChannel } from './channels/trivy/TrivyChannel'
import { EchoChannel } from './channels/echo/EchoChannel'
import { FilemanChannel } from './channels/fileman/FilemanChannel'
import { MagnifyChannel } from './channels/magnify/MagnifyChannel'
// NewsChannel and PinocchioChannel removed — now loaded as plugins

import { IncomingMessage } from 'http'

import fileUpload from 'express-fileupload'
import v8 from 'node:v8'
import http from 'http'
import bodyParser from 'body-parser'
import cors from 'cors'
import { Application } from 'express-serve-static-core'
import * as crypto from 'crypto'

// Providers +++ convert into plugin
import { createProviderInstance, TProviderConstructor } from './providers/IProvider'
import { EventsProvider } from './providers/events/EventsProvider'
import { ValidatingProvider } from './providers/validating/ValidatingProvider'
import { TickProvider } from './providers/tick/TickProvider'
import { BusinessProvider } from './providers/business/BusinessProvider'
import { MetricsProvider as MetricsProvider } from './providers/metrics/MetricsProvider'

import { ELogComponent, logError, logInfo, logTrace, logWarning, setLogConfig } from './tools/Logging'
import { PluginManager } from './tools/PluginManager'
import { PluginApi } from './api/PluginApi'
const fs = require('fs')

// const originalFetch = require('node-fetch');
// global.fetch = (...args) => {
//     logInfo(ELogComponent.CORE, `🚀 Petición iniciada a: ${args[0]}`);
//     return originalFetch(...args);
// }

const runningEnv = {
  isElectron: process.env.FORCE==='electron' || !!(process.versions && process.versions.electron),
  isDocker: process.env.FORCE==='docker' || fs.existsSync('/.dockerenv'),
  isK8s: process.env.FORCE==='k8s' || !!process.env.KUBERNETES_SERVICE_HOST,
  isTTY: !!process.stdout.isTTY
}
const app : Application = express()

interface IRunningInstance {
    id: string
    electronContext?: string
    clusterInfo: ClusterInfo
    kwirthData: KwirthData
    secrets: ISecrets
    configMaps: IConfigMaps
    channels: Map<string,IChannel>
    backChannelObject: IBackChannelObject
    active: boolean
    router: any
    apiKeyApi: ApiKeyApi|undefined
}

let rootPath = process.env.ROOTPATH
if (rootPath && !rootPath.startsWith('/')) rootPath = '/'+ rootPath
//rootPath='/kwirth' //+++
const envRootPath = rootPath || ''
const envCommand = process.env.COMMAND
const envContext = process.env.CONTEXT || undefined
const envAuth = process.env.AUTH || 'kwirth'  // kwirth | kubeconfig | b2c | entraid | cognito | keycloak | ...
const envMasterKey = process.env.MASTERKEY || 'Kwirth4Ever'
const envForward = (process.env.FORWARD || 'true').toLowerCase() === 'true'
const envPort = +(process?.env?.PORT || '3883')
const envFront = process.env.FRONT !== undefined ? process.env.FRONT === 'true' : true
const envAnsiLog = process.env.ANSILOG !== undefined ? process.env.ANSILOG === 'true' : true
const envExitLog = process.env.EXITLOG !== undefined ? process.env.EXITLOG === 'true' : true
const envConfigMapPath = process.env.CONFIGMAPPATH !== undefined ? process.env.CONFIGMAPPATH : '.'
const envSecretPath = process.env.SECRETPATH !== undefined ? process.env.SECRETPATH : '.'
const envChannelLogEnabled = (process.env.CHANNEL_LOG || 'true').toLowerCase() === 'true'
const envChannelMetricsEnabled = (process.env.CHANNEL_METRICS || 'true').toLowerCase() === 'true'
const envChannelAlertEnabled = (process.env.CHANNEL_ALERT || 'true').toLowerCase() === 'true'
const envChannelOpsEnabled = (process.env.CHANNEL_OPS || 'true').toLowerCase() === 'true'
const envChannelTrivyEnabled = (process.env.CHANNEL_TRIVY || 'true').toLowerCase() === 'true'
const envChannelEchoEnabled = (process.env.CHANNEL_ECHO || 'true').toLowerCase() === 'true'
const envChannelFilemanEnabled = (process.env.CHANNEL_FILEMAN || 'true').toLowerCase() === 'true'
const envChannelMagnifyEnabled = (process.env.CHANNEL_MAGNIFY || 'true').toLowerCase() === 'true'

const runningInstances:IRunningInstance[] = []
let pluginManager: PluginManager | undefined

const registeredProviders = new Map<string, TProviderConstructor>()
registeredProviders.set('events', EventsProvider)
registeredProviders.set('tick', TickProvider)
registeredProviders.set('validating', ValidatingProvider)
registeredProviders.set('business', BusinessProvider)
registeredProviders.set('metrics', MetricsProvider)

const registeredChannels = new Map<string, TChannelConstructor>()
registeredChannels.set('log', LogChannel)
registeredChannels.set('alert', AlertChannel)
registeredChannels.set('metrics', MetricsChannel)
registeredChannels.set('ops', OpsChannel)
registeredChannels.set('trivy', TrivyChannel)
registeredChannels.set('fileman', FilemanChannel)
registeredChannels.set('echo', EchoChannel)
registeredChannels.set('magnify', MagnifyChannel)
// 'news' 'topology' and 'pinocchio' channels loaded dynamically by PluginManager

if (envCommand!==undefined) {
    switch(envCommand) {
        case 'APIKEY': // Bearer Api Key
            let expire= Date.now() + 86400000
            let input = envMasterKey + '|cluster::::|' + expire
            let hash = crypto.createHash('md5').update(input).digest('hex')
            let apiKey:ApiKey={ accessKey:accessKeyBuild(hash, 'permanent', 'cluster::::'), description:'ApiKey created with Kwirth External', expire, days:1}
            logInfo(ELogComponent.CORE, apiKey)
            process.exit(0)
        default:
            process.exit(1)
    }
}

// +++TEST
// interface TimerInfo {
//   type: 'Interval' | 'Timeout';
//   createdAt: string;
//   ms: number | undefined;
// }

// declare global {
//   // Usamos 'any' aquí para el ID para evitar el conflicto entre number (Browser) y Timeout (Node)
//   var activeTimers: Map<any, TimerInfo>;
// }
// global.activeTimers = new Map();

// const originalSetInterval = global.setInterval;
// const originalClearInterval = global.clearInterval;

// (global as any).setInterval = (handler: TimerHandler, timeout?: number, ...args: any[]) => {
//   const id = originalSetInterval(handler, timeout, ...args);
//   global.activeTimers.set(id, {
//     type: 'Interval',
//     createdAt: new Date().toLocaleTimeString(),
//     ms: timeout
//   });
//   return id;
// };

// (global as any).clearInterval = (id: any) => {
//   global.activeTimers.delete(id);
//   originalClearInterval(id);
// };

// // --- Interceptar TIMEOUTS ---
// const originalSetTimeout = global.setTimeout;
// const originalClearTimeout = global.clearTimeout;

// (global as any).setTimeout = (handler: TimerHandler, timeout?: number, ...args: any[]) => {
//   const id = originalSetTimeout((...innerArgs: any[]) => {
//     global.activeTimers.delete(id);
//     if (typeof handler === 'function') {
//       handler(...innerArgs);
//     }
//   }, timeout, ...args);

//   global.activeTimers.set(id, {
//     type: 'Timeout',
//     createdAt: new Date().toLocaleTimeString(),
//     ms: timeout
//   });
//   return id;
// };

// (global as any).clearTimeout = (id: any) => {
//   global.activeTimers.delete(id);
//   originalClearTimeout(id);
// };

const getExecutionEnvironment = async (context:string|undefined):Promise<string> => {
    logInfo(ELogComponent.CORE, 'Detecting execution environment...')

    logInfo(ELogComponent.CORE, 'Trying Electron...')    
    if (runningEnv.isElectron) return 'electron'

    logInfo(ELogComponent.CORE, 'Trying Kubernetes...')
    if (runningEnv.isK8s) return 'kubernetes'

    logInfo(ELogComponent.CORE, 'Trying Docker...')
    if (runningEnv.isDocker) return 'docker'

    return 'undetected'
}


const getKubernetesKwirthData = async (context:string|undefined):Promise<KwirthData|undefined> => {
    for (let counter=0; counter<3;counter++) {
        try {
            let podName=process.env.HOSTNAME
            let kubeConfig = new KubeConfig()
            kubeConfig.loadFromDefault()
            if (context) kubeConfig.setCurrentContext(context)
            let coreApi = kubeConfig.makeApiClient(CoreV1Api)
            let appsApi = kubeConfig.makeApiClient(AppsV1Api)

            const pods = await coreApi.listPodForAllNamespaces()
            const pod = pods.items.find(p => p.metadata?.name === podName)  
            if (pod && pod.metadata?.namespace) {
                let depName = (await AuthorizationManagement.getPodControllerName(appsApi, pod, true)) || ''
                return { clusterName: 'inCluster', namespace: pod.metadata.namespace, deployment:depName, inCluster:true, isElectron:false, version:VERSION, lastVersion: VERSION, clusterType: EClusterType.KUBERNETES, metricsInterval:15, channels: [] }
            }
            else {
                // kwirth is supposed to be running outside of cluster, so we look for kwirth users config in order to detect namespace
                let allSecrets = (await coreApi.listSecretForAllNamespaces()).items
                let usersSecret = allSecrets.find(s => s.metadata?.name === 'kwirth-users')
                if (!usersSecret) usersSecret = allSecrets.find(s => s.metadata?.name === 'kwirth.users')
                if (usersSecret) {
                    // this namespace will be used to access secrets and configmaps
                    return { clusterName: 'inCluster', namespace:usersSecret.metadata?.namespace!, deployment:'', inCluster:false, isElectron:runningEnv.isElectron, version:VERSION, lastVersion: VERSION, clusterType: EClusterType.KUBERNETES, metricsInterval:15, channels: [] }
                }
                else {
                    // kwirth is running outside, but wants to use kubernetes secrets for storing creds, and they don't exsit
                    logInfo(ELogComponent.CORE, 'Cannot determine namespace while running outside cluster (trying to read users secret)')
                    //+++ try to create users secret
                    process.exit(1)
                }
            }
        }
        catch (err) {
            logError(ELogComponent.CORE, 'Error obatining KwirthData')
            logError(ELogComponent.CORE, err)
        }
    }
    return undefined
}

const activateRunningInstance = (ri:IRunningInstance) => {
    runningInstances.forEach( r => r.active = false)
    ri.active = true
    logInfo(ELogComponent.CORE, `Activated RI: ${ri.id} ${ri.clusterInfo.name}` )
}

const createRunningInstance = async (context:string|undefined, kwirthData:KwirthData):Promise<IRunningInstance|undefined> => {
    try {
        let kubeConfig = new KubeConfig()
        kubeConfig.loadFromDefault()
        if (context) kubeConfig.setCurrentContext(context)

        const currentContextName = kubeConfig.getCurrentContext()
        logInfo(ELogComponent.CORE, `Will use '${currentContextName}' context`)
        const currentContext = kubeConfig.contexts.find(c => c.name === currentContextName)

        if (currentContext) {
            kubeConfig.clusters = kubeConfig.clusters.map(cluster => {
                if (cluster.name === currentContext.cluster) {
                    return {
                        ...cluster,
                        skipTLSVerify: true
                    }
                }
                return cluster
            })
        }
        

        let clusterInfo = new ClusterInfo()
        clusterInfo.kubeConfig = kubeConfig
        clusterInfo.coreApi = kubeConfig.makeApiClient(CoreV1Api)
        clusterInfo.versionApi = kubeConfig.makeApiClient(VersionApi)    
        clusterInfo.appsApi= kubeConfig.makeApiClient(AppsV1Api)
        clusterInfo.networkApi= kubeConfig.makeApiClient(NetworkingV1Api)
        clusterInfo.crdApi= kubeConfig.makeApiClient(CustomObjectsApi)
        clusterInfo.rbacApi= kubeConfig.makeApiClient(RbacAuthorizationV1Api)
        clusterInfo.extensionApi= kubeConfig.makeApiClient(ApiextensionsV1Api)
        clusterInfo.storageApi= kubeConfig.makeApiClient(StorageV1Api)
        clusterInfo.batchApi= kubeConfig.makeApiClient(BatchV1Api)
        clusterInfo.autoscalingApi= kubeConfig.makeApiClient(AutoscalingV2Api)
        clusterInfo.schedulingApi= kubeConfig.makeApiClient(SchedulingV1Api)
        clusterInfo.coordinationApi= kubeConfig.makeApiClient(CoordinationV1Api)
        clusterInfo.admissionApi= kubeConfig.makeApiClient(AdmissionregistrationV1Api)
        clusterInfo.policyApi= kubeConfig.makeApiClient(PolicyV1Api)
        clusterInfo.nodeApi = kubeConfig.makeApiClient(NodeV1Api)
        clusterInfo.objectsApi = KubernetesObjectApi.makeApiClient(kubeConfig)
        clusterInfo.execApi = new Exec(clusterInfo.kubeConfig)
        clusterInfo.logApi = new Log(clusterInfo.kubeConfig)
        clusterInfo.apisApi = kubeConfig.makeApiClient(ApisApi)

        if (runningEnv.isElectron || runningEnv.isDocker) {
            // do nothing, since we will use kubeconfig credentials
            logInfo(ELogComponent.CORE, 'SA Token will not be created under isElectron or isDocker contexts')
        }
        else {
            let saToken = new ServiceAccountToken(clusterInfo.coreApi, kwirthData.namespace)
            let token = await saToken.createToken('kwirth-sa', kwirthData.namespace)
            if (token) {
                logInfo(ELogComponent.CORE, 'Got token...')
                clusterInfo.saToken = saToken
                clusterInfo.token = token
            }
            else {
                logWarning(ELogComponent.CORE, 'There is no SA Token, no metrics will be available.')
            }
        }

        clusterInfo.setKubernetesClusterName()
        clusterInfo.nodes = await clusterInfo.getNodes()

        let configMaps
        let secrets

        if (runningEnv.isDocker) {
            logInfo(ELogComponent.CORE, `Configuration paths:  ${envConfigMapPath} ${envSecretPath}`)
            configMaps = new DockerConfigMaps(clusterInfo.coreApi, envConfigMapPath)
            secrets = new DockerSecrets(clusterInfo.coreApi, envSecretPath)
        }
        else {
            secrets = new KubernetesSecrets(clusterInfo.coreApi, kwirthData.namespace)
            configMaps = new KubernetesConfigMaps(clusterInfo.coreApi, kwirthData.namespace)
        }

        let users:{ [username:string]:string } = await secrets.read('kwirth-users')
        if (!users) {
            logInfo(ELogComponent.CORE, 'Admin user will be created, since there is no users config map')
            users = {
                admin: 'eyJpZCI6ImFkbWluIiwibmFtZSI6Ik5pY2tsYXVzIFdpcnRoIiwicGFzc3dvcmQiOiJwYXNzd29yZCIsInJlc291cmNlcyI6ImNsdXN0ZXI6Ojo6In0='
            }
            await secrets.write('kwirth-users', users)
        }

        let runningInstance:IRunningInstance = {
            id: uuid(),
            kwirthData: kwirthData,
            clusterInfo: clusterInfo,
            secrets,
            configMaps,
            channels: new Map(),
            backChannelObject: {},
            active: false,
            router: undefined,
            apiKeyApi: undefined
        }
        return runningInstance
    }
    catch (err) {
        logError(ELogComponent.CORE, 'Error creating running instance')
        logError(ELogComponent.CORE, err)
    }
}

const sendChannelSignal = (webSocket: WebSocket, level: ESignalMessageLevel, text: string, instanceMessage: IInstanceMessage, localChannels:Map<string,IChannel>) => {
    if (localChannels.has(instanceMessage.channel)) {
        let signalMessage:ISignalMessage = {
            action: instanceMessage.action,
            flow: EInstanceMessageFlow.RESPONSE,
            level,
            channel: instanceMessage.channel,
            instance: instanceMessage.instance,
            type: EInstanceMessageType.SIGNAL,
            text
        }
        webSocket.send(JSON.stringify(signalMessage))
    }
    else {
        logError(ELogComponent.CORE, `Unsupported channel '${instanceMessage.channel}' for sending signals`)
    }
}

const sendChannelSignalAsset = (webSocket: WebSocket, level: ESignalMessageLevel, event: ESignalMessageEvent, text: string, instanceMessage: IInstanceMessage, ri:IRunningInstance, namespace:string, pod:string, container?:string) => {
    if (ri.channels.has(instanceMessage.channel)) {
        let signalMessage:ISignalMessage = {
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            level,
            channel: instanceMessage.channel,
            instance: instanceMessage.instance,
            type: EInstanceMessageType.SIGNAL,
            namespace,
            pod,
            ...(container? {container}: {}),
            event,
            text
        }
        webSocket.send(JSON.stringify(signalMessage))
    }
    else {
        logError(ELogComponent.CORE, `Channel '${instanceMessage.channel}' is unsupported sneding asset info`)
        sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Channel '${instanceMessage.channel}' is unsupported sending asset info`, instanceMessage, ri.channels)
    }
}

const sendInstanceConfigSignalMessage = (ws:WebSocket, action:EInstanceMessageAction, flow: EInstanceMessageFlow, channel: string, instanceMessage:IInstanceMessage, text:string, data?:any) => {
    let resp:IInstanceConfigResponse = {
        action,
        flow,
        channel,
        instance: instanceMessage.instance,
        ...(data!==undefined? {data}: {}),
        type: EInstanceMessageType.SIGNAL,
        text
    }
    ws.send(JSON.stringify(resp))
}

const addObject = async (webSocket:WebSocket, instanceConfig:IInstanceConfig, podNamespace:string, podName:string, containerName:string, ri:IRunningInstance) => {
    try {
        logInfo(ELogComponent.CORE, `Object review '${instanceConfig.channel}': ${podNamespace}/${podName}/${containerName} (view: ${instanceConfig.view}) (instance: ${instanceConfig.instance})`)

        let valid = AuthorizationManagement.checkAkr(ri.channels, instanceConfig, podNamespace, podName, containerName)
        if (!valid) {
            logError(ELogComponent.CORE, `No AKR found for object : ${podNamespace}/${podName}/${containerName} (view: ${instanceConfig.view}) (instance: ${instanceConfig.instance})`)
            return
        }

        logInfo(ELogComponent.CORE, `Level is enough for adding object: ${podNamespace}/${podName}/${containerName} (view: ${instanceConfig.view}) (instance: ${instanceConfig.instance})`)

        if(ri.channels.has(instanceConfig.channel)) {
            let channel = ri.channels.get(instanceConfig.channel)!
            if (channel?.containsAsset(webSocket, podNamespace, podName, containerName)) {
                logInfo(ELogComponent.CORE, `Existing asset '${instanceConfig.channel}': ${podNamespace}/${podName}/${containerName} (view: ${instanceConfig.view}) (instance: ${instanceConfig.instance})`)
            }
            else {
                logInfo(ELogComponent.CORE, `addObject '${instanceConfig.channel}': ${podNamespace}/${podName}/${containerName} (view: ${instanceConfig.view}) (instance: ${instanceConfig.instance})`)
                await channel.addObject(webSocket, instanceConfig, podNamespace, podName, containerName)
                sendChannelSignalAsset(webSocket, ESignalMessageLevel.INFO, ESignalMessageEvent.ADD, `Container ADDED: ${podNamespace}/${podName}/${containerName}`, instanceConfig, ri, podNamespace, podName, containerName)
            }
        }
        else {
            logError(ELogComponent.CORE, `Invalid channel ${instanceConfig.channel}`)
        }
    }
    catch (err) {
        logError(ELogComponent.CORE, 'Error adding object')
        logError(ELogComponent.CORE, err)
    }
}

const deleteObject = async (webSocket:WebSocket, _eventType:string, podNamespace:string, podName:string, containerName:string, instanceConfig:IInstanceConfig, ri:IRunningInstance) => {
    if(ri.channels.has(instanceConfig.channel)) {
        ri.channels.get(instanceConfig.channel)?.deleteObject(webSocket, instanceConfig, podNamespace, podName, containerName)
        sendChannelSignalAsset(webSocket, ESignalMessageLevel.INFO, ESignalMessageEvent.DELETE, `Container DELETED: ${podNamespace}/${podName}/${containerName}`, instanceConfig, ri, podNamespace, podName, containerName)
    }
    else {
        logError(ELogComponent.CORE, `Invalid channel ${instanceConfig.channel}`)
    }
}

const processEvent = async (eventType:string, obj: any, webSocket:WebSocket, instanceConfig:IInstanceConfig, podNamespace:string, podName:string, containers:string[], ri:IRunningInstance) => {
    try {
        if (eventType === 'ADDED') {
            logInfo(ELogComponent.CORE, `eventype: ${eventType}, ${podNamespace}, ${podName}, ${obj.status.phase}`)
            for (let container of containers) {
                let containerName = container
                switch (instanceConfig.view) {
                    case EInstanceConfigView.NAMESPACE:
                        logInfo(ELogComponent.CORE, 'Namespace event')
                        logInfo(ELogComponent.CORE, `Pod ADDED: ${podNamespace}/${podName}/${containerName} on namespace`)
                        await addObject(webSocket, instanceConfig, podNamespace, podName, containerName, ri)
                        break
                    case EInstanceConfigView.GROUP:
                        logInfo(ELogComponent.CORE, 'Group event')
                        let [_groupType, groupName] = instanceConfig.group.split('+')
                        // we rely on kubernetes naming conventions here (we could query k8 api to discover group the pod belongs to)
                        if (podName.startsWith(groupName)) {  
                            logInfo(ELogComponent.CORE, `Pod ADDED: ${podNamespace}/${podName}/${containerName} on group`)
                            await addObject(webSocket, instanceConfig, podNamespace, podName, containerName, ri)
                            break
                        }
                        logInfo(ELogComponent.CORE, `Excluded group: ${groupName}`)
                        break
                    case EInstanceConfigView.POD:
                        logInfo(ELogComponent.CORE, 'Pod event')
                        if ((instanceConfig.namespace==='' || (instanceConfig.namespace!=='' && instanceConfig.namespace.split(',').includes(podNamespace))) && instanceConfig.pod.split(',').includes(podName)) {
                            if (instanceConfig.pod.split(',').includes(podName)) {
                                logInfo(ELogComponent.CORE, `Pod ADDED: ${podNamespace}/${podName}/${containerName} on pod`)
                                await addObject(webSocket, instanceConfig, podNamespace, podName, containerName, ri)
                                break
                            }
                        }
                        logInfo(ELogComponent.CORE, `Excluded pod: ${podName}`)
                        break
                    case EInstanceConfigView.CONTAINER:
                        logInfo(ELogComponent.CORE, 'Container event')
                        // container has the form: podname+containername (includes a plus sign as separating char)
                        let instanceContainers = Array.from (new Set (instanceConfig.container.split(',').map (c => c.split('+')[1])))
                        let instancePods = Array.from (new  Set (instanceConfig.container.split(',').map (c => c.split('+')[0])))
                        if (instanceContainers.includes(containerName) && instancePods.includes(podName)) {
                            if (instanceConfig.container.split(',').includes(podName+'+'+containerName)) {
                                logInfo(ELogComponent.CORE, `Pod ADDED: ${podNamespace}/${podName}/${containerName} on container`)
                                await addObject(webSocket, instanceConfig, podNamespace, podName, containerName, ri)
                                break
                            }
                        }
                        logInfo(ELogComponent.CORE, `Excluded container: ${containerName}`)
                        break
                    default:
                        logError(ELogComponent.CORE, 'Invalid instanceConfig view')
                        break
                }
            }
        }
        else if (eventType === 'MODIFIED') {
            logInfo(ELogComponent.CORE, `eventype ${eventType}, ${podNamespace}, ${podName}, ${obj.status.phase.toLowerCase()}`)
            let containerNames = obj.spec.containers.map( (c: any) => c.name)
            if (obj.status.phase.toLowerCase()==='running') {
                processEvent('ADDED', obj, webSocket, instanceConfig, podNamespace, podName, containerNames, ri)
            }
            else {
                // modifyObject(webSocket, eventType, podNamespace, podName, '', instanceConfig)
                // sendChannelSignalAsset(webSocket, SignalMessageLevelEnum.INFO, SignalMessageEventEnum.OTHER, `Pod MODIFIED: ${podNamespace}/${podName}`, instanceConfig, podNamespace, podName, '')
            }
        }
        else if (eventType === 'DELETED') {
            logInfo(ELogComponent.CORE, `eventype ${eventType}, ${podNamespace}, ${podName}, ${obj.status.phase}`)
            deleteObject(webSocket, eventType, podNamespace, podName, '', instanceConfig, ri)
        }
        else {
            logError(ELogComponent.CORE, `Pod ${eventType} is unmanaged`)
            sendChannelSignalAsset(webSocket, ESignalMessageLevel.INFO, ESignalMessageEvent.OTHER, `Received unmanaged event (${eventType}): ${podNamespace}/${podName}`, instanceConfig, ri, podNamespace, podName)
        }
    }
    catch (err) {
        logError(ELogComponent.CORE, 'Error preceossing event')
        logError(ELogComponent.CORE, err)
    }
}

const watchDockerPods = async (ri:IRunningInstance, _apiPath:string, queryParams:any, webSocket:WebSocket, instanceConfig:IInstanceConfig) => {
    //launch included containers

    try {
        if (instanceConfig.view==='pod') {
            let kvps:string[] = queryParams.labelSelector.split(',')
            const jsonObject: { [key: string]: string } = {}
            kvps.forEach(kvp => {
                const [key, value] = kvp.split('=')
                jsonObject[key] = value
            })

            let containers = await ri.clusterInfo.dockerTools.getContainers(jsonObject['kwirthDockerPodName'])
            for (let container of containers) {
                processEvent('ADDED', null, webSocket, instanceConfig, '$docker', jsonObject['kwirthDockerPodName'], [ container ], ri )
            }
        }
        else if (instanceConfig.view==='container') {
            let kvps:string[] = queryParams.labelSelector.split(',')
            const jsonObject: { [key: string]: string } = {}
            kvps.forEach(kvp => {
                const [key, value] = kvp.split('=')
                jsonObject[key] = value
            })
            let podName=jsonObject['kwirthDockerPodName']
            let containerName = jsonObject['kwirthDockerContainerName']
            let id = await ri.clusterInfo.dockerTools.getContainerId(podName, containerName )
            if (id) {
                processEvent('ADDED', null, webSocket, instanceConfig, '$docker', podName, [ containerName ], ri)
            }
            else {
                sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Container ${podName}/${containerName} does not exist.`, instanceConfig, ri.channels)
            }
        }
    }
    catch (err) {
        logError(ELogComponent.CORE, 'Error watching docker pods')
        logError(ELogComponent.CORE, err)
    }
}

const watchKubernetesPods = async (ri:IRunningInstance, apiPath:string, queryParams:any, webSocket:WebSocket, instanceConfig:IInstanceConfig) => {
    try {
        const watch = new Watch(ri.clusterInfo.kubeConfig)

        await watch.watch(apiPath, queryParams, (eventType:string, obj:any) => {
            let podName:string = obj.metadata.name
            let podNamespace:string = obj.metadata.namespace

            let containerNames:string[] = obj.spec.containers.map( (c: any) => c.name)
            processEvent(eventType, obj, webSocket, instanceConfig, podNamespace, podName, containerNames, ri)
        },
        (err) => {
            if (err !== null) {
                logError(ELogComponent.CORE, 'Generic error starting watchPods')
                logError(ELogComponent.CORE, err)
                sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, JSON.stringify(err), instanceConfig, ri.channels)
            }
            else {
                // watch method launches a 'done' invocation several minutes after starting streaming, I don't know why.
            }
        })
    }
    catch (err) {
        logError(ELogComponent.CORE, 'Error watching kubernetes pods')
        logError(ELogComponent.CORE, err)
    }        
}

const watchPods = async (ri:IRunningInstance, apiPath:string, queryParams:any, webSocket:WebSocket, instanceConfig:IInstanceConfig) => {
    try {
        if (ri.kwirthData.clusterType === EClusterType.DOCKER) {
            await watchDockerPods(ri, apiPath, queryParams, webSocket, instanceConfig)
        }
        else {
            try {
                await watchKubernetesPods(ri, apiPath, queryParams, webSocket, instanceConfig)
            }
            catch (err) {
                logError(ELogComponent.CORE, 'Error starting to watch docker pods')
                logError(ELogComponent.CORE, err)
            }
        }
    }
    catch (err) {
        logError(ELogComponent.CORE, 'Error in generic watch pods')
        logError(ELogComponent.CORE, err)
    }
}

const getRequestedValidatedScopedPods = async (ri:IRunningInstance, instanceConfig:IInstanceConfig, accessKeyResources:ResourceIdentifier[], validNamespaces:string[], validPodNames:string[], validContainers:string[], ) => {
    let selectedPods:V1Pod[] = []
    let allPods:V1Pod[] = []
    try {

        if (ri.kwirthData.clusterType === EClusterType.DOCKER)
            allPods = await ri.clusterInfo.dockerTools.getAllPods()
        else {
            for (let ns of validNamespaces) {
                allPods.push(...(await ri.clusterInfo.coreApi.listNamespacedPod({namespace: ns})).items)
            }
        }

        for (let pod of allPods) {
            let podName = pod.metadata?.name!
            let podNamespace = pod.metadata?.namespace!
            let containerNames = pod.spec?.containers.map(c => c.name) || []

            let existClusterScope = accessKeyResources.some(resource => resource.scopes === 'cluster')
            if (!existClusterScope) {
                logInfo(ELogComponent.CORE, 'validPodNames: ' + validPodNames + '  podName: ' + podName)
                if (validPodNames.length>0 && !validPodNames.includes(podName)) continue

                if (instanceConfig.namespace!=='' && instanceConfig.namespace.split(',').includes(podNamespace)) {
                    if (!validNamespaces.includes(podNamespace)) continue
                }

                if (instanceConfig.pod!=='' && instanceConfig.pod.split(',').includes(podName)) {
                    if (!validPodNames.includes(podName)) continue
                }

                let foundKeyResource = false
                for (let c of containerNames) {
                    if (AuthorizationManagement.checkAkr(ri.channels, instanceConfig, podNamespace, podName, c)) {
                        foundKeyResource = true
                        break
                    }
                }
                if (!foundKeyResource) continue
            }
            selectedPods.push(pod)
        }
    }
    catch (err) {
        logError(ELogComponent.CORE, 'Error getting requested validated scoped pods')
        logError(ELogComponent.CORE, err)
    }
    return selectedPods
}

const processReconnect = async (webSocket: WebSocket, instanceMessage: IInstanceMessage, localChannels:Map<string,IChannel>) => {
    logInfo(ELogComponent.CORE, `Trying to reconnect instance '${instanceMessage.instance}' on channel ${instanceMessage.channel}`)
    for (let channel of localChannels.values()) {
        logInfo(ELogComponent.CORE, 'Review channel for reconnect: ' + channel.getChannelData().id)
        if (channel.containsInstance(instanceMessage.instance)) {
            logInfo(ELogComponent.CORE, 'Found channel ' + channel.getChannelData().id)
            let updated = channel.updateConnection(webSocket, instanceMessage.instance)
            if (updated) {
                sendInstanceConfigSignalMessage(webSocket, EInstanceMessageAction.RECONNECT, EInstanceMessageFlow.RESPONSE, instanceMessage.channel, instanceMessage, 'Reconnect successful on channel: '+channel.channelId)
                return
            }
            else {
                sendInstanceConfigSignalMessage(webSocket, EInstanceMessageAction.RECONNECT, EInstanceMessageFlow.RESPONSE, instanceMessage.channel, instanceMessage, 'An error has occurred while updating connection to channel '+channel.channelId)
                return
            }
        }
        else {
            logInfo(ELogComponent.CORE, `Instance '${instanceMessage.instance}' not found for reconnect on channel ${channel.getChannelData().id}`)
        }
    }
    logInfo(ELogComponent.CORE, `Instance '${instanceMessage.instance}' not found for reconnect in any channels`)
    sendInstanceConfigSignalMessage(webSocket, EInstanceMessageAction.RECONNECT, EInstanceMessageFlow.RESPONSE, instanceMessage.channel, instanceMessage, 'Instance has not been found for reconnect', false)
}

const processStartInstanceConfig = async (ri:IRunningInstance, webSocket: WebSocket, instanceConfig: IInstanceConfig, accessKeyResources: ResourceIdentifier[], validNamespaces: string[], validPodNames: string[], validContainers: string[]) => {
    try {
        logInfo(ELogComponent.CORE, `Trying to perform instance config for channel '${instanceConfig.channel}' with view '${instanceConfig.view}'`)
        if (ri.channels.get(instanceConfig.channel) && ri.channels.get(instanceConfig.channel)?.getChannelData().cluster) {
            logWarning(ELogComponent.CORE, 'A cluster-wide access key has been received for access key')
            logWarning(ELogComponent.CORE, instanceConfig.accessKey.substring(0,8)+'... to access channel ' + instanceConfig.channel)
            let channel = ri.channels.get(instanceConfig.channel)
            if (channel) {
                instanceConfig.instance = uuid()
                sendInstanceConfigSignalMessage(webSocket,EInstanceMessageAction.START, EInstanceMessageFlow.RESPONSE, instanceConfig.channel, instanceConfig, 'Instance Config accepted')
                await channel.addObject(webSocket, instanceConfig, '*all', '*all', '*all')
            }
            else {
                sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Channel not found for adding object`, instanceConfig, ri.channels)
            }
        }
        else {
            let requestedValidatedPods = await getRequestedValidatedScopedPods(ri, instanceConfig, accessKeyResources, validNamespaces, validPodNames, validContainers)
            if (requestedValidatedPods.length === 0) {
                sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Access denied: there are no filters that match requested instance config`, instanceConfig, ri.channels)
                return
            }
            
            // we confirm startInstance is ok prior to launching watchPods (because client needs to know instanceId)
            instanceConfig.instance = uuid()
            sendInstanceConfigSignalMessage(webSocket,EInstanceMessageAction.START, EInstanceMessageFlow.RESPONSE, instanceConfig.channel, instanceConfig, 'Instance Config accepted')

            switch (instanceConfig.view) {
                case EInstanceConfigView.NAMESPACE:
                    for (let ns of validNamespaces) {
                        await watchPods(ri, `/api/v1/namespaces/${ns}/${instanceConfig.objects}`, {}, webSocket, instanceConfig)
                    }
                    break
                case EInstanceConfigView.GROUP:
                    for (let namespace of validNamespaces) {
                        for (let gTypeName of instanceConfig.group.split(',')) {
                            let groupPods = await AuthorizationManagement.getPodLabelSelectorsFromController(ri.clusterInfo.coreApi, ri.clusterInfo.appsApi, ri.clusterInfo.batchApi, namespace, gTypeName)
                            if (groupPods.pods.length > 0) {
                                let specificInstanceConfig = JSON.parse(JSON.stringify(instanceConfig))
                                specificInstanceConfig.group = gTypeName
                                await watchPods(ri, `/api/v1/namespaces/${namespace}/${instanceConfig.objects}`, { labelSelector: groupPods.labelSelector }, webSocket, specificInstanceConfig)
                            }
                            else
                                logInfo(ELogComponent.CORE, `No pods on namespace ${namespace}`)
                        }
                    }
                    break
                case EInstanceConfigView.POD:
                    for (let podName of instanceConfig.pod.split(',')) {
                        let validPod = requestedValidatedPods.find(p => p.metadata?.name === podName)
                        if (validPod) {
                            let metadataLabels = validPod.metadata?.labels
                            if (metadataLabels) {
                                if (ri.kwirthData.clusterType === EClusterType.DOCKER) {
                                    metadataLabels['kwirthDockerPodName'] = podName
                                }

                                let labelSelector = Object.entries(metadataLabels).map(([key, value]) => `${key}=${value}`).join(',')
                                let specificInstanceConfig: IInstanceConfig = JSON.parse(JSON.stringify(instanceConfig))
                                specificInstanceConfig.pod = podName
                                await watchPods(ri, `/api/v1/${instanceConfig.objects}`, { labelSelector }, webSocket, specificInstanceConfig)
                            }
                            else {
                                try {
                                    let fieldSelector = `metadata.name=${podName}`
                                    let specificInstanceConfig: IInstanceConfig = JSON.parse(JSON.stringify(instanceConfig))
                                    // we listen for pods path, so when watch starts kube will look after all pods included
                                    await watchPods(ri, `/api/v1/namespaces/${validPod.metadata?.namespace}/pods`, { fieldSelector, watch: true }, webSocket, specificInstanceConfig)
                                }
                                catch (err) {
                                    sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Access denied: cannot get metadata labels for pod '${podName}'`, instanceConfig, ri.channels)
                                }
                            }
                        }
                        else {
                            sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Access denied: your accesskey has no access to pod '${podName}' (or pod does not exsist) for pod access`, instanceConfig, ri.channels)
                        }
                    }
                    break
                case EInstanceConfigView.CONTAINER:
                    for (let container of instanceConfig.container.split(',')) {
                        let [podName, containerName] = container.split('+')
                        let validPod = requestedValidatedPods.find(p => p.metadata?.name === podName)
                        if (validPod) {
                            let metadataLabels = validPod.metadata?.labels

                            if (metadataLabels) {
                                if (ri.kwirthData.clusterType === EClusterType.DOCKER) {
                                    metadataLabels['kwirthDockerContainerName'] = containerName
                                    metadataLabels['kwirthDockerPodName'] = podName
                                }
            
                                let labelSelector = Object.entries(metadataLabels).map(([key, value]) => `${key}=${value}`).join(',')
                                let specificInstanceConfig: IInstanceConfig = JSON.parse(JSON.stringify(instanceConfig))
                                specificInstanceConfig.container = container
                                await watchPods(ri, `/api/v1/${instanceConfig.objects}`, { labelSelector }, webSocket, specificInstanceConfig)
                            }
                            else {
                                // we have no labels, so we use pod name
                                try {
                                    let fieldSelector = `metadata.name=${podName}`
                                    let specificInstanceConfig: IInstanceConfig = JSON.parse(JSON.stringify(instanceConfig))
                                    specificInstanceConfig.container = container
                                    // we listen for pods path, so when watch starts kube will look after all pods included
                                    await watchPods(ri, `/api/v1/namespaces/${validPod.metadata?.namespace}/pods`, { fieldSelector, watch: true }, webSocket, specificInstanceConfig)
                                }
                                catch (err) {
                                    sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Access denied: cannot get metadata labels for container '${podName}/${containerName}'`, instanceConfig, ri.channels)
                                }
                            }
                        }
                        else {
                            sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Access denied: your accesskey has no access to container '${podName}' (or pod does not exsist) for container access`, instanceConfig, ri.channels)
                        }
                    }
                    break
                default:
                    sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Access denied: invalid view '${instanceConfig.view}'`, instanceConfig, ri.channels)
                    break
            }
        }
    }
    catch (err) {
        logError(ELogComponent.CORE, 'Error starting instance')
        logError(ELogComponent.CORE, err)
    }
}

const processStopInstanceConfig = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, localChannels:Map<string,IChannel>) => {
    if (localChannels.has(instanceConfig.channel)) {
        localChannels.get(instanceConfig.channel)?.stopInstance(webSocket, instanceConfig)
    }
    else {
        logError(ELogComponent.CORE, 'Invalid channel on instance stop')
    }
}

const processPauseContinueInstanceConfig = async (instanceConfig: IInstanceConfig, webSocket: WebSocket, _action:EInstanceMessageAction, localChannels:Map<string,IChannel>) => {
    if (localChannels.has(instanceConfig.channel)) {
        localChannels.get(instanceConfig.channel)?.pauseContinueInstance(webSocket, instanceConfig, instanceConfig.action)
    }
    else {
        sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Instance ${instanceConfig.channel} does not exist`, instanceConfig, localChannels)
    }
}

const processPing = (webSocket:WebSocket, instanceMessage:IInstanceMessage, localChannels:Map<string,IChannel>): void => {
    if (!localChannels.has(instanceMessage.channel)) {
        sendInstanceConfigSignalMessage(webSocket, EInstanceMessageAction.PING, EInstanceMessageFlow.RESPONSE, instanceMessage.channel, instanceMessage, 'Channel not found for ping')
        return
    }
    let channel = localChannels.get(instanceMessage.channel)!
    if (channel.containsConnection(webSocket)) {
        let refreshed = channel.refreshConnection(webSocket)
        if (refreshed) {
            sendInstanceConfigSignalMessage(webSocket, EInstanceMessageAction.PING, EInstanceMessageFlow.RESPONSE, instanceMessage.channel, instanceMessage, 'OK')
            return
        }
        else {
            sendInstanceConfigSignalMessage(webSocket, EInstanceMessageAction.PING, EInstanceMessageFlow.RESPONSE, instanceMessage.channel, instanceMessage, 'An error has ocurred while refreshing connection')
            return
        }
    }
    else {
        logInfo(ELogComponent.CORE, `Ping socket not found on channel ${instanceMessage.channel}`)
    }
    sendInstanceConfigSignalMessage(webSocket, EInstanceMessageAction.PING, EInstanceMessageFlow.RESPONSE, instanceMessage.channel, instanceMessage, 'Socket has not been found')
}

const processChannelCommand = async (webSocket: WebSocket, instanceMessage: IInstanceMessage,  localChannels:Map<string,IChannel>, podNamespace?:string, podName?:string, containerName?:string): Promise<void> => {
    try {
        let channel = localChannels.get(instanceMessage.channel)
        if (channel) {
            let instance = channel.containsInstance(instanceMessage.instance)
            if (instance) {
                channel.processCommand(webSocket, instanceMessage, podNamespace, podName, containerName)
            }
            else {
                // we have no instance, may be an IMMED command
                if (instanceMessage.flow === EInstanceMessageFlow.IMMEDIATE) {
                    logInfo(ELogComponent.CORE, `Process IMMEDIATE command`)
                    channel.processCommand(webSocket, instanceMessage, podNamespace, podName, containerName)
                }
                else {
                    logInfo(ELogComponent.CORE, `Instance '${instanceMessage.instance}' and flow ${instanceMessage.flow} not found for command`)
                    logInfo(ELogComponent.CORE, instanceMessage)
                    sendInstanceConfigSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, instanceMessage.channel, instanceMessage, `Instance '${instanceMessage.instance}' has not been found for command`)
                }
            }   
        }
        else {
            logError(ELogComponent.CORE, `Channel not found`)
            sendInstanceConfigSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, instanceMessage.channel, instanceMessage, 'Socket has not been found')
        }
    }
    catch (err) {
        logError(ELogComponent.CORE, 'Error on processCommand')
        logError(ELogComponent.CORE, err)
    }
}

const processChannelRoute = async (ri:IRunningInstance, webSocket: WebSocket, instanceMessage: IInstanceMessage): Promise<void> => {
    let channel = ri.channels.get(instanceMessage.channel)
    if (channel) {
        let instance = channel.containsInstance(instanceMessage.instance)
        if (instance) {
            let routeMessage = instanceMessage as IRouteMessage
            if (ri.channels.has(routeMessage.destChannel)) {
                if (ri.channels.get(routeMessage.destChannel)?.getChannelData().routable) {
                    logInfo(ELogComponent.CORE, `Routing message to channel ${routeMessage.destChannel}`)
                    processClientMessage (webSocket, JSON.stringify(routeMessage.data), ri)
                }
                else {
                    logError(ELogComponent.CORE, `Destination channel (${routeMessage.destChannel}) for 'route' command doesn't support routing`)
                }
            }
            else {
                logError(ELogComponent.CORE, `Destination channel '${routeMessage.destChannel}' does not exist for instance '${instanceMessage.instance}'`)
                sendInstanceConfigSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, instanceMessage.channel, instanceMessage, `Dest channel ${routeMessage.destChannel} does not exist`)
            }
        }
        else {
            logError(ELogComponent.CORE, `Instance '${instanceMessage.instance}' not found for route on channel ${channel.getChannelData().id}`)
            sendInstanceConfigSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, instanceMessage.channel, instanceMessage, 'Instance has not been found for routing')
        }   
    }
    else {
        logError(ELogComponent.CORE, `Socket not found for routing`)
        sendInstanceConfigSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, instanceMessage.channel, instanceMessage, 'Socket has not been found')
    }
}

const processChannelWebsocket = async (ri:IRunningInstance, webSocket: WebSocket, instanceConfig: IInstanceConfig): Promise<void> => {
    let channel = ri.channels.get(instanceConfig.channel)
    if (channel) {
        let instance = channel.containsInstance(instanceConfig.instance)
        if (instance) {
            let response: IInstanceConfigResponse = {
                text: 'WebSocket accepted',
                action: EInstanceMessageAction.WEBSOCKET,
                flow: EInstanceMessageFlow.RESPONSE,
                type: EInstanceMessageType.DATA,
                channel: channel.getChannelData().id,
                data: uuid(),
                instance: instanceConfig.instance
            }
            ri.clusterInfo.pendingWebsocket.push({
                channel: channel.getChannelData().id,
                instance: instanceConfig.instance,
                challenge: response.data,
                data: instanceConfig.data,
                instanceConfig: instanceConfig
            })
            webSocket.send(JSON.stringify(response))
        }
        else {
            logError(ELogComponent.CORE, `Instance '${instanceConfig.instance}' not found for WebSocket on channel ${channel.getChannelData().id}`)
            sendInstanceConfigSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, instanceConfig.channel, instanceConfig, 'Instance has not been found for WEBSOCKET request')
        }   
    }
    else {
        logError(ELogComponent.CORE, `Socket not found for routing`)
        sendInstanceConfigSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, instanceConfig.channel, instanceConfig, 'Socket has not been found')
    }
}

const processClientMessage = async (webSocket:WebSocket, message:string, ri:IRunningInstance) => {
    try {
        const instanceMessage = JSON.parse(message) as IInstanceMessage

        if (instanceMessage.flow !== EInstanceMessageFlow.REQUEST && instanceMessage.flow !== EInstanceMessageFlow.IMMEDIATE) {
            sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, 'Invalid flow received', instanceMessage, ri.channels)
            return
        }

        if (instanceMessage.action === EInstanceMessageAction.PING) {
            processPing(webSocket, instanceMessage, ri.channels)
            return
        }

        if (instanceMessage.action === EInstanceMessageAction.RI) {
            sendInstanceConfigSignalMessage(webSocket, EInstanceMessageAction.RI, EInstanceMessageFlow.RESPONSE, instanceMessage.channel, instanceMessage, 'Sending RI', ri.id)
            return
        }

        if (!ri.channels.has(instanceMessage.channel)) {
            sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, 'Unsupported channel in this Kwirth deployment', instanceMessage, ri.channels)
            return
        }

        logInfo(ELogComponent.CORE, `Received request: ${instanceMessage.flow}, ${instanceMessage.action}, ${instanceMessage.channel}`)
        if (instanceMessage.action === EInstanceMessageAction.RECONNECT) {
            logInfo(ELogComponent.CORE, 'Reconnect received')
            if (!ri.channels.get(instanceMessage.channel)?.getChannelData().reconnectable) {
                logError(ELogComponent.CORE, `Reconnect capability not enabled for channel ${instanceMessage.channel} and instance ${instanceMessage.instance}`)
                sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Channel ${instanceMessage.channel} does not support reconnect`, instanceMessage, ri.channels)
                return
            }
            processReconnect (webSocket, instanceMessage, ri.channels)
            return
        }

        if (instanceMessage.action === EInstanceMessageAction.ROUTE) {
            let routeMessage = instanceMessage as IRouteMessage
            logInfo(ELogComponent.CORE, `Route received from channel ${instanceMessage.channel} to ${routeMessage.destChannel}`)
            processChannelRoute (ri, webSocket, instanceMessage)
            return
        }

        const instanceConfig = JSON.parse(message) as IInstanceConfig
        if (!instanceConfig.accessKey) {
            sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, 'No access key received', instanceConfig, ri.channels)
            return
        }

        let accessKey = accessKeyDeserialize(instanceConfig.accessKey)
        if (accessKey.type.toLowerCase().startsWith('bearer:')) {
            if (!AuthorizationManagement.validBearerKey(envMasterKey, accessKey)) {
                sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Invalid bearer access key: ${instanceConfig.accessKey}`, instanceConfig, ri.channels)
                return
            }       
        }
        else {
            if (!ri.apiKeyApi || !ri.apiKeyApi.apiKeys.some(apiKey => accessKeySerialize(apiKey.accessKey)===instanceConfig.accessKey)) {
                sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Invalid API key or no API key: ${instanceConfig.accessKey}`, instanceConfig, ri.channels)
                return
            }
        }

        let accessKeyResources = parseResources(accessKeyDeserialize(instanceConfig.accessKey).resources)

        let validNamespaces:string[] = []
        if (instanceConfig.namespace) validNamespaces = await AuthorizationManagement.getValidNamespaces(ri.clusterInfo.coreApi, accessKey, instanceConfig.namespace.split(','))
        logInfo(ELogComponent.AUTH, 'validNamespaces: ' + validNamespaces)

        let validControllers:string[] = []
        if (instanceConfig.group) validControllers = await AuthorizationManagement.getValidControllers(ri.clusterInfo.coreApi,ri.clusterInfo.appsApi, ri.clusterInfo.batchApi, accessKey, validNamespaces, instanceConfig.group.split(','))
        logInfo(ELogComponent.AUTH, 'validControllers:' + validControllers)

        let validPodNames:string[] = []
        if (ri.kwirthData.clusterType === EClusterType.DOCKER) {
            validPodNames = await ri.clusterInfo.dockerTools.getAllPodNames()
        }
        else {
            if (instanceConfig.pod) validPodNames = await AuthorizationManagement.getValidPods(ri.clusterInfo.coreApi, ri.clusterInfo.appsApi, validNamespaces, accessKey, instanceConfig.pod.split(','))
        }
        logInfo(ELogComponent.AUTH, 'validPods:' + validPodNames)

        let validContainers:string[] = []
        if (instanceConfig.container) validContainers = await  AuthorizationManagement.getValidContainers(ri.clusterInfo.coreApi, accessKey, validNamespaces, validPodNames, instanceConfig.container.split(','))
        logInfo(ELogComponent.AUTH, 'validContainers:' + validContainers)
        
        switch (instanceConfig.action) {
            case EInstanceMessageAction.COMMAND:
                if (instanceMessage.flow === EInstanceMessageFlow.IMMEDIATE) {
                    logInfo(ELogComponent.CORE, 'Processing immediate request')
                    if (validNamespaces.includes(instanceConfig.namespace)) {
                        if (validPodNames.includes(instanceConfig.pod)) {
                            if (instanceConfig.container !== '' && instanceConfig.container) {
                                let containerAuthorized = accessKeyResources.some (r => r.namespaces === instanceConfig.namespace && r.pods === instanceConfig.pod && r.containers === instanceConfig.container)
                                if (containerAuthorized) {
                                    processChannelCommand(webSocket, instanceConfig, ri.channels, instanceConfig.namespace, instanceConfig.pod, instanceConfig.container)
                                }
                                else {
                                    sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Not authorized send immediate command to container ${instanceConfig.namespace}/${instanceConfig.pod}/${instanceConfig.container}`, instanceConfig, ri.channels)
                                }
                            }
                            else {
                                processChannelCommand(webSocket, instanceConfig, ri.channels, instanceConfig.namespace, instanceConfig.pod)
                            }
                        }
                        else {
                            sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Not authorized send immediate command to pod ${instanceConfig.namespace}/${instanceConfig.pod}`, instanceConfig, ri.channels)
                        }
                    }
                    else {
                        sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Not authorized send immediate command to namespace  ${instanceConfig.namespace}`, instanceConfig, ri.channels)
                    }
                }
                else {
                    processChannelCommand(webSocket, instanceConfig, ri.channels)
                }
                break
            case EInstanceMessageAction.WEBSOCKET:
                processChannelWebsocket (ri, webSocket, instanceConfig)
                break

            case EInstanceMessageAction.START:
                processStartInstanceConfig(ri, webSocket, instanceConfig, accessKeyResources, validNamespaces, validPodNames, validContainers)
                break
            case EInstanceMessageAction.STOP:
                processStopInstanceConfig(webSocket, instanceConfig, ri.channels)
                break
            case EInstanceMessageAction.MODIFY:
                if (ri.channels.get(instanceConfig.channel)?.getChannelData().modifiable) {
                    ri.channels.get(instanceConfig.channel)?.modifyInstance(webSocket, instanceConfig)
                }
                else {
                    sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Channel ${instanceConfig.channel} does not support MODIFY`, instanceConfig, ri.channels)
                }
                break
            case EInstanceMessageAction.PAUSE:
            case EInstanceMessageAction.CONTINUE:   
                if (ri.channels.get(instanceConfig.channel)?.getChannelData().pauseable) {
                    processPauseContinueInstanceConfig(instanceConfig, webSocket, instanceConfig.action, ri.channels)
                }
                else {
                    sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Channel ${instanceConfig.channel} does not support PAUSE/CONTINUE`, instanceConfig, ri.channels)
                }
                break
            default:
                logError(ELogComponent.CORE, `Invalid action in instance config: '${instanceConfig.action}'`)
                break
        }
    }
    catch (err) {
        logError(ELogComponent.CORE, 'Error processing clietn message')
        logError(ELogComponent.CORE, err)
    }
}

const setUpRoutes = async (ri:IRunningInstance) : Promise<boolean> => {
    try {
        const riRouter = express.Router()

        let result = await ApiKeyApi.create(ri.configMaps, envMasterKey, runningEnv.isElectron)
        if (!result) {
            logError(ELogComponent.CORE, 'Could not get apikeyapi setting up routes')
            return false
        }
        let apiKeyApi = result
        riRouter.use(`/key`, apiKeyApi.router)
        ri.apiKeyApi = apiKeyApi
        for (let provider of ri.clusterInfo.providers) {
            if (provider.requiresApiKeyApi) provider.apiKeyApi = result
        }
        let configApi:ConfigApi = new ConfigApi(apiKeyApi, ri.kwirthData, ri.clusterInfo)
        riRouter.use(`/config`, configApi.router)
        let storeApi:StoreApi = new StoreApi(ri.configMaps, apiKeyApi)
        riRouter.use(`/store`, storeApi.router)
        let userApi:UserApi = new UserApi(ri.secrets, apiKeyApi)
        riRouter.use(`/user`, userApi.router)
        let loginApi:LoginApi = new LoginApi(ri.secrets, ri.configMaps, ri.apiKeyApi)
        riRouter.use(`/login`, loginApi.router)
        let manageKwirthApi:ManageKwirthApi = new ManageKwirthApi(ri.clusterInfo.coreApi, ri.clusterInfo.appsApi, ri.clusterInfo.batchApi, apiKeyApi, ri.kwirthData)
        riRouter.use(`/managekwirth`, manageKwirthApi.router)
        let manageCluster:ManageClusterApi = new ManageClusterApi(ri.clusterInfo.coreApi, ri.clusterInfo.appsApi, apiKeyApi)
        riRouter.use(`/managecluster`, manageCluster.router)
        if (pluginManager) {
            const onPluginInstalled = (id: string) => {
                const activeRI = runningInstances.find(r => r.active)
                if (!activeRI) return
                const ChannelClass = registeredChannels.get(id)
                if (!ChannelClass) return
                try {
                    const channelInstance = createChannelInstance(ChannelClass, activeRI.clusterInfo, activeRI.backChannelObject)
                    if (channelInstance) {
                        for (const provId of channelInstance.requirements.providers) {
                            if (!activeRI.clusterInfo.providers.find(p => p.id === provId)) {
                                const provConstructor = registeredProviders.get(provId)
                                if (provConstructor) {
                                    const providerInstance = createProviderInstance(provConstructor, activeRI.clusterInfo, activeRI.kwirthData)
                                    if (providerInstance) {
                                        providerInstance.startProvider()
                                        activeRI.clusterInfo.providers.push(providerInstance)
                                        logInfo(ELogComponent.CORE, `Provider '${provId}' started for plugin '${id}'`)
                                    }
                                } else {
                                    logError(ELogComponent.CORE, `Required provider '${provId}' not registered (needed by plugin '${id}')`)
                                }
                            }
                        }
                        activeRI.channels.set(id, channelInstance)
                        channelInstance.startChannel()
                        if (!activeRI.kwirthData.channels.some(c => c.id === id))
                            activeRI.kwirthData.channels.push(channelInstance.getChannelData())
                        logInfo(ELogComponent.CORE, `Plugin channel '${id}' instantiated and started`)
                    }
                } catch (err) {
                    logError(ELogComponent.CORE, `Failed to instantiate plugin channel '${id}': ${err}`)
                }
            }
            const onPluginUninstalled = (id: string) => {
                const activeRI = runningInstances.find(r => r.active)
                if (activeRI) {
                    activeRI.channels.delete(id)
                    activeRI.kwirthData.channels = activeRI.kwirthData.channels.filter(c => c.id !== id)
                }
                logInfo(ELogComponent.CORE, `Plugin channel '${id}' removed from active instance`)
            }
            let pluginApi = new PluginApi(pluginManager, registeredChannels, apiKeyApi, { onPluginInstalled, onPluginUninstalled })
            riRouter.use(`/plugins`, pluginApi.router)
        }
        // let metricsApi:MetricsApi = new MetricsApi(ri.clusterInfo, apiKeyApi)
        // riRouter.use(`/metrics`, metricsApi.route)

        for (let provider of ri.clusterInfo.providers) {
            if (provider.providesRouter) {
                if (provider.router) {
                    let path
                    // if (provider.routerAlias)
                    //     path = `${envRootPath}/${provider.routerAlias}`
                    // else
                    //     path = `${envRootPath}/${ri.id}/provider/${provider.id}`
                    if (provider.routerAlias)
                        path = `/${provider.routerAlias}`
                    else
                        path = `/${ri.id}/provider/${provider.id}`
                    riRouter.use(path, provider.router)
                    logInfo(ELogComponent.CORE, `Provider ${provider.id} will listen HTTP requests at '${path}'`)
                }
                else {
                    logError(ELogComponent.CORE, `Provider ${provider.id} provides router but ruter doen't exist`)
                }
            }
        }
            
        ri.router = riRouter
        return true
    }
    catch (err) {
        logError(ELogComponent.CORE, 'Error setting up routes')
        logError(ELogComponent.CORE, err)
    }
    return false
}

const processHttpChannelRequest = async (channel: IChannel, endpointName:string, aka:ApiKeyApi, req:Request, res:Response) : Promise<void> => {
    try {
        let accessKey = await AuthorizationManagement.getKey(req, res, aka)
        if (accessKey) {
            channel.endpointRequest(endpointName, req, res, accessKey)
        }
        else {
            logError(ELogComponent.CORE, 'Could not get accessKey processing an HTTP channel request')
            res.status(400).send()
        }
    }
    catch (err) {
        logError(ELogComponent.CORE, 'Error on GET endpoint')
        logError(ELogComponent.CORE, err)
        res.status(400).send()
    }
}

const startChannelEndpoints = (ri:IRunningInstance, expressApp:Application) => {
    logInfo(ELogComponent.CORE, `Starting HTTP channel endpoints`)
    for (let channel of ri.channels.values()) {
        let channelData = channel.getChannelData()
        if (channelData.endpoints.length>0) {
            logInfo(ELogComponent.CORE, `  Starting endpoints for channel '${channelData.id}'`)
            for (let endpoint of channelData.endpoints) {
                logInfo(ELogComponent.CORE, `    ${envRootPath}/${ri.id}/channel/${channelData.id}/${endpoint.name}`)
                const router = express.Router()
                router.route('*')
                    .all( async (req:Request,res:Response, next) => {
                        if (endpoint.requiresAccessKey) {
                            if (! (await AuthorizationManagement.validKey(req,res, ri.apiKeyApi!))) return
                        }
                        next()
                    })
                    .get( async (req:Request, res:Response) => {
                        if (endpoint.methods.includes('GET')) {
                            processHttpChannelRequest(channel, endpoint.name, ri.apiKeyApi!, req, res)
                        }
                        else
                            res.status(405).send()
                    })
                    .post( async (req:Request, res:Response) => {
                        if (endpoint.methods.includes('POST')) {
                            processHttpChannelRequest(channel, endpoint.name, ri.apiKeyApi!, req, res)
                        }
                        else
                            res.status(405).send()
                    })
                    .put( async (req:Request, res:Response) => {
                        if (endpoint.methods.includes('PUT'))
                            processHttpChannelRequest(channel, endpoint.name, ri.apiKeyApi!, req, res)
                        else
                            res.status(405).send()
                    })
                    .delete( async (req:Request, res:Response) => {
                        if (endpoint.methods.includes('DELETE'))
                            processHttpChannelRequest(channel, endpoint.name, ri.apiKeyApi!, req, res)
                        else
                            res.status(405).send()
                    })
                expressApp.use(`${envRootPath}/${ri.id}/channel/${channelData.id}/${endpoint.name}`, router)
            }
        }
    }
}

const startRunningInstance = async (ri:IRunningInstance, expressApp:Application) => {
    try {
        let lastVersion = await getLastKwirthVersion(ri.kwirthData)
        if (lastVersion) ri.kwirthData.lastVersion = lastVersion
    
        // show root contents for electron debuggunng purposes
        fs.readdir('.', (err:any, currentFiles:any) => {
            if (err) {
                logError(ELogComponent.CORE, 'Error reading folder data:')
                logError(ELogComponent.CORE, err)
                return
            }
            logInfo(ELogComponent.CORE, 'File list at project root when starting instance: ' + currentFiles.join(', '))
        })

        if (! (await setUpRoutes(ri))) {
            logError(ELogComponent.CORE, 'Could not set up HTTP routes. Exiting')
            process.exit(1)
        }

        startChannelEndpoints(ri, expressApp)
        
        logInfo(ELogComponent.CORE, 'Starting channels:')
        for (let channel of ri.channels.values()) {
            logInfo(ELogComponent.CORE, `  '${channel.getChannelData().id}'`)
            channel.startChannel()
        }
    }
    catch (err) {
        logError(ELogComponent.CORE, 'Error in startRunningInstance')
        logError(ELogComponent.CORE, err)
    }
}

const setKubernetesClusterKwirthRequirements = async (runningInstance:IRunningInstance, localKwirthData: KwirthData, localClusterInfo:ClusterInfo, backChannelObject:IBackChannelObject) : Promise<void> => {
    try {
        logInfo(ELogComponent.CORE, 'Node info loaded')

        logInfo(ELogComponent.CORE, 'Source Info')
        logInfo(ELogComponent.CORE, '  Name: ' + localClusterInfo.name)
        logInfo(ELogComponent.CORE, '  Type: ' + localClusterInfo.type)
        logInfo(ELogComponent.CORE, '  Flavour: ' + localClusterInfo.flavour)
        logInfo(ELogComponent.CORE, '  Nodes: ' + localClusterInfo.nodes.size)


        // Channel management
        let requiredChannels = []
        if (envChannelLogEnabled) requiredChannels.push('log')
        if (envChannelAlertEnabled) requiredChannels.push('alert')
        if (envChannelMetricsEnabled) requiredChannels.push('metrics')
        if (envChannelOpsEnabled) requiredChannels.push('ops')
        if (envChannelTrivyEnabled) requiredChannels.push('trivy')
        if (envChannelFilemanEnabled) requiredChannels.push('fileman')
        if (envChannelEchoEnabled) requiredChannels.push('echo')
        if (envChannelMagnifyEnabled) requiredChannels.push('magnify')
        // plugin channels: load installed plugins and add their ids to requiredChannels
        if (!pluginManager) {
            pluginManager = new PluginManager(runningInstance.configMaps)
            await pluginManager.init()
            await pluginManager.loadAll(registeredChannels)
            pluginManager.loadDevPlugins(registeredChannels)
        }
        for (const pluginId of [...pluginManager.getInstalledIds(), ...pluginManager.getDevIds()]) {
            if (!requiredChannels.includes(pluginId)) requiredChannels.push(pluginId)
        }

        logInfo(ELogComponent.CORE, 'Required channels:')
        for (let chanId of registeredChannels.keys()) {
            logInfo(ELogComponent.CORE, `  '${chanId}' required: ${requiredChannels.includes(chanId)}`)
        }


        // we create and instantiate channels, but we don't start them, because we need to start the providers first
        for(let channelId of requiredChannels) {
            let channelConstructor = registeredChannels.get(channelId)
            if (channelConstructor) {
                let channelInstance = createChannelInstance(registeredChannels.get(channelId), localClusterInfo, backChannelObject)
                if (channelInstance)
                    runningInstance.channels.set(channelId, channelInstance!)
                else
                    logError(ELogComponent.CORE, `Couldn't create a channel instance for '${channelId}'`)
            }
            else {
                logError(ELogComponent.CORE, `Required channel '${channelId}' is not registered`)
            }
        }
        

        // we need the channels instantiated (but not started) in order to discover what provider do they require
        logInfo(ELogComponent.CORE, 'Required providers:')
        let requiredProviders = []
        for (let provId of registeredProviders.keys()) {
            let required = Array.from(runningInstance.channels.values()).reduce( (prev, current) => { return prev || current.requirements.providers.includes(provId)}, false)
            if (required) requiredProviders.push(provId)
            logInfo(ELogComponent.CORE, `  '${provId}' required: ${required}`)
        }

        
        localClusterInfo.providers = []
        for(let provId of requiredProviders) {
            let provider = registeredProviders.get(provId)
            if (provider) {
                let providerInstance = createProviderInstance(registeredProviders.get(provId), localClusterInfo, localKwirthData)
                if (providerInstance) {
                    providerInstance!.startProvider()
                    logInfo(ELogComponent.CORE, `Provider '${provId}' started`)
                    localClusterInfo.providers.push(providerInstance!)
                }
                else {
                    logError(ELogComponent.CORE, `Couldn't create a provider instance for '${provId}'`)
                }
            }
            else {
                logError(ELogComponent.CORE, `Required provider '${provId}' is not registered`)
            }
        }

    }
    catch (err) {
        logError(ELogComponent.CORE, 'Error setting up kubernetes requirements')
        logError(ELogComponent.CORE, err)
    }
}

const prepareRunningInstance = async (localKwirthData:KwirthData, runningInstance:IRunningInstance) : Promise<void> => {
    try {
        let backChannelObject: IBackChannelObject = {
            logInfo: (message: unknown) => logInfo(ELogComponent.CHANNEL, message),
            logTrace: (message: unknown) => logTrace(message),
            logWarning: (message: unknown) => logWarning(ELogComponent.CHANNEL, message),
            logError: (message: unknown) => logError(ELogComponent.CHANNEL, message),
            writeStorage: async (id: string, secret: boolean, data: any) => {
                if (secret) {
                    const jsonString = JSON.stringify(data);
                    const base64Data = Buffer.from(jsonString, 'utf8').toString('base64');
                    
                    await runningInstance.secrets.write('kwirth-store-channel-' + id, { 
                        data: base64Data 
                    });
                } else {
                    await runningInstance.configMaps.write('kwirth-store-channel-' + id, JSON.stringify(data));
                }
            },
            readStorage: async (id: string, secret: boolean) => {
                if (secret) {
                    let content = await runningInstance.secrets.read('kwirth-store-channel-' + id);
                    if (content && content['data']) {
                        const decodedString = Buffer.from(content['data'], 'base64').toString('utf8');
                        return JSON.parse(decodedString);
                    }
                    return undefined;
                } else {
                    let content = await runningInstance.configMaps.read('kwirth-store-channel-' + id);
                    if (content) return JSON.parse(content);
                    return undefined;
                }
            }
        }

        runningInstance.backChannelObject = backChannelObject
        await setKubernetesClusterKwirthRequirements(runningInstance, localKwirthData, runningInstance.clusterInfo, backChannelObject)
        runningInstance.clusterInfo.type = localKwirthData.clusterType

        // this '.channels' object is sent to clients when they want to know something about support channels on the backend they're connected to
        localKwirthData.channels =  Array.from(runningInstance.channels.keys()).map(k => {
            return runningInstance.channels.get(k)?.getChannelData()!
        })

        logInfo(ELogComponent.CORE, `Enabled channels for this (kubernetes) run are: ${Array.from(runningInstance.channels.keys()).map(c => `'${c}'`).join(', ')}`)
        logInfo(ELogComponent.CORE, `Enabled providers for this (kubernetes) run are: ${Array.from(runningInstance.clusterInfo.providers).map(p => `'${p.id}'`).join(', ')}`)
        logInfo(ELogComponent.CORE, `Detected own namespace: ${localKwirthData.namespace}`)
        if (localKwirthData.deployment !== '')
            logInfo(ELogComponent.CORE, `Detected own deployment: ${localKwirthData.deployment}`)
        else
            logInfo(ELogComponent.CORE, `No deployment detected. Kwirth is not running inside a cluster`)

        if (envForward) {
            logInfo(ELogComponent.CORE, 'Will try to configure FORWARDing...')
            if (runningInstance.kwirthData.inCluster) {
                logInfo(ELogComponent.CORE, 'FORWARD for inCluster is being configured...')
                if (envRootPath!=='') {
                    configureForward(runningInstance.clusterInfo, app)
                }
                else {
                    logInfo(ELogComponent.CORE, 'FORWARD for kubernetes Kwirth cannot be started since Kwirth must have a root path specified (like /kwirth, for example). Kwirth cannot FORWARD if it is running on root (/) path')
                }
            }
            else if (runningInstance.kwirthData.isElectron) {
                logInfo(ELogComponent.CORE, 'FORWARD for electron should be implemented')
            }
            else {
                logInfo(ELogComponent.CORE, 'FORWARD not avialable (not inCluster and not isElectron)')
            }
        }
        else {
            logInfo(ELogComponent.CORE, 'No FORWARD mechanism will be available.')
        }
    }
    catch (err) {
        logError(ELogComponent.CORE, 'Error preparing kubernetes')
        logError(ELogComponent.CORE, err)
    }
}

const launchKubernetes = async (context:string|undefined, localKwirthData:KwirthData, expressApp:Application) : Promise<void> => {
    try {
        logInfo(ELogComponent.CORE, 'Start Kubernetes Kwirth')
        if (localKwirthData) {
            logInfo(ELogComponent.CORE, `Initial kwirthData`)
            logInfo(ELogComponent.CORE, localKwirthData)
            try {
                let runningInstance = await createRunningInstance(context, localKwirthData)
                if (runningInstance) {
                    setupProcessHooks(runningInstance, localKwirthData)

                    await prepareRunningInstance(localKwirthData, runningInstance)
                    runningInstances.push(runningInstance)
                    activateRunningInstance(runningInstance)
                    await startRunningInstance(runningInstance, expressApp)
                }
                else {
                    logError(ELogComponent.CORE, 'Cannot get a running instance')
                }
            }
            catch (err){
                logError(ELogComponent.CORE, err)
            }
        }
        else {
            logError(ELogComponent.CORE, 'Cannot get kwirthdata launching Kubernetes, exiting...')
        }
    }
    catch (err) {
        logError(ELogComponent.CORE, 'Error launching kubernetes')
        logError(ELogComponent.CORE, err)
    }
}

const launchDocker = async (context:string|undefined, localKwirthData:KwirthData, expressApp:Application) : Promise<void> => {    
    try {
        logInfo(ELogComponent.CORE, 'Start Docker Kwirth')
        if (localKwirthData) {
            logInfo(ELogComponent.CORE, `Initial kwirthData`)
            logInfo(ELogComponent.CORE, localKwirthData)
            try {
                let runningInstance = await createRunningInstance(context, localKwirthData)
                if (runningInstance) {
                    await prepareRunningInstance(localKwirthData, runningInstance)
                    runningInstances.push(runningInstance)
                    activateRunningInstance(runningInstance)
                    await startRunningInstance(runningInstance, expressApp)
                }
                else {
                    logError(ELogComponent.CORE, 'Cannot get a running instance')
                }
            }
            catch (err){
                logError(ELogComponent.CORE, err)
            }
        }
        else {
            logError(ELogComponent.CORE, 'Cannot get kwirthdata launching Docker, exiting...')
        }
    }
    catch (err) {
        logError(ELogComponent.CORE, 'Error launching docker')
        logError(ELogComponent.CORE, err)
    }
}

const launchElectron = async (localKwirthData:KwirthData, expressApp:Application) : Promise<void> => {
    try {
        logInfo(ELogComponent.CORE, 'Start Electron Kwirth')
        if (localKwirthData) {
            logInfo(ELogComponent.CORE, `Initial kwirthData`)
            logInfo(ELogComponent.CORE, localKwirthData)
            try {
                expressApp.get('/core/electron/kubeconfig', (req:Request,res:Response) => {
                    try {
                        let kubeConfig = new KubeConfig()
                        kubeConfig.loadFromDefault()
                        let myContexts = JSON.parse(JSON.stringify(kubeConfig.contexts))
                        myContexts.forEach( (context:any) => {
                            const cluster = kubeConfig.clusters.find(c => c.name === context.cluster)
                            if (cluster) context.server = cluster.server
                        })
                        res.status(200).json(myContexts)
                    }
                    catch (err) {
                        res.status(500).json({})
                        logError(ELogComponent.CORE, err)
                    }
                })
                expressApp.delete('/core/electron/kubeconfig', (req:Request,res:Response) => {
                    try {
                        let contextName = req.body.context
                        if (contextName) {
                            let ri = runningInstances.find(r => r.electronContext === contextName)
                            if (ri) {
                                // +++ implement remove runninginstance? or keep them started?
                                res.status(200).json({})
                            }
                            else {
                                res.status(404).json({})
                            }
                        }
                        else {
                            res.status(404).json({})
                        }
                    }
                    catch (err) {
                        res.status(500).json({})
                        logError(ELogComponent.CORE, err)
                    }
                })
                expressApp.post('/core/electron/kubeconfig', async (req:Request, res:Response) => {
                    try {
                        let contextName:string = req.body.context
                        logInfo(ELogComponent.CORE, 'Activating context for electron use: '+contextName)
                        if (contextName) {
                            let existingRunningInstance = runningInstances.find(r => r.electronContext === contextName)
                            if (existingRunningInstance) {
                                logInfo(ELogComponent.CORE, 'Already activated '+contextName)
                                activateRunningInstance(existingRunningInstance)
                                res.status(200).json(existingRunningInstance.apiKeyApi?.apiKeys[0])  // we just reuse the first inElectron ApiKey (there should be no other kind of Api Keysstsored)
                            }
                            else {
                                let runningInstance = await createRunningInstance(contextName, localKwirthData) 
                                if (runningInstance) {
                                    runningInstance.electronContext = contextName
                                    await prepareRunningInstance(localKwirthData, runningInstance)
                                    runningInstances.push(runningInstance)
                                    activateRunningInstance(runningInstance)
                                    await startRunningInstance(runningInstance, expressApp)

                                    logInfo(ELogComponent.CORE, 'Creating instance for context' + contextName)
                                    // +++ we should be using a common function for creating api key
                                    let description = 'Volatile key for electron'
                                    let expire:number = Date.now() + 10000000000  // 4 months
                                    let days:number = 1
                                    let accessKey:AccessKey = { id: uuid(), type: 'volatile', resources: 'cluster::::' }
                                    let apiKey:ApiKey={ accessKey, description, expire, days }
                                    if (runningInstance.apiKeyApi) 
                                        runningInstance.apiKeyApi.apiKeys.push(apiKey)
                                    else
                                        throw new Error('no apikeyapis')
                                    res.status(200).json({ accessKey })
                                }
                                else {
                                    logError(ELogComponent.CORE, 'Could not get a running instance')
                                    res.status(400).json({})
                                }
                            }
                        }
                        else {
                            res.status(500).json({error: 'NotFound'})
                        }
                    }
                    catch (err) {
                        res.status(500).json({})
                        logError(ELogComponent.CORE, err)
                    }
                })
            }
            catch (err){
                logError(ELogComponent.CORE, err)
            }
        }
        else {
            logError(ELogComponent.CORE, 'Cannot get kwirthdata launching Electron, exiting...')
        }    
    }
    catch (err) {
        logError(ELogComponent.CORE, 'Error launching electron')
        logError(ELogComponent.CORE, err)
    }
}

const startNodeTasks = () => {
    // launch GC every 15 secs
    if (global.gc) {
        logInfo(ELogComponent.CORE, 'GC will run every 15 secs asynchronously')
        setInterval ( () => {
            if (global.gc) global.gc()
       }, 15000)
    }
    else {
        logInfo(ELogComponent.CORE, `No GC will run. You'd better enable it by adding '--expose-gc' to your node start command`)
    }

    // show heap status every 5 mins
    setInterval ( () => {
        logInfo(ELogComponent.CORE, v8.getHeapStatistics())
    }, 300000)
}

const configureForward = (localClusterInfo:ClusterInfo, expressApp:Application) => {
    expressApp.use(cookieParser())
    expressApp.use(cors({
        allowedHeaders: ['Content-Type', 'Authorization', 'x-kwirth-app'],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    }))

    const getDynamicTarget = (req: Request): string => {
        let dest= req.cookies['x-kwirth-forward']
        return 'http://'+dest
    }

    const dynamicProxy = createProxyMiddleware({
        target: 'https://www.w3.org/',        // Initial value (required but usesless)
        router: getDynamicTarget,             // decide target for each request
        changeOrigin: true,
        on: {
            proxyReq: fixRequestBody,         // Keep PUT/POST body integrity
        },
    })

    async function getPodIp(coreApi:CoreV1Api, namespace:string, podName:string) {
        try {
            const response = await coreApi.readNamespacedPod({
                name: podName,
                namespace: namespace
            })
            
            const podIp = response!.status?.podIP
            
            if (podIp) {
                return podIp
            }
            else {
                logInfo(ELogComponent.CORE, 'Pod exists, but it seems to not to have an assigned IP')
            }
        }
        catch (err) {
            logError(ELogComponent.CORE, 'Error getting pod')
        }
    }

    expressApp.use(async (req: Request, res: Response, next: NextFunction) => {
        if (req.url.startsWith(`/healthz`) || req.url.startsWith(`/health`)) {
            return next()
        }
        if (!req.url.startsWith(`${envRootPath}`)) {
            if (req.cookies['x-kwirth-refresh']==='1') {
                res.cookie('x-kwirth-refresh', '2', { path: '/' })
                res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
                res.set('Pragma', 'no-cache')
                res.set('Expires', '0')
                res.redirect('/')
                return
            }
            let dest = req.cookies['x-kwirth-forward']
            logInfo(ELogComponent.CORE, `[PROXY] dynamic routing to `+dest)
            return dynamicProxy(req, res, next)
        }
        if (req.url.startsWith(`${envRootPath}/port-forward/pod`)) {
            try {
                let namespace=req.url.split('/')[4]
                let podname=req.url.split('/')[5]
                let port=req.url.split('/')[6]
                logInfo(ELogComponent.CORE, `[PROXY] Launch port forward for pod ${namespace}/${podname}`)
                let ip = await getPodIp(localClusterInfo.coreApi, namespace, podname)
                logInfo(ELogComponent.CORE, `[PROXY] IP ` + ip)
                res.cookie('x-kwirth-forward', ip+':'+port, { path: '/' })
                res.cookie('x-kwirth-refresh', '1', { path: '/' })
                res.redirect('/')
                return
            }
            catch (err) {
                logError(ELogComponent.CORE, 'Error processing port-forward')
                logError(ELogComponent.CORE, err)
            }
        }
        next()
    })
}

const createHttpServers = (localKwirthData:KwirthData, expressApp:Application, instances:IRunningInstance[], localProcessClientMessage:(webSocket: WebSocket, message: string, ri:IRunningInstance) => Promise<void>) => {
    try {
        // create HTTP and WS servers
        logInfo(ELogComponent.CORE, 'Creating HTTP server...')
        const httpServer = http.createServer(expressApp)
        logInfo(ELogComponent.CORE, 'Creating WS server...')
        const wsServer = new WebSocketServer({ server: httpServer, skipUTF8Validation:true  })

        wsServer.on('connection', (webSocket:WebSocket, req:IncomingMessage) => {
            const ipHeader = req.headers['x-forwarded-for']
            const ip = (Array.isArray(ipHeader) ? ipHeader[0] : ipHeader || req.socket.remoteAddress || '').split(',')[0].trim()
            logInfo(ELogComponent.CORE, `Client connected from ${ip}`)

            if (req.url) {
                // This block precesses web socket connections for channels (they are not the websocket connecitons for kwrith itself)
                const fullUrl = new URL(req.url, `http://${req.headers.host}`)
                const challenge = fullUrl.searchParams.get('challenge')
                if (challenge) {
                    let ri = instances.find(r => r.active)
                    if (!ri) {
                        logWarning(ELogComponent.CORE, 'No running Instance found on WS connection')
                        return
                    }
                    let websocketRequestIndex = ri.clusterInfo.pendingWebsocket.findIndex(i => i.challenge === challenge)
                    if (websocketRequestIndex>=0) {
                        let websocketRequest = ri.clusterInfo.pendingWebsocket[websocketRequestIndex]
                        logInfo(ELogComponent.CORE, 'Websocket request received for channel ' + websocketRequest.channel)
                        if (!ri.channels.has(websocketRequest.channel)) {
                            webSocket.close()
                            logError(ELogComponent.CORE, 'Channel not found')
                            logError(ELogComponent.CORE, websocketRequest.channel)
                            return
                        }
                        let channel = ri.channels.get(websocketRequest.channel)!
                        logInfo(ELogComponent.CORE, 'Websocket connection request routed to' + websocketRequest.channel)
                        channel.websocketRequest(webSocket, websocketRequest.instance, websocketRequest.instanceConfig)
                        ri.clusterInfo.pendingWebsocket.splice(websocketRequestIndex,1)
                        return
                    }
                    else {
                        logError(ELogComponent.CORE, 'Instance not found for completing webscoket request:')
                        logError(ELogComponent.CORE, challenge)
                        webSocket.close()
                        return
                    }
                }
            }

            webSocket.onmessage = (event) => {
                let ri = instances.find(r => r.active)
                if (!ri) {
                    logWarning(ELogComponent.CORE, 'No running Instance found on WS message')
                    return
                }
                localProcessClientMessage(webSocket, event.data, ri)
            }

            webSocket.onclose = () => {
                // we do not remove connections for the client to reconnect
                logInfo(ELogComponent.CORE, 'Client disconnected')
                let ri = instances.find(r => r.active)
                if (!ri) {
                    logWarning(ELogComponent.CORE, 'No running Instance found on WS close')
                    return
                }
                for (let channel of ri.channels.values()) {
                    if (channel.containsConnection(webSocket)) {
                        logWarning(ELogComponent.CORE, `Connection from IP ${ip} to channel ${channel.getChannelData().id} has been interrupted.`)
                    }
                }
                if (runningEnv.isElectron) {
                    // +++ if session is electron, we remove everything and stop everything
                }
            }
        })

        logInfo(ELogComponent.CORE, 'Listening...')
        httpServer.listen(envPort, () => {
            logInfo(ELogComponent.CORE, `Server is listening on port ${envPort}`)
            if (localKwirthData.inCluster) {
                logInfo(ELogComponent.CORE, `Kwirth is running INSIDE cluster`)
            }
            else {
                logInfo(ELogComponent.CORE, `Kwirth is running OUTSIDE a cluster`)
            }
        })
    }
    catch (err) {
        logError(ELogComponent.CORE, 'Error creatinh HTTP/WS server')
        logError(ELogComponent.CORE, err)
    }
}

const setupProcessHooks = (runningInstance: IRunningInstance, kwirthData:KwirthData) => {
    const handleNodeProcessSignal = (signal:any) => {
        logWarning(ELogComponent.CORE, `⚠️ Signal ${signal} received. We just close everything.`)
        process.exit(0)
    }   

    const exitAndLog = async (signal:any, reason:any, promise:any, err: any, origin: any, exitCode:number, waitSeconds: number) => {
        if (reason) {
            logError(ELogComponent.CORE, 'Reason:')
            logError(ELogComponent.CORE, JSON.stringify(reason))
        }
        if (promise) {
            logError(ELogComponent.CORE, 'Promise:')
            logError(ELogComponent.CORE, JSON.stringify(promise))
        }
        if (err) {
            logError(ELogComponent.CORE, 'Err:')
            logError(ELogComponent.CORE, err.stack || err)
        }
        if (origin) {
            logError(ELogComponent.CORE, `Origin:`)
            logError(ELogComponent.CORE, `${origin}`)
        }

        if (envExitLog && runningEnv.isK8s && kwirthData.inCluster) {
            let entry = {
                timestamp: new Date().toISOString(),
                reason,
                promise,
                err,
                origin,
            }
            try {
                var secureLogCm:V1ConfigMap = {
                    metadata: {
                        name: 'kwirth-secure-log',
                        namespace: kwirthData.namespace
                    },
                    data: { events: JSON.stringify([]) }
                }
                let events = []
                try {
                    let cfgMap = await runningInstance.clusterInfo.coreApi?.readNamespacedConfigMap({ name: 'kwirth-secure-log', namespace: kwirthData.namespace })
                    if (cfgMap && cfgMap.data && cfgMap.data.events) events = JSON.parse(cfgMap.data.events)
                }
                catch(err:any){
                    if (err.code===404)
                        await runningInstance.clusterInfo.coreApi?.createNamespacedConfigMap({ namespace: kwirthData.namespace, body: secureLogCm })
                    else
                        logError(ELogComponent.CORE, 'Error reading kubernetes secureLog configMap in ' + kwirthData.namespace + '/' + name)
                }
                events.push(entry)
                secureLogCm.data!.events = JSON.stringify(events)
                await runningInstance.clusterInfo.coreApi?.replaceNamespacedConfigMap({ name: 'kwirth-secure-log', namespace: kwirthData.namespace, body:secureLogCm })
            }
            catch {
                console.log('Error writing secure exit info. Waiting for 1h before finishing')
                await new Promise((resolve) => setTimeout(resolve, 60*60*1000))
            }
        }

        if (waitSeconds>0) await new Promise((resolve) => setTimeout(resolve, waitSeconds*1000))
        process.exit(exitCode)
    }

    process.on('SIGTERM', () => handleNodeProcessSignal('SIGTERM'))

    process.on('SIGINT', () => handleNodeProcessSignal('SIGINT'))

    process.on('unhandledRejection', async (reason:any, promise:any) => {
        logError(ELogComponent.CORE, '❌ UNHANDLED REJECTION')
        exitAndLog(undefined, reason, promise, undefined, undefined, 1, 10)
    })

    process.on('uncaughtException', async (err, origin) => {
        logError(ELogComponent.CORE, '🚨 UNCAUGHT EXCEPTION')
        exitAndLog(undefined, undefined, undefined, err, origin, 1, 10)
    })

    process.on('exit', async () => {
        logWarning(ELogComponent.CORE, '🚨 EXITING on Node exit')
        exitAndLog(undefined, undefined, undefined, undefined, undefined, 1, 10)
    })
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////// START ///////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
setLogConfig(envAnsiLog)  //+++ test
logInfo(ELogComponent.CORE, `Kwirth version is ${VERSION}`)
logInfo(ELogComponent.CORE, `Kwirth started at ${new Date().toISOString()}`)
logInfo(ELogComponent.CORE, 'Kwirth running environment:')
logInfo(ELogComponent.CORE, runningEnv)
logInfo(ELogComponent.CORE, `Kwirth Auth: ${envAuth}`)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

showLogo()
startNodeTasks()

getExecutionEnvironment(envContext).then( async (exenv:string) => {
    logInfo(ELogComponent.CORE, `Kubernetes context: '${envContext}' (default kubeconfig context)`)

    let kwirthData:KwirthData
    switch (exenv) {
        case 'electron':
            kwirthData = {
                namespace: 'default',
                deployment: '',
                isElectron: true,
                inCluster: false,
                version: VERSION,
                lastVersion: VERSION,
                clusterName: 'inElectron',
                clusterType: EClusterType.KUBERNETES,
                metricsInterval: 15,
                channels: []
            }
            break
        case 'windowsdocker':
        case 'linuxdocker':
            kwirthData = {
                namespace: '',
                deployment: '',
                isElectron: runningEnv.isElectron,
                inCluster: false,
                version: VERSION,
                lastVersion: VERSION,
                clusterName: 'inDocker',
                clusterType: EClusterType.DOCKER,
                metricsInterval:15,
                channels: []
            }
            break
        case 'docker':
            kwirthData = {
                namespace: '',
                deployment: '',
                isElectron: false,
                inCluster: false,
                version: VERSION,
                lastVersion: VERSION,
                clusterName: 'inDocker',
                clusterType: EClusterType.KUBERNETES,
                metricsInterval:15,
                channels: []
            }
            break
        case 'kubernetes':
            let kd = await getKubernetesKwirthData(envContext)
            if (kd)
                kwirthData = kd
            else {
                logError(ELogComponent.CORE, 'Cannot get KwirthData. Exiting')
                process.exit(1)
            }
            break
        default:
            logError(ELogComponent.CORE, `Unsupported execution environment '${exenv}'. Exiting...`)
            process.exit()
    }

    app.use(bodyParser.json())
    app.use(cors())
    app.use(fileUpload())

    // serve front
    if (envFront) {
        logInfo(ELogComponent.CORE, `Front serving is enbaled`)
        logInfo(ELogComponent.CORE, `SPA is available at: ${envRootPath}/front`)
        app.get(`${envRootPath}`, (req, res) => res.redirect(`${envRootPath}/front`))
    }
    else {
        logInfo(ELogComponent.CORE, 'Front serving not enabled, SPA will not be available')
    }
    app.use(`${envRootPath}`, (req, res, next) => {
        if (req.path.startsWith(`${envRootPath}/front`) || req.path === '/') return next()
        if (runningEnv.isElectron && req.path.startsWith('/core/electron/')) return next()
        if (req.path.startsWith(`${envRootPath}/core/auth/`)) return next()

        const activeRI = runningInstances.find(r => r.active)
        if (activeRI && activeRI.router)
            return activeRI.router(req, res, next)
        else
            return res.status(503).send('No active instance available')
    })
    app.get(`${envRootPath}/core/auth/method`, (req:Request,res:Response) => {
        return res.status(200).json({ auth: envAuth })
    })

    if (envFront) app.use(`${envRootPath}/front/`, express.static('./front'))

    if (kwirthData.inCluster) {
        logInfo(ELogComponent.CORE, 'Configuring healthz endpoint for Kubernetes')
        app.get(`/healthz`, (_req:Request,res:Response) => { res.status(200).send() })
    }

    const fs = require('fs')
    fs.readdir('.', (err:any, folderFiles:any) => {
        if (err) {
            logError(ELogComponent.CORE, 'Error reading folder data:')
            logError(ELogComponent.CORE, err)
            return
        }
        logInfo(ELogComponent.CORE, 'File list at project root when launching environment: ' + folderFiles.join(', '))
    })

    createHttpServers(kwirthData, app, runningInstances, processClientMessage)

    switch (exenv) {
        case 'electron':
            await launchElectron(kwirthData, app)
            break
        case 'windowsdocker':
        case 'linuxdocker':
            //await launchKwirthDocker(kwirthData)
            break
        case 'docker':
            await launchDocker(envContext, kwirthData, app)
            break
        case 'kubernetes':
            await launchKubernetes(envContext, kwirthData, app)
            break
        default:
            logError(ELogComponent.CORE, `'Unsupported execution environment '${exenv}'. Exiting...`)
            process.exit()
    }
    logInfo(ELogComponent.CORE, `KWI1500I Control is being given to Kwirth`)
 })
.catch( (err) => {
    console.error (err)
    console.error ('Cannot determine execution environment')
    process.exit()
})
