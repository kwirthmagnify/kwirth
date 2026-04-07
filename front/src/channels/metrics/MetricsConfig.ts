import { EMetricsConfigMode } from "@kwirthmagnify/kwirth-common"
import { EChartType } from "./MenuChart"

interface IMetricViewConfig {
    displayName: string
    chartType: EChartType
    configurable: boolean
    compact: boolean
    legend: boolean
    tooltip: boolean
    labels: boolean
    stack: boolean
}

interface IMetricsConfig {
    depth: number
    width: number
    lineHeight: number
    configurable: boolean
    compact: boolean
    legend: boolean
    merge: boolean 
    stack: boolean
    chart: EChartType
    // although we like Map's, we prefer using a JSON beacuse of serialization to backend
    metricsDefault: { [key:string]: IMetricViewConfig }
}

class MetricsConfig implements IMetricsConfig{
    depth = 20
    width = 3
    lineHeight = 300
    configurable = true
    compact = false
    legend = true
    merge = false
    stack = false
    chart = EChartType.LineChart
    metricsDefault = {}
}

interface IMetricsInstanceConfig {
    mode: EMetricsConfigMode
    aggregate: boolean
    interval: number
    metrics: string[]
}

class MetricsInstanceConfig implements IMetricsInstanceConfig{
    mode = EMetricsConfigMode.STREAM
    aggregate = false
    interval = 15
    metrics:string[] = []
}

const METRICSCOLOURS = [
    "#6e5bb8", // morado oscuro
    "#4a9076", // verde oscuro
    "#b56c52", // naranja oscuro
    "#7f6b97", // color lavanda oscuro
    "#b0528f", // rosa oscuro
    "#b0b052", // amarillo oscuro
    "#b05252", // rojo oscuro
    "#5285b0", // azul oscuro
    "#a38ad6", // morado pastel
    "#89c1a0", // verde pastel
    "#e4a28a", // naranja pastel
    "#b09dbd", // lavanda pastel
    "#e2a4c6", // rosa pastel
    "#c5c89e", // amarillo pastel
    "#e2a4a4", // rojo pastel
    "#90b7e2", // azul pastel
    "#f8d5e1", // rosa claro pastel
    "#b2d7f0", // azul muy claro pastel
    "#f7e1b5", // amarillo muy claro pastel
    "#d0f0c0", // verde muy claro pastel
    "#f5b0a1", // coral pastel
    "#d8a7db", // lavanda muy claro pastel
    "#f4c2c2", // rosa suave pastel
    "#e6c7b9", // marrón claro pastel
    "#f0e2b6", // crema pastel
    "#a7c7e7", // azul pálido pastel
    "#f5e6a5", // amarillo pálido pastel
    "#e3c8f5", // lilas pastel
    "#d0c4e8", // lila pálido pastel
    "#b8d8b8", // verde claro pastel
    "#d2ebfa", // azul muy claro pastel
    "#f1c1d2"  // rosa bebé pastel
]

export type { IMetricsConfig, IMetricsInstanceConfig, IMetricViewConfig }
export { MetricsConfig, MetricsInstanceConfig, METRICSCOLOURS }
