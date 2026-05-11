import { IEchoInstanceConfig } from "./EchoTypes"

interface IEchoConfig {
    maxLines: number
}

class EchoConfig implements IEchoConfig {
    maxLines = 3
}

class EchoInstanceConfig implements IEchoInstanceConfig {
    interval = 5
}

export type { IEchoConfig }
export { EchoConfig, EchoInstanceConfig }
