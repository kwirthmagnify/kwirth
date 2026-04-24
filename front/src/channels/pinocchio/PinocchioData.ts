import { IAnalysis, IConfigProvider, IPinocchioConfig } from "./PinocchioConfig"

export interface IPinocchioData {
    providersAvailable: string[]
    providers: IConfigProvider[]
    config: IPinocchioConfig
    analysis: IAnalysis[]
    paused:boolean
    started:boolean
}

export class PinocchioData implements IPinocchioData {
    providersAvailable: string[] = []
    providers: IConfigProvider[] = []
    config = {
        kinds:[],
        llms:[]
    }
    analysis: IAnalysis[] = []
    paused = false
    started = false
}
