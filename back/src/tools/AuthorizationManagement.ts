import { ApiKeyApi } from '../api/ApiKeyApi'
import { AccessKey, accessKeyDeserialize, accessKeySerialize, IInstanceConfig, parseResource, parseResources, ResourceIdentifier } from '@jfvilas/kwirth-common'
import { ApiKey } from '@jfvilas/kwirth-common'
import * as crypto from 'crypto'
import { IChannel } from '../channels/IChannel'
import { Request, Response } from 'express'
import { AppsV1Api, BatchV1Api, CoreV1Api, V1Pod } from '@kubernetes/client-node'

export class AuthorizationManagement {
    
    public static cleanApiKeys = (apiKeys:ApiKey[]) => {
        if (!apiKeys) return []
        apiKeys = apiKeys.filter(a => a.expire >= Date.now())
        return apiKeys
    }    

    public static validBearerKey = (masterKey:string, accessKey:AccessKey): boolean => {
        let expire = accessKey.type.split(':')[1]
        let input = masterKey + '|' + accessKey.resources + '|' + expire
        var hash = crypto.createHash('md5').update(input).digest('hex')
        return hash === accessKey.id
    }
    
    public static validKey = async (req:Request,res:Response, apiKeyApi: ApiKeyApi): Promise<boolean> => {
        try {
            if (req.headers.authorization) {
                var receivedAccessKeyStr = req.headers.authorization.replaceAll('Bearer ','').trim()
                var receivedAccessKey = accessKeyDeserialize(receivedAccessKeyStr)
                let computedExpire = 0
                if (receivedAccessKey.type && receivedAccessKey.type.startsWith('bearer:')) {
                    if (!AuthorizationManagement.validBearerKey(apiKeyApi.masterKey, receivedAccessKey)) {
                        res.status(403).json({})
                        console.log('Hashes do not match validating key')
                        return false
                    }
                    else
                        computedExpire = +receivedAccessKey.type.split(':')[1]
                }
                else {
                    let key = apiKeyApi.apiKeys.find(apiKey => accessKeySerialize(apiKey.accessKey)===receivedAccessKeyStr)
                    if (!key) {
                        if (!apiKeyApi.isElectron) await apiKeyApi.refreshKeys()
                        key = apiKeyApi.apiKeys.find(apiKey => accessKeySerialize(apiKey.accessKey)===receivedAccessKeyStr)
                        if (!key) {
                            console.log('Inexistent key on validKey: '+receivedAccessKeyStr)
                            res.status(403).json({})
                            return false
                        }            
                    }
                    else {
                        computedExpire = key.expire
                    }
                }
                if (computedExpire>0) {
                    if (computedExpire>=Date.now())
                        return true
                    else
                        console.log('Expired key: '+receivedAccessKeyStr)
                }
            }
            else {
                console.log('No valid key present in headers')
            }
        }
        catch (err) {
            console.log('Error validating Key', err)
        }
        res.status(403).json({})
        return false
    }
    
    public static getKey = async (req:Request,res:Response, apiKeyApi: ApiKeyApi): Promise<AccessKey|undefined> => {
        if (req.headers.authorization) {
            var receivedAccessString = req.headers.authorization.replaceAll('Bearer ','').trim()
            var receivedAccessKey = accessKeyDeserialize(receivedAccessString)
            let computedExpire = 0
            if (receivedAccessKey.type && receivedAccessKey.type.startsWith('bearer:')) {
                if (!AuthorizationManagement.validBearerKey(apiKeyApi.masterKey, receivedAccessKey)) {
                    console.log('Hashes do not match getting key')
                    return undefined
                }
                else
                    computedExpire = +receivedAccessKey.type.split(':')[1]
            }
            else {
                var key = apiKeyApi.apiKeys.find(apiKey => accessKeySerialize(apiKey.accessKey)===receivedAccessString)
                if (!key) {
                    if (!apiKeyApi.isElectron) await apiKeyApi.refreshKeys()
                    key = apiKeyApi.apiKeys.find(apiKey => accessKeySerialize(apiKey.accessKey)===receivedAccessString)
                    if (!key) {
                        console.log('Inexistent key on getKey: '+receivedAccessString)
                        res.status(403).json({})
                        return undefined
                    }            
                }
                else {
                    computedExpire = key.expire
                }
            }
            if (computedExpire>0) {
                if (computedExpire<Date.now())
                    console.log('Expired key: '+receivedAccessString)
                else
                    return receivedAccessKey
            }
            res.status(403).json({})
            return undefined
        }
        else {
            console.log('No valid key present in headers')
            res.status(403).json({})
            return undefined
        }
    }
    
