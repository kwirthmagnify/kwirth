import { ELogSortOrder, ILogInstanceConfig } from "./LogTypes"

interface ILogConfig {
    startDiagnostics: boolean

    // for general log viewing
    follow: boolean
    maxMessages: number
    showNames: boolean

    // for start diagnostics
    maxPerPodMessages: number
    sortOrder: ELogSortOrder
}

class LogConfig implements ILogConfig{
    startDiagnostics = false
    follow = true
    maxMessages = 5000
    maxPerPodMessages = 1000
    sortOrder = ELogSortOrder.TIME
    showNames = false
}

class LogInstanceConfig implements ILogInstanceConfig{
    previous = false
    timestamp = true
    fromStart = false
    startTime? = 0
}

export type { ILogConfig }
export { LogConfig, LogInstanceConfig }
