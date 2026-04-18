import { IInstanceMessage } from "@kwirthmagnify/kwirth-common"

export interface IPinocchioMessage extends IInstanceMessage {
    msgtype: 'pinocchiomessageresponse'
    namespace: string
    pod: string
    container: string
    text: string
}

interface IAnalysis {
    findings: {
        description: string
        level: 'low'|'medium'|'high'|'critical'
    }[],
    globalRisk?: number
    timestamp: number
    usage?: {
        input?:number,
        output?:number
    }
    pod?: any
    text?: string
}

export interface IPinocchioData {
    analysis: IAnalysis[]
    paused:boolean
    started:boolean
}

export class PinocchioData implements IPinocchioData {
    analysis: IAnalysis[] = []
    paused = false
    started = false
}