    public static getScopeLevel = (channels:Map<string, IChannel>, instanceConfigChannel:string, scopes:string, def:number): number => {
        let higherScope = -1
        if (channels.has(instanceConfigChannel)) {
            // we return the higher scope from all valid scopes
            for (let sc of scopes.split(',')) {
                let scLevel = channels.get(instanceConfigChannel)!.getChannelScopeLevel(sc)
                if (scLevel<0) console.log(`***************** Inexistent scope '${sc}' on channel '${instanceConfigChannel}' *****************`)
                if (scLevel>higherScope) higherScope = scLevel
            }
        }
        if (higherScope<0) higherScope = def
        return higherScope
    }

    public static checkResource = (resource:ResourceIdentifier, podNamespace:string, podName:string, containerName:string): boolean => {
       if (resource.namespaces !== '') {
            let x = AuthorizationManagement.getValidValues([podNamespace], resource.namespaces.split(','))
            if (x.length===0) return false
        }
        if (resource.groups !== '') {
            //+++
        }
        if (resource.pods !== '') {
            let x = AuthorizationManagement.getValidValues([podName], resource.pods.split(','))
            if (x.length===0) return false
        }
        if (resource.containers !== '') {
            let x = AuthorizationManagement.getValidValues([containerName], resource.containers.split(','))
            if (x.length===0) return false
        }
        return true
    }

    public static checkAkr = (channels:Map<string, IChannel>, instanceConfig:IInstanceConfig, podNamespace:string, podName:string, containerName:string): boolean => {
        let accessKeyResources = parseResources(accessKeyDeserialize(instanceConfig.accessKey).resources)
        let valid=false
        for (let akr of accessKeyResources) {
            let haveLevel = AuthorizationManagement.getScopeLevel(channels, instanceConfig.channel, akr.scopes, Number.MIN_VALUE)
            let requestedLevel = AuthorizationManagement.getScopeLevel(channels, instanceConfig.channel, instanceConfig.scope, Number.MAX_VALUE)
            if (haveLevel<requestedLevel) {
                console.log(`Insufficent level '${akr.scopes}' (${haveLevel}) < '${instanceConfig.scope}' (${requestedLevel}) for object`)
                continue
            }
            console.log(`Level is enough for object (${podNamespace}/${podName}/${containerName}): '${akr.scopes}'(${haveLevel}) >= '${instanceConfig.scope}' (${requestedLevel}),  let's check regexes...`)

            if (!this.checkResource(akr, podNamespace, podName, containerName)) continue

            valid = true
            console.log(`Found AKR: ${JSON.stringify(akr)}`)
            break
        }
        return valid
    }

    public static validAuth = (req:Request, res:Response, channels:Map<string, IChannel>, reqScope:string, instanceConfig: IInstanceConfig, namespace:string, controller:string, pod:string, container:string): boolean => {
        if (!req.headers.authorization) return false
        
        let key = req.headers.authorization.replaceAll('Bearer ','').trim()
        let accessKey = accessKeyDeserialize(key)
        let resId = parseResource(accessKey.resources)
    
        if (resId.scopes === 'cluster') return true
        
        let haveLevel = AuthorizationManagement.getScopeLevel(channels, instanceConfig.channel, resId.scopes, Number.MIN_VALUE)
        let requestedLevel = AuthorizationManagement.getScopeLevel(channels, instanceConfig.channel, instanceConfig.scope, Number.MAX_VALUE)
        if (haveLevel < requestedLevel) {
            console.log('Insufficient scope level')
            return false
        }
        if ((namespace !== '') && (namespace !== resId.namespaces)) {
            console.log('Insufficient namespace capabilities')
            return false
        }
        if ((controller !== '') && (controller !== resId.groups)) {
            console.log('Insufficient controller capabilities')
            return false
        }
        if ((pod !== '') && (pod !== resId.pods)) {
            console.log('Insufficient pod capabilities')
            return false
        }
        if ((container !== '') && (container !== resId.containers)) {
            console.log('Insufficient container capabilities')
            return false
        }
        console.log('Authorized!')
        return true
    }
    
