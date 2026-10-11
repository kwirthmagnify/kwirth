import { IInstanceMessage } from '@kwirthmagnify/kwirth-common'

export enum EMetricsConfigMode {
    SNAPSHOT='snapshot',
    STREAM='stream'
}

// What travels to the back inside instanceConfig.data
export interface IMetricsInstanceConfig {
    mode: EMetricsConfigMode
    aggregate: boolean
    interval: number
    metrics: string[]
}

export interface IMetricsAssetsValue {
    metricName: string
    metricValue: number
}

export interface IMetricsAssets {
    assetName: string
    values: IMetricsAssetsValue[]
}

export interface IMetricsMessageResponse extends IInstanceMessage {
    msgtype: 'metricsmessageresponse'
    id?: string
    command?: string
    timestamp: number
    namespace: string
    group: string
    pod: string
    container: string
    assets: IMetricsAssets[]
}
