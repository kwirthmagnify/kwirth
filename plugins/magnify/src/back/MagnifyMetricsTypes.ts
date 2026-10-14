/*
    The part of the 'metrics' provider's reading that Magnify uses: the cluster usage it draws in its
    overview. The provider is an installable extension (providers/metrics), so the core cannot import its
    types; keep this in sync with IMetricsClusterUsage in providers/metrics/src/common/MetricsTypes.ts.
*/
export interface IMetricsClusterUsage {
    vcpus: number
    memory: number
    cpuUsage: number
    memoryUsage: number
    txmbps: number
    rxmbps: number
    pods: number
    maxPods: number
}

/*
    What Magnify answers to its USAGE command, which the front polls: the usage plus whether the providers its
    overview lives on are there at all. Without the flags, a cluster with no provider installed and one whose
    provider has not produced anything yet look the same (zeros, an empty list), and the overview drew empty
    charts and an empty events feed with no explanation.
*/
export interface IMagnifyClusterUsage extends IMetricsClusterUsage {
    metricsProvider: boolean
    eventsProvider: boolean
}