    public static getValidValues = (values:string[], regexes:string[]): string[] => {
        let result:string[] = []
        try {
            for (let value of values) {
                if (regexes.some(r => new RegExp(r).test(value))) result.push(value)
            }
            return [...new Set(result)]
        }
        catch (err) {
            console.log('getValidValues error', err)
            return []
        }
    }

    public static getAllowedNamespaces = async (coreApi:CoreV1Api, accessKey:AccessKey): Promise<string[]> => {
        try {
            let resources = parseResources(accessKey.resources)
            let response = await coreApi.listNamespace()
            let clusterNamespaces = response.items.map (ns => ns!.metadata!.name!)
            let result:string[] = []

            for (let resid of resources) {
                result.push (...AuthorizationManagement.getValidValues(clusterNamespaces, resid.namespaces.split(',')))
            }
            return [...new Set(result)]
        }
        catch (err) {
            console.log('Cannot list namespaces', err)
            return []
        }
    }
    
    public static getValidNamespaces = async (coreApi: CoreV1Api, accessKey:AccessKey, requestedNamespaces:string[]): Promise<string[]> => {
        let result:string[] = []

        let allowedNamespaces = await this.getAllowedNamespaces(coreApi, accessKey)
        if (requestedNamespaces.length === 0 || (requestedNamespaces.length === 1 && requestedNamespaces[0]==='')) {
            result.push(...allowedNamespaces)
        }
        else {
            let x = this.getValidValues(allowedNamespaces, requestedNamespaces.map(ns => '^'+ns+'$'))
            result.push(...x)
        }
        result = [...new Set(result)]
        return result
    }
    
    public static getAllowedControllers = async (coreApi:CoreV1Api, appsApi:AppsV1Api, batchApi: BatchV1Api, namespace:string, accessKey:AccessKey): Promise<{[name:string]:any}[]> => {
        let result:{[name:string]:any}[] = []
        try {
            let resources = parseResources(accessKey!.resources)
        
            const [deployments, replicaSets, replicationControllers, daemonSets, statefulSets, jobs] = await Promise.all([
                appsApi.listDeploymentForAllNamespaces(),
                appsApi.listReplicaSetForAllNamespaces(),
                coreApi.listReplicationControllerForAllNamespaces(),
                appsApi.listDaemonSetForAllNamespaces(),
                appsApi.listStatefulSetForAllNamespaces(),
                batchApi.listJobForAllNamespaces()
            ])
            const allControllers = [
                ...deployments.items.map(i => ({ ...i, kind: 'Deployment' })),
                ...replicaSets.items.map(i => ({ ...i, kind: 'ReplicaSet' })),
                ...replicationControllers.items.map(i => ({ ...i, kind: 'ReplicationController' })),
                ...daemonSets.items.map(i => ({ ...i, kind: 'DaemonSet' })),
                ...statefulSets.items.map(i => ({ ...i, kind: 'StatefulSet' })),
                ...jobs.items.map(i => ({ ...i, kind: 'Job' }))
            ]
            for (let controllerType of ['Deployment','ReplicaSet','ReplicationController','DaemonSet','StatefulSet','Job']) {
                let controllerList:string[] = allControllers.filter((c:any) => c.metadata.namespace === namespace && c.kind===controllerType).map((c:any) => c.metadata.name) || []

                // we prune glist according to resources and namespaces
                for (let resource of resources) {
                    if (resource.groups !== '' && AuthorizationManagement.getValidValues([namespace], resource.namespaces.split(',')).length>0) {
                        let resControllers = resource.groups.split(',').filter(g => g.startsWith(controllerType+'+'))
                        if (resControllers.length!==0) {
                            let regexes = resControllers.map(g => g.split('+')[1])
                            controllerList = [ ...new Set(AuthorizationManagement.getValidValues(controllerList, regexes)) ]
                        }
                    }
                }
                result.push (...controllerList.map (controllerName => { return { name:controllerName, type:controllerType } }))
            }
        }
        catch (err) {
            console.log('Error obtaining allowed controllers')
            console.log(err)
        }
        return Array.from(new Map(result.map(item => [`${item.name}-${item.type}`, item])).values())
    }

