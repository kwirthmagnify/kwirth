// Types only: client-node 1.x is an ES module and this package is CommonJS, so its types are read in 'import' mode.
import type { AppsV1Api, BatchV1Api, CoreV1Api, NetworkingV1Api, V1Eviction, V1Job, V1Pod } from '@kubernetes/client-node' with { 'resolution-mode': 'import' }
import { randomUUID } from 'crypto'
const jsYaml = require('js-yaml')
const k8s = require('@kubernetes/client-node')

/*
    Where this module writes.

    It used to write with `console.log`, which means it bypassed kwirth's logging entirely: no
    timestamp, no component, no level — and, above all, **impossible to filter or silence**, because the
    filter works by component and these lines carried none. Lines like
    `[KubernetesTools] ConfigMap 'trivy-operator' removed.` turned up raw in the middle of a formatted
    log.

    Every signature here is public and used by plugins, so passing a logger down twenty functions would
    be a breaking change for every consumer. Instead the module holds ONE logger that the core installs
    at startup through `setKubernetesToolsLogger()`. It reaches the plugins too: they do not bundle
    common-back, they resolve it from the core's global, so there is a single module instance and a
    single logger for everybody.

    The default stays `console` on purpose: nobody is obliged to install one, and a consumer that never
    calls the setter keeps the old behaviour instead of going silent.
*/
// Variadic because many call sites here log a message and a value together ('Error applying:', err).
// The installer joins them; that way converting the call sites was not an exercise in rewriting forty
// lines by hand, which is where mistakes get made.
export interface IKubernetesToolsLogger {
    info(...args: unknown[]): void
    error(...args: unknown[]): void
}

let log: IKubernetesToolsLogger = {
    info: (...args: unknown[]) => console.log('[KubernetesTools]', ...args),
    error: (...args: unknown[]) => console.error('[KubernetesTools]', ...args)
}

/** Installed once by the core; the id it logs under is the core's to choose. */
export const setKubernetesToolsLogger = (logger: IKubernetesToolsLogger): void => { log = logger }

export async function applyResource(resource: any, clusterInfo: any): Promise<string> {
    try {
        if (resource.metadata?.managedFields) delete resource.metadata.managedFields
        await clusterInfo.objectsApi.patch(resource, undefined, undefined, 'kwirth', true, 'application/apply-patch+yaml')
        return `${resource.kind} '${resource.metadata?.name}' applied successfully.`
    } catch (err: any) {
        log.error('Error applying:', err)
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
                if (result !== '') log.info(result)
            } catch (err) {
                log.error('Error applying resource:', err)
                break
            }
        }
    } catch (err) {
        log.error('Error applying all resources:', err)
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
                    log.info(`Resource kind '${kind}' not implemented for deletion.`)
                    return
            }
            log.info(`${kind} '${name}' removed.`)
        } catch (err) {
            log.error(`Error removing ${kind} '${name}':`, err)
        }
    }

    try {
        const resources: any[] = []
        jsYaml.loadAll(yamlContent, (doc: any) => { if (doc) resources.push(doc) })
        for (const resource of resources) {
            try { await deleteResource(resource) } catch (err) {
                log.error('Error deleting resource:', err)
                break
            }
        }
    } catch (err) {
        log.error('Error deleting all resources:', err)
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
        log.error('Error getting selector:', err)
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
                    log.info(`Pod ${pod.metadata.name} deleted.`)
                }
            }
        }
    } catch (err) {
        log.error('Error restarting controller:', err)
    }
}

/*
    The cluster operations Magnify runs on demand (scale, cordon, drain, evict, a shell or a work pod on a
    node, cron jobs, the default IngressClass, purging an image from every node). They lived in the core,
    where Magnify was the only one using them; here any extension can, and at runtime they are the core's
    copy (global.__kwirth_back__), so a plugin does not bundle @kubernetes/client-node to get them.
    Moved as they were: each keeps its signature, and its errors are logged and swallowed, not thrown.
*/

export async function scaleController(kind: string, namespace: string, name: string, replicas: number, clusterInfo: any): Promise<void> {
    try {
        const patch = [
            {
                op: 'replace',
                path: '/spec/replicas',
                value: replicas
            }
        ]
        switch (kind) {
            case 'Deployment':
                await clusterInfo.appsApi.patchNamespacedDeployment({ name, namespace, body: patch })
                break
            case 'StatefulSet':
                await clusterInfo.appsApi.patchNamespacedStatefulSet({ name, namespace, body: patch })
                break
            case 'ReplicaSet':
                await clusterInfo.appsApi.patchNamespacedReplicaSet({ name, namespace, body: patch })
                break
            case 'ReplicationController':
                await clusterInfo.coreApi.patchNamespacedReplicationController({ name, namespace, body: patch })
                break
            default:
                break
        }
        log.info(`${kind} ${name} scaled to ${replicas}`)
    }
    catch (err) {
        log.error('Error scaling:', err)
    }
}

