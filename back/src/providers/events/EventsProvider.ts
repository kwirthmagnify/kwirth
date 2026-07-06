import { Watch, CoreV1Event } from '@kubernetes/client-node'
import express, { Request, Response } from 'express'
import { KwirthData } from '@kwirthmagnify/kwirth-common'
import { IProvider } from '../IProvider'
import { ClusterInfo } from '../../model/ClusterInfo'
import { IChannel } from '../../channels/IChannel'
import { ELogComponent, logError, logInfo, logWarning } from '../../tools/Logging'
import { AuthorizationManagement } from '../../tools/AuthorizationManagement'
import { ApiKeyApi } from '../../api/ApiKeyApi'

export interface IEventsSubscriber {
    kinds: string[]
    crdInstances: string[]
    syncCrdInstances: boolean
}

// Query for the events pull: all events, or scoped by involvedObject (namespace/kind/name).
export interface IEventsQuery {
    namespace?: string
    kind?: string
    name?: string
    limit?: number
}

export class EventsProvider implements IProvider {
    public readonly id = 'events'
    public readonly providesRouter = true
    public router = express.Router()
    public routerAlias = 'events'
    readonly requiresApiKeyApi: boolean = true
    public apiKeyApi: ApiKeyApi|undefined

    private resourceWatchers: Map<string, { watch: Watch, stopped: boolean }>
    private clusterInfo: ClusterInfo
    private subscribers: Map<IChannel, IEventsSubscriber>
    private eventsWatchStartTime = 0   // epoch ms when the /api/v1/events watch started (backlog gate)

