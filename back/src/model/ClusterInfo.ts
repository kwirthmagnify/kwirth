import { AdmissionregistrationV1Api, ApiextensionsV1Api, ApisApi, AppsV1Api, AutoscalingV2Api, BatchV1Api, CoordinationV1Api, CoreV1Api, CustomObjectsApi, Exec, KubeConfig, KubernetesObjectApi, Log, NetworkingV1Api, NodeV1Api, PolicyV1Api, RbacAuthorizationV1Api, SchedulingV1Api, StorageV1Api, V1Node, VersionApi } from '@kubernetes/client-node'
import { EClusterType, IInstanceConfig, ISenderAccess } from '@kwirthmagnify/kwirth-common'
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

    setKubernetesClusterName = async() => {
        try {
            if (this.name !== '') return
            var resp = await this.coreApi.listNode()
            if (!resp.items || resp.items.length===0) return 'unnamed'

            let node = resp.items[0]
            if (node.metadata?.labels && node.metadata?.labels['kubernetes.azure.com/cluster']) {
                this.flavour = 'aks'
                this.name = node.metadata?.labels['kubernetes.azure.com/cluster']
                let rg = node.metadata?.labels['kubernetes.azure.com/network-resourcegroup']
                if (this.name.startsWith(rg+'_')) this.name = this.name.substring(rg.length+1)            
            }
            else if (node.metadata?.labels && node.metadata?.labels['k8s.io/cloud-provider-aws']) {
                this.flavour = 'eks'
                if (node.metadata?.annotations) {
                    let lastAppliedConfig = node.metadata?.annotations['kubectl.kubernetes.io/last-applied-configuration']
                    if (lastAppliedConfig) {
                        let config = JSON.parse(lastAppliedConfig)
                        if (config) {
                            let spec = config['spec']
                            if (spec) {
                                let tags = spec['tags']
                                this.name = tags['karpenter.sh/discovery']
                            }
                        }
                    }
                    if (this.name==='') {
                        for (let node of resp.items) {
                            if (node.metadata?.labels) {
                                if (node.metadata.labels['alpha.eksctl.io/cluster-name']) {
                                    this.name=node.metadata.labels['alpha.eksctl.io/cluster-name']
                                    break
                                }
                            }
                        }
                    }
                }
            }
            else if (node.metadata?.annotations && node.metadata?.annotations['k3s.io/hostname']) {
                let hostname = node.metadata?.annotations['k3s.io/hostname'].toLocaleLowerCase()
                this.flavour = hostname.startsWith('k3d') ? 'k3d' : 'k3s'

                let i = hostname.indexOf('-agent-')
                if (i>=0) 
                    this.name = hostname.substring(0,i)
                else {
                    i = hostname.indexOf('-server-')
                    if (i>=0) this.name = hostname.substring(0,i)
                }
            }
            if (node.spec?.providerID && node.spec.providerID.toLowerCase().startsWith('gce://')) {
                this.flavour = 'gke'
                if (node.metadata?.labels?.['name']) {
                    this.name = node.metadata.labels['name']
                }
                else {
                    const parts = node.spec.providerID.split('/')
                    const fullNodeName = parts[parts.length - 1]
                    const gkeMatch = fullNodeName.match(/^gke-(.*)-[^-]+-[^-]+$/);
                    if (gkeMatch && gkeMatch[1])
                        this.name = gkeMatch[1]
                    else
                        this.name = node.metadata?.labels?.['cloud.google.com/gke-nodepool'] || 'unnamed'
                }
            }
        }
        catch (err) {
            logError(ELogComponent.CORE,'Cannot set cluster name')
            logError(ELogComponent.CORE,err)
            return 'unnamed-err'
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
