import { AdmissionregistrationV1Api, ApiextensionsV1Api, ApisApi, AppsV1Api, AutoscalingV2Api, BatchV1Api, CoordinationV1Api, CoreV1Api, CustomObjectsApi, Exec, KubeConfig, KubernetesObjectApi, Log, NetworkingV1Api, NodeV1Api, PolicyV1Api, RbacAuthorizationV1Api, SchedulingV1Api, StorageV1Api, V1Node, VersionApi } from '@kubernetes/client-node'
import { EClusterType, EClusterFlavour, ERancherRole, IInstanceConfig, ISenderAccess, IWebhookAccess } from '@kwirthmagnify/kwirth-common'
import { IProviderSubscriber } from '@kwirthmagnify/kwirth-common-back'
import { ServiceAccountToken } from '../tools/ServiceAccountToken'
import { IProvider } from '../providers/IProvider'
import { isPluviderId, TPluviderChannel } from '../providers/Pluvider'
import { consumerIdOf, TSubscriptionConsumer } from '../providers/Consumer'
import { IChannel } from '../channels/IChannel'
import { ELogComponent, logError, logInfo, logWarning, providerLogger } from '../tools/Logging'
import { IRouteAccess } from '../tools/RouteRegistry'
import { IDceAccess } from '../tools/DceManager'

export interface INodeInfo {
    name: string
    ip: string
    maxPods: number
}

export interface IPendingWebsocket {
    channel:string
    instance:string
    challenge:string
    data: string
    instanceConfig: IInstanceConfig
}

/**
 * A LIVE subscription, exactly as the core brokered it: who produces and who consumes.
 *
 * The core is the only place where this information exists in full. A provider stores its subscribers,
 * but 'IProviderSubscriber' is a single-method interface and carries no identity, so the provider knows
 * HOW MANY it has and not WHO they are. Here, on the other hand, the subscription goes through with the
 * channel in front — and with that the graph can be drawn without asking anybody for anything.
 */
export interface ISubscription {
    /** Who produces: a provider ('events') or a pluvider ('plugin:agora'). */
    providerId: string
    /**
     * Who consumes: the channel's id ('agora'), or a provider's with its prefix ('provider:aws') when
     * the consumer is another provider. It is called 'consumerId' and not 'channelId' ever since it
     * stopped being able to be only a channel — see providers/Consumer.ts.
     */
    consumerId: string
    /** Since when, so it can be said how long something has gone without consumers. */
    since: number
}

/*
    The edge, plus what it takes to know WHEN it stops existing — which is not the same as knowing
    that it exists.

    A channel subscribes to the same provider more than once perfectly normally: one subscription per
    tab, or because it gets re-instantiated. That is still ONE edge — the graph says who feeds whom,
    not how many times. But the unsubscribe arrives just as repeatedly, and if the first one removed
    the edge, the registry would empty out while the provider keeps delivering to the others. That is
    exactly what used to happen: the graph emptied itself after a couple of reloads.

    Subscribers are kept BY IDENTITY, the same criterion the provider uses in its own Map. That way
    the registry cannot end up claiming something different from what the provider believes: two adds
    of the same object count as one, just like there, and the edge goes when the last one goes.
    Holding those references adds no leak — the provider already holds them.
*/
/*
    The core's view of the handle it hands out. The published contract lives in 'common-back'
    (IProviderHandle) and is what plugins compile against; this is declared here so the core does not
    have to wait for that package to be republished and served by npm — the same reason its view of
    IProvider is written down in providers/IProvider.ts.
*/
export interface IProviderHandle {
    readonly id: string
    /*
        Returns whatever the producer returns — normally a promise — instead of swallowing it: a
        provider that fails when registering a subscriber leaves an unhandled rejection, and that takes
        the core down. Whoever consumes other people's providers wraps it in Promise.resolve().catch().
    */
    subscribe(subscriber: IProviderSubscriber, data?: any): unknown
    updateSubscription(subscriber: IProviderSubscriber, data?: any): unknown
    unsubscribe(subscriber: IProviderSubscriber): unknown
}

