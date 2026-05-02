interface INodeMetrics {
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

export { INodeMetrics }