import { IExtensionLogger, IProvider, IProviderStorage, IProviderSubscriber, IProviderSubscriptionHelp, IResourceWatcher, KwirthData, createResourceWatcher } from '@kwirthmagnify/kwirth-common-back'
import express, { Request, Response } from 'express'
import { IEventsQuery, IEventsSubscription, IKubeEvent, IKubeObject } from '../common/EventsTypes'

export * from '../common/EventsTypes'

const PROVIDER_ID = 'events'
const MAX_HTTP_LIMIT = 500

/*
    The slice of the core's ClusterInfo this provider uses. Structural, because an extension cannot import
    the core: coreApi for the one-off reads of Kubernetes Events, and kubeConfig, which createResourceWatcher
    (kwirth-common-back, the core's copy at runtime) needs to open the watches.
*/
interface IEventList { items?: IKubeEvent[] }
interface IEventsClusterInfo {
    coreApi: {
        listNamespacedEvent(params: { namespace: string, fieldSelector?: string }): Promise<IEventList>
        listEventForAllNamespaces(params: { fieldSelector?: string, limit?: number }): Promise<IEventList>
    }
    kubeConfig: unknown
}

// What the provider keeps per subscriber: what it asked for, plus the CRD kinds learnt since it subscribed
interface ISubscriberState {
    kinds: string[]
    crdInstances: string[]
    syncCrdInstances: boolean
}

// The part of a CustomResourceDefinition used to watch its instances
interface ICrd extends IKubeObject {
    spec: { group: string, names: { kind: string, plural: string }, versions: { name: string }[] }
}

const eventTime = (e: IKubeEvent): number => new Date(e.eventTime ?? e.lastTimestamp ?? e.firstTimestamp ?? 0).getTime()

export class EventsProvider implements IProvider {
    public readonly id = PROVIDER_ID
    /*
        No public router. The pull of Kubernetes Events that used to hang from '/provider/events' is in the
        configRouter, which the core mounts BEHIND the accessKey at '/core/providerconfig/events': an
        extension cannot use the core's key validation, and there the core does it for us. In-process
        consumers read it through the contract instead (getData).
    */
    public readonly providesRouter = false
    public router = undefined
    public routerAlias = undefined
    public readonly requiresApiKeyApi = false
    public apiKeyApi = undefined
    public configRouter = express.Router()

    private clusterInfo: IEventsClusterInfo
    private kwirthData: KwirthData
    private watchers: Map<string, IResourceWatcher> = new Map()
    private subscribers: Map<IProviderSubscriber, ISubscriberState> = new Map()
    /*
        Deliveries made since startup: one per call to a subscriber, not one per event produced. Here the
        difference matters — this provider FILTERS by 'kinds', so an event may be delivered to nobody, and
        counting productions would give a throughput that does not exist.
    */
    private deliveries = 0
    private eventsWatchStartTime = 0   // epoch ms when the /api/v1/events watch started (backlog gate)

    /*
        The log. The core replaces it through setLogger() right after constructing the provider, already
        identified: '[prov] [INFO] [events] ...'. This is a fallback for an older core.
    */
    private log: IExtensionLogger = {
        info: (message: unknown) => console.log(`[${PROVIDER_ID}] ${message}`),
        trace: (message: unknown) => console.log(`[${PROVIDER_ID}] ${message}`),
        warning: (message: unknown) => console.warn(`[${PROVIDER_ID}] ${message}`),
        error: (message: unknown) => console.error(`[${PROVIDER_ID}] ${message}`)
    }

    setLogger = (logger: IExtensionLogger): void => { this.log = logger }

    constructor(clusterInfo: unknown, kwirthData: KwirthData, _storage?: IProviderStorage) {
        this.clusterInfo = clusterInfo as IEventsClusterInfo
        this.kwirthData = kwirthData

        // GET /core/providerconfig/events?namespace&kind&name&limit — raw Kubernetes Events, newest first
        this.configRouter.get('/', async (req: Request, res: Response) => {
            try {
                const items = await this.getEvents({
                    namespace: (req.query.namespace as string) || '',
                    kind: (req.query.kind as string) || '',
                    name: (req.query.name as string) || '',
                    limit: Math.min(parseInt(req.query.limit as string) || 0, MAX_HTTP_LIMIT),
                })
                res.status(200).json(items)
            }
            catch (err) {
                this.log.error(`GET events error: ${err}`)
                res.status(500).json([])
            }
        })
    }

