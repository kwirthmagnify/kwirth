import express, { Request, Response} from 'express'
import { ApiKeyApi } from './ApiKeyApi'
import { ClusterInfo } from '../model/ClusterInfo'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'
import { EClusterType, KwirthData } from '@kwirthmagnify/kwirth-common'
import Docker from 'dockerode'

export class ConfigApi {
    public route = express.Router()
    dockerApi : Docker
    kwirthData: KwirthData
    clusterInfo: ClusterInfo
    apiKeyApi: ApiKeyApi

    constructor (aka: ApiKeyApi, kwirthData:KwirthData, clusterInfo:ClusterInfo) {
        this.kwirthData = kwirthData
        this.clusterInfo = clusterInfo
        this.apiKeyApi = aka
        this.dockerApi = new Docker()

        // return kwirth version information
        this.route.route('/info')
            .get( async (req:Request, res:Response) => {
                try {
                    res.status(200).json(this.kwirthData)
                }
                catch (err) {
                    res.status(500).json({})
                    console.log(err)
                }
            })
            
        // return kwirth and cluster version information
        this.route.route('/cluster')
            .all( async (req:Request,res:Response, next) => {
                if (! (await AuthorizationManagement.validKey(req,res, this.apiKeyApi))) return
                next()
            })
            .get( async (req:Request, res:Response) => {
                try {
                    const versionInfo = await this.clusterInfo.versionApi.getCode()
                    const currentCluster = this.clusterInfo.kubeConfig.getCurrentCluster()

                    const nodes = await this.clusterInfo.coreApi.listNode()
                    const nodeNames = nodes.items.map((node:any) => node.metadata.name)
                    res.status(200).json({
                        name: this.clusterInfo.name,
                        type: this.clusterInfo.type,
                        flavour: this.clusterInfo.flavour,
                        memory: this.clusterInfo.memory,
                        vcpu: this.clusterInfo.vcpus,
                        reportedName: clusterInfo?.name,
                        reportedServer: currentCluster?.server,
                        version: versionInfo.major + '.' + versionInfo.minor,
                        platform: versionInfo.platform,
                        nodes: nodeNames
                    })
                }
                catch (err) {
                    res.status(500).json({})
                    console.log(err)
                }
            })
            
        // get all namespaces
        this.route.route('/namespace')
            .all( async (req:Request,res:Response, next) => {
                if (! (await AuthorizationManagement.validKey(req,res, this.apiKeyApi))) return
                next()
            })
            .get( async (req:Request, res:Response) => {
                try {
                    if (this.kwirthData.clusterType === EClusterType.DOCKER) {
                        res.status(200).json(['$docker'])
                    }
                    else {
                        try {
                            let accessKey = await AuthorizationManagement.getKey(req,res, this.apiKeyApi)
                            if (accessKey) {
                                let list = await AuthorizationManagement.getAllowedNamespaces(this.clusterInfo.coreApi, accessKey)
                                res.status(200).json(list)
                            }
                            else {
                                res.status(403).json([])
                                return
                            }
                        }
                        catch (err) {
                            res.status(500).json([])
                            console.log(err)
                        }
                    }
                }
                catch (err) {
                    console.log('Error obtaining namespaces', err)
                    res.status(500).json([])
                }
            })

        // get all namespaces
        this.route.route('/pod')
            .all( async (req:Request,res:Response, next) => {
                if (! (await AuthorizationManagement.validKey(req,res, this.apiKeyApi))) return
                next()
            })
            .get( async (req:Request, res:Response) => {
                try {
                    if (this.kwirthData.clusterType === EClusterType.DOCKER) {
                        res.status(200).json(['$docker'])
                    }
                    else {
                        try {
                            let accessKey = await AuthorizationManagement.getKey(req,res, this.apiKeyApi)
                            if (accessKey) {
                                let list = await AuthorizationManagement.getAllowedClusterPods(this.clusterInfo.coreApi, this.clusterInfo.appsApi, accessKey)
                                res.status(200).json(list)
                            }
                            else {
                                res.status(403).json([])
                                return
                            }
                        }
                        catch (err) {
                            res.status(500).json([])
                            console.log(err)
                        }
                    }
                }
                catch (err) {
                    console.log('Error obtaining namespaces', err)
                    res.status(500).json([])
                }
            })

        // get all deployments in a namespace
        this.route.route(['/:namespace/groups', '/:namespace/controllers'])
            .all( async (req:Request, res:Response, next) => {
                if (! (await AuthorizationManagement.validKey(req,res, this.apiKeyApi))) return
                next()
            })
            .get( async (req:Request, res:Response) => {
                try {
                    let accessKey = await AuthorizationManagement.getKey(req,res, this.apiKeyApi)
                    if (accessKey) {
                        let result = await AuthorizationManagement.getAllowedControllers(this.clusterInfo.coreApi, this.clusterInfo.appsApi, this.clusterInfo.batchApi, req.params.namespace, accessKey)
                        res.status(200).json(result)
                    }
                    else {
                        res.status(403).json([])
                        return
                    }
                }
                catch (err) {
                    res.status(500).json([])
                    console.log(err)
                }
            })

        // get all pods in a namespace in a controller
        this.route.route('/:namespace/:controller/pods')
            .all( async (req:Request,res:Response, next) => {
                if (! (await AuthorizationManagement.validKey(req,res, this.apiKeyApi))) return
                next()
            })
            .get( async (req:Request, res:Response) => {
                try {
                    let result:string[]=[]

                    if (this.kwirthData.clusterType === EClusterType.DOCKER) {
                        result = await this.clusterInfo.dockerTools.getAllPodNames()
                    }
                    else {
                        let accessKey = await AuthorizationManagement.getKey(req,res, this.apiKeyApi)
                        if (accessKey) {
                            result = await AuthorizationManagement.getAllowedPods(this.clusterInfo.coreApi, this.clusterInfo.appsApi, req.params.namespace, req.params.controller, accessKey)
                        }
                        else {
                            res.status(403).json([])
                            return
                        }
                    }
                    result = [...new Set(result)]
                    res.status(200).json(result)
                }
                catch (err) {
                    res.status(500).json([])
                    console.log(err)
                }
            })

        // returns an array containing all the containers running inside a pod
        this.route.route('/:namespace/:pod/containers')
            .all( async (req:Request,res:Response, next) => {
                if (! (await AuthorizationManagement.validKey(req,res, this.apiKeyApi))) return
                next()
            })
            .get( async (req:Request, res:Response) => {
                try {
                if (this.kwirthData.clusterType === EClusterType.DOCKER) {
                    let names = await this.clusterInfo.dockerTools.getContainers(req.params.pod)
                    res.status(200).json(names)
                }
                else {
                    try {
                        let accessKey = await AuthorizationManagement.getKey(req, res, this.apiKeyApi)
                        if (accessKey) {
                            let result = await AuthorizationManagement.getAllowedContainers(this.clusterInfo.coreApi, accessKey, req.params.namespace, req.params.pod)
                            res.status(200).json(result)
                        }
                        else {
                            res.status(403).json([])
                            return
                        }
                    }
                    catch (err) {
                        res.status(500).json([])
                        console.log(err)
                    }
                }
                }
                catch (err) {
                    console.log('Error obtaining pod containers')
                    res.status(500).json([])
                }
            })
    }

    setDockerApi = (dockerApi:Docker) => {
        this.dockerApi = dockerApi
    }
    
}
