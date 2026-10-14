/*
    The shape of the metrics channel's config, as Magnify sees it when it embeds that channel.

    The metrics channel is a plugin (plugins/metrics), so the core cannot import its types. The plugin
    builds its own initial state (prepareExternalChannel); Magnify only applies its form on top of it,
    and for that it needs these shapes. Keep them in sync with plugins/metrics/src/front/MetricsConfig.ts,
    plugins/metrics/src/front/MenuChart.tsx and plugins/metrics/src/common/MetricsTypes.ts.
*/

export enum EChartType {
    LineChart='line',
    BarChart='bar',
    AreaChart='area',
    ValueChart='value',
    PieChart='pie',
    TreemapChart='treemap',
}

export enum EMetricsConfigMode {
    SNAPSHOT='snapshot',
    STREAM='stream'
}

export interface IMetricViewConfig {
    displayName: string
    chartType: EChartType
    configurable: boolean
    compact: boolean
    legend: boolean
    tooltip: boolean
    labels: boolean
    stack: boolean
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
    metricsDefault: { [key:string]: IMetricViewConfig }
}

export interface IMetricsInstanceConfig {
    mode: EMetricsConfigMode
    aggregate: boolean
    interval: number
    metrics: string[]
}
