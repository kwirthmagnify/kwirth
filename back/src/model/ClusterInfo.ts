import { AdmissionregistrationV1Api, ApiextensionsV1Api, ApisApi, AppsV1Api, AutoscalingV2Api, BatchV1Api, CoordinationV1Api, CoreV1Api, CustomObjectsApi, Exec, KubeConfig, KubernetesObjectApi, Log, NetworkingV1Api, NodeV1Api, PolicyV1Api, RbacAuthorizationV1Api, SchedulingV1Api, StorageV1Api, V1Node, VersionApi } from '@kubernetes/client-node'
import { EClusterType, IInstanceConfig, ISenderAccess, IWebhookAccess } from '@kwirthmagnify/kwirth-common'
import { ServiceAccountToken } from '../tools/ServiceAccountToken'
import { IProvider } from '../providers/IProvider'
import { isPluviderId, TPluviderChannel } from '../providers/Pluvider'
import { IChannel } from '../channels/IChannel'
import { ELogComponent, logError, logInfo, logWarning, providerLogger } from '../tools/Logging'

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
 * Una suscripcion VIVA, tal y como el core la intermedio: quien produce y quien consume.
 *
 * El core es el unico sitio donde esta informacion existe completa. Un provider guarda sus
 * suscriptores, pero 'IProviderSubscriber' es una interfaz de un solo metodo y no lleva identidad, asi
 * que el provider sabe CUANTOS tiene y no QUIENES son. Aqui, en cambio, la suscripcion pasa con el
 * canal delante — y con eso se puede dibujar el grafo sin pedirle nada a nadie.
 */
export interface ISubscription {
    /** Quien produce: un provider ('events') o un pluvider ('plugin:agora'). */
    providerId: string
    /** Quien consume: el id del canal. */
    channelId: string
    /** Desde cuando, para poder decir cuanto lleva algo sin consumidores. */
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
interface ISubscriptionEntry extends ISubscription {
    subscribers: Set<IChannel>
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
        Registro de PLUVIDERS: canales que ademas producen. Separado de 'providers' a proposito — ver
        el porque en providers/Pluvider.ts. La clave es el id compuesto ('plugin:<channelId>').
    */
    public pluviders: Map<string, TPluviderChannel> = new Map()
    public senders?: ISenderAccess
    public webhooks?: IWebhookAccess
    /*
        Quien consume a quien, registrado aqui porque aqui es donde se sabe.

        Se escribe al suscribirse y al darse de baja —cuando alguien abre o cierra un canal—, nunca por
        evento: no esta en el camino caliente y no cuesta nada mantenerlo.

        ⚠️ NO es la verdad absoluta: quien llame a 'provider.addSubscriber()' directamente, sin pasar
        por aqui, no aparece. Lo hace provider-debug con su propio proxy, a proposito. Por eso esto
        convive con 'IProvider.getStats()', que da el TOTAL que el provider reconoce: si el total es
        mayor que lo registrado aqui, hay consumidores que este mapa no conoce, y quien lo pinte debe
        decirlo en vez de dar a entender que estan todos.
    */
    private subscriptions: ISubscriptionEntry[] = []

    public vcpus: number = 0
    public memory: number = 0
    public type: EClusterType = EClusterType.KUBERNETES
    public flavour: string ='unknown'

