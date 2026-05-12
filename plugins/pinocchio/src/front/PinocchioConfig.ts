import { IInstanceMessage } from "@kwirthmagnify/kwirth-common"

export const kindsAvailable = ['Pod', 'Deployment', 'DaemonSet', 'StatefulSet', 'ReplicaSet', 'Job', 'CronJob','ReplicationController', 'Service', 'Ingress', 'HTTPRoute']

export enum EPinocchioCommand {
    CONFIGGET = 'configget',
    CONFIGSET = 'configset',
    PROVIDERSGET = 'providersget',
    PROVIDERSSET = 'providersset',
    PROVIDERSAVAILABLE = 'providersavailable',
    TOOLSAVAILABLE = 'toolsavailable',
    PLAYGROUNDSET = 'playgroundset',
}

export interface IPlaygroundRequest {
    trigger: string
    llm: string
    steps: number
    kind?: string
    spaces: string[]
    tools: string[]
    promptType: string
    system: string
    prompt: string
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

export interface IMessage {
    timestamp: number
    text: string
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

export interface IConfigTriggerVersion {
    id: string
    description?: string
    enabled: boolean
    system: string
    promptType: string
    prompt: string
    action: 'inform'|'cancel'|'repair'
    llm: string
    steps: number
    tools: string[]
    autoTools?: boolean
    spaces: string[]
}

export interface IConfigTrigger {
    id: string
    trigger: string
    kind?: string
    versions: IConfigTriggerVersion[]
}

export interface IConfigLlm {
    id: string
    provider: string
    model: string
    temperature: number
    useProviderKey: boolean
    key: string
    data?: any
}

export interface IPlaygroundState {
    llm: string
    steps: number
    tools: string[]
    autoTools: boolean
    system: string
    prompt: string
    eventData: string
    triggerType: 'business' | 'artifact'
    artifactKind: string
    eventSpace: string
    eventType: string
    systemHistory?: string[]
    promptHistory?: string[]
    artifactHistory?: string[]
    businessHistory?: string[]
    spaceTypeHistory?: { space: string, type: string }[]
}

export interface IPinocchioConfig {
    triggers: IConfigTrigger[]
    llms: IConfigLlm[]
    playground?: IPlaygroundState
}

export class PinocchioConfig  implements IPinocchioConfig {
    triggers: IConfigTrigger[] = []
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
    toolsAvailable?: { name: string, description: string }[]
    message?:IMessage
}
