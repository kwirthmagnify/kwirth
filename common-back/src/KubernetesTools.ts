const jsYaml = require('js-yaml')
const k8s = require('@kubernetes/client-node')

async function applyResource(resource: any, clusterInfo: any): Promise<string> {
    try {
        if (resource.metadata?.managedFields) delete resource.metadata.managedFields
        await clusterInfo.objectsApi.patch(resource, undefined, undefined, 'kwirth', true, 'application/apply-patch+yaml')
        return `${resource.kind} '${resource.metadata?.name}' applied successfully.`
    } catch (err: any) {
        console.log('[KubernetesTools] Error applying:', err)
        return 'Error applying: ' + err
    }
}

export async function applyAllResources(yamlContent: string, clusterInfo: any): Promise<void> {
    try {
        const resources: any[] = []
        jsYaml.loadAll(yamlContent, (doc: any) => { if (doc) resources.push(doc) })
        for (const resource of resources) {
            try {
                const result = await applyResource(resource, clusterInfo)
                if (result !== '') console.log('[KubernetesTools]', result)
            } catch (err) {
                console.log('[KubernetesTools] Error applying resource:', err)
                break
            }
        }
    } catch (err) {
        console.log('[KubernetesTools] Error applying all resources:', err)
    }
}

export async function deleteAllResources(yamlContent: string, clusterInfo: any): Promise<void> {
    async function deleteResource(resource: any) {
        const kind = resource.kind
        const name = resource.metadata?.name
        const namespace = resource.metadata?.namespace
        try {
            switch (kind) {
                case 'Namespace':
                    await clusterInfo.coreApi.deleteNamespace({ name }); break
                case 'ConfigMap':
                    await clusterInfo.coreApi.deleteNamespacedConfigMap({ name, namespace }); break
                case 'Secret':
                    await clusterInfo.coreApi.deleteNamespacedSecret({ name, namespace }); break
                case 'CustomResourceDefinition':
                    await clusterInfo.extensionApi.deleteCustomResourceDefinition({ name }); break
                case 'Deployment':
                    await clusterInfo.appsApi.deleteNamespacedDeployment({ name, namespace }); break
                case 'Service':
                    await clusterInfo.coreApi.deleteNamespacedService({ name, namespace }); break
                case 'ClusterRole':
                    await clusterInfo.rbacApi.deleteClusterRole({ name }); break
                case 'ClusterRoleBinding':
                    await clusterInfo.rbacApi.deleteClusterRoleBinding({ name }); break
                case 'RoleBinding':
                    await clusterInfo.rbacApi.deleteNamespacedRoleBinding({ name, namespace }); break
                case 'ServiceAccount':
                    await clusterInfo.coreApi.deleteNamespacedServiceAccount({ name, namespace }); break
                default:
                    console.log(`[KubernetesTools] Resource kind '${kind}' not implemented for deletion.`)
                    return
            }
            console.log(`[KubernetesTools] ${kind} '${name}' removed.`)
        } catch (err) {
            console.log(`[KubernetesTools] Error removing ${kind} '${name}':`, err)
        }
    }

    try {
        const resources: any[] = []
        jsYaml.loadAll(yamlContent, (doc: any) => { if (doc) resources.push(doc) })
        for (const resource of resources) {
            try { await deleteResource(resource) } catch (err) {
                console.log('[KubernetesTools] Error deleting resource:', err)
                break
            }
        }
    } catch (err) {
        console.log('[KubernetesTools] Error deleting all resources:', err)
    }
}

async function getSelector(kind: string, namespace: string, name: string, clusterInfo: any): Promise<Record<string, string> | undefined> {
    try {
        switch (kind) {
            case 'Deployment':    return (await clusterInfo.appsApi.readNamespacedDeployment({ name, namespace })).spec?.selector?.matchLabels
            case 'ReplicaSet':    return (await clusterInfo.appsApi.readNamespacedReplicaSet({ name, namespace })).spec?.selector?.matchLabels
            case 'DaemonSet':     return (await clusterInfo.appsApi.readNamespacedDaemonSet({ name, namespace })).spec?.selector?.matchLabels
            case 'StatefulSet':   return (await clusterInfo.appsApi.readNamespacedStatefulSet({ name, namespace })).spec?.selector?.matchLabels
            case 'ReplicationController': return (await clusterInfo.coreApi.readNamespacedReplicationController({ name, namespace })).spec?.selector
            case 'Job':           return (await clusterInfo.batchApi.readNamespacedJob({ name, namespace })).spec?.selector?.matchLabels
        }
    } catch (err) {
        console.log('[KubernetesTools] Error getting selector:', err)
    }
    return undefined
}

export interface ICrdInformerHandlers {
    onAdd?: (obj: any) => void
    onUpdate?: (obj: any) => void
    onDelete?: (obj: any) => void
    onError?: (err: any) => void
}

export function createCrdInformer(clusterInfo: any, apiGroup: string, apiVersion: string, plural: string, handlers: ICrdInformerHandlers): any {
    const path = `/apis/${apiGroup}/${apiVersion}/${plural}`
    const listFunction = () =>
        clusterInfo.crdApi.listCustomObjectForAllNamespaces({ group: apiGroup, version: apiVersion, plural })
            .then((res: any) => res as { items: any[] })
    return createInformer(clusterInfo, path, listFunction, handlers)
}

/** Generic informer for ANY resource (core or group): the caller supplies the `watchPath` (e.g.
 *  '/api/v1/services', '/apis/networking.k8s.io/v1/ingresses') and the `listFn` that returns {items}.
 *  Reused by createCrdInformer and by consumers of core resources (exposure, for instance). */
