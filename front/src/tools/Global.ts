import { KwirthData, ENotifyLevel, EClusterType } from '@kwirthmagnify/kwirth-common'
import { Cluster, IClusterInfo } from '../model/Cluster'
import { addGetAuthorization } from './AuthorizationManagement'
import { MetricDefinition } from '@kwirthmagnify/kwirth-common-front'

export { ENotifyLevel }

/*
    Asks the 'metrics' provider for something ('' = the metric list, '/usage/cluster' = the cluster usage).

    The provider is an installable extension, and its routes hang from its configRouter, which the core
    mounts behind the accessKey at /core/providerconfig/metrics. A cluster running a Kwirth from before
    that change still serves them at /provider/metrics, and the cluster list can mix both (federation),
    so a 404 on the new route makes it try the old one. Which one answered is remembered per cluster URL,
    so the home page, which polls every few seconds, does not pay two requests every time.
*/
const metricsProviderBase: Map<string, string> = new Map()
export const fetchMetricsProvider = async (cluster: Cluster, subpath: string): Promise<Response> => {
    const remembered = metricsProviderBase.get(cluster.url)
    if (remembered) return fetch(`${cluster.url}${remembered}${subpath}`, addGetAuthorization(cluster.accessString))
    const current = await fetch(`${cluster.url}/core/providerconfig/metrics${subpath}`, addGetAuthorization(cluster.accessString))
    if (current.status !== 404) {
        metricsProviderBase.set(cluster.url, '/core/providerconfig/metrics')
        return current
    }
    const legacy = await fetch(`${cluster.url}/provider/metrics${subpath}`, addGetAuthorization(cluster.accessString))
    // a 404 on both means the provider is not installed there: nothing is remembered, so it is asked again next time
    if (legacy.status !== 404) metricsProviderBase.set(cluster.url, '/provider/metrics')
    return legacy
}

//+++ review and move to metrics channel
export const getMetricsNames = async (cluster:Cluster) => {
    // Without a cluster there is no metrics provider: on Kwirth on ECS (or anywhere outside Kubernetes) it
    // does not start even if installed, so this call can only 404. The guard lives HERE and not at the two call sites, because
    // a third one would have to remember, and "there are metrics channels installed" is not the same
    // question as "is there anything to take metrics from".
    if (cluster.kwirthData?.clusterType === EClusterType.NONE) return
    try {
        console.log(`Receiving metrics for cluster ${cluster.name}`)
        cluster.metricsList=new Map()
        var response = await fetchMetricsProvider(cluster, '')
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

