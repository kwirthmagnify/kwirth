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

export type TAlertMetricOperator = '<' | '<=' | '>' | '>=' | '==' | '!='
export type TAlertTriggerMode = 'leading-edge' | 'cooldown' | 'continuous'

export interface IAlertMetricRule {
    metric: string
    operator: TAlertMetricOperator
    value: number
    severity: EAlertSeverity
    mode: TAlertTriggerMode
    cooldown: number
}

export interface IAlertInstanceConfig {
    regexInfo: string[],
    regexWarning: string[],
    regexError: string[],
    metricRules: IAlertMetricRule[],
}