    /*
        Un id con prefijo ('plugin:agora') apunta a un pluvider y se resuelve contra su registro; sin
        prefijo, a un provider y el camino es el de siempre.

        La ausencia se trata distinto en cada caso: un provider declarado en 'requirements' que no
        esta registrado es una mala configuracion (error), mientras que un pluvider ausente es un
        escenario legitimo —su plugin puede no estar instalado— y el consumidor sigue funcionando sin
        el (warning).
    */
    addSubscriber = (providerId: string, c:IChannel, data:any) => {
        const log = providerLogger(providerId)
        if (isPluviderId(providerId)) {
            let pluv = this.pluviders.get(providerId)
            if (pluv) {
                pluv.addSubscriber(c, data)
                this.trackSubscription(providerId, c)
                log.info(`Subscriber '${c.getChannelData().id}' added`)
            }
            else
                log.warning(`Cannot subscribe channel '${c.getChannelData().id}': this pluvider is not installed or is not running here`)
            return
        }
        let prov = this.providers.find(p => p.id===providerId)
        if (prov) {
            prov.addSubscriber(c,data)
            this.trackSubscription(providerId, c)
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
                this.untrackSubscription(providerId, c)
                log.info(`Subscriber '${c.getChannelData().id}' removed`)
            }
            else
                log.warning(`Cannot remove the subscription of channel '${c.getChannelData().id}': this pluvider is not installed or is not running here`)
            return
        }
        let prov = this.providers.find(p => p.id===providerId)
        if (prov) {
            prov.removeSubscriber(c)
            this.untrackSubscription(providerId, c)
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
    private trackSubscription = (providerId: string, c: IChannel): void => {
        const channelId = c.getChannelData().id
        const edge = this.subscriptions.find(s => s.providerId === providerId && s.channelId === channelId)
        if (edge) {
            edge.subscribers.add(c)
            return
        }
        this.subscriptions.push({ providerId, channelId, since: Date.now(), subscribers: new Set([c]) })
    }

    /*
        The edge goes away with the LAST subscriber, not the first. An unsubscribe from someone who was
        never there — a double cleanup, a channel that never subscribed — takes nothing down with it.
    */
    private untrackSubscription = (providerId: string, c: IChannel): void => {
        const channelId = c.getChannelData().id
        const pos = this.subscriptions.findIndex(s => s.providerId === providerId && s.channelId === channelId)
        if (pos < 0) return
        const edge = this.subscriptions[pos]
        edge.subscribers.delete(c)
        if (edge.subscribers.size === 0) this.subscriptions.splice(pos, 1)
    }

    /**
     * Who consumes what, right now. A copy, not the live list: whoever reads it cannot modify the
     * core's registry by accident, and the subscriber Set never leaves this class — outside, only the
     * edge itself is needed.
     */
    getSubscriptions = (): ISubscription[] =>
        this.subscriptions.map(({ providerId, channelId, since }) => ({ providerId, channelId, since }))

    // Kubernetes no tiene nombre de cluster: los gestionados dejan pistas en labels/providerID del
    // nodo, y k3s no deja ninguna (k3d solo la deja en el nombre de sus contenedores). Precedencia:
    //   1. KWIRTH_CLUSTER_NAME — el operador manda, ninguna heurística lo pisa
    //   2. heurística por flavour sobre el nodo control-plane
    //   3. uid del namespace kube-system — identidad garantizada aunque no sea legible
    setKubernetesClusterName = async() => {
        try {
            if (this.name !== '') return
            const configuredName = (process.env.KWIRTH_CLUSTER_NAME ?? '').trim()
            let detectedName = ''

            const resp = await this.coreApi.listNode()
            const nodes = resp.items ?? []
            if (nodes.length > 0) {
                // Las pistas del flavour (y en k3s el mejor candidato a nombre) están en el
                // control-plane; items[0] puede ser un agente cualquiera
                const controlPlane = nodes.find(n => n.metadata?.labels && (
                    'node-role.kubernetes.io/control-plane' in n.metadata.labels ||
                    'node-role.kubernetes.io/master' in n.metadata.labels))
                detectedName = this.detectClusterName(controlPlane ?? nodes[0], nodes)
            }

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

    // Nombre publicado por el flavour del cluster ('' si ese flavour no publica ninguno)
    private detectClusterName = (node: V1Node, nodes: V1Node[]): string => {
        const labels = node.metadata?.labels ?? {}
        const annotations = node.metadata?.annotations ?? {}

        if (labels['kubernetes.azure.com/cluster']) {
            this.flavour = 'aks'
            // el label trae el resource group del nodo por delante (MC_<rg>_<cluster>_<region>)
            let name = labels['kubernetes.azure.com/cluster']
            const rg = labels['kubernetes.azure.com/network-resourcegroup']
            if (rg && name.startsWith(rg+'_')) name = name.substring(rg.length+1)
            return name
        }

        if (labels['k8s.io/cloud-provider-aws']) {
            this.flavour = 'eks'
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
            // eksctl etiqueta los nodos que crea, pero no necesariamente todos los del cluster
            const eksctlNode = nodes.find(n => n.metadata?.labels?.['alpha.eksctl.io/cluster-name'])
            return eksctlNode?.metadata?.labels?.['alpha.eksctl.io/cluster-name'] ?? ''
        }

        if (node.spec?.providerID?.toLowerCase().startsWith('gce://')) {
            this.flavour = 'gke'
            if (labels['name']) return labels['name']
            const fullNodeName = node.spec.providerID.split('/').pop() ?? ''
            const gkeMatch = fullNodeName.match(/^gke-(.*)-[^-]+-[^-]+$/)
            return gkeMatch?.[1] || labels['cloud.google.com/gke-nodepool'] || ''
        }

        if (annotations['k3s.io/hostname']) {
            const hostname = annotations['k3s.io/hostname'].toLocaleLowerCase()
            this.flavour = hostname.startsWith('k3d') ? 'k3d' : 'k3s'
            // k3d nombra sus nodos '<cluster>-server-N' / '<cluster>-agent-N', así que el nombre del
            // cluster sale de recortar por el separador. Un k3s de verdad usa el hostname de la
            // máquina, que no lleva separador ni nombre de cluster: lo mejor que hay es el hostname
            // del control-plane (y si no vale, el operador tiene KWIRTH_CLUSTER_NAME)
            if (this.flavour !== 'k3d') return hostname
            let cut = hostname.indexOf('-agent-')
            if (cut < 0) cut = hostname.indexOf('-server-')
            return cut >= 0 ? hostname.substring(0, cut) : hostname
        }

        return ''
    }

    // Identidad del cluster: uid del namespace kube-system (único y estable entre reinicios)
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