/* A provider or a pluvider, seen only as the thing you subscribe to: both offer exactly this. */
interface ISubscriptionTarget {
    addSubscriber(subscriber: IProviderSubscriber, data: any): unknown
    removeSubscriber(subscriber: IProviderSubscriber): unknown
    updateSubscription?(subscriber: IProviderSubscriber, data: any): unknown
}

interface ISubscriptionEntry extends ISubscription {
    /*
        Whatever the provider was handed: the channel itself through the old 'addSubscriber', or a
        per-instance subscriber through a handle. It is kept as the key because it is the same thing
        the provider holds in its own Map, so both sides count the same subscriptions.
    */
    subscribers: Set<object>
}

export class ClusterInfo {
    public name: string = ''
    public id: string = ''
    public nodes: Map<string, INodeInfo> = new Map()
    public pendingWebsocket:IPendingWebsocket[] = []
    public kubeConfig!: KubeConfig
    public coreApi!: CoreV1Api
    public versionApi!: VersionApi
    public appsApi!: AppsV1Api
    public execApi!: Exec
    public logApi!: Log
    public crdApi!: CustomObjectsApi
    public rbacApi!: RbacAuthorizationV1Api
    public extensionApi!: ApiextensionsV1Api
    public storageApi!: StorageV1Api
    public networkApi!: NetworkingV1Api
    public batchApi!: BatchV1Api
    public autoscalingApi!: AutoscalingV2Api
    public schedulingApi!: SchedulingV1Api
    public coordinationApi!: CoordinationV1Api
    public admissionApi!: AdmissionregistrationV1Api
    public policyApi!: PolicyV1Api
    public nodeApi!: NodeV1Api
    public objectsApi!: KubernetesObjectApi
    public apisApi!: ApisApi
    public saToken!: ServiceAccountToken
    public token: string|undefined   // needed just for connecting to kubelet and extract metrics
    public providers!: IProvider[]
    /*
        The PLUVIDER registry: channels that also produce. Kept apart from 'providers' on purpose — the
        why of it is in providers/Pluvider.ts. The key is the composite id ('plugin:<channelId>').
    */
    public pluviders: Map<string, TPluviderChannel> = new Map()
    public senders?: ISenderAccess
    public webhooks?: IWebhookAccess
    /** Every published HTTP route, read-only (the Status channel's Routes tab). */
    public routes?: IRouteAccess
    /** The installed DCEs, their state and who consumes them, read-only (the Status channel's DCE tab). */
    public dces?: IDceAccess
    /*
        Who consumes whom, recorded here because here is where it is known.

        It is written on subscribing and on unsubscribing — when somebody opens or closes a channel —
        never per event: it is not in the hot path and keeping it costs nothing.

        ⚠️ It is NOT the absolute truth: whoever calls 'provider.addSubscriber()' directly, without
        coming through here, does not appear. provider-debug does so with a proxy of its own, on
        purpose. That is why this lives alongside 'IProvider.getStats()', which gives the TOTAL the
        provider acknowledges: should the total be greater than what is recorded here, there are
        consumers this map does not know about, and whoever draws it must say so instead of implying
        they are all there.
    */
    private subscriptions: ISubscriptionEntry[] = []

    public vcpus: number = 0
    public memory: number = 0
    public type: EClusterType = EClusterType.KUBERNETES
    public flavour: EClusterFlavour = EClusterFlavour.UNKNOWN
    /*
        Whether a Rancher is managing this cluster, and in which role. Detected from the presence of its
        agent, NOT from the 'cattle.io' domain: that one belongs to SUSE as a whole and plain k3s already
        uses it for its own CRDs (k3s.cattle.io, helm.cattle.io), so matching on it reports a Rancher on
        every k3s in existence.
    */
    public rancherManaged: boolean = false
    public rancherRole: ERancherRole = ERancherRole.NONE

