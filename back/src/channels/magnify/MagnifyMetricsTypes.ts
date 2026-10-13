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
    What Magnify answers to its USAGE command: the usage plus whether the 'metrics' provider is there at all.
    Without the flag, a cluster with no provider installed and one whose provider has not read yet look the
    same (zeros), and the overview drew three empty charts with no explanation.
*/
export interface IMagnifyClusterUsage extends IMetricsClusterUsage {
    metricsProvider: boolean
}
