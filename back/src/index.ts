import { ApisApi, CoreV1Api, AppsV1Api, KubeConfig, KubernetesObjectApi, Log, Watch, Exec, V1Pod, CustomObjectsApi, RbacAuthorizationV1Api, ApiextensionsV1Api, VersionApi, NetworkingV1Api, StorageV1Api, BatchV1Api, AutoscalingV2Api, NodeV1Api, SchedulingV1Api, CoordinationV1Api, AdmissionregistrationV1Api, PolicyV1Api } from '@kubernetes/client-node'
import Docker from 'dockerode'
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
import { MetricsApi } from './api/MetricsApi'
import { v4 as uuid } from 'uuid'

import { MetricsTools } from './tools/MetricsTools'
import { LogChannel } from './channels/log/LogChannel'
import { AlertChannel } from './channels/alert/AlertChannel'
import { MetricsChannel } from './channels/metrics/MetricsChannel'
import { ISecrets } from './tools/ISecrets'
import { IConfigMaps } from './tools/IConfigMap'
import { DockerSecrets } from './tools/DockerSecrets'
import { DockerConfigMaps } from './tools/DockerConfigMaps'
//import { DockerTools } from './tools/DockerTools'
import { OpsChannel } from './channels/ops/OpsChannel'
import { TrivyChannel } from './channels/trivy/TrivyChannel'
import { IChannel } from './channels/IChannel'
import { EchoChannel } from './channels/echo/EchoChannel'
import { FilemanChannel } from './channels/fileman/FilemanChannel'

import { IncomingMessage } from 'http'
import { MagnifyChannel } from './channels/magnify/MagnifyChannel'
import { EventsProvider } from './providers/EventsProvider'

import fileUpload from 'express-fileupload'
import v8 from 'node:v8'
import http from 'http'
import bodyParser from 'body-parser'
import cors from 'cors'
import { Application } from 'express-serve-static-core'
import { PinocchioChannel } from './channels/pinocchio/PinocchioChannel'
import * as crypto from 'crypto'
import { ValidatingProvider } from './providers/ValidatingProvider'
import { TickProvider } from './providers/TickProvider'
import { IProvider } from './providers/IProvider'
const fs = require('fs')

// const originalFetch = require('node-fetch');
// global.fetch = (...args) => {
//     console.log(`🚀 Petición iniciada a: ${args[0]}`);
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
    active: boolean
    router: any
    apiKeyApi: ApiKeyApi|undefined
}
var runningInstances:IRunningInstance[] = []

let rootPath = process.env.ROOTPATH
if (rootPath && !rootPath.startsWith('/')) rootPath = '/'+ rootPath
const envRootPath = rootPath || ''
const envCommand = process.env.COMMAND
const envContext = process.env.CONTEXT || undefined
const envAuth = process.env.AUTH || 'kwirth'  // kwirth | kubeconfig | b2c | entraid | cognito | keycloak | ...
const envMasterKey = process.env.MASTERKEY || 'Kwirth4Ever'
const envForward = (process.env.FORWARD || 'true').toLowerCase() === 'true'
const envPort = +(process?.env?.PORT || '3883')
const envFront = process.env.FRONT !== undefined ? process.env.FRONT === 'true' : true
const envConfigMapPath = process.env.CONFIGMAPPATH !== undefined ? process.env.CONFIGMAPPATH : '.'
const envSecretPath = process.env.SECRETPATH !== undefined ? process.env.SECRETPATH : '.'
const envMetricsInterval = process.env.METRICSINTERVAL? +process.env.METRICSINTERVAL : 15
const envChannelLogEnabled = (process.env.CHANNEL_LOG || 'true').toLowerCase() === 'true'
const envChannelMetricsEnabled = (process.env.CHANNEL_METRICS || 'true').toLowerCase() === 'true'
const envChannelAlertEnabled = (process.env.CHANNEL_ALERT || 'true').toLowerCase() === 'true'
const envChannelOpsEnabled = (process.env.CHANNEL_OPS || 'true').toLowerCase() === 'true'
const envChannelTrivyEnabled = (process.env.CHANNEL_TRIVY || 'true').toLowerCase() === 'true'
const envChannelEchoEnabled = (process.env.CHANNEL_ECHO || 'true').toLowerCase() === 'true'
const envChannelFilemanEnabled = (process.env.CHANNEL_FILEMAN || 'true').toLowerCase() === 'true'
const envChannelMagnifyEnabled = (process.env.CHANNEL_MAGNIFY || 'true').toLowerCase() === 'true'
const envChannelPinocchioEnabled = (process.env.CHANNEL_PINOCCHIO || 'true').toLowerCase() === 'true'

if (envCommand!==undefined) {
    switch(envCommand) {
        case 'APIKEY': // Bearer Api Key
            let expire= Date.now() + 86400000
            let input = envMasterKey + '|cluster::::|' + expire
            let hash = crypto.createHash('md5').update(input).digest('hex')
            let apiKey:ApiKey={ accessKey:accessKeyBuild(hash, 'permanent', 'cluster::::'), description:'ApiKey created with Kwirth External', expire, days:1}
            console.log(apiKey)
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



// const getExecutionEnvironment = async (context:string|undefined):Promise<string> => {
//     console.log('Detecting execution environment...')

//     console.log('Trying Electron...')    
//     if (runningEnv.isElectron) return 'electron'

//     // we keep this order of detection, since kubernetes also has a docker engine
//     console.log('Trying Kubernetes...')
//     try {
//         let kubeConfig = new KubeConfig()
//         kubeConfig.loadFromDefault()
//         if (context) kubeConfig.setCurrentContext(context)
//         let coreApi = kubeConfig.makeApiClient(CoreV1Api)
//         await coreApi.listPodForAllNamespaces()
//         return 'kubernetes'
//     }
//     catch (err) {
//         console.log(err)
//         console.log('================================================')
//     }

//     console.log('Trying Linux docker...')
//     try {
//         let dockerApiLinux = new Docker({ socketPath: '/var/run/docker.sock'})
//         await dockerApiLinux.listContainers( { all:false } )
//         return 'linuxdocker'
//     }
//     catch (err) {
//         console.log(err)
//         console.log('================================================')
//     }

//     console.log('Trying Windows docker...')
//     try {
//         let dockerApiWindows = new Docker({ socketPath: '//./pipe/docker_engine' })
//         await dockerApiWindows.listContainers( { all:false } )
//         return 'windowsdocker'
//     }
//     catch (err) {
//         console.log(err)
//         console.log('================================================')
//     }
//     return 'undetected'
// }

const getExecutionEnvironment = async (context:string|undefined):Promise<string> => {
    console.log('Detecting execution environment...')

    console.log('Trying Electron...')    
    if (runningEnv.isElectron) return 'electron'

    console.log('Trying Kubernetes...')
    if (runningEnv.isK8s) {
        return 'kubernetes'
    }

    console.log('Trying Docker...')
    if (runningEnv.isDocker) return 'docker'

    return 'undetected'
}


const getKubernetesKwirthData = async (context:string|undefined):Promise<KwirthData|undefined> => {
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
                console.log('Cannot determine namespace while running outside cluster (trying to read users secret)')
                process.exit(1)
            }
        }
    }
    catch (err) {
        console.log('Error obatining KwirthData')
        console.log(err)
    }
    return undefined
}