    /*
        A prefixed id ('plugin:agora') points at a pluvider and is resolved against its registry;
        without a prefix, at a provider, and the route is the usual one.

        Absence is treated differently in each case: a provider declared in 'requirements' that is not
        registered is a misconfiguration (an error), whereas an absent pluvider is a legitimate scenario
        — its plugin may not be installed — and the consumer goes on working without it (a warning).
    */
    addSubscriber = (providerId: string, c:IChannel, data:any) => {
        const log = providerLogger(providerId)
        if (isPluviderId(providerId)) {
            let pluv = this.pluviders.get(providerId)
            if (pluv) {
                pluv.addSubscriber(c, data)
                this.trackSubscription(providerId, c.getChannelData().id, c)
                log.info(`Subscriber '${c.getChannelData().id}' added`)
            }
            else
                log.warning(`Cannot subscribe channel '${c.getChannelData().id}': this pluvider is not installed or is not running here`)
            return
        }
        let prov = this.providers.find(p => p.id===providerId)
        if (prov) {
            prov.addSubscriber(c,data)
            this.trackSubscription(providerId, c.getChannelData().id, c)
            log.info(`Subscriber '${c.getChannelData().id}' added`)
        }
        else
            log.error(`Cannot subscribe channel '${c.getChannelData().id}': this provider does not exist`)
    }

    updateSubscriber = (providerId: string, c:IChannel, data:any) => {
        //+++ review how to implement
    }

    removeSubscriber = (providerId: string, c:IChannel) => {
        const log = providerLogger(providerId)
        if (isPluviderId(providerId)) {
            let pluv = this.pluviders.get(providerId)
            if (pluv) {
                pluv.removeSubscriber(c)
                this.untrackSubscription(providerId, c.getChannelData().id, c)
                log.info(`Subscriber '${c.getChannelData().id}' removed`)
            }
            else
                log.warning(`Cannot remove the subscription of channel '${c.getChannelData().id}': this pluvider is not installed or is not running here`)
            return
        }
        let prov = this.providers.find(p => p.id===providerId)
        if (prov) {
            prov.removeSubscriber(c)
            this.untrackSubscription(providerId, c.getChannelData().id, c)
            log.info(`Subscriber '${c.getChannelData().id}' removed`)
        }
        else
            log.error(`Cannot remove the subscription of channel '${c.getChannelData().id}': this provider does not exist`)
    }

    /*
        Recorded AFTER the provider has accepted the subscription, not before: if 'addSubscriber'
        blows up, the core must not be left believing in a subscription that never happened.

        A duplicate is not ignored, it is COUNTED: there is still a single edge, but we need to know
        how many subscribers hold it up so the first unsubscribe does not remove it. The 'since' is
        kept — it belongs to the edge, not to the latest arrival — and that is what lets us say how
        long something has been feeding someone.
    */
    private trackSubscription = (providerId: string, consumerId: string, subscriber: object): void => {
        const edge = this.subscriptions.find(s => s.providerId === providerId && s.consumerId === consumerId)
        if (edge) {
            edge.subscribers.add(subscriber)
            return
        }
        this.subscriptions.push({ providerId, consumerId, since: Date.now(), subscribers: new Set([subscriber]) })
    }

    /*
        The edge goes away with the LAST subscriber, not the first. An unsubscribe from someone who was
        never there — a double cleanup, a channel that never subscribed — takes nothing down with it.
    */
    private untrackSubscription = (providerId: string, consumerId: string, subscriber: object): void => {
        const pos = this.subscriptions.findIndex(s => s.providerId === providerId && s.consumerId === consumerId)
        if (pos < 0) return
        const edge = this.subscriptions[pos]
        edge.subscribers.delete(subscriber)
        if (edge.subscribers.size === 0) this.subscriptions.splice(pos, 1)
    }

