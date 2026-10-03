import { IRallyxInstanceConfig } from '../common/RallyxTypes'

export interface IRallyxConfig {
    /** Pause the game automatically when the tab loses focus. */
    pauseOnBlur: boolean
}

export class RallyxConfig implements IRallyxConfig {
    pauseOnBlur = true
}

export class RallyxInstanceConfig implements IRallyxInstanceConfig {
    senderId?: string
    senderConfigName?: string
}
