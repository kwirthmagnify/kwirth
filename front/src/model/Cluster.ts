import { EClusterFlavour, ERancherRole, KwirthData } from '@kwirthmagnify/kwirth-common'
import { MetricDefinition } from '../channels/metrics/MetricsTypes'

export class Cluster {
    public id: string = ''
    public name: string = ''
    public enabled: boolean = true
    public url: string = ''
    public accessString: string = ''
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
