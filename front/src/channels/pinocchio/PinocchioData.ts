import { IAnalysis, IConfigProvider, IPinocchioConfig } from "./PinocchioConfig"

export interface IPinocchioData {
    toolsAvailable: string[]
    providersAvailable: string[]
    providers: IConfigProvider[]
    config: IPinocchioConfig
    analysis: IAnalysis[]
    paused:boolean
    started:boolean
}

export class PinocchioData implements IPinocchioData {
    toolsAvailable: string[] = []
    providersAvailable: string[] = []
    providers: IConfigProvider[] = []
    config = {
        triggers: [],
        llms: []
    }
    analysis: IAnalysis[] = []
    paused = false
    started = false
}
