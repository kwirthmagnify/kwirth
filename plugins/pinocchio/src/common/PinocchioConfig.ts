import { IInstanceMessage } from "@kwirthmagnify/kwirth-common"
import { ILlm, ILlmModel, ILlmProvider } from "@kwirthmagnify/kwirth-common-ai"

export type IConfigModel = ILlmModel
export type IConfigProvider = ILlmProvider
export type IConfigLlm = ILlm

export const kindsAvailable = ['Pod', 'Deployment', 'DaemonSet', 'StatefulSet', 'ReplicaSet', 'Job', 'CronJob', 'ReplicationController', 'Service', 'Ingress', 'HTTPRoute']

export enum EPinocchioCommand {
    CONFIGGET = 'configget',
    CONFIGSET = 'configset',
    PROVIDERSGET = 'providersget',
    PROVIDERSSET = 'providersset',
    PROVIDERSAVAILABLE = 'providersavailable',
    TOOLSAVAILABLE = 'toolsavailable',
    PLAYGROUNDSET = 'playgroundset',
}

export interface IAnalysis {
    findings: {
        description: string
        level: 'low' | 'medium' | 'high' | 'critical'
    }[]
    report?: string
    timestamp: number
    usage?: {
        input?: number
        output?: number
    }
    pod?: unknown
    text?: string
}

export interface IMessage {
    timestamp: number
    text: string
    role?: 'llm'
    playground?: true
}

export interface IConfigTriggerVersion {
    id: string
    description?: string
    enabled: boolean
    system: string
    promptType: string
    prompt: string
    action: 'inform' | 'cancel' | 'repair'
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

export interface IPlaygroundState {
    llm: string
    steps: number
    tools: string[]
    autoTools: boolean
    promptType?: 'jinja' | 'artifact'
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

export class PinocchioConfig implements IPinocchioConfig {
    triggers: IConfigTrigger[] = []
    llms: IConfigLlm[] = []
}

export interface IPinocchioInstanceConfig {
}

export class PinocchioInstanceConfig implements IPinocchioInstanceConfig {
}

export interface IPinocchioMessage extends IInstanceMessage {
    channel: 'pinocchio'
    accessKey: string
    msgtype: 'pinocchiomessage'
    id: string
    instance: string
    command: EPinocchioCommand
    data?: unknown
}

export interface IPinocchioMessageResponse extends IInstanceMessage {
    channel: 'pinocchio'
    msgtype: 'pinocchiomessageresponse'
    analysis?: IAnalysis
    config?: IPinocchioConfig
    providers?: IConfigProvider[]
    providersAvailable?: string[]
    toolsAvailable?: { name: string, description: string }[]
    message?: IMessage
}