const activateRunningInstance = (ri:IRunningInstance) => {
    runningInstances.forEach( r => r.active = false)
    ri.active = true
    console.log('Activated RI:',ri.id, ri.clusterInfo.name)
}

const createRunningInstance = async (context:string|undefined, kwirthData:KwirthData):Promise<IRunningInstance|undefined> => {
    try {
        let kubeConfig = new KubeConfig()
        kubeConfig.loadFromDefault()
        if (context) kubeConfig.setCurrentContext(context)

        const currentContextName = kubeConfig.getCurrentContext()
        console.log(`Will use '${currentContextName}' context`)
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
            console.log('SA Token will not be created under isElectron or isDocker contexts')
        }
        else {
            // let saToken = new ServiceAccountToken(clusterInfo.coreApi, kwirthData.namespace)
            // await saToken.createToken('kwirth-sa', kwirthData.namespace)
            // let token:string|undefined = undefined
            // let retries = 3
            // while (!token && retries-- > 0) {
            //     await new Promise((resolve) => setTimeout(resolve, 1000))
            //     token = await saToken.extractToken('kwirth-sa', kwirthData.namespace)
            // }
            // if (token) {
            //     console.log('Got token...')
            //     clusterInfo.saToken = saToken
            //     clusterInfo.token = token
            // }
            // else {
            //     console.log('No SA Token, no metrics will be available.')
            // }
            let saToken = new ServiceAccountToken(clusterInfo.coreApi, kwirthData.namespace)
            let token = await saToken.createToken('kwirth-sa', kwirthData.namespace)
            if (token) {
                console.log('Got token...')
                clusterInfo.saToken = saToken
                clusterInfo.token = token
            }
            else {
                console.log('No SA Token, no metrics will be available.')
            }
        }

        clusterInfo.setKubernetesClusterName()
        clusterInfo.nodes = await clusterInfo.getNodes()

        let configMaps
        let secrets
        if (runningEnv.isDocker) {
            console.log('Configuration paths:', envConfigMapPath, envSecretPath)
            configMaps = new DockerConfigMaps(clusterInfo.coreApi, envConfigMapPath)
            secrets = new DockerSecrets(clusterInfo.coreApi, envSecretPath)
            let users:{ [username:string]:string } = await secrets.read('kwirth-users')
            if (!users) {
                console.log('Admin user will be created, since there is no users config map')
                users = {
                    admin: 'eyJpZCI6ImFkbWluIiwibmFtZSI6Ik5pY2tsYXVzIFdpcnRoIiwicGFzc3dvcmQiOiJwYXNzd29yZCIsInJlc291cmNlcyI6ImNsdXN0ZXI6Ojo6In0='
                }
                await secrets.write('kwirth-users',users)
            }
        }
        else {
            secrets = new KubernetesSecrets(clusterInfo.coreApi, kwirthData.namespace)
            configMaps = new KubernetesConfigMaps(clusterInfo.coreApi, kwirthData.namespace)
        }
        let runningInstance:IRunningInstance = {
            id: uuid(),
            kwirthData: kwirthData,
            clusterInfo: clusterInfo,
            secrets,
            configMaps,
            channels: new Map(),
            active: false,
            router: undefined,
            apiKeyApi: undefined
        }
        return runningInstance
    }
    catch (err) {
        console.log('Error creating running instance')
        console.log(err)
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
        console.log(localChannels)
        console.log(`Unsupported channel '${instanceMessage.channel}' for sending signals`)
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
        console.log(`Channel '${instanceMessage.channel}' is unsupported sneding asset info`)
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
        console.log(`Object review '${instanceConfig.channel}': ${podNamespace}/${podName}/${containerName} (view: ${instanceConfig.view}) (instance: ${instanceConfig.instance})`)

        let valid = AuthorizationManagement.checkAkr(ri.channels, instanceConfig, podNamespace, podName, containerName)
        if (!valid) {
            console.log(`No AKR found for object : ${podNamespace}/${podName}/${containerName} (view: ${instanceConfig.view}) (instance: ${instanceConfig.instance})`)
            return
        }

        console.log(`Level is enough for adding object: ${podNamespace}/${podName}/${containerName} (view: ${instanceConfig.view}) (instance: ${instanceConfig.instance})`)

        if(ri.channels.has(instanceConfig.channel)) {
            let channel = ri.channels.get(instanceConfig.channel)!
            if (channel?.containsAsset(webSocket, podNamespace, podName, containerName)) {
                console.log(`Existing asset '${instanceConfig.channel}': ${podNamespace}/${podName}/${containerName} (view: ${instanceConfig.view}) (instance: ${instanceConfig.instance})`)
            }
            else {
                console.log(`addObject '${instanceConfig.channel}': ${podNamespace}/${podName}/${containerName} (view: ${instanceConfig.view}) (instance: ${instanceConfig.instance})`)
                await channel.addObject(webSocket, instanceConfig, podNamespace, podName, containerName)
                sendChannelSignalAsset(webSocket, ESignalMessageLevel.INFO, ESignalMessageEvent.ADD, `Container ADDED: ${podNamespace}/${podName}/${containerName}`, instanceConfig, ri, podNamespace, podName, containerName)
            }
        }
        else {
            console.log(`Invalid channel`, instanceConfig.channel)
        }
    }
    catch (err) {
        console.error('Error adding object', err)
    }
}

