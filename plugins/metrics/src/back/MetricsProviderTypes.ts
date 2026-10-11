/*
    The part of the core 'metrics' provider's model this channel reads (back/src/providers/metrics/IMetricsModel.ts
    in the core). The plugin cannot import from the core, so it keeps a copy of just what it uses.
*/

export interface IMetricsValue {
    value: number
    timestamp: number
}

export interface IMetricsClusterUsage {
    vcpus: number
    memory: number
}

export interface IMetricsNode {
    name: string
    timestamp: number
    podMetricValues: Map<string, IMetricsValue>
    containerMetricValues: Map<string, IMetricsValue>
}

export interface IMetricsCluster {
    metricsInterval: number
    cluster: IMetricsClusterUsage
    nodes: IMetricsNode[]
    clusterMetricValues: Map<string, IMetricsValue>
}
