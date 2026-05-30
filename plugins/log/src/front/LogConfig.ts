import { ELogSortOrder, ILogInstanceConfig } from "./LogTypes"

interface ILogConfig {
    startDiagnostics: boolean
    fromNowOn: boolean
    follow: boolean
    maxMessages: number
    showNames: boolean
    maxPerPodMessages: number
    sortOrder: ELogSortOrder
}

class LogConfig implements ILogConfig {
    startDiagnostics = false
    fromNowOn: boolean = false
    follow = true
    maxMessages = 5000
    maxPerPodMessages = 1000
    sortOrder = ELogSortOrder.TIME
    showNames = false
}

class LogInstanceConfig implements ILogInstanceConfig {
    previous = false
    timestamp = true
    fromStart = false
    startTime? = 0
}

export type { ILogConfig }
export { LogConfig, LogInstanceConfig }
