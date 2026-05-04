import express, { Request, Response} from 'express'
import { AppsV1Api, V1DeploymentList, V1PodList } from '@kubernetes/client-node'
import { CoreV1Api } from '@kubernetes/client-node'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'
import { ApiKeyApi } from './ApiKeyApi'

export class ManageClusterApi {
    public route = express.Router()
    coreApi:CoreV1Api
    appsApi:AppsV1Api

    constructor (coreApi:CoreV1Api, appsApi:AppsV1Api, apiKeyApi: ApiKeyApi) {
        this.coreApi = coreApi
        this.appsApi = appsApi

        this.route.route('/find')
            .all( async (req:Request,res:Response, next) => {
                if (! (await AuthorizationManagement.validKey(req, res, apiKeyApi))) return
                next()
            })
            .get( async (req:Request, res:Response) => {
                try {
                    // object indicates what kind of object to search for: pod, deployment
                    let object:string=req.query.type? (req.query.type as string) : 'pod' // transitional
                    let namespace:string=req.query.namespace as string
                    let labelSelector = ''
                    // we can search for a specific label (label=value) or for a whole labelSelector (wich comes in the request)
                    if (req.query.label) {
                        let label:string=req.query.label as string
                        let labelValue:string=req.query.entity as string  // transitional
                        if (!labelValue) labelValue=req.query.value as string
                        if (label && labelValue) labelSelector=`${label}=${labelValue}`
                    }
                    else if (req.query.labelselector) {
                        labelSelector = req.query.labelselector as string
                    }
                    else {
                        console.log('No label selector')
                        res.status(500).send('"label" or "labelselector" must be specified')
                        return
                    }
                    // 'data' says what data to return to caller:
                    //      id --> just pod id (name+namespace)
                    //      containers --> containers list (adds a container names array)
                    //      all => all pod data
                    let data:string=req.query.data? (req.query.data as string) : 'id'  // transitional
                    switch(object) {
                        case 'pod':
                            let podListResp:V1PodList
                            if (namespace) 
                                podListResp = await this.coreApi.listNamespacedPod( { namespace, labelSelector })
                            else
                                podListResp = await this.coreApi.listPodForAllNamespaces( { labelSelector })
                            switch (data) {
                                case 'id':
                                    let podList = podListResp.items.map(pod => {
                                        return { namespace:pod.metadata?.namespace, name:pod.metadata?.name }
                                    })
                                    res.status(200).json(podList)
                                    break
                                case 'containers':
                                    let podListContainer = podListResp.items.map(pod => {
                                        return { namespace:pod.metadata?.namespace, name:pod.metadata?.name, containers: pod.spec?.containers.map( (c) => c.name) }
                                    })
                                    res.status(200).json(podListContainer)
                                    break
                                case 'all':
                                    res.status(200).json(podListResp.items)
                                    break   
                                default:
                                    console.log('Invalid data spec')
                                    res.status(500).json()
                                    break
                            }
                            break
                        case 'deployment':
                            var depListResp:V1DeploymentList
                            if (namespace) 
                                depListResp = await this.appsApi.listNamespacedDeployment({ namespace, labelSelector })
                            else
                                depListResp = await this.appsApi.listDeploymentForAllNamespaces({ labelSelector })
                            switch (data) {
                                case 'id':
                                    var depList=depListResp.items.map(deployment => {
                                        return { namespace:deployment.metadata?.namespace, name:deployment.metadata?.name }
                                    })
                                    res.status(200).json(depList)
                                    break
                                case 'all':
                                    res.status(200).json(depListResp.items)
                                    break   
                                default:
                                    console.log('Invalid data spec')
                                    res.status(500).json()
                                    break
                            }
                            break
                        default:
                            console.log('Invalid object')
                            res.status(500).json()
                            break
                        }
                }
                catch (err) {
                    res.status(500).json()
                    console.log(err)
                }
            })

    }
}
