import { IChannel } from '../channels/IChannel'
import { ClusterInfo } from '../model/ClusterInfo'
import { Watch } from '@kubernetes/client-node'
import { IProvider } from '../providers/IProvider'

export interface IEventsSubscriber {
    kinds: string[]
    crdInstances: string[]
    syncCrdInstances: boolean
}

export class EventsProvider implements IProvider {
    public readonly id = 'events'
    public readonly providesRouter = false
    public router = undefined

    private resourceWatchers: Map<string, Watch>
    private clusterInfo: ClusterInfo
    private subscribers: Map<IChannel, IEventsSubscriber>

    constructor(clusterInfo: ClusterInfo) {
        this.clusterInfo = clusterInfo
        this.subscribers = new Map()
        this.resourceWatchers = new Map()
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
            console.log(`Errors ocurred while adding subscriber ${c.getChannelData().id} to provider 'events'`)
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

        const watch = new Watch(this.clusterInfo.kubeConfig)
        const watchLoop = async () => {
            try {
                await watch.watch(
                    resourcePath,
                    {}, 
                    (type, apiObj) => {
                        retryCount = 0
                        currentWaitTime = INITIAL_WAIT
                        if (apiObj && apiObj.metadata) eventHandler(type, apiObj, this.subscribers)
                    },
                    (err) => {
                        const errorMsg = err?.message || err?.Error || "Unknown error"
                        console.log(`[${resourcePath}] Watcher ended: ${errorMsg}`)

                        if (retryCount < MAX_RETRIES) {
                            retryCount++
                            console.log(`[${resourcePath}] Retry ${retryCount}/${MAX_RETRIES}. Waiting ${currentWaitTime / 1000}s...`)                            
                            setTimeout(watchLoop, currentWaitTime)
                            currentWaitTime *= 2
                        }
                        else {
                            console.error(`[${resourcePath}] MAX RETRIES REACHED (${MAX_RETRIES}). Stopping watcher.`)
                            this.resourceWatchers.delete(resourcePath)
                        }
                    }
                );
            }
            catch (error: any) {
                if (retryCount < MAX_RETRIES) {
                    retryCount++
                    console.error(`[${resourcePath}] Error: ${error.message}. Retry ${retryCount} in ${currentWaitTime / 1000}s`)
                    setTimeout(watchLoop, currentWaitTime)
                    currentWaitTime *= 2
                }
                else {
                    this.resourceWatchers.delete(resourcePath)
                    // @ts-ignore
                    if (typeof watch.abort === 'function') watcher.abort()
                }
            }
        }

        watchLoop()
        this.resourceWatchers.set(resourcePath, watch)
    }

    private handleEvent = (type: string, obj: any, subscribersList: Map<IChannel, IEventsSubscriber>) => {
        if (obj.kind === 'CustomResourceDefinition') {
            if (type === 'DELETED') {
                this.stopCrdInstanceWatcher(obj, subscribersList)
            }
            else if (type === 'ADDED') {
                this.startCrdInstanceWatcher(obj, subscribersList)
            }
        }

        for (let [channel, subscriber] of subscribersList.entries()) {
            if (subscriber.kinds.includes(obj.kind) || (subscriber.crdInstances && subscriber.crdInstances.includes(obj.kind))) {
                channel.processProviderEvent(this.id, { type, obj })
            }
            else {
                //console.log('********************notproroc', subscriber.crdInstances, obj.kind)
            }
        }
    }

    private startCrdInstanceWatcher = (crd: any, subscribersList: Map<IChannel, IEventsSubscriber>) => {
        const kindName = crd.spec.names.kind
        const resourcePath = `/apis/${crd.spec.group}/${crd.spec.versions[0].name}/${crd.spec.names.plural}`

        if (this.resourceWatchers.has(resourcePath)) {
            console.log(`Already watching CRD instances for: ${kindName}`)
            return
        }

        if (crd.spec.versions && crd.spec.versions.length > 1) {
            console.warn(`Only version '${crd.spec.versions[0].name}' of '${kindName}' will be watched. All versions are: ${crd.spec.versions.map((v:any) => v.name).join(', ')}`);
        }

        // Registrar el nuevo tipo de instancia en los suscriptores
        for (let subscriber of subscribersList.values()) {
            if (!subscriber.crdInstances.includes(kindName)) subscriber.crdInstances.push(kindName)
        }

        this.startResourceWatcher(resourcePath, this.handleEvent)
    }
    
    private stopCrdInstanceWatcher = (crd: any, subscribersList: Map<IChannel, IEventsSubscriber>) => {
        const kindName = crd.spec.names.kind;
        const resourcePath = `/apis/${crd.spec.group}/${crd.spec.versions[0].name}/${crd.spec.names.plural}`
        const watcher = this.resourceWatchers.get(resourcePath)

        for (let subscriber of subscribersList.values()) {
            subscriber.crdInstances = subscriber.crdInstances.filter(k => k !== kindName)
        }

        if (watcher) {
            console.log(`Stopping watcher for CRD: ${kindName} at ${resourcePath}`)
            try {
                // @ts-ignore
                if (typeof watcher.abort === 'function') {
                    // @ts-ignore
                    watcher.abort();
                }
            } catch (e) {
                console.error("Error aborting watcher:", e);
            }
            this.resourceWatchers.delete(resourcePath)
        }
    }

    startProvider = async () => {
        console.log('Events reception started...')

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
        ];

        [...coreResources, ...apiResources].forEach(path => this.startResourceWatcher(path, this.handleEvent));
    }

    stopProvider = async () => {
    }

}