    public static getValidControllers = async (coreApi: CoreV1Api, appsApi: AppsV1Api, batchApi:BatchV1Api, accessKey:AccessKey, namespaces:string[], requestedControllers:string[]): Promise<string[]> => {
        let result:string[] = []
        let allowedControllers:string[] =  []

        for (let ns of namespaces) {
            let x:{[name:string]:any}[] = await this.getAllowedControllers(coreApi, appsApi, batchApi, ns, accessKey)
            let y = x.map(g => g.type+'+'+g.name)
            allowedControllers.push(...y)
        }

        if (requestedControllers.length === 0 || (requestedControllers.length === 1 && requestedControllers[0]==='')) {
            result.push(...allowedControllers)
        }
        else {
            let x = this.getValidValues(allowedControllers, requestedControllers.map(g => '^'+g.replaceAll('+','\\+')+'$'))
            result.push(...x)
        }
        return [...new Set(result)]
    }
    
    static readReplicaSet = async (appsApi: AppsV1Api, namespace:string, name:string) => {
        try {
            let rs = (await appsApi.readNamespacedReplicaSet({name, namespace}))
            return rs
        }
        catch (err) {
            return undefined
        }
    }

    public static getPodLabelSelectorsFromController = async (coreApi:CoreV1Api, appsApi:AppsV1Api, batchApi: BatchV1Api, namespace:string, controllerTypeName:string): Promise<{pods:V1Pod[],labelSelector:string}> => {
        let response:any
        let controllerName, controllerType
        let emptyResult = { pods:[] as V1Pod[],labelSelector:'' };
        [controllerType, controllerName] = controllerTypeName.toLowerCase().split('+')
    
        try {
            switch (controllerType.toLocaleLowerCase()) {
                case 'deployment': {
                        let x = await appsApi.listNamespacedDeployment({namespace})
                        let names = x.items.map (d => d.metadata?.name)
                        if (!names.includes(controllerName)) return emptyResult
                        response = await appsApi.readNamespacedDeployment({ name: controllerName, namespace: namespace })
                    }
                    break
                case'replicaset': {
                        let x = await appsApi.listNamespacedReplicaSet({namespace})
                        let names = x.items.map (rs => rs.metadata?.name)
                        if (!names.includes(controllerName)) return emptyResult
                        response = await appsApi.readNamespacedReplicaSet({ name: controllerName, namespace: namespace })
                    }
                    break
                case'replicationcontroller': {
                        let x = (await coreApi.listNamespacedReplicationController({namespace}))
                        let names = x.items.map(rs => rs.metadata?.name)
                        if (!names.includes(controllerName)) return emptyResult
                        response = await coreApi.readNamespacedReplicationController({ name: controllerName, namespace: namespace })
                    }
                    break
                case'daemonset': {
                        let x = await appsApi.listNamespacedDaemonSet({namespace})
                        let names = x.items.map (ds => ds.metadata?.name)
                        if (!names.includes(controllerName)) return emptyResult
                        response = await appsApi.readNamespacedDaemonSet({ name: controllerName, namespace: namespace })
                    }
                    break
                case'statefulset': {
                        let x = await appsApi.listNamespacedStatefulSet({namespace})
                        let names = x.items.map (ss => ss.metadata?.name)
                        if (!names.includes(controllerName)) return emptyResult
                        response = await appsApi.readNamespacedStatefulSet({ name: controllerName, namespace: namespace })
                    }
                    break
                case'job': {
                        let x = await batchApi.listNamespacedJob({namespace})
                        let names = x.items.map (j => j.metadata?.name)
                        if (!names.includes(controllerName)) return emptyResult
                        response = await batchApi.readNamespacedJob({ name: controllerName, namespace: namespace })
                    }
                    break
            }    
        }
        catch (error) {
            console.log('Error reading namespaced group: ', error)
            return emptyResult
        }
    
        if (response) {
            const matchLabels = response.spec?.selector.matchLabels
            const labelSelector = Object.entries(matchLabels || {}).map(([key, value]) => `${key}=${value}`).join(',')
            const pods = (await coreApi.listNamespacedPod({namespace, labelSelector})).items
            return  { pods, labelSelector }
        }
        else {
            return { pods:[], labelSelector:'' }
        }
    }

