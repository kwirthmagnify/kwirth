import { EClusterFlavour, ERancherRole, IClusterRoute, KwirthData } from '@kwirthmagnify/kwirth-common'
import { MetricDefinition } from '@kwirthmagnify/kwirth-common-front'

export class Cluster {
    public id: string = ''
    public name: string = ''
    public enabled: boolean = true
    public url: string = ''             // ALWAYS the real url (persisted, shown). To connect: clusterBaseUrl() in tools/ClusterRouting
    public accessString: string = ''
    public route?: IClusterRoute        // set on PROXIED entries: how this core reaches a cluster it cannot reach directly
    public home: boolean|undefined = false
    public inCluster: boolean = false
    public metricsList: Map<string,MetricDefinition> = new Map()  //+++ review if needs to be moved to metrics channel
    public kwirthData?: KwirthData
    public clusterInfo?: IClusterInfo
}

export interface IClusterInfo {
    id: string,
    name: string,
    type: string,
    flavour: EClusterFlavour,
    /** Whether a Rancher manages this cluster, and whether it is the one Rancher runs on. */
    rancherManaged: boolean,
    rancherRole: ERancherRole,
    memory: number
    vcpu: number
    reportedName: string,
    reportedServer: string,
    version: string,
    platform: string,
    nodes: string[]
}
