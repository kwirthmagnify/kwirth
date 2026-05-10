import { IInstanceMessage } from "@kwirthmagnify/kwirth-common"
import { IMetricsAssets } from "./MetricsTypes"

export enum EMetricsEventSeverity {
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error'
}

export interface IAssetMetricsValues extends IInstanceMessage {
    assets: IMetricsAssets[]
    timestamp: number
}

export interface IMetricsData {
    assetMetricsValues: IAssetMetricsValues[]
    events: { severity:EMetricsEventSeverity, text:string }[]
    paused:boolean
    started:boolean
}

export class MetricsData implements IMetricsData{
    assetMetricsValues = []
    events = []
    paused = false
    started = false
}