    /*
        The way a channel gets hold of a producer, and the only one that keeps the core's registry
        true: it is handed the handle already bound to both ends, instead of the provider object it
        could call behind the core's back.

        ⚠️ Nothing here sits in the path of the data. 'subscribe' passes the provider the very same
        subscriber it was given — no wrapper — so events go straight from producer to consumer exactly
        as they do today. The core only runs on subscribe and unsubscribe, which happen once per tab.

        Returns undefined when there is no such producer here, and says nothing about it: this is a
        question, and a consumer is allowed to ask whether something is available. Whoever cannot work
        without it is the one that knows how to complain, and now knows how to identify itself too.

        ⚠️ The consumer is no longer necessarily a CHANNEL. A provider may consume another provider —
        the case that forced it is a provider owning the cloud credentials that aws/azure/gcp need —
        so the two shapes are resolved to an id in one place (providers/Consumer.ts) instead of
        letting each call site invent its own.

        🔴 A provider that subscribes here subscribes for the LIFETIME of the instance, so it MUST
        unsubscribe in stopProvider(). Skipping it is not a leak of one object: the producer keeps
        handing events to an instance nobody uses any more, and on a hot reload each round leaves
        another ghost behind. It already happened once, and it disguised itself as a database error.

        ⚠️ Do NOT call this from startProvider(): whether the producer is already registered depends
        on which startup loop instantiated it. Use onProvidersReady(), which runs once everything is
        registered precisely so this is deterministic.
    */
    getProvider = (providerId: string, consumer: TSubscriptionConsumer): IProviderHandle | undefined => {
        const consumerId = consumerIdOf(consumer)
        if (consumerId === undefined) {
            /*
                Warned but not refused: an unnamed edge in the registry is a smaller harm than a
                subscription that does not happen. The subscriber Set still counts it, so nothing
                breaks — the graph just cannot say who it is.
            */
            providerLogger(providerId).warning('A consumer subscribed without being able to identify itself: the subscription works, but it will not be attributed to anyone in the registry')
        }
        const edgeId = consumerId ?? 'unknown'
        /*
            Both are subscribed to the same way. The cast is here because the core narrows a provider's
            subscriber to IChannel — older than the published contract, which has always said
            IProviderSubscriber, and which is what a per-instance subscriber actually is.
        */
        const target = (isPluviderId(providerId)
            ? this.pluviders.get(providerId)
            : this.providers.find(p => p.id === providerId)) as ISubscriptionTarget | undefined
        if (!target) return undefined

        return {
            id: providerId,
            subscribe: (subscriber: IProviderSubscriber, data?: any) => {
                const accepted = target.addSubscriber(subscriber, data)
                this.trackSubscription(providerId, edgeId, subscriber)
                return accepted
            },
            updateSubscription: (subscriber: IProviderSubscriber, data?: any) => target.updateSubscription?.(subscriber, data),
            unsubscribe: (subscriber: IProviderSubscriber) => {
                const removed = target.removeSubscriber(subscriber)
                this.untrackSubscription(providerId, edgeId, subscriber)
                return removed
            }
        }
    }

    /**
     * Who consumes what, right now. A copy, not the live list: whoever reads it cannot modify the
     * core's registry by accident, and the subscriber Set never leaves this class — outside, only the
     * edge itself is needed.
     */
    getSubscriptions = (): ISubscription[] =>
        this.subscriptions.map(({ providerId, consumerId, since }) => ({ providerId, consumerId, since }))

