import express, { Request, Response} from 'express'
import { ClusterInfo } from '../model/ClusterInfo'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'
import { ApiKeyApi } from './ApiKeyApi'
import { IClusterMetricsConfig } from '@kwirthmagnify/kwirth-common'
import { NodeMetrics } from '../model/INodeMetrics'

export class MetricsApi {
    public route = express.Router()
    clusterInfo:ClusterInfo

    constructor (clusterInfo:ClusterInfo, apiKeyApi: ApiKeyApi) {
        this.clusterInfo = clusterInfo

        this.route.route('/')
            .all( async (req:Request,res:Response, next) => {
                if (! (await AuthorizationManagement.validKey(req, res, apiKeyApi))) return
                next()
            })
            .get( async (req:Request, res:Response) => {
                try {
                    if (this.clusterInfo.metrics) {
                        let json = this.clusterInfo.metrics.getMetricsList()
                        res.status(200).json(json)
                    }
                    else {
                        res.status(200).json([])
                    }
                }
                catch (err) {
                    res.status(400).send()
                    console.log('Error obtaining available metrics list')
                    console.log(err)
                }
            })
        this.route.route('/usage/*')
            .all( async (req:Request,res:Response, next) => {
                if (! (await AuthorizationManagement.validKey(req, res, apiKeyApi))) return
                next()
            })
            .get( async (req:Request, res:Response) => {
                try {
                    switch (req.url) {
                        case '/usage/cluster':
                            this.sendUsageCluster(req,res)
                        break
                        // case '/usage/poddetail':
                        //     this.sendUsagePodDetail(req,res)
                        // break
                    }
                }
                catch (err) {
                    res.status(400).send()
                    console.log('Error obtaining available metrics list')
                    console.log(err)
                }
            })
        this.route.route('/debug/:action/:nodename')
            .all( async (req:Request,res:Response, next) => {
                next()
            })
            .get( async (req:Request, res:Response) => {
                try {
                    if (req.params.action==='node') {
                        var json:{ [key:string]:any } = {}
                        for(var key of this.clusterInfo.nodes.get(req.params.nodename)?.containerMetricValues.keys()!) {
                            var value = this.clusterInfo.nodes.get(req.params.nodename)?.containerMetricValues.get(key)
                            json[key]=value
                        }
                        for(var key of this.clusterInfo.nodes.get(req.params.nodename)?.machineMetricValues.keys()!) {
                            var value = this.clusterInfo.nodes.get(req.params.nodename)?.machineMetricValues.get(key)
                            json[key]=value
                        }
                        res.status(200).json(json)
                    }
                    if (req.params.action==='text') {
                        var node = this.clusterInfo.nodes.get(req.params.nodename)
                        var text = await this.clusterInfo.metrics.readCAdvisorMetrics(node!)
                        res.status(200).send(text)
                    }
                    if (req.params.action==='summary') {
                        var node = this.clusterInfo.nodes.get(req.params.nodename)
                        if (node) {
                            let nm = (await this.clusterInfo.metrics.readCAdvisorSummary(node)).node as NodeMetrics
                            res.status(200).send(JSON.stringify(nm))
                        }
                    }
                }
                catch (err) {
                    res.status(400).send()
                    console.log('Error debugging available metrics list')
                    console.log(err)
                }
            })

        this.route.route('/config')
            .all( async (req:Request,res:Response, next) => {
                if (! (await AuthorizationManagement.validKey(req, res, apiKeyApi))) return
                next()
            })
            .get( async (req:Request, res:Response) => {
                try {
                    res.status(200).json({ metricsInterval: clusterInfo.metricsInterval })
                }
                catch (err) {
                    res.status(400).send()
                    console.log('Error sending metrics settings')
                    console.log(err)
                }
            })
            .post( async (req:Request, res:Response) => {
                try {
                    let data:IClusterMetricsConfig = req.body
                    if (data.metricsInterval) {
                        clusterInfo.metricsInterval = data.metricsInterval
                        clusterInfo.stopMetricsInterval()
                        clusterInfo.startMetricsInterval(+data.metricsInterval) 
                        console.log(`New metrics cluster interval set to ${data.metricsInterval}`)
                    }
                    res.status(200).json()
                }
                catch (err) {
                    res.status(400).send()
                    console.log('Error updating metrics settings')
                    console.log(err)
                }
            })
    }

    sendUsageCluster = (req:Request, res:Response) => {
        res.status(200).send(this.clusterInfo.metrics.getClusterUsage())
    }

}
