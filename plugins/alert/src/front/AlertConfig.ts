import { IAlertInstanceConfig } from "./AlertTypes"

export interface IAlertConfig {
    maxAlerts: number
}

export class AlertConfig implements IAlertConfig {
    maxAlerts = 25
}

export class AlertInstanceConfig implements IAlertInstanceConfig {
    regexInfo: string[] = []
    regexWarning: string[] = []
    regexError: string[] = []
    metricRules = []
    senderId = ''
    senderConfigName = ''
}