    // gets controller name including (or not) deployment (aside form replica, daemon and stateful)
    static getPodControllerName = async (appsApi:AppsV1Api, pod:V1Pod, includeDeployment:boolean): Promise<string|undefined> => {
        if (!pod || !pod.metadata || !pod.metadata.namespace || !pod.metadata.ownerReferences) return
        let controller = pod.metadata.ownerReferences.find(or => or.controller)
        if (controller) {
            if (!includeDeployment || controller.kind !== 'ReplicaSet') return controller.name  // we return stateful, dameon & job

            let rs = await AuthorizationManagement.readReplicaSet(appsApi, pod.metadata.namespace, controller.name)
            if (rs?.metadata?.ownerReferences) {
                let rsController = rs.metadata?.ownerReferences.find(rsor => rsor.controller)
                if (rsController && rsController.kind === 'Deployment') return rsController.name
            }
            else {
                return controller.name
            }
        }
    }

    public static getAllowedClusterPods = async (coreApi: CoreV1Api, appsApi:AppsV1Api, accessKey:AccessKey): Promise<any[]> => {
        let pods:V1Pod[] = []
        let result:{namespace:string, name:string, controllerName:string, controllerType:string, containers:string[]}[]=[]
    
        let resources = parseResources(accessKey!.resources)
        let response = await coreApi.listPodForAllNamespaces()
        pods = response.items
    
        for (let pod of pods) {
            for (let resource of resources) {
                if (!pod.metadata?.name || !pod.metadata.namespace) continue

                if (AuthorizationManagement.getValidValues([pod.metadata.namespace], resource.namespaces.split(',')).length>0) {
                    let validPodNames = AuthorizationManagement.getValidValues([pod.metadata.name], resource.pods.split(','))
                    if (validPodNames.includes(pod.metadata.name)) {
                        result.push({
                            namespace: pod.metadata.namespace,
                            name: pod.metadata.name,
                            controllerName: pod.metadata.ownerReferences?.[0].name || '',
                            controllerType: pod.metadata.ownerReferences?.[0].kind || '',
                            containers: pod.spec?.containers.map(c => c.name) || []
                        })
                    }
                }
            }
        }
        return Array.from(new Map(result.map(item => [`${item.namespace}/${item.name}`, item])).values())
    }
    
    // public static getAllowedPods = async (coreApi: CoreV1Api, appsApi:AppsV1Api, namespace:string, controller:string, accessKey:AccessKey): Promise<string[]> => {
    //     let pods:V1Pod[] = []
    //     let result:string[]=[]
    
    //     let resources = parseResources(accessKey!.resources)
    //     let response = await coreApi.listNamespacedPod({namespace})
    //     pods = response.items
    
    //     for (let pod of pods) {
    //         for (let resource of resources) {
    //             if (!pod.metadata?.name || !pod.metadata.namespace) continue

