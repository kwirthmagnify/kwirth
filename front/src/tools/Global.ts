import { KwirthData, ENotifyLevel, EClusterType } from '@kwirthmagnify/kwirth-common'
import { Cluster, IClusterInfo } from '../model/Cluster'
import { addGetAuthorization } from './AuthorizationManagement'
import { clusterBaseUrl, resolvedClusterUrl, routeAwaitsTicket, unresolvedRouteMessage } from './ClusterRouting'
import { isLoginCluster } from './ClusterLogin'
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
    // Emptied first, also when there is nothing to read: whoever opens a metrics channel gets a Map, never stale data
    cluster.metricsList = new Map()
    if (cluster.kwirthData?.clusterType === EClusterType.NONE) return
    try {
        console.log(`Receiving metrics for cluster ${cluster.name}`)
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
    /*
        'enabled' = whether the cluster answered, decided at the END: an entry that is read again (the cluster
        selector re-checks the grey ones every time it opens) does not go grey while the answer is on its way.
    */
    let reachable = false
    try {
        // A proxied entry whose ticket has not come yet just waits: it is read when the ticket arrives (RouteTickets).
        if (routeAwaitsTicket(cluster)) return
        // A proxied entry nobody resolves stays disabled, and says why (instead of a bare network error).
        const base = resolvedClusterUrl(cluster)
        if (!base) {
            notify(undefined, ENotifyLevel.WARNING, unresolvedRouteMessage(cluster))
            return
        }
        // A LOGIN entry with no session has no key to read with: it waits for the user to sign in when using it
        if (isLoginCluster(cluster) && !cluster.accessString) return
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
            reachable = true
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
        /*
            🔴 Here, and not on /config/info, is where a LOGIN entry learns its session is gone: /config/info is
            PUBLIC —it answers 200 with no key at all— so a revoked or expired key still passed it. /config/cluster
            asks for the key and refuses it (403).
        */
        if (isLoginCluster(cluster) && (responseCluster.status === 401 || responseCluster.status === 403)) {
            cluster.loginExpired = true
            return
        }
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
    finally {
        cluster.enabled = reachable
    }
}

// How long a cluster that answered has to answer again before it goes grey
const RECHECK_TIMEOUT_MS = 5000
const rechecking: Set<Cluster> = new Set()

/*
    Whether a cluster of the list answers NOW. The cluster selector asks it of every entry each time it is
    opened: the answer at login was the only one there was, so an entry whose tunnel came up later stayed grey
    for the rest of the session (and one whose cluster went away stayed selectable).
      - a grey entry is read again in full (readClusterInfo), so its data is there when it turns usable;
      - an entry that answered is only asked for /config/info, and goes grey if it does not answer in time.
    Quiet: the user opening a list is not the moment to notify that a cluster is down (the grey says it).
    Returns whether 'enabled' changed. A check already on its way is not started twice.
*/
export const recheckCluster = async (cluster: Cluster): Promise<boolean> => {
    if (rechecking.has(cluster)) return false
    rechecking.add(cluster)
    const before = cluster.enabled
    const expiredBefore = cluster.loginExpired
    try {
        // a LOGIN entry with no session has nothing to check with: it waits to be signed in to
        if (isLoginCluster(cluster) && !cluster.accessString) return false
        if (!cluster.enabled) {
            await readClusterInfo(cluster, () => {})
        }
        else {
            const base = resolvedClusterUrl(cluster)
            let answers = false
            if (base) {
                try {
                    /*
                        A LOGIN entry is checked on /config/cluster, which asks for the key: /config/info is public and
                        would answer 200 to a session that is gone. Refused = expired or revoked (plans/cluster-login, D5).
                    */
                    const path = isLoginCluster(cluster) ? 'config/cluster' : 'config/info'
                    const response = await fetch(`${base}/${path}`, { ...addGetAuthorization(cluster.accessString), signal: AbortSignal.timeout(RECHECK_TIMEOUT_MS) })
                    answers = response.status === 200
                    if (isLoginCluster(cluster) && (response.status === 401 || response.status === 403)) cluster.loginExpired = true
                }
                catch {
                    answers = false
                }
            }
            cluster.enabled = answers
        }
    }
    finally {
        rechecking.delete(cluster)
    }
    return cluster.enabled !== before || cluster.loginExpired !== expiredBefore
}

