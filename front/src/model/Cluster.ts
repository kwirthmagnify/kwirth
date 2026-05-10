import { v4 as uuid } from 'uuid'
import { KwirthData } from '@kwirthmagnify/kwirth-common'
import { MetricDefinition } from '../channels/metrics/MetricsTypes'

export class Cluster {
    public id: string
    public name: string = ''
    public enabled: boolean = true
    public url: string = ''
    public accessString: string = ''
    public source: boolean|undefined = false
    public inCluster: boolean = false
    public metricsList: Map<string,MetricDefinition> = new Map()  //+++ review if needs to be moved to metrics channel
    public kwirthData?: KwirthData
    public clusterInfo?: IClusterInfo
    
    constructor () {
        this.id = uuid()
    }
}

export interface IClusterInfo {
    name: string,
    type: string,
    flavour: string,
    memory: number
    vcpu: number
    reportedName: string,
    reportedServer: string,
    version: string,
    platform: string,
    nodes: string[]
}