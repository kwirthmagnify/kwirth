import { IInstanceMessage } from "@kwirthmagnify/kwirth-common"

export enum ELogSortOrder {
    NONE = 'none',
    TIME = 'time',
    POD = 'pod'
}

export interface ILogMessage extends IInstanceMessage {
    msgtype: 'logmessage'
    timestamp?: Date
    text: string
    namespace: string
    pod:string
    container: string
}

export interface ILogInstanceConfig {
    previous: boolean
    timestamp: boolean
    fromStart: boolean
    startTime?: number
}