    //             if (AuthorizationManagement.getValidValues([pod.metadata.namespace], resource.namespaces.split(',')).length>0) {
    //                 let validPodNames = AuthorizationManagement.getValidValues([pod.metadata.name], resource.pods.split(','))
    //                 if (validPodNames.includes(pod.metadata.name)) {
    //                     if (controller==='') {
    //                         result.push(pod.metadata.name)
    //                     }
    //                     else {
    //                         if (pod.metadata.ownerReferences) {
    //                             let controllerName = await this.getPodControllerName(appsApi, pod, true)
    //                             if (controllerName === controller || pod.metadata.name.startsWith(controller)) result.push(pod.metadata.name)
    //                         }
    //                         else {
    //                             if (validPodNames.includes(pod.metadata.name)) result.push(pod.metadata.name)
    //                         }
    //                     }
    //                 }
    //             }
    //         }
    //     }
    //     return [...new Set(result)]
    // }
    
    // public static getValidPods = async (coreApi: CoreV1Api, appsApi:AppsV1Api, namespaces:string[], accessKey:AccessKey, requestedPods:string[]): Promise<string[]> => {
    //     let result:string[]=[]
    //     let allowedPods = []

    //     for (let ns of namespaces) {
    //         allowedPods.push (...await this.getAllowedPods(coreApi, appsApi, ns, '', accessKey))
    //     }

    //     if (requestedPods.length === 0 || (requestedPods.length === 1 && requestedPods[0]==='')) {
    //         result.push(...allowedPods)
    //     }
    //     else {
    //         let x = this.getValidValues(allowedPods, requestedPods.map(pod => '^'+pod+'$'))
    //         result.push(...x)
    //     }
    //     return [...new Set(result)]
    // }

    public static getAllowedPods = async (coreApi: CoreV1Api, appsApi: AppsV1Api, namespace: string, controller: string, accessKey: AccessKey): Promise<string[]> => {
        const resources = parseResources(accessKey!.resources)
        const response = await coreApi.listNamespacedPod({ namespace })
        const pods = response.items;

        const podChecks = pods.map(async (pod) => {
            const podName = pod.metadata?.name
            const podNs = pod.metadata?.namespace
            if (!podName || !podNs) return null

            for (let resource of resources) {
                const nsMatch = AuthorizationManagement.getValidValues([podNs], resource.namespaces.split(',')).length > 0
                if (!nsMatch) continue

                const validPodNames = AuthorizationManagement.getValidValues([podName], resource.pods.split(','))
                if (validPodNames.includes(podName)) {
                    
                    if (controller === '') return podName

                    if (pod.metadata?.ownerReferences) {
                        const controllerName = await this.getPodControllerName(appsApi, pod, true)
                        if (controllerName === controller || podName.startsWith(controller)) return podName
                    }
                    else if (podName === controller) { 
                        return podName
                    }
                }
            }
            return null
        })

        const results = await Promise.all(podChecks)
        return [...new Set(results.filter((p): p is string => p !== null))]
    }

    public static getValidPods = async (coreApi: CoreV1Api, appsApi: AppsV1Api, namespaces: string[], accessKey: AccessKey, requestedPods: string[]): Promise<string[]> => {
        const promises = namespaces.map(ns => this.getAllowedPods(coreApi, appsApi, ns, '', accessKey))
        const resultsArray = await Promise.all(promises)
        
        let allowedPods = resultsArray.flat()

        let result: string[] = []
        if (requestedPods.length === 0 || (requestedPods.length === 1 && requestedPods[0] === '')) {
            result = allowedPods
        }
        else {
            result = this.getValidValues(allowedPods, requestedPods.map(pod => '^' + pod + '$'));
        }

        return [...new Set(result)]
    }

    // public static getAllowedContainers = async (coreApi:CoreV1Api, accessKey:AccessKey, namespace:string, pod:string): Promise<string[]> => {
    //     let result:string[] = []    
    //     let resources = parseResources(accessKey!.resources)

    //     try {
    //         let x = (await coreApi.readNamespacedPod({ name: pod, namespace: namespace }))
    //         if (!x.spec) return result
    
