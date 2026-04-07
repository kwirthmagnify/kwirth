import { IInstanceMessage } from "@kwirthmagnify/kwirth-common"

export const TRIVY_API_VULN_PLURAL = 'vulnerabilityreports'
export const TRIVY_API_AUDIT_PLURAL = 'configauditreports'
export const TRIVY_API_SBOM_PLURAL = 'sbomreports'
export const TRIVY_API_EXPOSED_PLURAL = 'exposedsecretreports'

export interface ITrivyData {
    paused:boolean
    started:boolean
    assets: IAsset[]
    ri:string|undefined
    mode: 'list'|'card'
}

export class TrivyData implements ITrivyData{
    mode: 'list' | 'card' = 'card'
    started = false
    paused = false
    score = 0
    assets = []
    ri = undefined
}

export enum ETrivyCommand {
    RESCAN = 'rescan'
}

export interface ITrivyMessage extends IInstanceMessage {
    msgtype: 'trivymessage'
    id: string
    accessKey: string
    instance: string
    namespace: string
    group: string
    pod: string
    container: string
    command: ETrivyCommand
    params?: string[]
}

export interface ITrivyMessageResponse extends IInstanceMessage {
    msgtype: 'trivymessageresponse'
    id: string
    namespace: string
    group: string
    pod: string
    container: string
    msgsubtype?: string
    data?: any
}

export interface IAsset {
    name: string
    namespace: string
    container: string
    unknown: {
        statusCode: number
        statusMessage: string
    }
    vulnerabilityreports: {
        report: any
    }
    configauditreports: {
        report: any
    }
    sbomreports: {
        report: any
    }
    exposedsecretreports: {
        report: any
    }
}
