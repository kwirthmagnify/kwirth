import { ISenderDebugInstanceConfig } from '../common/SenderDebugTypes'

export interface ISenderDebugConfig {
    /** how many sends are kept in the tab.s history */
    maxHistory: number
}

export class SenderDebugConfig implements ISenderDebugConfig {
    maxHistory = 100
}

export class SenderDebugInstanceConfig implements ISenderDebugInstanceConfig {
    senderId = ''
    configName = ''
}