async function nodeSetSchedulable(coreApi: CoreV1Api, nodeName: string, unschedulable: boolean): Promise<void> {
    try {
        const patch = [
            {
                op: 'replace',
                path: '/spec/unschedulable',
                value: unschedulable
            }
        ]
        await coreApi.patchNode({ name: nodeName, body: patch })
        log.info(`Node ${nodeName}: unschedulable = ${unschedulable}`)
    }
    catch (err: any) {
        log.error(`Error in patchNode: ${err.body?.message || err.message}`)
    }
}

// A privileged pod on the node, with the host's filesystem and its CRI socket mounted: a shell on the node.
export async function nodeShell(coreApi: CoreV1Api, nodeName: string, podNamespace: string, podName: string): Promise<void> {
    try {
        const podDefinition: V1Pod = {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
                name: podName,
                namespace: podNamespace
            },
            spec: {
                containers: [
                    {
                        name: 'debugger',
                        image: 'alpine',
                        command: ['/bin/sh', '-c'],
                        args: [
                            'if [ -S "/host-run/k3s/containerd/containerd.sock" ]; then\n    S="/host-run/k3s/containerd/containerd.sock"\nelif [ -S "/host-run/containerd/containerd.sock" ]; then\n    S="/host-run/containerd/containerd.sock"\nelif [ -S "/host-run/crio/crio.sock" ]; then\n    S="/host-run/crio/crio.sock"\nelif [ -S "/host-var-run/containerd/containerd.sock" ]; then\n    S="/host-var-run/containerd/containerd.sock"\nfi\nif [ -n "$S" ]; then\n    export CONTAINER_RUNTIME_ENDPOINT="unix://$S"\n    export IMAGE_SERVICE_ENDPOINT="unix://$S"\n    echo "Socket detected in $S."\nelse\n    echo "ERROR: CRI runtime socket not found."\nfi\nsleep 3600\n'
                        ],
                        securityContext: {
                            privileged: true
                        },
                        volumeMounts: [
                            { name: 'host-root', mountPath: '/host' },
                            { name: 'run-host', mountPath: '/host-run' },
                            { name: 'var-run-host', mountPath: '/host-var-run' },
                            { name: 'usr-bin', mountPath: '/host-usr-bin' }
                        ]
                    }
                ],
                nodeName: nodeName,
                hostNetwork: true,
                hostPID: true,
                hostIPC: true,
                volumes: [
                    { name: 'host-root', hostPath: { path: '/' } },
                    { name: 'run-host', hostPath: { path: '/run' } },
                    { name: 'var-run-host', hostPath: { path: '/var/run' } },
                    { name: 'usr-bin', hostPath: { path: '/usr/bin' } }
                ]
            }
        }
        await coreApi.createNamespacedPod({ namespace: podNamespace, body: podDefinition })
    }
    catch (err) {
        log.error('Error creating the node shell pod:', err)
    }
}

export async function nodeCordon(coreApi: CoreV1Api, nodeName: string): Promise<void> {
    try {
        await nodeSetSchedulable(coreApi, nodeName, true)
    }
    catch (err) {
        log.error('Error in cordon:', err)
    }
}

export async function nodeUnCordon(coreApi: CoreV1Api, nodeName: string): Promise<void> {
    try {
        await nodeSetSchedulable(coreApi, nodeName, false)
    }
    catch (err) {
        log.error('Error in uncordon:', err)
    }
}

// Cordons the node and evicts its pods, except DaemonSet and static ones.
export async function nodeDrain(coreApi: CoreV1Api, nodeName: string): Promise<void> {
    try {
        await nodeSetSchedulable(coreApi, nodeName, true)
        const result = await coreApi.listPodForAllNamespaces({ fieldSelector: `spec.nodeName=${nodeName}` })
        const evictions = result.items.map(async (pod) => {
            const name = pod.metadata?.name
            const namespace = pod.metadata?.namespace
            if (!name || !namespace) return
            const isDaemonSet = pod.metadata?.ownerReferences?.some(ref => ref.kind === 'DaemonSet')
            const isStaticPod = pod.metadata?.annotations?.['kubernetes.io/config.mirror']
            if (isDaemonSet || isStaticPod) {
                log.info(`Omit system pod: ${name}`)
                return
            }
            await podEvict(coreApi, namespace, name)
        })
        await Promise.all(evictions)
        log.info(`Drain completed for node ${nodeName}`)
    }
    catch (err: any) {
        log.error(`Error draining node ${nodeName}: ${err.message}`)
    }
}

