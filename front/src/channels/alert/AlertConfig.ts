import { IAlertInstanceConfig, IAlertMetricRule } from "./AlertTypes"

interface IAlertConfig {
    maxAlerts: number
}

class AlertConfig implements IAlertConfig{
    maxAlerts: number = 25
}

class AlertInstanceConfig implements IAlertInstanceConfig{
    regexInfo:string[] = []
    regexWarning:string[] = []
    regexError:string[] = []
    metricRules:IAlertMetricRule[] = []
}

export type { IAlertConfig }
export { AlertConfig, AlertInstanceConfig }
