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

export interface IFinding {
    description: string
    level: 'low' | 'medium' | 'high' | 'critical'
    control_id?: string
    control_name?: string
    category?: 'privileges' | 'identity' | 'network' | 'filesystem' | 'supply_chain' | 'resources' | 'secrets' | 'general' | 'platform'
    confidence?: 'low' | 'medium' | 'high'
    evidence?: string
    impact?: string
    remediation?: string
    references?: string[]
    risk_score?: number
}

export interface IAnalysis {
    findings: IFinding[]
    resource?: { kind: string; name: string; namespace: string; images: string[] }
    pss_current?: 'privileged' | 'baseline' | 'restricted' | 'undefined'
    pss_target?: 'privileged' | 'baseline' | 'restricted' | 'undefined'
    score_summary?: { critical: number; high: number; medium: number; low: number }
    global_risk?: 'low' | 'medium' | 'high' | 'critical'
    controls_passed?: string[]
    not_visible?: string[]
    next_steps?: string[]
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

export type EK8sEvent = 'ADDED' | 'MODIFIED' | 'DELETED'
export const k8sEventsAvailable: EK8sEvent[] = ['ADDED', 'MODIFIED', 'DELETED']

export interface IConfigTrigger {
    id: string
    trigger: string
    kind?: string
    k8sEvent?: EK8sEvent
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
    artifactK8sEvent?: EK8sEvent
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
