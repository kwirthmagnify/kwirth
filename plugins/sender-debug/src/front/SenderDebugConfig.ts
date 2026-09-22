import { ISenderDebugInstanceConfig } from '../common/SenderDebugTypes'

export interface ISenderDebugConfig {
    /** cuantos envios se guardan en el historial de la pestaña */
    maxHistory: number
}

export class SenderDebugConfig implements ISenderDebugConfig {
    maxHistory = 100
}

export class SenderDebugInstanceConfig implements ISenderDebugInstanceConfig {
    senderId = ''
    configName = ''
}
