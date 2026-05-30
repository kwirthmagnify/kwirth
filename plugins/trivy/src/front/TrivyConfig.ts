import { ITrivyConfig, ITrivyInstanceConfig } from "./TrivyTypes"

class TrivyConfig implements ITrivyConfig { }

class TrivyInstanceConfig implements ITrivyInstanceConfig {
    ignoreCritical = false
    ignoreHigh = false
    ignoreMedium = false
    ignoreLow = true
}

export { TrivyConfig, TrivyInstanceConfig }
