import { AdmissionregistrationV1Api, ApiextensionsV1Api, ApisApi, AppsV1Api, AutoscalingV2Api, BatchV1Api, CoordinationV1Api, CoreV1Api, CustomObjectsApi, DiscoveryV1Api, Exec, KubeConfig, KubernetesObjectApi, Log, NetworkingV1Api, NodeV1Api, PolicyV1Api, RbacAuthorizationV1Api, SchedulingV1Api, StorageV1Api, V1Node, VersionApi } from '@kubernetes/client-node'
import { MetricsTools } from "../tools/MetricsTools"
import { EClusterType, IInstanceConfig } from "@kwirthmagnify/kwirth-common"
import Docker from 'dockerode'
import { DockerTools } from "../tools/DockerTools"
import { NodeMetrics } from "./INodeMetrics"
import { EventsTools } from "../tools/EventsTools"
import { ServiceAccountToken } from '../tools/ServiceAccountToken'

export interface INodeInfo {
    [x: string]: any;
    name:string
    ip:string
    kubernetesNode: V1Node
    containerMetricValues: Map<string,{value: number, timestamp:number}>
    prevContainerMetricValues: Map<string,{value: number, timestamp:number}>
    podMetricValues: Map<string,{value: number, timestamp:number}>
    prevPodMetricValues: Map<string,{value: number, timestamp:number}>
    machineMetricValues: Map<string,{value: number, timestamp:number}>
    prevMachineMetricValues: Map<string,{value: number, timestamp:number}>
    prevSummary: NodeMetrics|undefined
    summary: NodeMetrics|undefined
    timestamp: number
}

export interface IPendingWebsocket {
    channel:string
    instance:string
    challenge:string
    instanceConfig: IInstanceConfig
}

export class ClusterInfo {
    public name: string = ''
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
    public metrics!: MetricsTools
    public events!: EventsTools
    public metricsInterval: number = 15
    public metricsIntervalRef: NodeJS.Timeout|undefined = undefined
    public vcpus: number = 0
    public memory: number = 0
    public type: EClusterType = EClusterType.KUBERNETES
    public flavour: string ='unknown'

    stopMetricsInterval = () => clearTimeout(this.metricsIntervalRef)

    static executeTask(instance: ClusterInfo) {
        instance.metrics.readClusterMetrics(instance)
    }

    startMetricsInterval = (seconds: number) => {
        this.metricsInterval = seconds
        this.metricsIntervalRef = setInterval(
            ClusterInfo.executeTask, 
            this.metricsInterval * 1000,
            this)
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
            console.log('Cannot set cluster name')
            console.log(err)
            return 'unnamed-err'
        }
    }

    getNodes = async () => {
        // load nodes
        try {
            var resp = await this.coreApi.listNode()
            var nodes:Map<string, INodeInfo> = new Map()
            for (var node of resp.items) {
                if (node.spec?.unschedulable) {
                    console.log(`WARNING: Node ${node.metadata?.name} is unschedulable`)
                }
                else {
                    var nodeData:INodeInfo = {
                        name: node.metadata?.name!,
                        ip: node.status?.addresses!.find(address => address.type === 'InternalIP')?.address!,
                        kubernetesNode: node,
                        containerMetricValues: new Map(),
                        prevContainerMetricValues: new Map(),
                        machineMetricValues: new Map(),
                        timestamp: 0,
                        podMetricValues: new Map(),
                        prevPodMetricValues: new Map(),
                        prevMachineMetricValues: new Map(),
                        prevSummary: undefined,
                        summary: undefined
                    }
                    nodes.set(nodeData.name, nodeData)
                }
            }
            return nodes
        }
        catch (err) {
            console.log('Cannot list nodes', err)
            return new Map()
        }
    }

}