/*
    Runs 'invoke', waiting what the API server says on a 429 (Retry-After) and trying again. Any other error
    is logged and answered with false.
*/
export async function throttleExcute(id: string, invoke: () => Promise<unknown>): Promise<boolean> {
    let repeat = true
    let retry = 3
    while (repeat) {
        repeat = false
        try {
            await invoke()
            return true
        }
        catch (err: any) {
            log.error('Throttling error on', id)
            if (err.code === 429) {
                repeat = true
                await new Promise((resolve) => { setTimeout(resolve, (+err.headers['retry-after'] || 1) * 1000) })
            }
            else {
                retry--
                log.error('Error when throttling', id, err)
                if (retry > 0) await new Promise((resolve) => { setTimeout(resolve, 3000) })
                return false
            }
        }
    }
    log.error('Unexpected error when throttling', id)
    return false
}

// Runs a CronJob now: a Job from its jobTemplate, named '<cronjob>-manual-<epoch seconds>'.
export async function cronJobTrigger(namespace: string, cronJobName: string, batchApi: BatchV1Api): Promise<void> {
    try {
        const cronJob = await batchApi.readNamespacedCronJob({ name: cronJobName, namespace })
        if (!cronJob.spec?.jobTemplate) throw new Error('The CronJob has no jobTemplate.')
        const manualJobName = `${cronJobName}-manual-${Math.floor(Date.now() / 1000)}`
        const jobManifest: V1Job = {
            metadata: {
                name: manualJobName,
                labels: { 'triggered-by': 'node-client' }
            },
            spec: cronJob.spec.jobTemplate.spec
        }
        await batchApi.createNamespacedJob({ namespace, body: jobManifest })
        log.info(`Manual Job created: ${manualJobName}`)
    }
    catch (err: any) {
        log.error('Error launching CronJob:', err.response?.body?.message || err.message)
    }
}

// Suspends (true) or resumes (false) a CronJob.
export async function cronJobStatus(namespace: string, cronJobName: string, suspend: boolean, batchApi: BatchV1Api): Promise<void> {
    try {
        const patch = [
            {
                op: 'replace',
                path: '/spec/suspend',
                value: suspend
            }
        ]
        await batchApi.patchNamespacedCronJob({ name: cronJobName, namespace, body: patch })
        log.info(`CronJob "${cronJobName}" ${suspend ? 'suspended' : 'activated'}.`)
    }
    catch (err: any) {
        log.error('Error patching CronJob:', err.response?.body?.message || err.message)
    }
}

export async function podEvict(coreApi: CoreV1Api, namespace: string, name: string): Promise<void> {
    const body: V1Eviction = {
        apiVersion: 'policy/v1',
        kind: 'Eviction',
        metadata: { name, namespace }
    }
    try {
        await coreApi.createNamespacedPodEviction({ name, namespace, body })
        log.info(`Eviction successful for ${name}`)
    }
    catch (err: any) {
        log.error('Error evicting:', err.response?.body?.message || err.message)
    }
}

/*
    A work pod in 'default' ('ubuntu', 'alpine', 'dnsutils', 'jubuntu'), waited for until it is Running.
    Answers its name, or undefined for an unknown kind of work or a failure.
*/
export async function podWork(coreApi: CoreV1Api, work: string): Promise<string | undefined> {
    const podDefinition: V1Pod = {
        metadata: {
            name: 'kwirth-ubuntu-pod'
        },
        spec: {
            containers: [
                {
                    name: 'kwirth-container',
                    image: 'ubuntu:latest',
                    command: ['sleep', 'infinity'],
                    imagePullPolicy: 'Always'
                }
            ]
        }
    }
    switch (work) {
        case 'ubuntu':
            break
        case 'alpine':
            podDefinition.metadata!.name = 'kwirth-alpine-pod'
            podDefinition.spec!.containers[0].image = 'alpine:latest'
            break
        case 'dnsutils':
            podDefinition.metadata!.name = 'kwirth-dnsutils-pod'
            podDefinition.spec!.containers[0].image = 'tutum/dnsutils'
            break
        case 'jubuntu':
            podDefinition.metadata!.name = 'kwirth-jubuntu-pod'
            podDefinition.spec!.containers[0].image = 'jfvilasoutlook/jubuntu'
            break
        default:
            return undefined
    }
    try {
        await coreApi.createNamespacedPod({ namespace: 'default', body: podDefinition })
        let isRunning = false
        while (!isRunning) {
            try {
                const res = await coreApi.readNamespacedPodStatus({ name: podDefinition.metadata!.name!, namespace: 'default' })
                if (res.status?.phase === 'Running') {
                    isRunning = true
                    break
                }
            }
            catch {
                log.info('Waiting for pod...')
            }
            await new Promise(resolve => setTimeout(resolve, 2000))
        }
        return podDefinition.metadata!.name
    }
    catch (err: any) {
        log.error('Error creating the work pod:', err.response?.body?.message || err.message)
    }
    return undefined
}

