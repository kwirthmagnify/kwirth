export { EAlertSeverity, IAlertMessage, TAlertMetricOperator, TAlertTriggerMode, IAlertMetricRule, IAlertInstanceConfig } from '../common/AlertTypes'

// Minimal metrics model needed for processProviderEvent
export interface IMetricsNode {
    containerMetricValues: Map<string, { value: number; timestamp: number }>
    podMetricValues: Map<string, { value: number; timestamp: number }>
}

export interface IMetricsCluster {
    nodes: IMetricsNode[]
    clusterMetricValues?: Map<string, { value: number; timestamp: number }>
}