const deleteObject = async (webSocket:WebSocket, _eventType:string, podNamespace:string, podName:string, containerName:string, instanceConfig:IInstanceConfig, ri:IRunningInstance) => {
    if(ri.channels.has(instanceConfig.channel)) {
        ri.channels.get(instanceConfig.channel)?.deleteObject(webSocket, instanceConfig, podNamespace, podName, containerName)
        sendChannelSignalAsset(webSocket, ESignalMessageLevel.INFO, ESignalMessageEvent.DELETE, `Container DELETED: ${podNamespace}/${podName}/${containerName}`, instanceConfig, ri, podNamespace, podName, containerName)
    }
    else {
        console.log(`Invalid channel`, instanceConfig.channel)
    }
}

const processEvent = async (eventType:string, obj: any, webSocket:WebSocket, instanceConfig:IInstanceConfig, podNamespace:string, podName:string, containers:string[], ri:IRunningInstance) => {
    try {
        if (eventType === 'ADDED') {
            console.log('eventype',eventType, podNamespace, podName, obj.status.phase)
            for (let container of containers) {
                let containerName = container
                switch (instanceConfig.view) {
                    case EInstanceConfigView.NAMESPACE:
                        console.log('Namespace event')
                        console.log(`Pod ADDED: ${podNamespace}/${podName}/${containerName} on namespace`)
                        await addObject(webSocket, instanceConfig, podNamespace, podName, containerName, ri)
                        break
                    case EInstanceConfigView.GROUP:
                        console.log('Group event')
                        let [_groupType, groupName] = instanceConfig.group.split('+')
                        // we rely on kubernetes naming conventions here (we could query k8 api to discover group the pod belongs to)
                        if (podName.startsWith(groupName)) {  
                            console.log(`Pod ADDED: ${podNamespace}/${podName}/${containerName} on group`)
                            await addObject(webSocket, instanceConfig, podNamespace, podName, containerName, ri)
                            break
                        }
                        console.log(`Excluded group: ${groupName}`)
                        break
                    case EInstanceConfigView.POD:
                        console.log('Pod event')
                        if ((instanceConfig.namespace==='' || (instanceConfig.namespace!=='' && instanceConfig.namespace.split(',').includes(podNamespace))) && instanceConfig.pod.split(',').includes(podName)) {
                            if (instanceConfig.pod.split(',').includes(podName)) {
                                console.log(`Pod ADDED: ${podNamespace}/${podName}/${containerName} on pod`)
                                await addObject(webSocket, instanceConfig, podNamespace, podName, containerName, ri)
                                break
                            }
                        }
                        console.log(`Excluded pod: ${podName}`)
                        break
                    case EInstanceConfigView.CONTAINER:
                        console.log('Container event')
                        // container has the form: podname+containername (includes a plus sign as separating char)
                        let instanceContainers = Array.from (new Set (instanceConfig.container.split(',').map (c => c.split('+')[1])))
                        let instancePods = Array.from (new  Set (instanceConfig.container.split(',').map (c => c.split('+')[0])))
                        if (instanceContainers.includes(containerName) && instancePods.includes(podName)) {
                            if (instanceConfig.container.split(',').includes(podName+'+'+containerName)) {
                                console.log(`Pod ADDED: ${podNamespace}/${podName}/${containerName} on container`)
                                await addObject(webSocket, instanceConfig, podNamespace, podName, containerName, ri)
                                break
                            }
                        }
                        console.log(`Excluded container: ${containerName}`)
                        break
                    default:
                        console.log('Invalid instanceConfig view')
                        break
                }
            }
        }
        else if (eventType === 'MODIFIED') {
            console.log('eventype',eventType, podNamespace, podName, obj.status.phase.toLowerCase())
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
            console.log('eventype', eventType, podNamespace, podName, obj.status.phase)
            deleteObject(webSocket, eventType, podNamespace, podName, '', instanceConfig, ri)
        }
        else {
            console.log(`Pod ${eventType} is unmanaged`)
            sendChannelSignalAsset(webSocket, ESignalMessageLevel.INFO, ESignalMessageEvent.OTHER, `Received unmanaged event (${eventType}): ${podNamespace}/${podName}`, instanceConfig, ri, podNamespace, podName)
        }
    }
    catch (err) {
        console.log('Error preceossing event')
        console.log(err)
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
        console.log('Error watching docker pods')
        console.log(err)
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
                console.log('Generic error starting watchPods')
                console.log(err)
                sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, JSON.stringify(err), instanceConfig, ri.channels)
            }
            else {
                // watch method launches a 'done' invocation several minutes after starting streaming, I don't know why.
            }
        })
    }
    catch (err) {
        console.log('Error watching kubernetes pods')
        console.log(err)
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
                console.log('Error starting to watch docker pods')
                console.log(err)
            }
        }
    }
    catch (err) {
        console.log('Error in generic watch pods')
        console.log(err)
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
                console.log('validPodNames:',validPodNames, '  podName:', podName)
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
        console.log('Error getting requested validated scoped pods')
        console.log(err)
    }
    return selectedPods
}

const processReconnect = async (webSocket: WebSocket, instanceMessage: IInstanceMessage, localChannels:Map<string,IChannel>) => {
    console.log(`Trying to reconnect instance '${instanceMessage.instance}' on channel ${instanceMessage.channel}`)
    for (let channel of localChannels.values()) {
        console.log('Review channel for reconnect:', channel.getChannelData().id)
        if (channel.containsInstance(instanceMessage.instance)) {
            console.log('Found channel', channel.getChannelData().id)
            let updated = channel.updateConnection(webSocket, instanceMessage.instance)
            if (updated) {
                sendInstanceConfigSignalMessage(webSocket, EInstanceMessageAction.RECONNECT, EInstanceMessageFlow.RESPONSE, instanceMessage.channel, instanceMessage, 'Reconnect successful')
                return
            }
            else {
                sendInstanceConfigSignalMessage(webSocket, EInstanceMessageAction.RECONNECT, EInstanceMessageFlow.RESPONSE, instanceMessage.channel, instanceMessage, 'An error has ocurred while updating connection')
                return
            }
        }
        else {
            console.log(`Instance '${instanceMessage.instance}' not found for reconnect on channel ${channel.getChannelData().id}`)
        }
    }
    console.log(`Instance '${instanceMessage.instance}' found for reconnect in no channels`)
    sendInstanceConfigSignalMessage(webSocket, EInstanceMessageAction.RECONNECT, EInstanceMessageFlow.RESPONSE, instanceMessage.channel, instanceMessage, 'Instance has not been found for reconnect', false)
}