    constructor(clusterInfo: ClusterInfo, kwirthData: KwirthData) {
        this.clusterInfo = clusterInfo
        this.subscribers = new Map()
        this.resourceWatchers = new Map()

        // Pull endpoint at /provider/events: raw kube Events, all or scoped by involvedObject
        // (?namespace&kind&name). Single source for the UI (homepages project it) and for magnify.
        this.router.route('/')
            .all(async (req: Request, res: Response, next) => {
                if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi!))) return
                next()
            })
            .get(async (req: Request, res: Response) => {
                try {
                    const items = await this.getEvents({
                        namespace: (req.query.namespace as string) || '',
                        kind: (req.query.kind as string) || '',
                        name: (req.query.name as string) || '',
                        limit: Math.min(parseInt(req.query.limit as string) || 0, 500),
                    })
                    res.status(200).json(items)
                }
                catch (err) {
                    logError(ELogComponent.PROVIDER, `GET /provider/events error: ${err}`)
                    res.status(500).json([])
                }
            })
    }

    // Pull of raw kube Events (all, or scoped by involvedObject). Single implementation shared by the
    // HTTP router (/provider/events) and by in-node consumers (e.g. magnify) to avoid duplicating coreApi calls.
    getEvents = async (query: IEventsQuery): Promise<CoreV1Event[]> => {
        const namespace = query.namespace || ''
        const kind = query.kind || ''
        const name = query.name || ''
        const limit = query.limit || 0

        let result
        if (name && kind) {
            const fieldSelector = `involvedObject.name=${name},involvedObject.kind=${kind}`
            result = namespace
                ? await this.clusterInfo.coreApi.listNamespacedEvent({ namespace, fieldSelector })
                : await this.clusterInfo.coreApi.listEventForAllNamespaces({ fieldSelector })
        }
        else {
            result = await this.clusterInfo.coreApi.listEventForAllNamespaces(limit > 0 ? { limit: limit * 3 } : {})
        }
        let items = (result.items ?? []).sort((a, b) =>
            new Date(b.eventTime ?? b.lastTimestamp ?? b.firstTimestamp ?? 0).getTime() -
            new Date(a.eventTime ?? a.lastTimestamp ?? a.firstTimestamp ?? 0).getTime())
        if (limit > 0) items = items.slice(0, limit)
        return items
    }

    addSubscriber = async (c: IChannel, data: { kinds: string[], syncInstances:boolean}) => {
        try {
            let subscriber: IEventsSubscriber = {
                kinds: data.kinds,
                crdInstances: [],
                syncCrdInstances: data.syncInstances
            }
            this.subscribers.set(c, subscriber)
        }
        catch(err) {
            logError(ELogComponent.PROVIDER, `Errors occurred while adding subscriber ${c.getChannelData().id} to provider 'events'`)
        }
    }

    removeSubscriber = async (c: IChannel) => {
        if (this.subscribers.has(c)) this.subscribers.delete(c)
    }

    private startResourceWatcher = async (resourcePath: string, eventHandler: (type: string, obj: any, subscribersList: Map<IChannel, IEventsSubscriber>) => void) => {
        if (this.resourceWatchers.has(resourcePath)) return

        const MAX_RETRIES = 6
        const INITIAL_WAIT = 5000
        let retryCount = 0
        let currentWaitTime = INITIAL_WAIT

        const entry = { watch: new Watch(this.clusterInfo.kubeConfig), stopped: false }
        this.resourceWatchers.set(resourcePath, entry)

        const watchLoop = async () => {
            if (entry.stopped) return
            entry.watch = new Watch(this.clusterInfo.kubeConfig)
            try {
                await entry.watch.watch(
                    resourcePath,
                    {
                        timeoutSeconds: 3600
                    },
                    (type, apiObj) => {
                        retryCount = 0
                        currentWaitTime = INITIAL_WAIT
                        if (apiObj && apiObj.metadata) eventHandler(type, apiObj, this.subscribers)
                    },
                    (err) => {
                        if (entry.stopped) return
                        const errorMsg = err?.message || err?.Error || "Unknown error"
                        logError(ELogComponent.PROVIDER, `[${resourcePath}] Watcher ended: ${errorMsg}`)

                        if (retryCount < MAX_RETRIES) {
                            retryCount++
                            logInfo(ELogComponent.PROVIDER, `[${resourcePath}] Retry ${retryCount}/${MAX_RETRIES}. Waiting ${currentWaitTime / 1000}s...`)
                            setTimeout(watchLoop, currentWaitTime)
                            currentWaitTime *= 2
                        }
                        else {
                            logError(ELogComponent.PROVIDER, `[${resourcePath}] MAX RETRIES REACHED (${MAX_RETRIES}). Stopping watcher.`)
                            this.resourceWatchers.delete(resourcePath)
                        }
                    }
                )
            }
            catch (error: any) {
                if (entry.stopped) return
                if (retryCount < MAX_RETRIES) {
                    retryCount++
                    logError(ELogComponent.PROVIDER, `[${resourcePath}] Error: ${error.message}. Retry ${retryCount} in ${currentWaitTime / 1000}s`)
                    setTimeout(watchLoop, currentWaitTime)
                    currentWaitTime *= 2
                }
                else {
                    this.resourceWatchers.delete(resourcePath)
                }
            }
        }

        watchLoop()
    }

    private handleEvent = (type: string, obj: any, subscribersList: Map<IChannel, IEventsSubscriber>) => {
        if (obj.kind === 'CustomResourceDefinition' && type === 'ADDED') this.startCrdInstanceWatcher(obj, subscribersList)

        this.dispatch(type, obj, subscribersList)

        if (obj.kind === 'CustomResourceDefinition' && type === 'DELETED') this.stopCrdInstanceWatcher(obj, subscribersList)

    }

    // Delivers the event to subscribers whose filter accepts it. Guard against undefined 'kinds':
    // e.g. montag subscribes with addSubscriber('events', {}) → kinds ends up undefined.
    private dispatch = (type: string, obj: any, subscribersList: Map<IChannel, IEventsSubscriber>) => {
        for (let [channel, subscriber] of subscribersList.entries()) {
            if ((subscriber.kinds && subscriber.kinds.includes(obj.kind)) || (subscriber.crdInstances && subscriber.crdInstances.includes(obj.kind)) || subscriber.syncCrdInstances) {
                channel.processProviderEvent(this.id, { type, obj })
            }
        }
    }

    // Handler for the /api/v1/events watch (kube log). Discriminator = kind='Event' (forced because
    // watch items may come without 'kind'). Timestamp gate: kube replays the retention backlog (~1h)
    // when the watch starts → we don't re-deliver events prior to the watch start.
    private handleKubeEvent = (type: string, obj: any, subscribersList: Map<IChannel, IEventsSubscriber>) => {
        const ts = obj.lastTimestamp || obj.eventTime || obj.metadata?.creationTimestamp
        if (ts && new Date(ts).getTime() < this.eventsWatchStartTime) return
        obj.kind = 'Event'
        this.dispatch(type, obj, subscribersList)
    }

    private startCrdInstanceWatcher = (crd: any, subscribersList: Map<IChannel, IEventsSubscriber>) => {
        const kindName = crd.spec.names.kind
        const resourcePath = `/apis/${crd.spec.group}/${crd.spec.versions[0].name}/${crd.spec.names.plural}`

        if (this.resourceWatchers.has(resourcePath)) {
            logWarning(ELogComponent.PROVIDER, `Already watching CRD instances for: ${kindName}`)
            return
        }

        if (crd.spec.versions && crd.spec.versions.length > 1) {
            logWarning(ELogComponent.PROVIDER, `Only version '${crd.spec.versions[0].name}' of '${kindName}' will be watched. All versions are: ${crd.spec.versions.map((v:any) => v.name).join(', ')}`);
        }

        for (let [channel, subscriber] of subscribersList.entries()) {
            if (!subscriber.crdInstances.includes(kindName)) subscriber.crdInstances.push(kindName)
        }

        this.startResourceWatcher(resourcePath, this.handleEvent)
    }
    
    private stopCrdInstanceWatcher = (crd: any, subscribersList: Map<IChannel, IEventsSubscriber>) => {
        const kindName = crd.spec.names.kind;
        const resourcePath = `/apis/${crd.spec.group}/${crd.spec.versions[0].name}/${crd.spec.names.plural}`
        const entry = this.resourceWatchers.get(resourcePath)

        for (let subscriber of subscribersList.values()) {
            subscriber.crdInstances = subscriber.crdInstances.filter(k => k !== kindName)
        }

        if (entry) {
            logWarning(ELogComponent.PROVIDER, `Stopping watcher for CRD: ${kindName} at ${resourcePath}`)
            entry.stopped = true
            try {
                // @ts-ignore
                if (typeof entry.watch.abort === 'function') entry.watch.abort()
            }
            catch (e) {
                logError(ELogComponent.PROVIDER, 'Error aborting watcher:')
                logError(ELogComponent.PROVIDER, e)
            }
            this.resourceWatchers.delete(resourcePath)
        }
    }

    startProvider = async () => {
        logInfo(ELogComponent.PROVIDER, 'Events reception started...')
        const coreResources = [
            '/api/v1/nodes',
            '/api/v1/namespaces',
            '/api/v1/services',
            '/api/v1/endpoints',
            '/api/v1/configmaps',
            '/api/v1/secrets',
            '/api/v1/pods',
            '/api/v1/persistentvolumes',
            '/api/v1/persistentvolumeclaims',
            '/api/v1/serviceaccounts',
            '/api/v1/replicationcontrollers',
            '/api/v1/resourcequotas',
            '/api/v1/limitranges'
        ]
        const apiResources = [
            '/apis/apps/v1/deployments',
            '/apis/apps/v1/daemonsets',
            '/apis/apps/v1/statefulsets',
            '/apis/apps/v1/replicasets',
            '/apis/networking.k8s.io/v1/ingresses',
            '/apis/networking.k8s.io/v1/ingressclasses',
            '/apis/networking.k8s.io/v1/networkpolicies',
            '/apis/rbac.authorization.k8s.io/v1/roles',
            '/apis/rbac.authorization.k8s.io/v1/rolebindings',
            '/apis/rbac.authorization.k8s.io/v1/clusterroles',
            '/apis/rbac.authorization.k8s.io/v1/clusterrolebindings',
            '/apis/storage.k8s.io/v1/storageclasses',
            '/apis/batch/v1/jobs',
            '/apis/batch/v1/cronjobs',
            '/apis/apiextensions.k8s.io/v1/customresourcedefinitions'
        ]
        ;[...coreResources, ...apiResources].forEach(path => this.startResourceWatcher(path, this.handleEvent))

        // Kube log (Event objects) → push with kind='Event'; real opt-in: only reaches subscribers
        // whose 'kinds' includes 'Event'. The timestamp gate avoids re-delivering the retention backlog.
        this.eventsWatchStartTime = Date.now()
        this.startResourceWatcher('/api/v1/events', this.handleKubeEvent)
    }

    stopProvider = async () => {
        for (const [path, entry] of this.resourceWatchers) {
            entry.stopped = true
            try {
                // @ts-ignore
                if (typeof entry.watch.abort === 'function') entry.watch.abort()
            }
            catch (e) {
                logError(ELogComponent.PROVIDER, `Error aborting watcher for ${path}: ${e}`)
            }
        }
        this.resourceWatchers.clear()
    }

}