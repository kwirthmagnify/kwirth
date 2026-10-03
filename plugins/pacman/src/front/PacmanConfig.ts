import { IPacmanInstanceConfig } from '../common/PacmanTypes'

export interface IPacmanConfig {
    /** Pausa la partida automaticamente al perder el foco el tab. */
    pauseOnBlur: boolean
}

export class PacmanConfig implements IPacmanConfig {
    pauseOnBlur = true
}

export class PacmanInstanceConfig implements IPacmanInstanceConfig {
    senderId?: string
    senderConfigName?: string
}
