/*
    The model of what this provider delivers: each tick, one IMetricsCluster to every subscriber.

    It moved here from the core (back/src/providers/metrics/IMetricsModel.ts) when the provider became an
    extension. Its consumers (the metrics, alert, pinocchio, spectrum and agora plugins, and the core's
    Magnify) keep their own copy of the part they read, so a field can be added here without breaking
    them; renaming or removing one breaks them all.
*/

/** One metric of the list the provider serves (cAdvisor's '# HELP' / '# TYPE' lines). */
export interface IMetricDefinition {
    help: string
    type: string
    eval: string
}

/** What a subscriber may send. Consumers send { pod, container, machine } flags; today nothing filters on them. */
export interface IMetricsSubscriberConfig {
    container?: boolean
    pod?: boolean
    machine?: boolean
}

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

export interface IMetricsCluster {
    metricsInterval: number
    cluster: IMetricsClusterUsage
    nodes: IMetricsNode[]
    clusterMetricValues: Map<string, {value: number, timestamp: number}>
}

export interface IMetricsNode {
    name: string
    timestamp: number
    summary: IMetricsNodeSummary
    machineMetricValues: Map<string, {value: number, timestamp:number}>
    podMetricValues: Map<string, {value: number, timestamp:number}>
    containerMetricValues: Map<string, {value: number, timestamp:number}>
}

export interface IMetricsNodeSummary {
    nodeName: string
    systemContainers: ISystemContainer[]
    startTime: string
    cpu: ICpuUsage
    memory: IMemoryUsage
    network: INetworkUsage
    fs: IFilesystemUsage
    runtime: IRuntimeUsage
    swap: ISwapUsage
    pods: IPodMetrics[]
}

interface ISystemContainer {
    name: string
    startTime: string
    cpu: ICpuUsage
    memory: IMemoryUsage
    swap: ISwapUsage
}

interface ICpuUsage {
    time: string
    usageNanoCores: number
    usageCoreNanoSeconds: number
}

interface IMemoryUsage {
    time: string
    availableBytes: number
    usageBytes: number
    workingSetBytes: number
    rssBytes: number
    pageFaults: number
    majorPageFaults: number
}

interface ISwapUsage {
    time: string
    swapAvailableBytes: number
    swapUsageBytes: number
}

interface INetworkUsage {
    time: string
    name: string
    rxBytes: number
    rxErrors: number
    txBytes: number
    txErrors: number
    interfaces: INetworkInterface[]
}

interface INetworkInterface {
    name: string
    rxBytes: number
    rxErrors: number
    txBytes: number
    txErrors: number
}

interface IFilesystemUsage {
    time: string
    availableBytes: number
    capacityBytes: number
    usedBytes: number
    inodesFree: number
    inodes: number
    inodesUsed: number
}

interface IRuntimeUsage {
    imageFs: IFilesystemUsage
    containerFs: IFilesystemUsage
}

interface IPodMetrics {
    podRef: IPodReference
    startTime: string
    containers: IContainerMetrics[]
    cpu: ICpuUsage
    memory: IMemoryUsage
    network: INetworkUsage
    volume: IVolumeUsage[]
    ephemeralStorage: IFilesystemUsage
    processStats: ProcessStats
    swap: ISwapUsage
}

interface IPodReference {
    name: string
    namespace: string
    uid: string
}

interface IContainerMetrics {
    name: string
    startTime: string
    cpu: ICpuUsage
    memory: IMemoryUsage
    rootfs: IFilesystemUsage
    logs: IFilesystemUsage
    swap: ISwapUsage
}

interface IVolumeUsage {
    time: string
    availableBytes: number
    capacityBytes: number
    usedBytes: number
    inodesFree: number
    inodes: number
    inodesUsed: number
    name: string
}

interface ProcessStats {
    processCount: number
}
