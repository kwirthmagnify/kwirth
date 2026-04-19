import { IInstanceMessage } from "@kwirthmagnify/kwirth-common"

export enum EPinocchioCommand {
    CONFIG = 'config',
    STREAM = 'stream',
    INITIAL = 'initial',
}

export interface IPinocchioMessage extends IInstanceMessage {
    channel: 'pinocchio'
    accessKey: string
    msgtype: 'pinocchiomessage'
    id: string
    instance: string
    command: EPinocchioCommand
    data?: any
}

export interface IPinocchioMessageResponse extends IInstanceMessage {
    channel: 'pinocchio'
    msgtype: 'pinocchiomessageresponse'
    analysis?: IAnalysis
    config?: IPinocchioConfig
}

export interface IAnalysis {
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


export interface IConfigProvider {
    name: string
    models: string[]
}

export interface IConfigKind {
    kind: string
    enabled: boolean
    system: string
    prompt: string
    action: 'inform'|'cancel'|'repair'
    llm: string
}

export interface IConfigLlm {
    id: string
    provider: string
    model: string
    key: string
    data?: any
}

export interface IPinocchioConfig {
    providers: IConfigProvider[]
    kinds: IConfigKind[]
    llms: IConfigLlm[]
}

export class PinocchioConfig  implements IPinocchioConfig {
    providers: IConfigProvider[] = []
    kinds: IConfigKind[] = []
    llms: IConfigLlm[] = []
}

export interface IPinocchioInstanceConfig {
}

export class PinocchioInstanceConfig implements IPinocchioInstanceConfig{
}