const processStartInstanceConfig = async (ri:IRunningInstance, webSocket: WebSocket, instanceConfig: IInstanceConfig, accessKeyResources: ResourceIdentifier[], validNamespaces: string[], validPodNames: string[], validContainers: string[]) => {
    try {
        console.log(`Trying to perform instance config for channel '${instanceConfig.channel}' with view '${instanceConfig.view}'`)
        if (ri.channels.get(instanceConfig.channel) && ri.channels.get(instanceConfig.channel)?.getChannelData().cluster) {
            console.error('A cluster-wide access key has been created for access key', instanceConfig.accessKey.substring(0,8)+'... to access channel', instanceConfig.channel)
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
                                console.log(`No pods on namespace ${namespace}`)
                        }
                    }
                    break
                case EInstanceConfigView.POD:
                    for (let podName of instanceConfig.pod.split(',')) {
                        console.log('requestedValidatedPods, podName')
                        console.log(podName)
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
        console.log('Error starting instance')
        console.log(err)
    }
}

const processStopInstanceConfig = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, localChannels:Map<string,IChannel>) => {
    if (localChannels.has(instanceConfig.channel)) {
        localChannels.get(instanceConfig.channel)?.stopInstance(webSocket, instanceConfig)
    }
    else {
        console.log('Invalid channel on instance stop')
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
        console.log(`Ping socket not found on channel ${instanceMessage.channel}`)
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
                    console.log(`Process IMMEDIATE command`)
                    channel.processCommand(webSocket, instanceMessage, podNamespace, podName, containerName)
                }
                else {
                    console.log(`Instance '${instanceMessage.instance}' and flow ${instanceMessage.flow} not found for command`)
                    console.log(instanceMessage)
                    sendInstanceConfigSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, instanceMessage.channel, instanceMessage, `Instance '${instanceMessage.instance}' has not been found for command`)
                }
            }   
        }
        else {
            console.log(`Channel not found`)
            sendInstanceConfigSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, instanceMessage.channel, instanceMessage, 'Socket has not been found')
        }
    }
    catch (err) {
        console.error('Error on processCommand')
        console.error(err)
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
                    console.log(`Routing message to channel ${routeMessage.destChannel}`)
                    processClientMessage (webSocket, JSON.stringify(routeMessage.data), ri)
                }
                else {
                    console.log(`Destination channel (${routeMessage.destChannel}) for 'route' command doesn't support routing`)
                }
            }
            else {
                console.log(`Destination channel '${routeMessage.destChannel}' does not exist for instance '${instanceMessage.instance}'`)
                sendInstanceConfigSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, instanceMessage.channel, instanceMessage, `Dest channel ${routeMessage.destChannel} does not exist`)
            }
        }
        else {
            console.log(`Instance '${instanceMessage.instance}' not found for route on channel ${channel.getChannelData().id}`)
            sendInstanceConfigSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, instanceMessage.channel, instanceMessage, 'Instance has not been found for routing')
        }   
    }
    else {
        console.log(`Socket not found for routing`)
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
                instanceConfig: instanceConfig
            })
            webSocket.send(JSON.stringify(response))
        }
        else {
            console.log(`Instance '${instanceConfig.instance}' not found for WebSocket on channel ${channel.getChannelData().id}`)
            sendInstanceConfigSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, instanceConfig.channel, instanceConfig, 'Instance has not been found for WEBSOCKET request')
        }   
    }
    else {
        console.log(`Socket not found for routing`)
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

        console.log('Received request:', instanceMessage.flow, instanceMessage.action, instanceMessage.channel)
        if (instanceMessage.action === EInstanceMessageAction.RECONNECT) {
            console.log('Reconnect received')
            if (!ri.channels.get(instanceMessage.channel)?.getChannelData().reconnectable) {
                console.log(`Reconnect capability not enabled for channel ${instanceMessage.channel} and instance ${instanceMessage.instance}`)
                sendChannelSignal(webSocket, ESignalMessageLevel.ERROR, `Channel ${instanceMessage.channel} does not support reconnect`, instanceMessage, ri.channels)
                return
            }
            processReconnect (webSocket, instanceMessage, ri.channels)
            return
        }

        if (instanceMessage.action === EInstanceMessageAction.ROUTE) {
            let routeMessage = instanceMessage as IRouteMessage
            console.log(`Route received from channel ${instanceMessage.channel} to ${routeMessage.destChannel}`)
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
        console.log('validNamespaces:', validNamespaces)

        let validControllers:string[] = []
        if (instanceConfig.group) validControllers = await AuthorizationManagement.getValidControllers(ri.clusterInfo.coreApi,ri.clusterInfo.appsApi, ri.clusterInfo.batchApi, accessKey, validNamespaces, instanceConfig.group.split(','))
        console.log('validControllers:', validControllers)

        let validPodNames:string[] = []
        if (ri.kwirthData.clusterType === EClusterType.DOCKER) {
            validPodNames = await ri.clusterInfo.dockerTools.getAllPodNames()
        }
        else {
            if (instanceConfig.pod) validPodNames = await AuthorizationManagement.getValidPods(ri.clusterInfo.coreApi, ri.clusterInfo.appsApi, validNamespaces, accessKey, instanceConfig.pod.split(','))
        }
        console.log('validPods:', validPodNames)

        let validContainers:string[] = []
        if (instanceConfig.container) validContainers = await  AuthorizationManagement.getValidContainers(ri.clusterInfo.coreApi, accessKey, validNamespaces, validPodNames, instanceConfig.container.split(','))
        console.log('validContainers:', validContainers)
        
        switch (instanceConfig.action) {
            case EInstanceMessageAction.COMMAND:
                if (instanceMessage.flow === EInstanceMessageFlow.IMMEDIATE) {
                    console.log('Processing immediate request')
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
                if (ri.channels.get(instanceConfig.channel)?.getChannelData().modifyable) {
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
                console.log (`Invalid action in instance config: '${instanceConfig.action}'`)
                break
        }
    }
    catch (err) {
        console.log('Error processing clietn message')
        console.log(err)
    }
}

const setUpRoutes = async (ri:IRunningInstance) : Promise<boolean> => {
    try {
        const riRouter = express.Router()

        let result = await ApiKeyApi.create(ri.configMaps, envMasterKey, runningEnv.isElectron)
        if (!result) {
            console.log('Could not get apikeyapi')
            return false
        }
        let apiKeyApi = result
        riRouter.use(`/key`, apiKeyApi.route)
        ri.apiKeyApi = apiKeyApi
        let configApi:ConfigApi = new ConfigApi(apiKeyApi, ri.kwirthData, ri.clusterInfo)
        riRouter.use(`/config`, configApi.route)
        let storeApi:StoreApi = new StoreApi(ri.configMaps, apiKeyApi)
        riRouter.use(`/store`, storeApi.route)
        let userApi:UserApi = new UserApi(ri.secrets, apiKeyApi)
        riRouter.use(`/user`, userApi.route)
        let loginApi:LoginApi = new LoginApi(ri.secrets, ri.configMaps, ri.apiKeyApi)
        riRouter.use(`/login`, loginApi.route)
        let manageKwirthApi:ManageKwirthApi = new ManageKwirthApi(ri.clusterInfo.coreApi, ri.clusterInfo.appsApi, ri.clusterInfo.batchApi, apiKeyApi, ri.kwirthData)
        riRouter.use(`/managekwirth`, manageKwirthApi.route)
        let manageCluster:ManageClusterApi = new ManageClusterApi(ri.clusterInfo.coreApi, ri.clusterInfo.appsApi, apiKeyApi)
        riRouter.use(`/managecluster`, manageCluster.route)
        let metricsApi:MetricsApi = new MetricsApi(ri.clusterInfo, apiKeyApi)
        riRouter.use(`/metrics`, metricsApi.route)

        for (let provider of ri.clusterInfo.providers) {
            if (provider.providesRouter) {
                if (provider.router) {
                    riRouter.use(`/provider/${provider.id}`, provider.router)
                    console.error(`Provider ${provider.id} will listen HTTP requests at '/provider/${provider.id}'`)
                }
                else {
                    console.error(`Provider ${provider.id} provides router but ruter doen't exist`)
                }
            }
        }
            
        ri.router = riRouter
        return true
    }
    catch (err) {
        console.log('Error setting up routes')
        console.log(err)
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
            console.log('Could not get accessKey')
            res.status(400).send()
        }
    }
    catch (err) {
        console.log('Error on GET endpoint')
        console.log(err)
        res.status(400).send()
    }
}

const startChannelEndpoints = (ri:IRunningInstance, expressApp:Application) => {
    for (let channel of ri.channels.values()) {
        let channelData = channel.getChannelData()
        if (channelData.endpoints.length>0) {
            channelData
            for (let endpoint of channelData.endpoints) {
                console.log(`Will listen on ${envRootPath}/${ri.id}/channel/${channelData.id}/${endpoint.name}`)
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
        fs.readdir('.', (err:any, archivos:any) => {
            if (err) {
                console.error('Error reading folder data:', err)
                return
            }
            console.log('File list at project root when starting instance:', archivos.join(', '))
        })

        if (! (await setUpRoutes(ri))) {
            console.log('Could not set up HTTP routes. Exiting')
            process.exit(1)
        }
        startChannelEndpoints(ri, expressApp)
        for (let channel of ri.channels.values()) {
            console.log(`Starting channel '${channel.getChannelData().id}'`)
            channel.startChannel()
        }
    }
    catch (err) {
        console.log('Error in startRunningInstance')
        console.log(err)
    }
}

const handleNodeProcessSignal = (signal:any) => {
    console.warn(`⚠️ Signal ${signal} received. We just close everything.`)
    process.exit(0)
}   

process.on('SIGTERM', () => handleNodeProcessSignal('SIGTERM'))
process.on('SIGINT', () => handleNodeProcessSignal('SIGINT'))

process.on('unhandledRejection', (reason:any, promise:any) => {
    console.error('❌ UNHANDLED REJECTION')
    console.error('Reason:', reason)
    console.error('Stack:', reason.stack)
    console.error('Promise:', promise)
    console.dir(promise)
    process.exit(1)
})

process.on('uncaughtException', (err, origin) => {
    console.error('🚨 UNCAUGHT EXCEPTION')
    console.error(`Origin: ${origin}`)
    console.error(err.stack || err)
    process.exit(1)
})

process.on('exit', async () => {
    console.log('********************************************************************************')
    console.log('********************************************************************************')
    console.log('********************************************************************************')
    console.log('********************************************************************************')
    console.log('********************************************************************************')
    console.log('exiting on node exit')
    await new Promise((resolve) => setTimeout(resolve, 10000))
})

const setKubernetesClusterKwirthRequirements = async (localKwirthData: KwirthData, localClusterInfo:ClusterInfo, metricsRequired:boolean, eventsRequired: boolean, requiredProviders:string[]) : Promise<void> => {
    try {
        console.log('Node info loaded')

        console.log('Source Info')
        console.log('  Name:', localClusterInfo.name)
        console.log('  Type:', localClusterInfo.type)
        console.log('  Flavour:', localClusterInfo.flavour)
        console.log('  Nodes:', localClusterInfo.nodes.size)

        if (metricsRequired) {
            localClusterInfo.metrics = new MetricsTools(localClusterInfo, localKwirthData.inCluster)
            localClusterInfo.metricsInterval = envMetricsInterval // we set cluster metrics interval based on default metrics interval
            await localClusterInfo.metrics.startMetrics()
            console.log('  vCPU:', localClusterInfo.vcpus)
            console.log('  Memory (GB):', localClusterInfo.memory/1024/1024/1024)
        }

        if (eventsRequired) {
            localClusterInfo.events = new EventsProvider(localClusterInfo)
            localClusterInfo.events.startProvider()
        }

        localClusterInfo.providers = []
        for(let provId of requiredProviders) {
            //+++ refactorize like the pattern of constructor of front IChannel
            let prov:IProvider
            if (provId==='tick') prov = new TickProvider(localClusterInfo)
            if (provId==='validating') prov = new ValidatingProvider(localClusterInfo)
            prov!.startProvider()
            console.log(`Provider '${provId}' started`)
            localClusterInfo.providers.push(prov!)
        }

    }
    catch (err) {
        console.log('Error setting up kubernetes requirements')
        console.log(err)
    }
}

// const prepareRunningInstance = async (localKwirthData:KwirthData, runningInstance:IRunningInstance) : Promise<void> => {
//     try {
//         if (envChannelLogEnabled) runningInstance.channels.set('log', new LogChannel(runningInstance.clusterInfo))
//         if (envChannelAlertEnabled) runningInstance.channels.set('alert', new AlertChannel(runningInstance.clusterInfo))
//         if (envChannelMetricsEnabled) runningInstance.channels.set('metrics', new MetricsChannel(runningInstance.clusterInfo))
//         if (envChannelOpsEnabled) runningInstance.channels.set('ops', new OpsChannel(runningInstance.clusterInfo))
//         if (envChannelTrivyEnabled) runningInstance.channels.set('trivy', new TrivyChannel(runningInstance.clusterInfo))
//         if (envChannelEchoEnabled) runningInstance.channels.set('echo', new EchoChannel(runningInstance.clusterInfo))
//         if (envChannelFilemanEnabled) runningInstance.channels.set('fileman', new FilemanChannel(runningInstance.clusterInfo))
//         if (envChannelMagnifyEnabled) runningInstance.channels.set('magnify', new MagnifyChannel(runningInstance.clusterInfo, localKwirthData))
//         if (envChannelPinocchioEnabled) runningInstance.channels.set('pinocchio', new PinocchioChannel(runningInstance.clusterInfo))

//         // this '.channels' object is sent to clients when they want to know something about support channels on the backend they're connected to
//         localKwirthData.channels =  Array.from(runningInstance.channels.keys()).map(k => {
//             return runningInstance.channels.get(k)?.getChannelData()!
//         })

//         // Detect if any channel requires metrics or events
//         let eventsRequired = Array.from(runningInstance.channels.values()).reduce( (prev, current) => { return prev || current.getChannelData().events}, false)
//         console.log('Events required: ', eventsRequired)
//         let metricsRequired = Array.from(runningInstance.channels.values()).reduce( (prev, current) => { return prev || current.getChannelData().metrics}, false)
//         console.log('Metrics required: ', metricsRequired)
//         if (!envChannelMetricsEnabled) console.log('❌ Metrics have not been enabled on Kwirth, so it will not be available.')
//         if (!runningEnv.isElectron && !runningEnv.isDocker && !runningInstance.clusterInfo.token) console.log('❌ An SA Token could not be obtained, so metrics will not be available.')
//         metricsRequired = metricsRequired && envChannelMetricsEnabled && (runningEnv.isElectron || runningEnv.isDocker || Boolean(runningInstance.clusterInfo.token))

//         let registerdProviders = ['tick','validating']  //+++ refactorize
//         let requiredProviders = []
//         for (let provId of registerdProviders) {
//             let required = Array.from(runningInstance.channels.values()).reduce( (prev, current) => { return prev || current.getChannelData().providers.includes(provId)}, false)            
//             if (required) requiredProviders.push(provId)
//             console.log(`'${provId}' required:`, required)
//         }

//         await setKubernetesClusterKwirthRequirements(localKwirthData, runningInstance.clusterInfo, metricsRequired, eventsRequired, requiredProviders)
//         runningInstance.clusterInfo.type = localKwirthData.clusterType

//         console.log(`Enabled channels for this (kubernetes) run are: ${Array.from(runningInstance.channels.keys()).map(c => `'${c}'`).join(',')}`)
//         console.log(`Detected own namespace: ${localKwirthData.namespace}`)
//         if (localKwirthData.deployment !== '')
//             console.log(`Detected own deployment: ${localKwirthData.deployment}`)
//         else
//             console.log(`No deployment detected. Kwirth is not running inside a cluster`)

//         if (envForward) {
//             console.log('Will try to configure FORWARDing...')
//             if (runningInstance.kwirthData.inCluster) {
//                 console.log('FORWARD for inCluster is being configured...')
//                 if (envRootPath!=='') {
//                     configureForward(runningInstance.clusterInfo, app)
//                 }
//                 else {
//                     console.log('FORWARD for kubernetes Kwirth cannot be started since Kwirth must have a root path specified (like /kwirth, for example). Kwirth cannot FORWARD if it is running on root (/) path')
//                 }
//             }
//             else if (runningInstance.kwirthData.isElectron) {
//                 console.log('FORWARD for electron should be implemented')
//             }
//             else {
//                 console.log('FORWARD not avialable (not inCluster and not isElectron)')
//             }
//         }
//         else {
//             console.log('No FORWARD mechanism will be available.')
//         }
//     }
//     catch (err) {
//         console.log('Error preparing kubernetes')
//         console.log(err)
//     }
// }

const prepareRunningInstance = async (localKwirthData:KwirthData, runningInstance:IRunningInstance) : Promise<void> => {
    try {
        if (envChannelLogEnabled) runningInstance.channels.set('log', new LogChannel(runningInstance.clusterInfo))
        if (envChannelAlertEnabled) runningInstance.channels.set('alert', new AlertChannel(runningInstance.clusterInfo))
        if (envChannelMetricsEnabled) runningInstance.channels.set('metrics', new MetricsChannel(runningInstance.clusterInfo))
        if (envChannelOpsEnabled) runningInstance.channels.set('ops', new OpsChannel(runningInstance.clusterInfo))
        if (envChannelTrivyEnabled) runningInstance.channels.set('trivy', new TrivyChannel(runningInstance.clusterInfo))
        if (envChannelEchoEnabled) runningInstance.channels.set('echo', new EchoChannel(runningInstance.clusterInfo))
        if (envChannelFilemanEnabled) runningInstance.channels.set('fileman', new FilemanChannel(runningInstance.clusterInfo))
        if (envChannelMagnifyEnabled) runningInstance.channels.set('magnify', new MagnifyChannel(runningInstance.clusterInfo, localKwirthData))
        if (envChannelPinocchioEnabled) runningInstance.channels.set('pinocchio', new PinocchioChannel(runningInstance.clusterInfo))

        // this '.channels' object is sent to clients when they want to know something about support channels on the backend they're connected to
        localKwirthData.channels =  Array.from(runningInstance.channels.keys()).map(k => {
            return runningInstance.channels.get(k)?.getChannelData()!
        })

        // Detect if any channel requires metrics or events
        let eventsRequired = Array.from(runningInstance.channels.values()).reduce( (prev, current) => { return prev || current.getChannelData().events}, false)
        console.log('Events required: ', eventsRequired)
        let metricsRequired = Array.from(runningInstance.channels.values()).reduce( (prev, current) => { return prev || current.getChannelData().metrics}, false)
        console.log('Metrics required: ', metricsRequired)
        if (!envChannelMetricsEnabled) console.log('❌ Metrics have not been enabled on Kwirth, so it will not be available.')
        if (!runningEnv.isElectron && !runningEnv.isDocker && !runningInstance.clusterInfo.token) console.log('❌ An SA Token could not be obtained, so metrics will not be available.')
        metricsRequired = metricsRequired && envChannelMetricsEnabled && (runningEnv.isElectron || runningEnv.isDocker || Boolean(runningInstance.clusterInfo.token))

        let registerdProviders = ['tick','validating']  //+++ refactorize
        let requiredProviders = []
        for (let provId of registerdProviders) {
            let required = Array.from(runningInstance.channels.values()).reduce( (prev, current) => { return prev || current.getChannelData().providers.includes(provId)}, false)            
            if (required) requiredProviders.push(provId)
            console.log(`'${provId}' required:`, required)
        }

        await setKubernetesClusterKwirthRequirements(localKwirthData, runningInstance.clusterInfo, metricsRequired, eventsRequired, requiredProviders)
        runningInstance.clusterInfo.type = localKwirthData.clusterType

        console.log(`Enabled channels for this (kubernetes) run are: ${Array.from(runningInstance.channels.keys()).map(c => `'${c}'`).join(',')}`)
        console.log(`Detected own namespace: ${localKwirthData.namespace}`)
        if (localKwirthData.deployment !== '')
            console.log(`Detected own deployment: ${localKwirthData.deployment}`)
        else
            console.log(`No deployment detected. Kwirth is not running inside a cluster`)

        if (envForward) {
            console.log('Will try to configure FORWARDing...')
            if (runningInstance.kwirthData.inCluster) {
                console.log('FORWARD for inCluster is being configured...')
                if (envRootPath!=='') {
                    configureForward(runningInstance.clusterInfo, app)
                }
                else {
                    console.log('FORWARD for kubernetes Kwirth cannot be started since Kwirth must have a root path specified (like /kwirth, for example). Kwirth cannot FORWARD if it is running on root (/) path')
                }
            }
            else if (runningInstance.kwirthData.isElectron) {
                console.log('FORWARD for electron should be implemented')
            }
            else {
                console.log('FORWARD not avialable (not inCluster and not isElectron)')
            }
        }
        else {
            console.log('No FORWARD mechanism will be available.')
        }
    }
    catch (err) {
        console.log('Error preparing kubernetes')
        console.log(err)
    }
}

const launchKubernetes = async (context:string|undefined, localKwirthData:KwirthData, expressApp:Application) : Promise<void> => {
    try {
        console.log('Start Kubernetes Kwirth')
        if (localKwirthData) {
            console.log('Initial kwirthData', localKwirthData)
            try {
                let runningInstance = await createRunningInstance(context, localKwirthData)
                if (runningInstance) {
                    await prepareRunningInstance(localKwirthData, runningInstance)
                    runningInstances.push(runningInstance)
                    activateRunningInstance(runningInstance)
                    await startRunningInstance(runningInstance, expressApp)
                }
                else {
                    console.log('Cannot get a running instance')
                }
            }
            catch (err){
                console.log(err)
            }
        }
        else {
            console.log('Cannot get kwirthdata launching Kubernetes, exiting...')
        }
    }
    catch (err) {
        console.log('Error launching kubernetes')
        console.log(err)
    }
}

const launchDocker = async (context:string|undefined, localKwirthData:KwirthData, expressApp:Application) : Promise<void> => {    
    try {
        console.log('Start Docker Kwirth')
        if (localKwirthData) {
            console.log('Initial kwirthData', localKwirthData)
            try {
                let runningInstance = await createRunningInstance(context, localKwirthData)
                if (runningInstance) {
                    await prepareRunningInstance(localKwirthData, runningInstance)
                    runningInstances.push(runningInstance)
                    activateRunningInstance(runningInstance)
                    await startRunningInstance(runningInstance, expressApp)
                }
                else {
                    console.log('Cannot get a running instance')
                }
            }
            catch (err){
                console.log(err)
            }
        }
        else {
            console.log('Cannot get kwirthdata launching Docker, exiting...')
        }
    }
    catch (err) {
        console.log('Error launching kubernetes')
        console.log(err)
    }
}

const launchElectron = async (localKwirthData:KwirthData, expressApp:Application) : Promise<void> => {
    try {
        console.log('Start Electron Kwirth')
        if (localKwirthData) {
            console.log('Initial kwirthData', localKwirthData)
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
                        console.log(err)
                    }
                })
                expressApp.delete('/core/electron/kubeconfig', (req:Request,res:Response) => {
                    try {
                        let contextName = req.body.context
                        if (contextName) {
                            let ri = runningInstances.find(r => r.electronContext === contextName)
                            if (ri) {
                                // +++ implement remove runninginstance? or left them started?
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
                        console.log(err)
                    }
                })
                expressApp.post('/core/electron/kubeconfig', async (req:Request, res:Response) => {
                    try {
                        let contextName:string = req.body.context
                        console.log('Activating context for electron use:', contextName)
                        if (contextName) {
                            let existingRunningInstance = runningInstances.find(r => r.electronContext === contextName)
                            if (existingRunningInstance) {
                                console.log('Already activated', contextName)
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

                                    console.log('Creating instance for context', contextName)
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
                                    console.log('Could not get a running instance')
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
                        console.log(err)
                    }
                })
            }
            catch (err){
                console.log(err)
            }
        }
        else {
            console.log('Cannot get kwirthdata launching Electron, exiting...')
        }    
    }
    catch (err) {
        console.log('Error launching electron')
        console.log(err)
    }
}

const startNodeTasks = () => {
    // launch GC every 15 secs
    if (global.gc) {
        console.log('GC will run every 15 secs asynchronously')
        setInterval ( () => {
            if (global.gc) global.gc()
       }, 15000)
    }
    else {
        console.log(`No GC will run. You'd better enable it by adding '--expose-gc' to your node start command`)
    }

    // show heap status every 5 mins
    setInterval ( () => {
        console.log(v8.getHeapStatistics())
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
                console.log('Pod exists, but it seems to not to have an assigned IP')
            }
        }
        catch (err) {
            console.error('Error getting pod')
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
            console.log(`[PROXY] dynamic routing to `+dest)
            return dynamicProxy(req, res, next)
        }
        if (req.url.startsWith(`${envRootPath}/port-forward/pod`)) {
            try {
                let namespace=req.url.split('/')[4]
                let podname=req.url.split('/')[5]
                let port=req.url.split('/')[6]
                console.log(`[PROXY] Launch port forward for pod `, namespace, '/', podname)
                let ip = await getPodIp(localClusterInfo.coreApi, namespace, podname)
                console.log(`[PROXY] IP `, ip)
                res.cookie('x-kwirth-forward', ip+':'+port, { path: '/' })
                res.cookie('x-kwirth-refresh', '1', { path: '/' })
                res.redirect('/')
                return
            }
            catch (err) {
                console.log('Error processing port-forward')
                console.log(err)
            }
        }
        next()
    })
}

const createHttpServers = (localKwirthData:KwirthData, expressApp:Application, instances:IRunningInstance[], localProcessClientMessage:(webSocket: WebSocket, message: string, ri:IRunningInstance) => Promise<void>) => {
    try {
        // create HTTP and WS servers
        console.log('Creating HTTP server...')
        const httpServer = http.createServer(expressApp)
        console.log('Creating WS server...')
        const wsServer = new WebSocketServer({ server: httpServer, skipUTF8Validation:true  })

        wsServer.on('connection', (webSocket:WebSocket, req:IncomingMessage) => {
            const ipHeader = req.headers['x-forwarded-for']
            const ip = (Array.isArray(ipHeader) ? ipHeader[0] : ipHeader || req.socket.remoteAddress || '').split(',')[0].trim()
            console.log(`Client connected from ${ip}`)

            if (req.url) {
                // This block precesses web socket connections for channels (they are not the websocket connecitons for kwrith itself)
                const fullUrl = new URL(req.url, `http://${req.headers.host}`)
                const challenge = fullUrl.searchParams.get('challenge')
                if (challenge) {
                    let ri = instances.find(r => r.active)
                    if (!ri) {
                        console.log('No running Instance found on WS connection')
                        return
                    }
                    let websocketRequestIndex = ri.clusterInfo.pendingWebsocket.findIndex(i => i.challenge === challenge)
                    if (websocketRequestIndex>=0) {
                        let websocketRequest = ri.clusterInfo.pendingWebsocket[websocketRequestIndex]
                        console.log('Websocket request received for channel', websocketRequest.channel)
                        if (!ri.channels.has(websocketRequest.channel)) {
                            webSocket.close()
                            console.log('Channel not found', websocketRequest.channel)
                            return
                        }
                        let channel = ri.channels.get(websocketRequest.channel)!
                        console.log('Websocket connection request routed to', websocketRequest.channel)
                        channel.websocketRequest(webSocket, websocketRequest.instance, websocketRequest.instanceConfig)
                        ri.clusterInfo.pendingWebsocket.splice(websocketRequestIndex,1)
                        return
                    }
                    else {
                        console.log('Instance not found for completing webscoket request:', challenge)
                        webSocket.close()
                        return
                    }
                }
            }

            webSocket.onmessage = (event) => {
                let ri = instances.find(r => r.active)
                if (!ri) {
                    console.log('No running Instance found on WS message')
                    return
                }
                localProcessClientMessage(webSocket, event.data, ri)
            }

            webSocket.onclose = () => {
                // we do not remove connections for the client to reconnect
                console.log('Client disconnected')
                let ri = instances.find(r => r.active)
                if (!ri) {
                    console.log('No running Instance found on WS close')
                    return
                }
                for (let channel of ri.channels.values()) {
                    if (channel.containsConnection(webSocket)) {
                        console.log(`Connection from IP ${ip} to channel ${channel.getChannelData().id} has been interrupted.`)
                    }
                }
                if (runningEnv.isElectron) {
                    // +++ if session is electron, we remove everything and stop everything
                }
            }
        })

        console.log('Listening...')
        httpServer.listen(envPort, () => {
            console.log(`Server is listening on port ${envPort}`)
            if (localKwirthData.inCluster) {
                console.log(`Kwirth is running INSIDE cluster`)
            }
            else {
                console.log(`Kwirth is running OUTSIDE a cluster`)
            }
        })
    }
    catch (err) {
        console.log('Error creatinh HTTP/WS server')
        console.log(err)
    }
}


/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////// START ///////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
console.log(`Kwirth version is ${VERSION}`)
console.log(`Kwirth started at ${new Date().toISOString()}`)
console.log('Kwirth running environment:', runningEnv)
console.log('Kwirth Auth:', envAuth)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

showLogo()
startNodeTasks()

getExecutionEnvironment(envContext).then( async (exenv:string) => {
    console.log('Kubernetes context:', envContext || 'default kubeconfig context')

    let kwirthData:KwirthData
    switch (exenv) {
        case 'electron':
            kwirthData = {
                namespace: '',
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
                console.log('Cannot get KwirthData. Exiting')
                process.exit(1)
            }
            break
        default:
            console.log(`Unsupported execution environment '${exenv}'. Exiting...`)
            process.exit()
    }

    app.use(bodyParser.json())
    app.use(cors())
    app.use(fileUpload())

    // serve front
    if (envFront) {
        console.log(`Front serving is enbaled`)
        console.log(`SPA is available at: ${envRootPath}/front`)
        app.get(`${envRootPath}`, (req, res) => res.redirect(`${envRootPath}/front`))
    }
    else {
        console.log('Front serving not enabled, SPA will not be available')
    }
    app.use(`${envRootPath}`, (req, res, next) => {
        if (req.path.startsWith(`${envRootPath}/front`) || req.path === '/') return next()
        if (runningEnv.isElectron && req.path.startsWith('/core/electron/')) return next()
        if (req.path.startsWith('/core/auth/')) return next()

        const activeRI = runningInstances.find(r => r.active)
        if (activeRI && activeRI.router)
            return activeRI.router(req, res, next)
        else
            return res.status(503).send('No active instance available')
    })
    app.get('/core/auth/method', (req:Request,res:Response) => {
        return res.status(200).json({ auth: envAuth })
    })

    if (envFront) app.use(`${envRootPath}/front/`, express.static('./front'))

    if (kwirthData.inCluster) {
        console.log('Configuring healthz endpoint for Kubernetes')
        app.get(`/healthz`, (_req:Request,res:Response) => { res.status(200).send() })
    }

    const fs = require('fs')
    fs.readdir('.', (err:any, archivos:any) => {
        if (err) {
            console.error('Error reading folder data:', err)
            return
        }
        console.log('File list at project root when launching environment:', archivos.join(', '))
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
            console.log(`'Unsupported execution environment '${exenv}'. Exiting...`)
            process.exit()
    }
    console.log(`KWI1500I Control is being given to Kwirth`)
 })
.catch( (err) => {
    console.log (err)
    console.log ('Cannot determine execution environment')
    process.exit()
})
