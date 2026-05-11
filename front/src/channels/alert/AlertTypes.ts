import { IInstanceMessage } from "@kwirthmagnify/kwirth-common"

export enum EAlertSeverity {
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error'
}

export interface IAlertMessage extends IInstanceMessage {
    msgtype: 'alertmessage'
    timestamp?: Date
    severity: EAlertSeverity
    namespace: string
    pod: string
    container: string
    text: string
}

export interface IAlertInstanceConfig {
    regexInfo: string[],
    regexWarning: string[],
    regexError: string[],
}
