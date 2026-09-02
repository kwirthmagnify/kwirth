import { AdmissionregistrationV1Api, ApiextensionsV1Api, ApisApi, AppsV1Api, AutoscalingV2Api, BatchV1Api, CoordinationV1Api, CoreV1Api, CustomObjectsApi, Exec, KubeConfig, KubernetesObjectApi, Log, NetworkingV1Api, NodeV1Api, PolicyV1Api, RbacAuthorizationV1Api, SchedulingV1Api, StorageV1Api, V1Node, VersionApi } from '@kubernetes/client-node'
import { EClusterType, IInstanceConfig, ISenderAccess, IWebhookAccess } from '@kwirthmagnify/kwirth-common'
import Docker from 'dockerode'
import { DockerTools } from '../tools/DockerTools'
import { ServiceAccountToken } from '../tools/ServiceAccountToken'
import { IProvider } from '../providers/IProvider'
import { IChannel } from '../channels/IChannel'
import { ELogComponent, logError, logInfo, logWarning } from '../tools/Logging'

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

export class ClusterInfo {
    public name: string = ''
    public id: string = ''
    public nodes: Map<string, INodeInfo> = new Map()
    public pendingWebsocket:IPendingWebsocket[] = []
    public dockerTools!: DockerTools
    public dockerApi!: Docker
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
    public senders?: ISenderAccess
    public webhooks?: IWebhookAccess
    public vcpus: number = 0
    public memory: number = 0
    public type: EClusterType = EClusterType.KUBERNETES
    public flavour: string ='unknown'

    addSubscriber = (providerId: string, c:IChannel, data:any) => {
        let prov = this.providers.find(p => p.id===providerId)
        if (prov) {
            prov.addSubscriber(c,data)
            logInfo(ELogComponent.PROVIDER, `Subscriber '${c.getChannelData().id}' added to provider '${providerId}'`)
        }
        else
            logError(ELogComponent.PROVIDER, `Cannot subscribe channel '${c.getChannelData().id}' to provider '${providerId}' (provider do not exist)`)
    }

    updateSubscriber = (providerId: string, c:IChannel, data:any) => {
        //+++ review how to implement
    }

    removeSubscriber = (providerId: string, c:IChannel) => {
        let prov = this.providers.find(p => p.id===providerId)
        if (prov) {
            prov.removeSubscriber(c)
            logInfo(ELogComponent.PROVIDER, `Subscriber '${c.getChannelData().id}' removed from provider '${providerId}'`)
        }
        else
            logError(ELogComponent.PROVIDER,`Cannot remove subscription of channel '${c.getChannelData().id}' from provider ${providerId} (provider do not exist)`)
    }

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
