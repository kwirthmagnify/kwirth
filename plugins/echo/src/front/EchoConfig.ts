import { IEchoInstanceConfig } from './EchoTypes'

export interface IEchoConfig {
    maxLines: number
}

export class EchoConfig implements IEchoConfig {
    maxLines = 3
}

export class EchoInstanceConfig implements IEchoInstanceConfig {
    interval = 5
}