    /*
        The one-off read of the contract (IProvider.getData): Kubernetes Events, all or about one object
        ({ namespace?, kind?, name?, limit? }), newest first. What Magnify asks for its events feed.
    */
    getData = async (request: Record<string, unknown>): Promise<IKubeEvent[]> => this.getEvents(request as IEventsQuery)

    getDataHelp = (): IProviderSubscriptionHelp => ({
        usage: [
            'Reads Kubernetes Event objects once, newest first. Without "name" and "kind" it reads the whole',
            'cluster; with both, the events about that object (in "namespace", or in every namespace).'
        ].join('\n'),
        example: { namespace: 'default', kind: 'Pod', name: 'my-pod', limit: 25 },
        fields: [
            { name: 'namespace', type: 'string', description: 'Namespace of the object (with kind and name)' },
            { name: 'kind', type: 'string', description: 'Kind of the object the events are about' },
            { name: 'name', type: 'string', description: 'Name of the object the events are about' },
            { name: 'limit', type: 'number', description: 'At most this many events' }
        ]
    })

    /*
        The same read under its old name. Kept because excubitor (private) calls it directly, by looking the
        provider up; once it reads through getData this can go.
    */
    getEvents = async (query: IEventsQuery): Promise<IKubeEvent[]> => {
        const namespace = query.namespace || ''
        const kind = query.kind || ''
        const name = query.name || ''
        const limit = query.limit || 0

        let result: IEventList
        if (name && kind) {
            const fieldSelector = `involvedObject.name=${name},involvedObject.kind=${kind}`
            result = namespace
                ? await this.clusterInfo.coreApi.listNamespacedEvent({ namespace, fieldSelector })
                : await this.clusterInfo.coreApi.listEventForAllNamespaces({ fieldSelector })
        }
        else {
            result = await this.clusterInfo.coreApi.listEventForAllNamespaces(limit > 0 ? { limit: limit * 3 } : {})
        }
        let items = (result.items ?? []).sort((a, b) => eventTime(b) - eventTime(a))
        if (limit > 0) items = items.slice(0, limit)
        return items
    }

    getSubscriptionHelp = (): IProviderSubscriptionHelp => ({
        usage: [
            'Strict opt-in: an object is delivered only if its kind is listed in "kinds". Subscribing',
            'with {} therefore receives nothing at all.',
            '',
            'The watchers are started with the provider, not with your subscription, so you get changes',
            'from now on — not the current state of the cluster. Kubernetes Event objects arrive with',
            'kind forced to "Event", and the retention backlog kube replays on watch start is discarded.',
            '',
            'Each delivered event is { type, obj }, where type is ADDED / MODIFIED / DELETED.'
        ].join('\n'),
        example: { kinds: ['Pod', 'Event'], syncInstances: false },
        fields: [
            { name: 'kinds', type: 'string[]', required: true, description: 'Kubernetes kinds to receive: Pod, Deployment, Service, Ingress, Event, CustomResourceDefinition...' },
            { name: 'syncInstances', type: 'boolean', description: 'Also receive instances of watched CRDs, and everything else regardless of kinds' }
        ]
    })

    addSubscriber = async (subscriber: IProviderSubscriber, data?: IEventsSubscription): Promise<void> => {
        this.subscribers.set(subscriber, {
            kinds: data?.kinds ?? [],
            crdInstances: [],
            syncCrdInstances: Boolean(data?.syncInstances)
        })
    }

    removeSubscriber = async (subscriber: IProviderSubscriber): Promise<void> => {
        this.subscribers.delete(subscriber)
    }

    getStats = () => ({ subscribers: this.subscribers.size, events: this.deliveries })

    private startWatcher = (path: string, handler: (type: string, obj: IKubeObject) => void): void => {
        if (this.watchers.has(path)) return
        const watcher = createResourceWatcher(this.clusterInfo, path, handler, {
            log: { info: m => this.log.info(m), error: m => this.log.error(m) },
            onGiveUp: () => { this.watchers.delete(path) }
        })
        this.watchers.set(path, watcher)
    }

