import { IScopedObject } from "./OpsData"
import { IOpsInstanceConfig } from "./OpsTypes"

export enum ESwitchKey {
    DISABLED,
    NONE,
    ALT,
    CTRL,
    SHIFT
}

interface IOpsConfig {
    accessKey: ESwitchKey
    launchShell: boolean
    shell?: IScopedObject
}

class OpsConfig implements IOpsConfig{
    accessKey =  ESwitchKey.DISABLED
    launchShell = false
}

class OpsInstanceConfig implements IOpsInstanceConfig{
    sessionKeepAlive = true
}
export type { IOpsConfig }
export { OpsConfig, OpsInstanceConfig }