    //         for (let cont of x.spec.containers) {
    //             for (let resid of resources) {
    //                 // we check if the resource is applicable to the container we are evaluating (namespace and pod of the resource must match)
    //                 if (AuthorizationManagement.getValidValues([x.metadata!.namespace!], resid.namespaces.split(',')).length>0) {
    //                     if (AuthorizationManagement.getValidValues([x.metadata!.name!], resid.pods.split(',')).length>0) {
    //                         let xx = AuthorizationManagement.getValidValues([cont.name], resid.containers.split(','))
    //                         result.push(...xx)
    //                     }
    //                 }
    //             }
    //         }
    //         return [...new Set(result)]
    //     }
    //     catch (err) {
    //         //Error can be 404 (since caller may be asking of a pod that is not present in a concrete namespace) or other erros
    //         return []
    //     }
    // }

    // public static getValidContainers = async (coreApi:CoreV1Api, accessKey:AccessKey, namespaces:string[], pods:string[], requestedContainers:string[]): Promise<string[]> => {
    //     let result:string[] = []
    //     let allowedContainers = []

    //     for (let namespace of namespaces) {
    //         let pods = (await coreApi.listNamespacedPod({namespace})).items
    //         for (let pod of pods) {
    //             let x = await this.getAllowedContainers(coreApi, accessKey, namespace, pod.metadata?.name!)
    //             allowedContainers.push(...x.map(c => pod.metadata?.name+ '+' + c))
    //         }
    //     }

    //     if (requestedContainers.length === 0 || (requestedContainers.length === 1 && requestedContainers[0]==='')) {
    //         result.push(...allowedContainers)
    //     }
    //     else {
    //         let x = this.getValidValues(allowedContainers, requestedContainers.map(g => '^'+g.replaceAll('+','\\+')+'$'))
    //         result.push(...x)
    //     }
    //     return [...new Set(result)]
    // }

// 1. Nueva función de lógica pura (sin llamadas a API) para filtrar contenedores de un objeto Pod ya cargado

    public static filterAllowedContainersFromPod(pod: V1Pod, accessKey: AccessKey): string[] {
        const result: string[] = []
        const resources = parseResources(accessKey!.resources)
        const ns = pod.metadata?.namespace
        const podName = pod.metadata?.name

        if (!pod.spec?.containers || !ns || !podName) return []

        for (const cont of pod.spec.containers) {
            for (const resid of resources) {
                if (AuthorizationManagement.getValidValues([ns], resid.namespaces.split(',')).length > 0) {
                    if (AuthorizationManagement.getValidValues([podName], resid.pods.split(',')).length > 0) {
                        const matched = AuthorizationManagement.getValidValues([cont.name], resid.containers.split(','));
                        result.push(...matched);
                    }
                }
            }
        }
        return [...new Set(result)]
    }

    public static getAllowedContainers = async (coreApi: CoreV1Api, accessKey: AccessKey, namespace: string, podName: string): Promise<string[]> => {
        try {
            const pod = await coreApi.readNamespacedPod({ name: podName, namespace })
            return this.filterAllowedContainersFromPod(pod, accessKey)
        }
        catch (err) {
            return []
        }
    }

    public static getValidContainers = async (coreApi: CoreV1Api, accessKey: AccessKey, namespaces: string[], pods: string[], requestedContainers: string[]): Promise<string[]> => {
        const nsPromises = namespaces.map(ns => coreApi.listNamespacedPod({ namespace: ns }))
        const responses = await Promise.all(nsPromises)
        
        const allowedContainers: string[] = []

        for (const response of responses) {
            for (const pod of response.items) {
                const podName = pod.metadata?.name
                if (!podName) continue
                const containerNames = this.filterAllowedContainersFromPod(pod, accessKey)
                allowedContainers.push(...containerNames.map(c => `${podName}+${c}`))
            }
        }

        let result: string[] = []
        if (requestedContainers.length === 0 || (requestedContainers.length === 1 && requestedContainers[0] === '')) {
            result = allowedContainers
        }
        else {
            const regexes = requestedContainers.map(g => '^' + g.replaceAll('+', '\\+') + '$')
            result = this.getValidValues(allowedContainers, regexes)
        }
        return [...new Set(result)]
    }
}
