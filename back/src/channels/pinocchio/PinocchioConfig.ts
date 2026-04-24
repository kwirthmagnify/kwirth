import { IInstanceMessage } from "@kwirthmagnify/kwirth-common"

export const kindsAvailable = ['Pod', 'Deployment', 'DaemonSet', 'StatefulSet', 'ReplicaSet', 'Job', 'CronJob','ReplicationController', 'Service', 'Ingress', 'HTTPRoute']  //+++ move this to a backend API

export enum EPinocchioCommand {
    CONFIGGET = 'configget',
    CONFIGSET = 'configset',
    PROVIDERSGET = 'providersget',
    PROVIDERSSET = 'providersset',
    PROVIDERSAVAILABLE = 'providersavailable',
}

export interface IAnalysis {
    findings: {
        description: string
        level: 'low'|'medium'|'high'|'critical'
    }[],
    timestamp: number
    usage?: {
        input?:number,
        output?:number
    }
    pod?: any
    text?: string
}

export interface IConfigModel {
    id: string
    name: string
    description: string
    type: 'text'|'image'|'video'|'other'
}

export interface IConfigProvider {
    name: string
    key: string
    models: IConfigModel[]
}

export interface IConfigKind {
    kind: string
    enabled: boolean
    system: string
    promptType: string
    prompt: string
    action: 'inform'|'cancel'|'repair'
    llm: string
    steps: number
    tools: string[]
}

export interface IConfigLlm {
    id: string
    provider: string
    model: string
    useProviderKey: boolean
    key: string
    data?: any
}

export interface IPinocchioConfig {
    kinds: IConfigKind[]
    llms: IConfigLlm[]
}

export class PinocchioConfig  implements IPinocchioConfig {
    kinds: IConfigKind[] = []
    llms: IConfigLlm[] = []
}

export interface IPinocchioInstanceConfig {
}

export class PinocchioInstanceConfig implements IPinocchioInstanceConfig{
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
    providers?: IConfigProvider[]
    providersAvailable?: string[]
}
