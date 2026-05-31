import { IInstanceMessage } from "@kwirthmagnify/kwirth-common"

export interface ILogInstanceConfig {
    previous: boolean
    timestamp: boolean
    fromStart: boolean
    startTime?: number
}

export interface ILogMessage extends IInstanceMessage {
    msgtype: 'logmessage'
    timestamp?: Date
    text: string
    namespace: string
    pod: string
    container: string
}
