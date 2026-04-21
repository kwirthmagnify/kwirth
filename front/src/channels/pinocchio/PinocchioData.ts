import { IAnalysis, IConfigProvider, IPinocchioConfig } from "./PinocchioConfig"

export interface IPinocchioData {
    providers:IConfigProvider[]
    pinocchioConfig: IPinocchioConfig
    analysis: IAnalysis[]
    paused:boolean
    started:boolean
}

export class PinocchioData implements IPinocchioData {
    providers:IConfigProvider[] = []
    pinocchioConfig = {
        kinds:[],
        llms:[]
    }
    analysis: IAnalysis[] = []
    paused = false
    started = false
}
