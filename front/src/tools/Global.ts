import { KwirthData, ENotifyLevel, EClusterType } from '@kwirthmagnify/kwirth-common'
import { Cluster, IClusterInfo } from '../model/Cluster'
import { addGetAuthorization } from './AuthorizationManagement'
import { clusterBaseUrl, resolvedClusterUrl, routeAwaitsTicket, unresolvedRouteMessage } from './ClusterRouting'
import { MetricDefinition } from '@kwirthmagnify/kwirth-common-front'

export { ENotifyLevel }

/*
    Asks an installable provider for something over HTTP: 'metrics' ('' = the metric list, '/usage/cluster'
    = the cluster usage) or 'events' ('?limit=25' = the latest Kubernetes Events).

    Those providers are extensions, and their routes hang from their configRouter, which the core mounts
    behind the accessKey at /core/providerconfig/<id>. A cluster running a Kwirth from before that change
    still serves them at /provider/<id>, and the cluster list can mix both (federation), so a 404 on the new
    route makes it try the old one. Which one answered is remembered per cluster URL and provider, so the
    home page, which polls every few seconds, does not pay two requests every time.
*/
const providerBase: Map<string, string> = new Map()
export const fetchProvider = async (cluster: Cluster, providerId: string, subpath: string): Promise<Response> => {
    const base = clusterBaseUrl(cluster)
    const key = `${base}|${providerId}`
    const remembered = providerBase.get(key)
    if (remembered) return fetch(`${base}${remembered}${subpath}`, addGetAuthorization(cluster.accessString))
    const current = await fetch(`${base}/core/providerconfig/${providerId}${subpath}`, addGetAuthorization(cluster.accessString))
    if (current.status !== 404) {
        providerBase.set(key, `/core/providerconfig/${providerId}`)
        return current
    }
    const legacy = await fetch(`${base}/provider/${providerId}${subpath}`, addGetAuthorization(cluster.accessString))
    // a 404 on both means the provider is not installed there: nothing is remembered, so it is asked again next time
    if (legacy.status !== 404) providerBase.set(key, `/provider/${providerId}`)
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
        var response = await fetchProvider(cluster, 'metrics', '')
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
        // A proxied entry whose ticket has not come yet just waits: it is read when the ticket arrives (RouteTickets).
        if (routeAwaitsTicket(cluster)) return
        // A proxied entry nobody resolves stays disabled, and says why (instead of a bare network error).
        const base = resolvedClusterUrl(cluster)
        if (!base) {
            notify(undefined, ENotifyLevel.WARNING, unresolvedRouteMessage(cluster))
            return
        }
        let responseInfo = await fetch(`${base}/config/info`, addGetAuthorization(cluster.accessString))
        if (responseInfo.status===200) {
            cluster.kwirthData = await responseInfo.json() as KwirthData
            // accessString, name & url are set in clustersList, we don't overwrite them here
            /*
                cluster.home = false
                Disabled on purpose: this function must NOT touch 'home'. It was written (as 'source = false') when it
                only read the entries of the saved cluster list, which are never home, so the line did nothing. Later the
                pluginVersion effect in App.tsx started calling it on the SELECTED cluster to refresh its channels after a
                plugin loads, and the selected cluster is the home one (App.tsx selects it when the list arrives). From
                then on, any plugin load after the list wiped the flag: Manage clusters let the home be edited/deleted
                and saved it into the user's list, the Homepage lost its fallback, and every channel got 'home: false'
                for all clusters (Excubitor and Magnify lose their 'home' label; Agora works around it by name).
                'home' is set in ONE place only, loadSourceCluster in App.tsx; the list entries come without it.
            */
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
        let responseCluster = await fetch(`${base}/config/cluster`, addGetAuthorization(cluster.accessString))
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

