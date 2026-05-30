// Types from other core channels needed by OpsTabContent to create tabs.
// These match the interfaces in log/metrics channels — only used to pass
// typed config objects via channelObject.createTab (which accepts any).

export interface IResourceSelected {
    channelId: string
    clusterName: string
    view: any
    namespaces: string[]
    controllers: string[]
    pods: string[]
    containers: string[]
    name: string
}

export interface ILogConfig {
    fromNowOn: boolean
    startDiagnostics: boolean
    follow: boolean
    showNames: boolean
    maxMessages: number
    maxPerPodMessages: number
    sortOrder: ELogSortOrder
}

export interface ILogInstanceConfig {
    previous: boolean
    timestamp: boolean
    fromStart: boolean
    startTime?: number
}

export enum ELogSortOrder {
    TIME = 'time',
    NAME = 'name'
}

export interface IMetricsConfig {
    depth: number
    width: number
    lineHeight: number
    configurable: boolean
    compact: boolean
    legend: boolean
    merge: boolean
    stack: boolean
    chart: EChartType
    metricsDefault: Record<string, any>
}

export interface IMetricsInstanceConfig {
    mode: EMetricsConfigMode
    aggregate: boolean
    interval: number
    metrics: string[]
}

export enum EChartType {
    LineChart = 'line',
    BarChart = 'bar',
    AreaChart = 'area'
}

export enum EMetricsConfigMode {
    STREAM = 'stream',
    HISTORY = 'history'
}
