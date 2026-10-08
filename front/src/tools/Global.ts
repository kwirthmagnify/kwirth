import { KwirthData, ENotifyLevel, EClusterType } from '@kwirthmagnify/kwirth-common'
import { Cluster, IClusterInfo } from '../model/Cluster'
import { addGetAuthorization } from './AuthorizationManagement'
import { MetricDefinition } from '../channels/metrics/MetricsTypes'

export { ENotifyLevel }

//+++ review and move to metrics channel
export const getMetricsNames = async (cluster:Cluster) => {
    // Without a cluster there is no metrics provider: Kwirth on ECS (or anywhere outside Kubernetes) never
    // registers it, so this call can only 404. The guard lives HERE and not at the two call sites, because
    // a third one would have to remember, and "there are metrics channels installed" is not the same
    // question as "is there anything to take metrics from".
    if (cluster.kwirthData?.clusterType === EClusterType.NONE) return
    try {
        console.log(`Receiving metrics for cluster ${cluster.name}`)
        cluster.metricsList=new Map()
        var response = await fetch (`${cluster.url}/provider/metrics`, addGetAuthorization(cluster.accessString))
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
            cluster.home = false
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
            cluster.id = cluster.clusterInfo.id
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