    // Kubernetes has no cluster name: the managed ones leave clues in the node's labels/providerID, and
    // k3s leaves none (k3d only leaves it in the name of its containers). Precedence:
    //   1. KWIRTH_CLUSTER_NAME — the operator rules, no heuristic overrides it
    //   2. a heuristic by flavour over the control-plane node
    //   3. the kube-system namespace's uid — a guaranteed identity even if it is not readable
    setKubernetesClusterName = async() => {
        try {
            if (this.name !== '') return
            const configuredName = (process.env.KWIRTH_CLUSTER_NAME ?? '').trim()
            let detectedName = ''

            const resp = await this.coreApi.listNode()
            const nodes = resp.items ?? []
            if (nodes.length > 0) {
                // The flavour's clues (and, in k3s, the best candidate for a name) are on the
                // control-plane; items[0] can be any agent at all
                const controlPlane = nodes.find(n => n.metadata?.labels && (
                    'node-role.kubernetes.io/control-plane' in n.metadata.labels ||
                    'node-role.kubernetes.io/master' in n.metadata.labels))
                detectedName = this.detectClusterName(controlPlane ?? nodes[0], nodes)
            }

            await this.detectRancher()

            this.name = configuredName || detectedName || await this.getClusterUid()
            if (!configuredName && !detectedName) {
                logWarning(ELogComponent.CORE, `Cluster name cannot be detected on flavour '${this.flavour}', using cluster uid instead. Set KWIRTH_CLUSTER_NAME to give it a name.`)
            }
        }
        catch (err) {
            logError(ELogComponent.CORE,'Cannot set cluster name')
            logError(ELogComponent.CORE,err)
            this.name = (process.env.KWIRTH_CLUSTER_NAME ?? '').trim() || await this.getClusterUid()
        }
    }

    /*
        Is a Rancher managing this cluster, and is it the one Rancher runs on?

        It cannot be told from the nodes, so it is a separate look: Rancher deploys 'cattle-cluster-agent'
        on every cluster it manages, and on its own it additionally runs 'rancher' in cattle-system. That
        pair is what separates local from downstream.

        ⚠️ NOT detected by the 'cattle.io' domain. That belongs to SUSE at large, and plain k3s already
        ships k3s.cattle.io and helm.cattle.io of its own: matching on it would report a Rancher on every
        k3s in existence. Verified on the dev k3d, which has those CRDs and no Rancher anywhere.

        Failing to read is not the same as there being none, but it is treated as 'no Rancher': the worst
        outcome is a cluster that does not say it is managed, never one that claims to be and is not.
    */
    private detectRancher = async (): Promise<void> => {
        try {
            const deployments = await this.appsApi.listNamespacedDeployment({ namespace: 'cattle-system' })
            const names = (deployments.items ?? []).map(d => d.metadata?.name ?? '')
            if (!names.includes('cattle-cluster-agent') && !names.includes('rancher')) return
            this.rancherManaged = true
            // The Rancher server itself only runs on its local cluster; the managed ones just get the agent.
            this.rancherRole = names.includes('rancher') ? ERancherRole.LOCAL : ERancherRole.DOWNSTREAM
            logInfo(ELogComponent.CORE, `Rancher detected: this cluster is '${this.rancherRole}'`)
        }
        catch {
            // No cattle-system namespace, or no permission to read it. Either way: nothing to claim.
        }
    }

