import { IAnalysis, IConfigProvider, IMessage, IPinocchioConfig } from "./PinocchioConfig"

export interface IPinocchioData {
    toolsAvailable: string[]
    providersAvailable: string[]
    providers: IConfigProvider[]
    config: IPinocchioConfig
    content: (IAnalysis|IMessage)[]
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
    content:(IAnalysis|IMessage)[] = []
    paused = false
    started = false
}