export async function setIngressClassAsDefault(networkApi: NetworkingV1Api, name: string): Promise<void> {
    const patch = {
        op: 'replace',
        path: '/metadata/annotations',
        value: {
            'ingressclass.kubernetes.io/is-default-class': 'true'
        }
    }
    try {
        await networkApi.patchIngressClass({ name, body: [patch] })
        log.info(`IngressClass "${name}" set as default.`)
    }
    catch (err) {
        log.error('Error setting default IngressClass:', err)
    }
}

/*
    Removes an image from EVERY node: a privileged DaemonSet runs 'crictl rmi' against the node's CRI socket,
    is given a minute, and is deleted. It is deleted on failure too.
*/
export async function imageDelete(appsApi: AppsV1Api, imageName: string): Promise<void> {
    const safeImageName = imageName.replace(/[^a-zA-Z0-9./_:@-]/g, '')
    const uniqueId = randomUUID().substring(0, 8)
    const uniqueName = `kwirth-image-purger-${uniqueId}`
    const daemonSet = {
        metadata: {
            name: uniqueName,
            labels: { app: 'image-purger', id: uniqueId }
        },
        spec: {
            selector: { matchLabels: { app: uniqueName } },
            template: {
                metadata: { labels: { app: uniqueName } },
                spec: {
                    tolerations: [
                        { operator: 'Exists', effect: 'NoSchedule' },
                        { operator: 'Exists', effect: 'NoExecute' }
                    ],
                    hostPID: true,
                    containers: [{
                        name: 'worker',
                        image: 'kwirthmagnify/crictl',
                        command: ['/bin/sh', '-c'],
                        args: [`
                            if [ -S "/host-run/k3s/containerd/containerd.sock" ]; then
                                S="/host-run/k3s/containerd/containerd.sock"
                            elif [ -S "/host-run/containerd/containerd.sock" ]; then
                                S="/host-run/containerd/containerd.sock"
                            elif [ -S "/host-run/crio/crio.sock" ]; then
                                S="/host-run/crio/crio.sock"
                            elif [ -S "/host-var-run/containerd/containerd.sock" ]; then
                                S="/host-var-run/containerd/containerd.sock"
                            fi

                            if [ -n "$S" ]; then
                                export CONTAINER_RUNTIME_ENDPOINT="unix://$S"
                                export IMAGE_SERVICE_ENDPOINT="unix://$S"
                                echo "Socket detected in $S. Removing ${safeImageName}..."
                                /usr/local/bin/crictl rmi "${safeImageName}" || echo "Image not found on this node."
                            else
                                echo "ERROR: Runtime socket not found in /host-run nor /host-var-run"
                                exit 1
                            fi

                            sleep 50
                        `.trim()],
                        securityContext: {
                            privileged: true,
                            runAsUser: 0
                        },
                        volumeMounts: [
                            { name: 'run-host', mountPath: '/host-run', mountPropagation: 'HostToContainer' },
                            { name: 'var-run-host', mountPath: '/host-var-run', mountPropagation: 'HostToContainer' }
                        ]
                    }],
                    volumes: [
                        { name: 'run-host', hostPath: { path: '/run', type: 'Directory' } },
                        { name: 'var-run-host', hostPath: { path: '/var/run', type: 'Directory' } }
                    ]
                }
            }
        }
    }
    try {
        await appsApi.createNamespacedDaemonSet({ namespace: 'default', body: daemonSet })
        log.info(`[${uniqueName}] DaemonSet created, waiting for node cleaning...`)
        await new Promise((resolve) => setTimeout(resolve, 60000))
        await appsApi.deleteNamespacedDaemonSet({ name: uniqueName, namespace: 'default' })
        log.info(`[${uniqueName}] Image deleted and DaemonSet removed.`)
    }
    catch (err: any) {
        log.error('Error running imageDelete:', err.response?.body || err.message)
        try {
            await appsApi.deleteNamespacedDaemonSet({ name: uniqueName, namespace: 'default' })
        }
        catch { /* already gone */ }
    }
}
