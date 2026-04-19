import { IAnalysis, IPinocchioConfig } from "./PinocchioConfig"

export interface IPinocchioData {
    pinocchioConfig: IPinocchioConfig
    analysis: IAnalysis[]
    paused:boolean
    started:boolean
}

export class PinocchioData implements IPinocchioData {
    pinocchioConfig = {
        providers:[],
        kinds:[],
        llms:[]
    }
    analysis: IAnalysis[] = []
    paused = false
    started = false
}