export function createInformer(clusterInfo: any, watchPath: string, listFn: () => Promise<{ items: any[] }>, handlers: ICrdInformerHandlers): any {
    const informer = k8s.makeInformer(clusterInfo.kubeConfig, watchPath, listFn)
    if (handlers.onAdd)    informer.on('add',    handlers.onAdd)
    if (handlers.onUpdate) informer.on('update', handlers.onUpdate)
    if (handlers.onDelete) informer.on('delete', handlers.onDelete)
    if (handlers.onError)  informer.on('error',  handlers.onError)
    return informer
}

export interface IResourceWatcherOptions {
    /** Reconnections in a row before giving up (6 by default). A delivered object resets the count. */
    maxRetries?: number
    /** Wait before the first reconnection, doubled on each one after it (5000 ms by default). */
    initialWaitMs?: number
    /** How long the API server keeps each watch open before closing it (3600 s by default). */
    timeoutSeconds?: number
    log?: { info(message: unknown): void, error(message: unknown): void }
    /** Called once when the watcher gives up after maxRetries. */
    onGiveUp?: () => void
}

export interface IResourceWatcher {
    /** Stops the watcher for good: aborts the open request and does not reconnect. */
    stop(): void
    readonly stopped: boolean
}

/**
 * Watches ONE resource path ('/api/v1/pods', '/apis/apps/v1/deployments', '/api/v1/events'...) and calls
 * onEvent(type, obj) for every change from NOW on: ADDED, MODIFIED, DELETED.
 *
 * It is NOT an informer, on purpose: an informer lists first and emits an 'add' for every object that
 * already exists (and again on every resync), so a consumer that reacts to ADDED would see the whole
 * cluster arrive at once. This only delivers what changes.
 *
 * The watch reconnects when it ends — the API server closes it every so often, and the network can drop
 * it. A watch that ends after connecting reconnects at the initial wait; only FAILING TO CONNECT grows the
 * wait, and maxRetries failures in a row make it give up. Moved here from the core's
 * 'events' provider, so that provider (now an extension) and any other can watch without carrying its
 * own copy of @kubernetes/client-node: at runtime this function is the core's.
 */
export function createResourceWatcher(clusterInfo: any, watchPath: string, onEvent: (type: string, obj: any) => void, options: IResourceWatcherOptions = {}): IResourceWatcher {
    const maxRetries = options.maxRetries ?? 6
    const initialWait = options.initialWaitMs ?? 5000
    const timeoutSeconds = options.timeoutSeconds ?? 3600
    let retryCount = 0
    let currentWait = initialWait
    let stopped = false
    let controller: AbortController | undefined
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    const retry = (reason: string): void => {
        if (stopped) return
        if (retryCount < maxRetries) {
            retryCount++
            options.log?.info(`[${watchPath}] Watch ended (${reason}). Retry ${retryCount}/${maxRetries} in ${currentWait / 1000}s`)
            retryTimer = setTimeout(watchLoop, currentWait)
            currentWait *= 2
        }
        else {
            options.log?.error(`[${watchPath}] MAX RETRIES REACHED (${maxRetries}). Stopping watcher.`)
            stopped = true
            options.onGiveUp?.()
        }
    }

    const watchLoop = async (): Promise<void> => {
        if (stopped) return
        // this attempt's watch has already ended (done was called)
        let ended = false
        try {
            controller = await new k8s.Watch(clusterInfo.kubeConfig).watch(
                watchPath,
                { timeoutSeconds },
                (type: string, apiObj: any) => {
                    retryCount = 0
                    currentWait = initialWait
                    if (apiObj && apiObj.metadata) onEvent(type, apiObj)
                },
                (err: any) => {
                    ended = true
                    retry(err?.message || err?.Error || 'closed')
                }
            )
            /*
                Connected: the count starts again HERE, not when an event arrives. The API server closes every
                watch after a while (30-60 min, whatever timeoutSeconds says), and a quiet resource —
                configmaps, a CRD nobody touches — can go hours without an event. Counting those normal
                closes made such a watcher give up for ever after its sixth one. Only failing to connect,
                maxRetries times in a row, is a reason to give up.

                ⚠️ watch() does NOT throw when it fails to connect (a 500, a refused connection): it calls done
                with the error and returns all the same. So 'connected' is "returned with this attempt still
                open", never just "returned".
            */
            if (!ended) {
                retryCount = 0
                currentWait = initialWait
            }
            // stop() may have arrived while the request was being opened
            if (stopped) controller?.abort()
        }
        catch (err: any) {
            retry(err?.message ?? String(err))
        }
    }

    void watchLoop()
    return {
        stop: () => {
            stopped = true
            if (retryTimer) clearTimeout(retryTimer)
            try { controller?.abort() } catch { /* already closed */ }
        },
        get stopped() { return stopped }
    }
}

export async function restartController(kind: string, namespace: string, name: string, clusterInfo: any): Promise<void> {
    try {
        const labels = await getSelector(kind, namespace, name, clusterInfo)
        if (labels) {
            const labelSelector = Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(',')
            const pods = await clusterInfo.coreApi.listNamespacedPod({ namespace, labelSelector })
            for (const pod of pods.items) {
                if (pod.metadata?.name) {
                    await clusterInfo.coreApi.deleteNamespacedPod({ name: pod.metadata.name, namespace })
                    console.log(`[KubernetesTools] Pod ${pod.metadata.name} deleted.`)
                }
            }
        }
    } catch (err) {
        console.log('[KubernetesTools] Error restarting controller:', err)
    }
}