    handleEvent = (type: string, obj: IKubeObject): void => {
        if (obj.kind === 'CustomResourceDefinition' && type === 'ADDED') this.startCrdInstanceWatcher(obj as ICrd)
        this.dispatch(type, obj)
        if (obj.kind === 'CustomResourceDefinition' && type === 'DELETED') this.stopCrdInstanceWatcher(obj as ICrd)
    }

    // Delivers the change to every subscriber whose filter accepts it. A subscriber that throws does not
    // stop the others.
    dispatch = (type: string, obj: IKubeObject): void => {
        for (const [subscriber, state] of this.subscribers.entries()) {
            const kind = obj.kind ?? ''
            if (state.kinds.includes(kind) || state.crdInstances.includes(kind) || state.syncCrdInstances) {
                this.deliveries++
                try {
                    subscriber.processProviderEvent(this.id, { type, obj })
                }
                catch (err) {
                    this.log.error(`A subscriber threw while processing an event: ${err}`)
                }
            }
        }
    }

    // Handler for the /api/v1/events watch (the kube log). Its items may come without 'kind', so it is
    // forced to 'Event'; and Kubernetes replays the retention backlog (~1h) when the watch starts, so what
    // happened before the watch started is not delivered again.
    handleKubeEvent = (type: string, obj: IKubeEvent): void => {
        const ts = obj.lastTimestamp || obj.eventTime || obj.metadata?.creationTimestamp
        if (ts && new Date(ts).getTime() < this.eventsWatchStartTime) return
        obj.kind = 'Event'
        this.dispatch(type, obj)
    }

    private crdPath = (crd: ICrd): string => `/apis/${crd.spec.group}/${crd.spec.versions[0].name}/${crd.spec.names.plural}`

    private startCrdInstanceWatcher = (crd: ICrd): void => {
        const kindName = crd.spec.names.kind
        const path = this.crdPath(crd)
        if (this.watchers.has(path)) {
            this.log.warning(`Already watching CRD instances for: ${kindName}`)
            return
        }
        if (crd.spec.versions.length > 1) {
            this.log.warning(`Only version '${crd.spec.versions[0].name}' of '${kindName}' will be watched. All versions are: ${crd.spec.versions.map(v => v.name).join(', ')}`)
        }
        for (const state of this.subscribers.values()) {
            if (!state.crdInstances.includes(kindName)) state.crdInstances.push(kindName)
        }
        this.startWatcher(path, this.handleEvent)
    }

    private stopCrdInstanceWatcher = (crd: ICrd): void => {
        const kindName = crd.spec.names.kind
        const path = this.crdPath(crd)
        for (const state of this.subscribers.values()) {
            state.crdInstances = state.crdInstances.filter(k => k !== kindName)
        }
        const watcher = this.watchers.get(path)
        if (watcher) {
            this.log.warning(`Stopping watcher for CRD: ${kindName} at ${path}`)
            watcher.stop()
            this.watchers.delete(path)
        }
    }

    startProvider = async (): Promise<void> => {
        /*
            Without a Kubernetes cluster behind Kwirth (ECS, ACI, a container with no kubeconfig, Helm mode
            'zero') there is nothing to watch. The core used to unregister this provider there; as an
            extension it notices by itself, says it once and stays idle. Compared as a string: the provider
            does not load kwirth-common just for EClusterType.KUBERNETES.
        */
        if (String(this.kwirthData?.clusterType) !== 'kubernetes') {
            this.log.warning('There is no Kubernetes cluster behind this Kwirth: there is nothing to watch, so the events provider stays idle')
            return
        }
        this.log.info('Events reception started...')
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
        for (const path of [...coreResources, ...apiResources]) this.startWatcher(path, this.handleEvent)

        // The kube log (Event objects), pushed with kind 'Event': it only reaches subscribers whose 'kinds'
        // include 'Event'. The timestamp gate avoids re-delivering the retention backlog.
        this.eventsWatchStartTime = Date.now()
        this.startWatcher('/api/v1/events', (type, obj) => this.handleKubeEvent(type, obj as IKubeEvent))
    }

    stopProvider = async (): Promise<void> => {
        for (const watcher of this.watchers.values()) watcher.stop()
        this.watchers.clear()
        this.subscribers.clear()
    }
}

export default EventsProvider
