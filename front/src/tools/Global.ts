import { KwirthData } from '@kwirthmagnify/kwirth-common'
import { MetricDefinition } from '../channels/metrics/MetricDefinition'
import { Cluster, IClusterInfo } from '../model/Cluster'
import { addGetAuthorization } from './AuthorizationManagement'

export enum ENotifyLevel {
    INFO ='info',
    ERROR='error',
    WARNING='warning',
    SUCCESS='success'
}

export const getMetricsNames = async (cluster:Cluster) => {
    try {
        console.log(`Receiving metrics for cluster ${cluster.name}`)
        cluster.metricsList=new Map()
        var response = await fetch (`${cluster.url}/metrics`, addGetAuthorization(cluster.accessString))
        var json=await response.json() as MetricDefinition[]
        json.map( jsonMetric => cluster.metricsList.set(jsonMetric.metric, jsonMetric))
        console.log(`Metrics for cluster ${cluster.name} have been received (${Array.from(cluster.metricsList.keys()).length})`)
    }
    catch (err) {
        console.log(err)
        console.log('Error obtaining metrics list')
    }
}

export const readClusterInfo = async (cluster: Cluster, notify: (channel:string|undefined, level:ENotifyLevel, msg:string)=> void): Promise<void> => {
    try {
        cluster.enabled = false
        let responseInfo = await fetch(`${cluster.url}/config/info`, addGetAuthorization(cluster.accessString))
        if (responseInfo.status===200) {
            cluster.kwirthData = await responseInfo.json() as KwirthData
            // accessString, name & url are set in clustersList, we don't overwrite them here
            cluster.source = false
            cluster.enabled = true
            if (cluster.kwirthData) {
                let metricsRequired = Array.from(cluster.kwirthData.channels).reduce( (prev, current) => { return prev || current.metrics}, false)
                if (metricsRequired) getMetricsNames(cluster)
            }               
        }
        else {
            console.log('Get config info status code:', responseInfo.status)
            return
        }
        let responseCluster = await fetch(`${cluster.url}/config/cluster`, addGetAuthorization(cluster.accessString))
        if (responseCluster.status===200) {
            cluster.clusterInfo = await responseCluster.json() as IClusterInfo
        }
        else {
            console.log('Get cluster info status code:', responseInfo.status)
            return
        }
    }
    catch (error) {
        console.log(error)
        console.log(`Cluster ${cluster.name} not enabled`)
        notify(undefined, ENotifyLevel.WARNING, `Cluster ${cluster.name} not enabled. `+error)
    }
}