    // The name published by the cluster's flavour ('' when that flavour publishes none)
    private detectClusterName = (node: V1Node, nodes: V1Node[]): string => {
        const labels = node.metadata?.labels ?? {}
        const annotations = node.metadata?.annotations ?? {}

        if (labels['kubernetes.azure.com/cluster']) {
            this.flavour = EClusterFlavour.AKS
            // the label carries the node's resource group in front (MC_<rg>_<cluster>_<region>)
            let name = labels['kubernetes.azure.com/cluster']
            const rg = labels['kubernetes.azure.com/network-resourcegroup']
            if (rg && name.startsWith(rg+'_')) name = name.substring(rg.length+1)
            return name
        }

        if (labels['k8s.io/cloud-provider-aws']) {
            this.flavour = EClusterFlavour.EKS
            const lastAppliedConfig = annotations['kubectl.kubernetes.io/last-applied-configuration']
            if (lastAppliedConfig) {
                try {
                    const tags = JSON.parse(lastAppliedConfig)?.spec?.tags
                    if (tags?.['karpenter.sh/discovery']) return tags['karpenter.sh/discovery']
                }
                catch {
                    logWarning(ELogComponent.CORE, 'Node last-applied-configuration is not parseable, falling back to eksctl label')
                }
            }
            // eksctl labels the nodes it creates, but not necessarily every node in the cluster
            const eksctlNode = nodes.find(n => n.metadata?.labels?.['alpha.eksctl.io/cluster-name'])
            return eksctlNode?.metadata?.labels?.['alpha.eksctl.io/cluster-name'] ?? ''
        }

        if (node.spec?.providerID?.toLowerCase().startsWith('gce://')) {
            this.flavour = EClusterFlavour.GKE
            if (labels['name']) return labels['name']
            const fullNodeName = node.spec.providerID.split('/').pop() ?? ''
            const gkeMatch = fullNodeName.match(/^gke-(.*)-[^-]+-[^-]+$/)
            return gkeMatch?.[1] || labels['cloud.google.com/gke-nodepool'] || ''
        }

        /*
            SUSE RKE2 and Harvester, before k3s: Harvester runs ON TOP of RKE2, so its nodes carry the
            RKE2 clues too and asking for k3s first would mislabel both. Order here is not cosmetic.

            ⚠️ Unlike the ones above, these two are NOT verified against a real cluster -- there is none
            available yet -- and come from the distributions' documentation. They are the ones to re-check
            first when a Rancher shows up.
        */
        if (labels['harvesterhci.io/managed'] !== undefined || annotations['harvesterhci.io/host-ip']) {
            this.flavour = EClusterFlavour.HARVESTER
            return labels['harvesterhci.io/cluster-name'] ?? ''
        }

        if (annotations['rke2.io/hostname'] || annotations['rke2.io/node-args'] || node.status?.nodeInfo?.kubeletVersion?.includes('+rke2')) {
            this.flavour = EClusterFlavour.RKE2
            // RKE2 publishes no cluster name of its own; a Rancher-managed one leaves it in a label.
            return labels['cattle.io/cluster-name'] ?? annotations['rke2.io/hostname']?.toLocaleLowerCase() ?? ''
        }

        if (annotations['k3s.io/hostname']) {
            const hostname = annotations['k3s.io/hostname'].toLocaleLowerCase()
            this.flavour = hostname.startsWith('k3d') ? EClusterFlavour.K3D : EClusterFlavour.K3S
            // k3d names its nodes '<cluster>-server-N' / '<cluster>-agent-N', so the cluster's name
            // comes from trimming at the separator. A real k3s uses the machine's hostname, which
            // carries neither separator nor cluster name: the best there is is the control-plane's
            // hostname (and should that not do, the operator has KWIRTH_CLUSTER_NAME)
            if (this.flavour !== EClusterFlavour.K3D) return hostname
            let cut = hostname.indexOf('-agent-')
            if (cut < 0) cut = hostname.indexOf('-server-')
            return cut >= 0 ? hostname.substring(0, cut) : hostname
        }

        return ''
    }

    // The cluster's identity: the kube-system namespace's uid (unique and stable across restarts)
    private getClusterUid = async (): Promise<string> => {
        if (this.id !== '') return this.id
        try {
            return (await this.coreApi.readNamespace({ name:'kube-system' })).metadata?.uid ?? ''
        }
        catch {
            return ''
        }
    }

    getNodes = async () : Promise<Map<string, INodeInfo>> => {
        // load nodes
        try {
            var resp = await this.coreApi.listNode()
            var nodes:Map<string, INodeInfo> = new Map()
            for (var node of resp.items) {
                if (node.spec?.unschedulable) {
                    logWarning(ELogComponent.CORE,`WARNING: Node ${node.metadata?.name} is unschedulable`)
                }
                else {
                    var nodeData:INodeInfo = {
                        name: node.metadata?.name!,
                        ip: node.status?.addresses!.find(address => address.type === 'InternalIP')?.address!,
                        maxPods: parseInt(node.status?.allocatable?.['pods'] ?? '110', 10)
                    }
                    nodes.set(nodeData.name, nodeData)
                }
            }
            return nodes
        }
        catch (err) {
            logError(ELogComponent.CORE,'Cannot list nodes')
            logError(ELogComponent.CORE,err)
            return new Map()
        }
    }

}
